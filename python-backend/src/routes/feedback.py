import json

import requests
from flask import Blueprint, current_app, jsonify, request

from src.lib.runtime.logging import FEEDBACK_LOG_RING

blueprint = Blueprint("feedback", __name__)

@blueprint.route("/feedback", methods=["POST"])
def submit_feedback():
    webhook_url = current_app.extensions.get("feedback_webhook_url", "")
    if not webhook_url:
        return jsonify({"error": "feedback_not_configured"}), 503
    data = request.json or {}
    title = (data.get("title") or "").strip()
    category = (data.get("category") or "Bug").strip()
    severity = (data.get("severity") or "").strip()
    description = (data.get("description") or "").strip()
    version = (data.get("version") or "?").strip()
    os_info = (data.get("os") or "?").strip()
    reporter = (data.get("reporter") or "").strip()
    include_logs = bool(data.get("includeLogs", True))
    if not title and not description:
        return jsonify({"error": "empty"}), 400

    color = {"Bug": 0xE24B4A, "Absturz": 0xA32D2D, "UI / Design": 0x378ADD,
             "Vorschlag": 0x1D9E75}.get(category, 0x888780)
    fields = [
        {"name": "Category", "value": category or "—", "inline": True},
        {"name": "Version", "value": version, "inline": True},
        {"name": "System", "value": os_info, "inline": True},
    ]
    if severity:
        fields.append({"name": "Severity", "value": severity, "inline": True})
    embed = {
        "title": (title or "(no title)")[:240],
        "description": (description or "—")[:3900],
        "color": color,
        "fields": fields,
    }
    if reporter:
        embed["footer"] = {"text": f"from {reporter[:80]}"}

    files = {}
    # Optional screenshot (base64, with or without a data: URL prefix) → inline embed image.
    shot = data.get("screenshot")
    if shot:
        try:
            import base64
            if "," in shot and shot.strip().startswith("data:"):
                shot = shot.split(",", 1)[1]
            png = base64.b64decode(shot)
            if 0 < len(png) <= 8 * 1024 * 1024:
                files["file_shot"] = ("screenshot.png", png, "image/png")
                embed["image"] = {"url": "attachment://screenshot.png"}
        except Exception:
            pass
    payload = {"username": "Kodama Feedback", "embeds": [embed]}
    if include_logs and FEEDBACK_LOG_RING:
        log_text = "\n".join(list(FEEDBACK_LOG_RING)[-80:])
        files["file_log"] = ("backend-log.txt", log_text, "text/plain")
    try:
        if files:
            resp = requests.post(webhook_url,
                                 data={"payload_json": json.dumps(payload)},
                                 files=files, timeout=15)
        else:
            resp = requests.post(webhook_url, json=payload, timeout=12)
        if resp.status_code >= 300:
            return jsonify({"error": f"webhook_{resp.status_code}"}), 502
        return jsonify({"ok": True})
    except Exception as e:
        return jsonify({"error": str(e)}), 502
