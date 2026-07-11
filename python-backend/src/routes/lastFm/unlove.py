"""Remove the loved mark from a Last.fm track."""

from . import blueprint
from ._actions import submit_track_action


@blueprint.route("/unlove", methods=["POST"])
def lastfm_unlove():
    return submit_track_action("track.unlove")
