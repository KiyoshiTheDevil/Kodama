"""Create a profile from cookies returned by the embedded browser."""

import threading

from flask import jsonify, request

from . import blueprint
from ._services import music_session, profiles
from src.type_defs import RouteResponse


@blueprint.route("/cookie-login", methods=["POST"])
def cookie_login() -> RouteResponse:
    data = request.json or {}
    cookie_string = data.get("cookie", "")
    user_agent = data.get("user_agent", "Mozilla/5.0")
    profile_name = data.get("profile_name", "default")
    # Brand-account id captured from the login WebView's ytcfg (DELEGATED_SESSION_ID).
    # Empty for the default (non-brand) account. Also defensively strip any KODAMA_*
    # helper cookies out of the auth cookie string and recover the id from
    # KODAMA_DSID if the request body didn't carry it.
    delegated = (data.get("delegated_session_id") or "").strip()
    if cookie_string:
        kept = []
        for part in cookie_string.split(";"):
            piece = part.strip()
            if piece.startswith("KODAMA_DSID=") and not delegated:
                delegated = piece[len("KODAMA_DSID=") :].strip()
            if not piece.startswith("KODAMA_"):
                kept.append(piece)
        cookie_string = "; ".join(kept)

    if not cookie_string:
        return jsonify({"error": "Keine Cookies"}), 400
    if not any(cookie in cookie_string for cookie in ("SAPISID", "SSID", "HSID")):
        return jsonify({"error": "Keine Auth-Cookies gefunden. Bitte erst einloggen."}), 400

    headers = {
        "accept": "*/*",
        "accept-language": "en-US,en;q=0.5",
        "content-type": "application/json",
        "cookie": cookie_string,
        "origin": "https://music.youtube.com",
        "user-agent": user_agent,
        "x-origin": "https://music.youtube.com",
    }
    profile_repository = profiles()
    session = music_session()
    profile_repository.write_auth_headers(profile_name, session.prepare_auth_headers(headers))
    print(
        f"[login] cookie-login profile={profile_name} "
        f"brand_account={'yes id=' + delegated if delegated else 'no (default account)'}",
        flush=True,
    )
    try:
        # Persist the brand-account context before verification so create_client
        # exercises the chosen (brand) account, not the default one.
        metadata = profile_repository.read_metadata(profile_name)
        if delegated:
            metadata["brandUserId"] = delegated
        else:
            metadata.pop("brandUserId", None)
        profile_repository.write_metadata(profile_name, metadata)

        session.activate_verified_profile(profile_name)
        metadata = profile_repository.read_metadata(profile_name)
        metadata.pop("logged_out", None)
        metadata.setdefault("displayName", profile_name.capitalize())
        profile_repository.write_metadata(profile_name, metadata)
        threading.Thread(target=session.refresh_account_info, args=(profile_name,), daemon=True).start()
        session.state.adding_account = False
        return jsonify({"ok": True, "profile": profile_name})
    except Exception as error:
        profile_repository.remove_auth_headers(profile_name)
        return jsonify({"error": f"Login fehlgeschlagen: {error}"}), 500
