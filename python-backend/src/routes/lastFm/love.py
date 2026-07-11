"""Mark a track as loved on Last.fm."""

from . import blueprint
from ._actions import submit_track_action


@blueprint.route("/love", methods=["POST"])
def lastfm_love():
    return submit_track_action("track.love")
