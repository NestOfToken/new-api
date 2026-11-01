"""Deploy a published image through TAT; cloud credentials never enter scripts."""
import base64
import json
import os
import re
import shlex
import sys
import time

from tencentcloud.common import credential
from tencentcloud.common.exception.tencent_cloud_sdk_exception import TencentCloudSDKException
from tencentcloud.common.profile.client_profile import ClientProfile
from tencentcloud.common.profile.http_profile import HttpProfile
from tencentcloud.tat.v20201028 import models, tat_client


def deploy():
    required = (
        "TENCENTCLOUD_SECRET_ID", "TENCENTCLOUD_SECRET_KEY", "TENCENTCLOUD_REGION",
        "TENCENTCLOUD_INSTANCE_ID", "DEPLOY_DIR", "LFTECH_IMAGE_REF",
        "LFTECH_SOURCE_SHA", "LFTECH_VERSION", "LFTECH_RUN_ID",
    )
    missing = [name for name in required if not os.environ.get(name)]
    if missing:
        raise ValueError("Missing deployment settings: " + ", ".join(missing))
    image = os.environ["LFTECH_IMAGE_REF"]
    source_sha = os.environ["LFTECH_SOURCE_SHA"]
    version = os.environ["LFTECH_VERSION"]
    run_id = os.environ["LFTECH_RUN_ID"]
    deploy_dir = os.environ["DEPLOY_DIR"]
    for value, pattern, label in (
        (image, r"exlau/lftech-newapi@sha256:[a-f0-9]{64}", "image"),
        (source_sha, r"[a-f0-9]{40}", "source SHA"),
        (version, r"[A-Za-z0-9][A-Za-z0-9_.+-]{0,95}", "version"),
        (run_id, r"[0-9]+-[0-9]+", "run ID"),
        (deploy_dir, r"/opt/[A-Za-z0-9_./-]+", "deployment directory"),
        (os.environ["TENCENTCLOUD_INSTANCE_ID"], r"ins-[a-z0-9]+", "instance ID"),
        (os.environ["TENCENTCLOUD_REGION"], r"[a-z]+-[a-z]+(?:-[0-9]+)?", "region"),
    ):
        if not re.fullmatch(pattern, value):
            raise ValueError("Invalid " + label)
    if ".." in deploy_dir.split("/"):
        raise ValueError("Deployment directory cannot contain parent traversal")

    credentials = credential.Credential(
        os.environ["TENCENTCLOUD_SECRET_ID"], os.environ["TENCENTCLOUD_SECRET_KEY"]
    )
    http_profile = HttpProfile()
    http_profile.reqTimeout = 30
    client_profile = ClientProfile()
    client_profile.httpProfile = http_profile
    client = tat_client.TatClient(credentials, os.environ["TENCENTCLOUD_REGION"], client_profile)
    command = shlex.join([
        "sudo", "-n", "--", deploy_dir.rstrip("/") + "/scripts/deploy-new-api.sh",
        image, source_sha, version, run_id,
    ])
    request = models.RunCommandRequest()
    request.from_json_string(json.dumps({
        "Content": base64.b64encode(command.encode()).decode(),
        "CommandType": "SHELL", "CommandName": "lftech-new-api-deploy",
        "InstanceIds": [os.environ["TENCENTCLOUD_INSTANCE_ID"]],
        "Username": "newapiops", "WorkingDirectory": deploy_dir,
        "Timeout": 1200, "SaveCommand": False,
    }))
    invocation_id = client.RunCommand(request).InvocationId
    print("TAT invocation:", invocation_id, flush=True)
    deadline = time.monotonic() + 1260
    active = {"PENDING", "DELIVERING", "DELIVER_DELAYED", "RUNNING"}
    last_status = None
    while time.monotonic() < deadline:
        query = models.DescribeInvocationTasksRequest()
        query.from_json_string(json.dumps({
            "Filters": [{"Name": "invocation-id", "Values": [invocation_id]}],
            "HideOutput": False,
        }))
        tasks = client.DescribeInvocationTasks(query).InvocationTaskSet or []
        if tasks:
            task = tasks[0]
            if task.TaskStatus != last_status:
                print("TAT status:", task.TaskStatus, flush=True)
                last_status = task.TaskStatus
            if task.TaskStatus not in active:
                result = task.TaskResult
                if result and result.Output:
                    output = base64.b64decode(result.Output).decode(errors="replace")
                    # Values intentionally hidden by the operator must not be printed.
                    for name in ("TENCENTCLOUD_SECRET_ID", "TENCENTCLOUD_SECRET_KEY",
                                 "TENCENTCLOUD_REGION", "TENCENTCLOUD_INSTANCE_ID"):
                        output = output.replace(os.environ[name], "***")
                    # Disable Actions log commands in remote command output.
                    print("::stop-commands::lftech-tat-output", flush=True)
                    print(output, flush=True)
                    print("::lftech-tat-output::", flush=True)
                if task.TaskStatus != "SUCCESS" or not result or result.ExitCode != 0:
                    raise RuntimeError("Remote deployment failed; inspect the TAT invocation")
                summary = os.environ.get("GITHUB_STEP_SUMMARY")
                if summary:
                    with open(summary, "a", encoding="utf-8") as stream:
                        stream.write(f"\nDeployment succeeded. TAT invocation: `{invocation_id}`\n")
                        stream.write(f"\nImage: `{image}`\n\nSource: `{source_sha}`\n")
                return
        time.sleep(8)
    raise RuntimeError("TAT polling timed out; the remote command may still be running")


if __name__ == "__main__":
    try:
        deploy()
    except TencentCloudSDKException as error:
        print("Tencent Cloud API rejected the request: " + error.get_code(), file=sys.stderr)
        sys.exit(1)
    except (ValueError, RuntimeError) as error:
        print(str(error), file=sys.stderr)
        sys.exit(1)
