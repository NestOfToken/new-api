import os
import unittest
from types import SimpleNamespace
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

                def remote(status_only=False, prepare_only=False, prepared=False):
                    node = os.environ["TENCENTCLOUD_INSTANCE_ID"]
                    if status_only:
                        return {"image": "old", "health": "healthy"}
                    if prepare_only:
                        events.append(("prepare", node))
                        return
                    self.assertTrue(prepared)
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
                        self.assertEqual(events, [("prepare", "ins-master"), ("prepare", "ins-slave"), ("weight", "ins-master", 0), ("deploy", "ins-master")])
                        self.assertEqual(states[("ins-master", 18080)], (True, 0))
                        self.assertEqual(states[("ins-slave", 18080)], (True, 10))
                    else:
                        fleet_deploy.rollout(None, {"drain_seconds": 0}, targets)
                        self.assertEqual(events, [
                            ("prepare", "ins-master"), ("prepare", "ins-slave"),
                            ("weight", "ins-master", 0), ("deploy", "ins-master"), ("weight", "ins-master", 20),
                            ("weight", "ins-slave", 0), ("deploy", "ins-slave"), ("weight", "ins-slave", 10),
                        ])

    def test_unhealthy_peer_blocks_release(self):
        targets = [{"id": "ins-a", "name": "a", "port": 18080, "weight": 10},
                   {"id": "ins-b", "name": "b", "port": 18080, "weight": 10}]
        with patch.object(fleet_deploy, "target_health", return_value={
            ("ins-a", 18080): (True, 10), ("ins-b", 18080): (False, 10),
        }), patch.object(fleet_deploy, "remote_deploy") as remote:
            with self.assertRaisesRegex(RuntimeError, "All targets"):
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
            self.assertEqual(remote.call_count, 6)
            self.assertEqual([call.args[3] for call in weight.call_args_list], [10, 10])


    def test_capacity_rpc_uses_the_scf_result_contract(self):
        client = SimpleNamespace(Invoke=lambda request: SimpleNamespace(Result=SimpleNamespace(ErrMsg="", RetMsg='{"ok":true,"targets":[]}')))
        self.assertEqual(fleet_deploy.capacity_operation(client, "controller", {"action": "begin_release", "run_id": "1-1"}), {"ok": True, "targets": []})
        failing = SimpleNamespace(Invoke=lambda request: SimpleNamespace(Result=SimpleNamespace(ErrMsg="sensitive diagnostics", RetMsg="")))
        with self.assertRaisesRegex(RuntimeError, "Capacity controller invocation failed"):
            fleet_deploy.capacity_operation(failing, "controller", {})

    def test_elastic_peer_is_included_in_same_image_release(self):
        targets = [{"id": "ins-a", "name": "master", "port": 18080, "weight": 20},
                   {"id": "ins-b", "name": "slave", "port": 18080, "weight": 10},
                   {"id": "ins-elastic", "name": "elastic", "port": 18080, "weight": 20}]
        states = {(t["id"], t["port"]): (True, t["weight"]) for t in targets}
        with patch.dict(os.environ, {"LFTECH_IMAGE_REF": "same"}), \
             patch.object(fleet_deploy, "target_health", return_value=states), \
             patch.object(fleet_deploy, "remote_deploy", return_value={"image": "same", "health": "healthy"}) as remote, \
             patch.object(fleet_deploy, "change_weight") as weight:
            fleet_deploy.rollout(None, {}, targets)
            self.assertEqual(remote.call_count, 9)
            self.assertEqual([call.args[3] for call in weight.call_args_list], [20, 10, 20])

    def test_preparation_failure_never_drains_or_applies_any_target(self):
        targets = [{"id": "ins-a", "name": "master", "port": 18080, "weight": 20},
                   {"id": "ins-b", "name": "slave", "port": 18080, "weight": 10},
                   {"id": "ins-elastic", "name": "elastic", "port": 18080, "weight": 20}]
        states = {(t["id"], t["port"]): (True, t["weight"]) for t in targets}
        for failing in targets:
            with self.subTest(failing=failing["id"]):
                def remote(**options):
                    self.assertEqual(options, {"prepare_only": True})
                    if os.environ["TENCENTCLOUD_INSTANCE_ID"] == failing["id"]:
                        raise RuntimeError("preparation failed or unresolved")

                with patch.object(fleet_deploy, "target_health", return_value=states), \
                     patch.object(fleet_deploy, "remote_deploy", side_effect=remote), \
                     patch.object(fleet_deploy, "change_weight") as weight:
                    with self.assertRaisesRegex(RuntimeError, "preparation failed"):
                        fleet_deploy.rollout(None, {}, targets)
                    weight.assert_not_called()

    def test_tat_modes_are_mutually_exclusive(self):
        import tat_deploy
        for options in ({"status_only": True, "prepared": True},
                        {"prepare_only": True, "prepared": True}):
            with self.subTest(options=options), self.assertRaisesRegex(ValueError, "Conflicting"):
                tat_deploy.deploy(**options)


if __name__ == "__main__":
    unittest.main()
