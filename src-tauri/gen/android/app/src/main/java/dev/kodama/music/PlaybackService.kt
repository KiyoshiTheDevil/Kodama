package dev.kodama.music

import android.app.PendingIntent
import android.content.Intent
import androidx.media3.common.Player
import androidx.media3.session.MediaSession
import androidx.media3.session.MediaSessionService

/**
 * Hosts the media session for MediaBridge's player. Media3 builds the notification and the
 * lock-screen controls from it, and runs this service in the foreground while something plays,
 * which also keeps Android from stopping the app (and the web view's audio) in the background.
 */
class PlaybackService : MediaSessionService() {
  private var session: MediaSession? = null

  override fun onCreate() {
    super.onCreate()
    // A tap on the notification brings Kodama back.
    val open = PendingIntent.getActivity(
      this, 0,
      Intent(this, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP),
      PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
    )
    session = MediaSession.Builder(this, MediaBridge.player)
      .setSessionActivity(open)
      .build()
      // Registered right away. Media3 posts the notification and goes to the foreground only
      // for sessions it manages, and on its own it only takes one on when a controller binds to
      // this service; the system's media controls talk to the session directly and never do.
      .also { addSession(it) }
  }

  override fun onGetSession(controllerInfo: MediaSession.ControllerInfo): MediaSession? = session

  // Swiped away from the recent apps while paused: nothing to keep running for.
  override fun onTaskRemoved(rootIntent: Intent?) {
    val player = session?.player
    if (player == null || !player.playWhenReady || player.playbackState == Player.STATE_IDLE) stopSelf()
  }

  override fun onDestroy() {
    // The player is MediaBridge's and outlives this service; only the session goes.
    session?.release()
    session = null
    super.onDestroy()
  }
}
