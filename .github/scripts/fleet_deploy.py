"""Roll a verified image through the serving fleet with dedicated surge capacity."""
from datetime import datetime, timedelta, timezone
import json
import os
import re
import sys
import time

from tencentcloud.clb.v20180317 import clb_client, models
from tencentcloud.common import credential
from tencentcloud.common.exception.tencent_cloud_sdk_exception import TencentCloudSDKException
from tat_deploy import deploy as remote_deploy
from tencentcloud.scf.v20180416 import scf_client, models as scf_models
from tencentcloud.common.profile.client_profile import ClientProfile
from tencentcloud.common.profile.http_profile import HttpProfile


def release_event(event, node=""):
    observed = datetime.now(timezone(timedelta(hours=8))).isoformat(timespec="seconds")
    print("RELEASE_EVENT", json.dumps({"time": observed, "event": event, "node": node}), flush=True)
    summary = os.environ.get("GITHUB_STEP_SUMMARY")
    if summary:
        with open(summary, "a", encoding="utf-8") as stream:
            stream.write(f"\n- {observed} — {event}" + (f" ({node})" if node else "") + "\n")


def target_health(client, settings):
    request = models.DescribeTargetHealthRequest()
    request.from_json_string(json.dumps({
        "LoadBalancerIds": [settings["clb"]], "ListenerIds": [settings["listener"]],
        "LocationIds": [settings["location"]],
    }))
    result = {}
    for balancer in client.DescribeTargetHealth(request).LoadBalancers or []:
        for listener in balancer.Listeners or []:
            for rule in listener.Rules or []:
                if rule.LocationId == settings["location"]:
                    for target in rule.Targets or []:
                        result[(target.TargetId, target.Port)] = (target.HealthStatus, target.Weight)
    return result


def change_weight(client, settings, target, weight):
    request = models.ModifyTargetWeightRequest()
    request.from_json_string(json.dumps({
        "LoadBalancerId": settings["clb"], "ListenerId": settings["listener"],
        "LocationId": settings["location"],
        "Targets": [{"InstanceId": target["id"], "Port": target["port"], "Weight": weight}],
    }))
    deadline = time.monotonic() + 120
    while True:
        try:
            client.ModifyTargetWeight(request)
            break
        except TencentCloudSDKException as error:
            if error.get_code() != "FailedOperation.ResourceInOperating" or time.monotonic() >= deadline:
                raise
            time.sleep(5)
    while time.monotonic() < deadline:
        state = target_health(client, settings).get((target["id"], target["port"]))
        if state and state[1] == weight:
            return
        time.sleep(5)
    raise RuntimeError("CLB did not confirm the target weight; deployment stopped")


def verify_candidate(target):
    os.environ["TENCENTCLOUD_INSTANCE_ID"] = target["id"]
    current = remote_deploy(status_only=True)
    if current.get("image") != os.environ["LFTECH_IMAGE_REF"] or current.get("health") != "healthy":
        raise RuntimeError("Running image or application health mismatch on " + target["name"])


def verify_targets(client, settings, targets, *, candidate=False, drained=()):
    """Check the configured traffic state and, when requested, the running digest."""
    if candidate:
        for target in targets:
            verify_candidate(target)
    states = target_health(client, settings)
    for target in targets:
        expected_weight = 0 if target["id"] in drained else target["weight"]
        if states.get((target["id"], target["port"])) != (True, expected_weight):
            raise RuntimeError("Unexpected CLB health or weight on " + target["name"])


def drain_target(client, settings, target):
    change_weight(client, settings, target, 0)
    release_event("CLB confirmed weight zero", target["name"])
    os.environ["TENCENTCLOUD_INSTANCE_ID"] = target["id"]
    result = remote_deploy(drain_only=True)
    if not isinstance(result, dict) or type(result.get("drained")) is not bool:
        raise RuntimeError("Unconfirmed drain operation on " + target["name"])
    release_event("Drain completed" if result["drained"] else "Drain deadline reached", target["name"])


