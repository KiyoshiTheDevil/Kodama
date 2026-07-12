from unittest.mock import patch

from route_test_support import RouteTestCase


class OperationsRouteTests(RouteTestCase):
    def test_ipv4_first_setting_can_be_read_and_changed(self) -> None:
        self.assertEqual(self.client.get("/network/ipv4-first").json, {"enabled": True})

        disabled = self.client.post("/network/ipv4-first", json={"enabled": False})
        self.assertEqual(disabled.status_code, 200)
        self.assertEqual(disabled.json, {"enabled": False})
        self.assertFalse(self.network_settings.ipv4_first_enabled)

        enabled = self.client.post("/network/ipv4-first", json={"enabled": True})
        self.assertEqual(enabled.status_code, 200)
        self.assertEqual(enabled.json, {"enabled": True})
        self.assertTrue(self.network_settings.ipv4_first_enabled)

    def test_ipv4_first_setting_requires_a_boolean(self) -> None:
        response = self.client.post("/network/ipv4-first", json={"enabled": "false"})

        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json, {"error": "enabled must be a boolean"})

    def test_debug_info_route_reports_runtime_context(self) -> None:
        with patch("src.routes.operations.debug.time.time", return_value=1065.0), patch(
            "src.routes.operations.debug.shutil.which", return_value="/usr/bin/node"
        ):
            response = self.client.get("/debug/info")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json["node"], "/usr/bin/node")
        self.assertEqual(response.json["profile"], "default")
        self.assertEqual(response.json["uptime"], "1m 5s")
        self.assertIn("python", response.json)
        self.assertIn("logs", response.json)

    def test_local_fonts_route_returns_a_list(self) -> None:
        response = self.client.get("/api/local-fonts")
        self.assertEqual(response.status_code, 200)
        self.assertIsInstance(response.json, list)

    def test_overlay_routes(self) -> None:
        page = self.client.get("/overlay")
        self.assertEqual(page.status_code, 200)
        self.assertIn(b"Overlay", page.data)
        self.assertEqual(page.headers["X-Frame-Options"], "ALLOWALL")

        stream = self.client.get("/overlay/stream")
        self.assertEqual(stream.status_code, 200)
        self.assertIn(b'"title": "Song"', stream.data)

        self.assertEqual(self.client.post("/overlay/push", json={"title": "Now Playing"}).json, {"ok": True})
        self.assertEqual(self.overlay_server.state["title"], "Now Playing")

        self.assertEqual(self.client.get("/overlay/config").json["version"], 2)
        self.assertEqual(self.client.post("/overlay/config", json={"version": 2, "layers": ["x"]}).json, {"ok": True})
        self.assertEqual(self.overlay_server.config["layers"], ["x"])

        self.assertEqual(self.client.post("/overlay/server/start", json={"port": 9900}).json, {"ok": True, "port": 9900})
        self.assertEqual(self.overlay_server.started_ports, [9900])
        self.assertEqual(self.client.get("/overlay/status").json, {"running": True, "clients": 0})
        self.assertEqual(self.client.post("/overlay/server/stop").json, {"ok": True})
        self.assertEqual(self.client.get("/overlay/status").json, {"running": False, "clients": 0})

    def test_remote_desktop_routes_are_localhost_only(self) -> None:
        forbidden = self.client.post("/remote/_enable", json={"enabled": True}, environ_overrides={"REMOTE_ADDR": "192.0.2.10"})
        self.assertEqual(forbidden.status_code, 403)

        enabled = self.client.post(
            "/remote/_enable",
            json={"enabled": True, "token": "tok", "trusted": [{"id": "phone", "name": "Phone"}]},
        )
        self.assertEqual(enabled.json["enabled"], True)
        self.assertEqual(enabled.json["token"], "tok")

        status = self.client.get("/remote/_status")
        self.assertEqual(status.json["devices"][0]["id"], "phone")

        self.remote_control.devices["new"] = {"name": "New", "status": "pending"}
        self.assertEqual(self.client.post("/remote/_device", json={"id": "new", "action": "approve"}).json, {"ok": True})
        self.assertEqual(self.remote_control.devices["new"]["status"], "approved")
        self.assertEqual(self.client.post("/remote/_device", json={"id": "missing", "action": "approve"}).status_code, 404)

        self.assertEqual(self.client.post("/remote/_push", json={"title": "Song"}).json, {"ok": True})
        self.remote_control.commands.append("next")
        self.assertEqual(self.client.get("/remote/_poll").json, {"commands": ["next"]})
        self.remote_control.commands.append("prev")
        self.assertEqual(self.client.post("/remote/_sync", json={"state": {"title": "Synced"}}).json, {"commands": ["prev"]})
        self.assertEqual(self.remote_control.state["title"], "Synced")

    def test_remote_phone_routes_and_page(self) -> None:
        self.client.post("/remote/_enable", json={"enabled": True, "token": "tok"})

        self.assertEqual(self.client.post("/remote/hello", json={"token": "bad", "deviceId": "phone"}).status_code, 403)
        hello = self.client.post("/remote/hello", json={"token": "tok", "deviceId": "phone", "name": "Phone"})
        self.assertEqual(hello.json, {"status": "pending"})

        pending_state = self.client.get("/remote/state?token=tok&deviceId=phone")
        self.assertEqual(pending_state.json, {"status": "pending"})
        self.assertEqual(self.client.post("/remote/cmd", json={"token": "tok", "deviceId": "phone", "action": "next"}).status_code, 403)

        self.remote_control.devices["phone"]["status"] = "approved"
        approved_state = self.client.get("/remote/state?token=tok&deviceId=phone")
        self.assertEqual(approved_state.json["status"], "approved")
        self.assertIn("state", approved_state.json)

        self.assertEqual(self.client.post("/remote/cmd", json={"token": "tok", "deviceId": "phone", "action": "next"}).json, {"ok": True})
        self.assertEqual(self.client.post("/remote/cmd", json={"token": "tok", "deviceId": "phone", "action": "bad"}).status_code, 400)
        page = self.client.get("/remote")
        self.assertEqual(page.status_code, 200)
        self.assertIn(b"Remote", page.data)
