from unittest import TestCase
from unittest.mock import Mock, patch

from src.lib.runtime.launcher import run_server


class RuntimeLauncherTests(TestCase):
    def test_run_server_preserves_the_packaged_backend_runtime_contract(self):
        app = Mock()
        with patch("src.lib.runtime.launcher._port_is_free", return_value=True), patch(
            "src.lib.runtime.launcher._start_self_test"
        ), patch("src.lib.runtime.launcher.StartupLog") as startup_log:
            run_server(app, host="127.0.0.1", port=9999)

        app.run.assert_called_once_with(
            host="127.0.0.1", port=9999, debug=False, threaded=True, use_reloader=False
        )
        startup_log.return_value.write.assert_any_call("port 9999 is free")
