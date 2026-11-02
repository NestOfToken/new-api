"""Deploy one image to both CVMs, draining CLB traffic one target at a time."""
import json
import os
import re
import sys
import time

from tencentcloud.clb.v20180317 import clb_client, models
from tencentcloud.common import credential
from tencentcloud.common.exception.tencent_cloud_sdk_exception import TencentCloudSDKException
from tat_deploy import deploy as remote_deploy


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
    client.ModifyTargetWeight(request)
    deadline = time.monotonic() + 120
    while time.monotonic() < deadline:
        state = target_health(client, settings).get((target["id"], target["port"]))
        if state and state[1] == weight:
            return
        time.sleep(5)
    raise RuntimeError("CLB did not confirm the target weight; deployment stopped")


def rollout(client, settings, targets):
    # Configure the master first. A schema upgrade must remain compatible with
    # the previous application for the duration of the rolling deployment.
    for target in targets:
        states = target_health(client, settings)
        for peer in targets:
            if states.get((peer["id"], peer["port"])) != (True, peer["weight"]):
                raise RuntimeError("Both targets must be healthy at their configured weights before deployment")
        os.environ["TENCENTCLOUD_INSTANCE_ID"] = target["id"]
        current = remote_deploy(status_only=True)
        if current.get("health") != "healthy":
            raise RuntimeError("Current application is unhealthy; deployment stopped")
        replacing = current.get("image") != os.environ["LFTECH_IMAGE_REF"]
        if replacing:
            print("Draining:", target["name"], flush=True)
            change_weight(client, settings, target, 0)
            # Requests longer than this bounded window can still be interrupted.
            deadline = time.monotonic() + settings["drain_seconds"]
            while time.monotonic() < deadline:
                time.sleep(min(30, max(0, deadline - time.monotonic())))
                print("Waiting for in-flight requests:", target["name"], flush=True)
        # On failure do not restore weight: preserve the healthy peer and stop.
        remote_deploy()
        deadline = time.monotonic() + 180
        while time.monotonic() < deadline:
            state = target_health(client, settings).get((target["id"], target["port"]))
            if state and state[0]:
                break
            time.sleep(5)
        else:
            raise RuntimeError("Target failed its CLB health check; it remains drained")
        # Reassert unchanged weights on same-image runs as well, so those runs
        # verify CLB write permission before a future release needs to drain.
        change_weight(client, settings, target, target["weight"])
        print("Deployment verified:", target["name"], flush=True)


def deploy():
    targets = json.loads(os.environ["LFTECH_DEPLOY_TARGETS"])
    if not isinstance(targets, list) or len(targets) != 2:
        raise ValueError("Exactly two deployment targets are required")
    for target in targets:
        if not isinstance(target, dict) or set(target) != {"id", "name", "port", "weight"}:
            raise ValueError("Invalid deployment target fields")
        if not re.fullmatch(r"ins-[a-z0-9]+", target["id"]) or not re.fullmatch(r"[A-Za-z0-9_-]{1,64}", target["name"]):
            raise ValueError("Invalid target identity")
        if type(target["port"]) is not int or not 1 <= target["port"] <= 65535:
            raise ValueError("Invalid target port")
        if type(target["weight"]) is not int or not 1 <= target["weight"] <= 100:
            raise ValueError("Invalid target weight")
    if targets[0]["id"] == targets[1]["id"]:
        raise ValueError("Targets must be distinct instances")
    settings = {
        "clb": os.environ["LFTECH_CLB_ID"], "listener": os.environ["LFTECH_CLB_LISTENER_ID"],
        "location": os.environ["LFTECH_CLB_LOCATION_ID"],
        "drain_seconds": int(os.environ.get("LFTECH_DRAIN_SECONDS", "600")),
    }
    for key, pattern in (("clb", r"lb-[a-z0-9]+"), ("listener", r"lbl-[a-z0-9]+"), ("location", r"loc-[a-z0-9]+")):
        if not re.fullmatch(pattern, settings[key]):
            raise ValueError("Invalid CLB setting: " + key)
    if not 60 <= settings["drain_seconds"] <= 1800:
        raise ValueError("Drain window must be 60 to 1800 seconds")
    credentials = credential.Credential(os.environ["TENCENTCLOUD_SECRET_ID"], os.environ["TENCENTCLOUD_SECRET_KEY"])
    client = clb_client.ClbClient(credentials, os.environ["TENCENTCLOUD_REGION"])
    rollout(client, settings, targets)


if __name__ == "__main__":
    try:
        deploy()
    except TencentCloudSDKException as error:
        print("Tencent Cloud API rejected the request: " + error.get_code(), file=sys.stderr)
        sys.exit(1)
    except (ValueError, RuntimeError, KeyError, TypeError) as error:
        print(str(error), file=sys.stderr)
        sys.exit(1)