def rollout(client, settings, targets, surge):
    # A previous attempt of this owner may already have drained one old target.
    # The controller verifies all original weights before it first takes ownership.
    states = target_health(client, settings)
    offline = [t for t in targets if states.get((t["id"], t["port"]), (None, None))[1] == 0]
    if len(offline) > 1:
        raise RuntimeError("Multiple original targets are drained; inspect the release")
    verify_targets(client, settings, surge, candidate=True)
    release_event("Surge fleet verified at serving weight", ", ".join(t["name"] for t in surge))
    verify_targets(client, settings, targets, drained={t["id"] for t in offline})
    for target in targets:
        os.environ["TENCENTCLOUD_INSTANCE_ID"] = target["id"]
        print("Preparing image:", target["name"], flush=True)
        remote_deploy(prepare_only=True)

    # Normally master first. Recover a previously drained target before touching a peer.
    for target in offline + [t for t in targets if t not in offline]:
        peers = [t for t in targets if t != target]
        verify_targets(client, settings, surge, candidate=True)
        verify_targets(client, settings, peers)
        os.environ["TENCENTCLOUD_INSTANCE_ID"] = target["id"]
        current = remote_deploy(status_only=True)
        if current.get("health") != "healthy":
            raise RuntimeError("Current application is unhealthy on " + target["name"])
        if current.get("image") != os.environ["LFTECH_IMAGE_REF"]:
            print("Draining:", target["name"], flush=True)
            drain_target(client, settings, target)
            verify_targets(client, settings, surge, candidate=True)
            verify_targets(client, settings, peers)
        os.environ["TENCENTCLOUD_INSTANCE_ID"] = target["id"]
        remote_deploy(prepared=True)
        deadline = time.monotonic() + 180
        while time.monotonic() < deadline:
            state = target_health(client, settings).get((target["id"], target["port"]))
            if state and state[0]:
                break
            time.sleep(5)
        else:
            raise RuntimeError("Updated target failed its CLB health check")
        verify_candidate(target)
        change_weight(client, settings, target, target["weight"])
        release_event("Candidate verified and serving weight restored", target["name"])


def capacity_operation(client, name, event):
    request = scf_models.InvokeRequest()
    request.FunctionName, request.InvocationType = name, "RequestResponse"
    request.ClientContext = json.dumps(event)
    for attempt in range(20):
        result = client.Invoke(request).Result
        if result.ErrMsg:
            if attempt < 19 and re.search(r"concurr|并发", result.ErrMsg, re.I):
                time.sleep(3)
                continue
            raise RuntimeError("Capacity controller invocation failed")
        value = json.loads(result.RetMsg)
        if value.get("error") != "LockError" or attempt == 19:
            return value
        time.sleep(3)


def validate_targets(targets, elastic=False):
    if not isinstance(targets, list):
        raise ValueError("Invalid deployment target list")
    for target in targets:
        if not isinstance(target, dict) or set(target) != {"id", "name", "port", "weight"}:
            raise ValueError("Invalid deployment target fields")
        if not re.fullmatch(r"ins-[a-z0-9]+", target["id"]) or not re.fullmatch(r"[A-Za-z0-9_-]{1,64}", target["name"]):
            raise ValueError("Invalid target identity")
        if type(target["port"]) is not int or not 1 <= target["port"] <= 65535:
            raise ValueError("Invalid target port")
        if type(target["weight"]) is not int or not 1 <= target["weight"] <= 100:
            raise ValueError("Invalid target weight")
        if elastic and (target["port"] != 18080 or target["weight"] != 20):
            raise ValueError("Unexpected elastic port or weight")
    if len({t["id"] for t in targets}) != len(targets):
        raise ValueError("Duplicate deployment target")


