"""Send the current track to Last.fm."""

from . import blueprint
from ._actions import submit_track_action


@blueprint.route("/now-playing", methods=["POST"])
def lastfm_now_playing():
    return submit_track_action("track.updateNowPlaying")
