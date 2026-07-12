"""Runtime outbound-network settings for the frontend."""

from flask import jsonify, request

from . import blueprint
from ._services import network_settings
from src.type_defs import RouteResponse


@blueprint.route("/network/ipv4-first", methods=["GET", "POST"])
def ipv4_first_settings() -> RouteResponse:
    """Read or change the process-wide IPv4-first resolver preference."""
    settings = network_settings()
    if request.method == "POST":
        data = request.get_json(silent=True)
        enabled = data.get("enabled") if isinstance(data, dict) else None
        if not isinstance(enabled, bool):
            return jsonify({"error": "enabled must be a boolean"}), 400
        settings.set_ipv4_first_enabled(enabled)

    return jsonify({"enabled": settings.ipv4_first_enabled})