def surge_release(client, settings, fixed, capacity, name):
    run_id = os.environ["LFTECH_RUN_ID"]
    if not re.fullmatch(r"[0-9]+-[0-9]+", run_id):
        raise ValueError("Invalid deployment run ID")
    # A rerun of the same workflow must adopt its own nodes, never allocate another pair.
    owner = run_id.split("-")[0] + "-1"
    release = {"image": os.environ["LFTECH_IMAGE_REF"], "source_sha": os.environ["LFTECH_SOURCE_SHA"],
               "version": os.environ["LFTECH_VERSION"]}
    begin = {"action": "begin_surge", "run_id": owner, "count": len(fixed), "release": release}
    release_event("Release capacity requested")
    deadline = time.monotonic() + 3600
    event = begin
    while time.monotonic() < deadline:
        result = capacity_operation(capacity, name, event)
        if result.get("ok") is True:
            phase = result.get("phase")
            if phase == "done" and result.get("done") is True:
                release_event("Previously completed release confirmed")
                return
            if phase == "finishing" or (phase == "rolling" and result.get("ready") is True):
                break
            if phase != "warming":
                raise RuntimeError("Unexpected release phase from capacity controller")
            event = {"action": "poll_surge", "run_id": owner}
        elif result.get("retryable") is not True:
            raise RuntimeError("Capacity controller could not admit or warm the release")
        time.sleep(15)
    else:
        raise RuntimeError("Release capacity did not become ready before the deadline")

    existing, surge = result["existing"], result["surge"]
    validate_targets(existing, elastic=True)
    validate_targets(surge, elastic=True)
    if len(existing) > 2 or len(surge) != len(fixed):
        raise RuntimeError("Unexpected release capacity size")
    targets = fixed + existing
    validate_targets(targets + surge)
    if phase == "rolling":
        states = target_health(client, settings)
        retiring = any(states.get((t["id"], t["port"]), (None, None))[1] == 0 for t in surge)
        if not retiring:
            rollout(client, settings, targets, surge)
        # If cancellation interrupted final draining, the entire retained fleet must
        # already serve the candidate before we touch any of the remaining surge nodes.
        for target in surge:
            verify_targets(client, settings, targets, candidate=True)
            state = target_health(client, settings).get((target["id"], target["port"]))
            if not state or state[1] not in (0, target["weight"]):
                raise RuntimeError("Unexpected surge target weight before retirement")
            drain_target(client, settings, target)

    verify_targets(client, settings, targets, candidate=True)
    release_event("Retained fleet verified; requesting surge removal")
    deadline = time.monotonic() + 1800
    while time.monotonic() < deadline:
        result = capacity_operation(capacity, name, {"action": "finish_surge", "run_id": owner})
        if result.get("ok") is True:
            if result.get("phase") == "done" and result.get("done") is True:
                release_event("Surge removal and release completion confirmed")
                return
            if result.get("phase") != "finishing":
                raise RuntimeError("Capacity controller did not confirm retirement")
        elif result.get("retryable") is not True:
            raise RuntimeError("Capacity controller could not finish the release")
        time.sleep(10)
    raise RuntimeError("Temporary release capacity retirement was not confirmed")


def deploy():
    targets = json.loads(os.environ["LFTECH_DEPLOY_TARGETS"])
    validate_targets(targets)
    if len(targets) != 2:
        raise ValueError("Exactly two fixed deployment targets are required")
    settings = {
        "clb": os.environ["LFTECH_CLB_ID"], "listener": os.environ["LFTECH_CLB_LISTENER_ID"],
        "location": os.environ["LFTECH_CLB_LOCATION_ID"],
    }
    for key, pattern in (("clb", r"lb-[a-z0-9]+"), ("listener", r"lbl-[a-z0-9]+"), ("location", r"loc-[a-z0-9]+")):
        if not re.fullmatch(pattern, settings[key]):
            raise ValueError("Invalid CLB setting: " + key)
    name = os.environ.get("LFTECH_CAPACITY_FUNCTION")
    if not name:
        raise ValueError("Missing required capacity controller")
    credentials = credential.Credential(os.environ["TENCENTCLOUD_SECRET_ID"], os.environ["TENCENTCLOUD_SECRET_KEY"])
    region = os.environ["TENCENTCLOUD_REGION"]
    client = clb_client.ClbClient(credentials, region)
    http = HttpProfile()
    http.reqTimeout = 180
    profile = ClientProfile()
    profile.httpProfile = http
    capacity = scf_client.ScfClient(credentials, region, profile)
    surge_release(client, settings, targets, capacity, name)


if __name__ == "__main__":
    try:
        deploy()
    except TencentCloudSDKException as error:
        print("Tencent Cloud API rejected the request: " + error.get_code(), file=sys.stderr)
        sys.exit(1)
    except (ValueError, RuntimeError, KeyError, TypeError) as error:
        print(str(error), file=sys.stderr)
        sys.exit(1)
