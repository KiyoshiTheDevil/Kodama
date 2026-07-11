"""Scrobble a played track to Last.fm."""

import time

from . import blueprint
from ._actions import submit_track_action


@blueprint.route("/scrobble", methods=["POST"])
def lastfm_scrobble():
    return submit_track_action(
        "track.scrobble",
        extra=lambda data: {"timestamp": str(int(data.get("timestamp") or time.time()))},
    )
