import os
import unittest
from unittest.mock import patch

import fleet_deploy


class FleetDeploymentTests(unittest.TestCase):
    def test_rolling_order_and_failure_isolation(self):
        for fail in (False, True):
            with self.subTest(fail=fail):
                targets = [
                    {"id": "ins-master", "name": "master", "port": 18080, "weight": 20},
                    {"id": "ins-slave", "name": "slave", "port": 18080, "weight": 10},
                ]
                states = {(t["id"], t["port"]): (True, t["weight"]) for t in targets}
                events = []

                def remote(status_only=False):
                    node = os.environ["TENCENTCLOUD_INSTANCE_ID"]
                    if status_only:
                        return {"image": "old", "health": "healthy"}
                    events.append(("deploy", node))
                    if fail:
                        raise RuntimeError("deployment failed")

                def weight(client, settings, target, value):
                    peer = targets[1] if target == targets[0] else targets[0]
                    self.assertGreater(states[(peer["id"], peer["port"])][1], 0)
                    states[(target["id"], target["port"])] = (True, value)
                    events.append(("weight", target["id"], value))

                with patch.dict(os.environ, {"LFTECH_IMAGE_REF": "new"}), \
                     patch.object(fleet_deploy, "target_health", side_effect=lambda *_: dict(states)), \
                     patch.object(fleet_deploy, "remote_deploy", side_effect=remote), \
                     patch.object(fleet_deploy, "change_weight", side_effect=weight):
                    if fail:
                        with self.assertRaisesRegex(RuntimeError, "deployment failed"):
                            fleet_deploy.rollout(None, {"drain_seconds": 0}, targets)
                        self.assertEqual(events, [("weight", "ins-master", 0), ("deploy", "ins-master")])
                        self.assertEqual(states[("ins-master", 18080)], (True, 0))
                        self.assertEqual(states[("ins-slave", 18080)], (True, 10))
                    else:
                        fleet_deploy.rollout(None, {"drain_seconds": 0}, targets)
                        self.assertEqual(events, [
                            ("weight", "ins-master", 0), ("deploy", "ins-master"), ("weight", "ins-master", 20),
                            ("weight", "ins-slave", 0), ("deploy", "ins-slave"), ("weight", "ins-slave", 10),
                        ])

    def test_unhealthy_peer_blocks_release(self):
        targets = [{"id": "ins-a", "name": "a", "port": 18080, "weight": 10},
                   {"id": "ins-b", "name": "b", "port": 18080, "weight": 10}]
        with patch.object(fleet_deploy, "target_health", return_value={
            ("ins-a", 18080): (True, 10), ("ins-b", 18080): (False, 10),
        }), patch.object(fleet_deploy, "remote_deploy") as remote:
            with self.assertRaisesRegex(RuntimeError, "Both targets"):
                fleet_deploy.rollout(None, {}, targets)
            remote.assert_not_called()

    def test_healthy_same_image_does_not_drain(self):
        targets = [{"id": "ins-a", "name": "a", "port": 18080, "weight": 10},
                   {"id": "ins-b", "name": "b", "port": 18080, "weight": 10}]
        with patch.dict(os.environ, {"LFTECH_IMAGE_REF": "same"}), \
             patch.object(fleet_deploy, "target_health", return_value={
                 ("ins-a", 18080): (True, 10), ("ins-b", 18080): (True, 10),
             }), patch.object(fleet_deploy, "remote_deploy", return_value={"image": "same", "health": "healthy"}) as remote, \
             patch.object(fleet_deploy, "change_weight") as weight:
            fleet_deploy.rollout(None, {}, targets)
            self.assertEqual(remote.call_count, 4)
            weight.assert_not_called()


if __name__ == "__main__":
    unittest.main()
