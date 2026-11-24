import json
import os
import unittest
from types import SimpleNamespace
from unittest.mock import Mock, patch

import fleet_deploy
import tat_deploy


def target(name, weight=20):
    return {"id": "ins-" + name, "name": name, "port": 18080, "weight": weight}


class FleetDeploymentTests(unittest.TestCase):
    def setUp(self):
        self.enterContext(patch.object(fleet_deploy, "release_event"))
        self.fixed = [target("master"), target("slave", 10)]
        self.existing = [target("autoscaled")]
        self.surge = [target("surge1"), target("surge2")]
        self.retained = self.fixed + self.existing
        fleet = self.retained + self.surge
        self.weights = {t["id"]: t["weight"] for t in fleet}
        self.images = {t["id"]: "current" for t in self.retained}
        self.images.update({t["id"]: "candidate" for t in self.surge})
        self.healthy = {t["id"]: True for t in fleet}
        self.container_healthy = dict(self.healthy)
        self.events = []
        self.calls = []
        self.phase = "warming"
        self.fail = None
        self.drain_result = {"drained": True}
        self.enterContext(patch.dict(os.environ, {
            "LFTECH_IMAGE_REF": "candidate", "LFTECH_SOURCE_SHA": "a" * 40,
            "LFTECH_VERSION": "v2", "LFTECH_RUN_ID": "123-3",
        }))
        self.enterContext(patch.object(fleet_deploy, "capacity_operation", side_effect=self.capacity))
        self.enterContext(patch.object(fleet_deploy, "change_weight", side_effect=self.weight))
        self.enterContext(patch.object(fleet_deploy, "target_health", side_effect=self.health))
        self.enterContext(patch.object(fleet_deploy, "remote_deploy", side_effect=self.remote))
        self.enterContext(patch.object(fleet_deploy.time, "sleep"))

    def health(self, *_):
        return {(node, 18080): (self.healthy[node], weight) for node, weight in self.weights.items()}

    def weight(self, client, settings, node, value):
        self.weights[node["id"]] = value
        self.events.append(("weight", node["name"], value))

    def remote(self, **options):
        node = os.environ["TENCENTCLOUD_INSTANCE_ID"]
        self.assertEqual(len(options), 1)
        mode = next(iter(options))
        self.events.append((mode, node.removeprefix("ins-")))
        if self.fail == (mode, node):
            raise RuntimeError("injected failure")
        if mode == "status_only":
            health = "healthy" if self.container_healthy[node] else "unhealthy"
            return {"health": health, "image": self.images[node]}
        if mode == "prepared":
            self.images[node] = "candidate"
        if mode == "drain_only":
            return self.drain_result

    def capacity(self, client, name, event):
        self.calls.append(event)
        if event["action"] == "poll_surge":
            self.phase = "rolling"
        if event["action"] == "finish_surge":
            self.assertTrue(all(self.images[t["id"]] == "candidate" for t in self.retained))
            self.assertTrue(all(self.weights[t["id"]] == t["weight"] for t in self.retained))
            self.assertTrue(all(self.weights[t["id"]] == 0 for t in self.surge if t["id"] in self.weights))
            self.phase = "done" if self.phase == "finishing" else "finishing"
        return {"ok": True, "phase": self.phase, "ready": self.phase == "rolling",
                "done": self.phase == "done", "existing": self.existing, "surge": self.surge}

    def release(self):
        fleet_deploy.surge_release(None, {}, self.fixed, None, "controller")

    def test_full_release_preserves_existing_capacity_and_confirms_removal(self):
        self.release()
        self.assertEqual(self.calls[0], {"action": "begin_surge", "run_id": "123-1", "count": 2,
                                        "release": {"image": "candidate", "source_sha": "a" * 40, "version": "v2"}})
        self.assertEqual([event["action"] for event in self.calls],
                         ["begin_surge", "poll_surge", "finish_surge", "finish_surge"])
        writes = [e for e in self.events if e[0] != "status_only"]
        expected = [("prepare_only", t["name"]) for t in self.retained]
        for t in self.retained:
            expected.extend([("weight", t["name"], 0), ("drain_only", t["name"]),
                             ("prepared", t["name"]), ("weight", t["name"], t["weight"])])
        for t in self.surge:
            expected.extend([("weight", t["name"], 0), ("drain_only", t["name"])])
        self.assertEqual(writes, expected)

    def test_candidate_and_load_balancer_checks_precede_any_traffic_change(self):
        for failure in ("digest", "container", "clb", "weight"):
            with self.subTest(failure=failure):
                node = self.surge[1]["id"]
                self.images[node] = "wrong" if failure == "digest" else "candidate"
                self.container_healthy[node] = failure != "container"
                self.healthy[node] = failure != "clb"
                self.weights[node] = 3 if failure == "weight" else 20
                with self.assertRaises(RuntimeError):
                    self.release()
                self.assertFalse(any(e[0] in {"weight", "prepared"} for e in self.events))
                self.assertFalse(any(e["action"] == "finish_surge" for e in self.calls))

    def test_invalid_target_inventory_cannot_change_fixed_nodes(self):
        for invalid in ([target("master"), target("surge2")], [target("only")],
                        [target("bad", 10), target("surge2")]):
            with self.subTest(invalid=invalid):
                self.surge = invalid
                with self.assertRaises((RuntimeError, ValueError)):
                    self.release()
                self.assertEqual(self.events, [])

    def test_preparation_fails_before_any_drain(self):
        self.fail = ("prepare_only", self.existing[0]["id"])
        with self.assertRaisesRegex(RuntimeError, "injected"):
            self.release()
        self.assertFalse(any(e[0] == "weight" for e in self.events))

    def test_failed_apply_keeps_peer_and_surge_online_and_owner_can_resume(self):
        self.fail = ("prepared", "ins-slave")
        with self.assertRaisesRegex(RuntimeError, "injected"):
            self.release()
        self.assertEqual(self.weights["ins-slave"], 0)
        self.assertTrue(all(self.weights[t["id"]] == 20 for t in self.surge + self.existing))
        self.assertFalse(any(e["action"] == "finish_surge" for e in self.calls))
        self.assertNotIn(("prepared", "autoscaled"), self.events)
        self.events.clear()
        self.fail = None
        self.release()
        self.assertEqual(next(e for e in self.events if e[0] == "prepared"), ("prepared", "slave"))

    def test_surge_loss_during_drain_stops_before_replacing_original(self):
        remote = self.remote

        def lose_peer(**options):
            result = remote(**options)
            if options.get("drain_only"):
                self.healthy["ins-surge2"] = False
            return result

        with patch.object(fleet_deploy, "remote_deploy", side_effect=lose_peer), self.assertRaisesRegex(RuntimeError, "CLB"):
            self.release()
        self.assertEqual(self.images["ins-master"], "current")
        self.assertNotIn(("weight", "slave", 0), self.events)
        self.assertFalse(any(e["action"] == "finish_surge" for e in self.calls))

    def test_known_drain_deadline_can_proceed_but_unconfirmed_result_cannot(self):
        self.drain_result = {}
        with self.assertRaisesRegex(RuntimeError, "Unconfirmed drain"):
            self.release()
        self.assertEqual(self.images["ins-master"], "current")
        self.drain_result = {"drained": False}
        self.release()
        self.assertEqual(self.phase, "done")

    def test_partial_surge_drain_requires_all_originals_on_new_image(self):
        self.phase = "rolling"
        self.weights["ins-surge1"] = 0
        with self.assertRaisesRegex(RuntimeError, "Running image"):
            self.release()
        self.assertFalse(any(e[0] == "weight" for e in self.events))
        self.images.update({t["id"]: "candidate" for t in self.retained})
        self.release()
        self.assertNotIn(("prepared", "master"), self.events)
        self.assertTrue(all(e[1].startswith("surge") for e in self.events if e[0] == "weight"))
        self.assertEqual(self.phase, "done")

    def test_rerun_during_removal_does_not_contact_terminating_nodes(self):
        self.phase = "finishing"
        self.images.update({t["id"]: "candidate" for t in self.retained})
        for t in self.surge:
            del self.weights[t["id"]]
        self.release()
        self.assertFalse(any(e[1].startswith("surge") for e in self.events))
        self.assertEqual(self.phase, "done")
        self.events.clear()
        self.release()
        self.assertEqual(self.events, [])


class CapacityRpcTests(unittest.TestCase):
    def test_only_admission_failures_are_retried(self):
        def reply(invocation_error="", **value):
            return SimpleNamespace(Result=SimpleNamespace(ErrMsg=invocation_error, RetMsg=json.dumps(value)))

        client = Mock()
        client.Invoke.side_effect = [reply(invocation_error="Concurrency limit"), reply(ok=False, error="LockError"), reply(ok=True)]
        with patch.object(fleet_deploy.time, "sleep"):
            self.assertEqual(fleet_deploy.capacity_operation(client, "controller", {"action": "finish_surge"}), {"ok": True})
        self.assertEqual(client.Invoke.call_count, 3)
        client.Invoke.side_effect = [reply(invocation_error="sensitive diagnostics")]
        with self.assertRaisesRegex(RuntimeError, "^Capacity controller invocation failed$"):
            fleet_deploy.capacity_operation(client, "controller", {})

    def test_tat_modes_are_mutually_exclusive(self):
        for options in ({"status_only": True, "prepared": True}, {"prepare_only": True, "prepared": True}):
            with self.subTest(options=options), self.assertRaisesRegex(ValueError, "Conflicting"):
                tat_deploy.deploy(**options)


if __name__ == "__main__":
    unittest.main()
