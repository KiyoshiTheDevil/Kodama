package dev.kodama.music

import android.app.Activity
import android.content.Context
import android.content.pm.ActivityInfo
import android.content.Intent
import android.media.AudioDeviceCallback
import android.media.AudioDeviceInfo
import android.media.AudioManager
import android.media.MediaRouter2
import android.provider.Settings
import android.net.Uri
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.util.Log
import android.view.HapticFeedbackConstants
import android.webkit.JavascriptInterface
import android.webkit.WebView
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import androidx.media3.common.MediaItem
import androidx.media3.common.MediaMetadata
import androidx.media3.common.Player
import androidx.media3.common.SimpleBasePlayer
import com.google.common.util.concurrent.Futures
import com.google.common.util.concurrent.ListenableFuture
import org.json.JSONObject
import java.lang.ref.WeakReference

/**
 * The page's player as Android sees it: the notification, the lock screen, Bluetooth buttons.
 *
 * Playback itself stays in the web view (an <audio> element). The page sends what it plays
 * (`KodamaAndroid.mediaUpdate`), the same values the desktop hands its OS media controls
 * (media_update in src-tauri/src/media.rs), and this side answers presses with the same
 * "media-control" actions the page already handles there.
 */
object MediaBridge {
  private const val TAG = "KodamaMedia"
  private val main = Handler(Looper.getMainLooper())
  private var webView = WeakReference<WebView?>(null)
  private var activity = WeakReference<Activity?>(null)
  private lateinit var appContext: Context
  private var serviceStarted = false

  val player: WebPlayer by lazy { WebPlayer(Looper.getMainLooper()) }

  fun isPlaying() = player.isPlayingNow()

  /** Called from MainActivity once the web view exists. */
  fun attach(view: WebView) {
    appContext = view.context.applicationContext
    webView = WeakReference(view)
    activity = WeakReference(view.context as? Activity)
    view.addJavascriptInterface(JsApi(), "KodamaAndroid")
    DiscordPresence.init(appContext)
    AudioOutputs.start(appContext)
  }

  /** A press on the notification, the lock screen or a headset, handed to the page. */
  fun sendControl(action: String, position: Double? = null) {
    val payload = JSONObject().put("action", action)
    if (position != null) payload.put("position", position)
    runInPage("window.__kodamaMediaControl && window.__kodamaMediaControl($payload)")
  }

  fun runInPage(script: String) {
    main.post { webView.get()?.evaluateJavascript(script, null) }
  }

  private fun ensureService() {
    if (serviceStarted) return
    try {
      appContext.startService(Intent(appContext, PlaybackService::class.java))
      serviceStarted = true
    } catch (e: Exception) {
      // Not allowed from the background on newer Android; the next update from the page,
      // which comes while it is in front, tries again.
      Log.w(TAG, "could not start the playback service: ${e.message}")
    }
  }

  /** What the page calls. Runs on a binder thread, so everything is posted to the main thread. */
  private class JsApi {
    @JavascriptInterface
    fun mediaUpdate(json: String) {
      val o = try { JSONObject(json) } catch (e: Exception) { return }
      val snap = WebPlayer.Snapshot(
        title = o.optString("title"),
        artist = o.optString("artist"),
        album = o.optString("album"),
        artwork = o.optString("thumbnail").ifEmpty { null },
        durationMs = (o.optDouble("duration", 0.0) * 1000).toLong(),
        positionMs = (o.optDouble("elapsed", 0.0) * 1000).toLong(),
        playing = !o.optBoolean("paused", true),
      )
      main.post {
        player.update(snap)
        ensureService()
        // Paused in the background: the moment a noted icon can go in (AppIcons).
        if (!snap.playing) AppIcons.applyIfIdle(appContext)
      }
    }

    @JavascriptInterface
    fun mediaClear() {
      main.post { player.update(null) }
    }

    /** The device the sound goes to, or "" for the phone's own speaker. */
    @JavascriptInterface
    fun audioOutput(): String = AudioOutputs.current()

    /** Signing in to YouTube Music; the outcome comes back on window.__kodamaLogin. */
    @JavascriptInterface
    fun openLogin(profile: String, confirmLabel: String, switchHint: String) {
      main.post { LoginActivity.start(appContext, profile, confirmLabel, switchHint) }
    }

    @JavascriptInterface
    fun closeLogin() {
      main.post { LoginActivity.close() }
    }

    /** Discord's Rich Presence (DiscordPresence.kt); the sign-in's outcome comes back on window.__kodamaDiscord. */
    @JavascriptInterface
    fun discordLogin() {
      main.post { DiscordLoginActivity.start(appContext) }
    }

    @JavascriptInterface
    fun discordLogout() = DiscordPresence.signOut()

    @JavascriptInterface
    fun discordAccount(): String = DiscordPresence.account()

    @JavascriptInterface
    fun discordUpdate(json: String) = DiscordPresence.update(json)

    @JavascriptInterface
    fun discordClear() = DiscordPresence.clear()

    /**
     * A short buzz through the system's own haptics, so it follows the phone's touch-feedback
     * setting. The kinds are the page's names (src/haptics.js); newer constants fall back to
     * older ones that feel alike.
     */
    @JavascriptInterface
    fun haptic(kind: String) {
      val api = Build.VERSION.SDK_INT
      val c = when (kind) {
        "tick" -> if (api >= 34) HapticFeedbackConstants.SEGMENT_TICK else HapticFeedbackConstants.CLOCK_TICK
        "confirm" -> if (api >= 30) HapticFeedbackConstants.CONFIRM else HapticFeedbackConstants.VIRTUAL_KEY
        "toggle-on" -> if (api >= 34) HapticFeedbackConstants.TOGGLE_ON else HapticFeedbackConstants.CLOCK_TICK
        "toggle-off" -> if (api >= 34) HapticFeedbackConstants.TOGGLE_OFF else HapticFeedbackConstants.CLOCK_TICK
        "long-press" -> HapticFeedbackConstants.LONG_PRESS
        "drag-start" -> if (api >= 34) HapticFeedbackConstants.DRAG_START else HapticFeedbackConstants.LONG_PRESS
        "gesture-end" -> if (api >= 30) HapticFeedbackConstants.GESTURE_END else HapticFeedbackConstants.CLOCK_TICK
        "reject" -> if (api >= 30) HapticFeedbackConstants.REJECT else HapticFeedbackConstants.LONG_PRESS
        else -> HapticFeedbackConstants.VIRTUAL_KEY
      }
      main.post { webView.get()?.performHapticFeedback(c) }
    }

    /**
     * Phones stay upright (MainActivity.holdUpright), except while the player shows a video:
     * then the phone may turn, as far as its own rotation lock allows. Tablets always turn.
     */
    @JavascriptInterface
    fun setOrientation(free: Boolean) {
      main.post {
        val a = activity.get() ?: return@post
        if (!MainActivity.isPhone(a)) return@post
        a.requestedOrientation =
          if (free) ActivityInfo.SCREEN_ORIENTATION_FULL_USER else ActivityInfo.SCREEN_ORIENTATION_PORTRAIT
      }
    }

    /** A video across the whole screen: status and gesture bar hidden, a swipe brings them back. */
    @JavascriptInterface
    fun setImmersive(on: Boolean) {
      main.post {
        val a = activity.get() ?: return@post
        val controller = WindowCompat.getInsetsController(a.window, a.window.decorView)
        controller.systemBarsBehavior = WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
        if (on) controller.hide(WindowInsetsCompat.Type.systemBars())
        else controller.show(WindowInsetsCompat.Type.systemBars())
      }
    }

    /**
     * The launcher icon, by the name scripts/android-app-icons.py gives it ("3d_pink"). Noted
     * for later unless [now], which closes the app (AppIcons).
     */
    @JavascriptInterface
    fun setAppIcon(slug: String, now: Boolean) {
      main.post { if (now) AppIcons.select(appContext, slug) else AppIcons.request(appContext, slug) }
    }

    /** The icon noted and not yet put in, or "" when there is none. */
    @JavascriptInterface
    fun pendingAppIcon(): String = AppIcons.pending(appContext) ?: ""

    /** The system's own output picker, the one an app may open (it cannot switch by itself). */
    @JavascriptInterface
    fun openOutputPicker() {
      main.post { AudioOutputs.openPicker(appContext) }
    }
  }
}

/**
 * A player with nothing to play: it mirrors the page's state and turns commands into
 * "media-control" actions for it.
 *
 * The playlist is three items, the song between a stand-in before and after it, so that the
 * notification offers previous and next: Media3 only does when there is somewhere to go, and
 * the page's queue lives in the page.
 */
class WebPlayer(looper: Looper) : SimpleBasePlayer(looper) {
  data class Snapshot(
    val title: String,
    val artist: String,
    val album: String,
    val artwork: String?,
    val durationMs: Long,
    val positionMs: Long,
    val playing: Boolean,
  )

  private var snap: Snapshot? = null

  fun isPlayingNow() = snap?.playing == true

  fun update(next: Snapshot?) {
    snap = next
    invalidateState()
  }

  override fun getState(): State {
    val s = snap ?: return State.Builder()
      .setAvailableCommands(Player.Commands.EMPTY)
      .setPlaybackState(Player.STATE_IDLE)
      .build()
    val meta = MediaMetadata.Builder()
      .setTitle(s.title)
      .setArtist(s.artist)
      .setAlbumTitle(s.album.ifEmpty { null })
      .setArtworkUri(s.artwork?.let(Uri::parse))
      .build()
    val current = MediaItemData.Builder("current")
      .setMediaItem(MediaItem.Builder().setMediaId("current").setMediaMetadata(meta).build())
      .setMediaMetadata(meta)
      .setDurationUs(if (s.durationMs > 0) s.durationMs * 1000 else androidx.media3.common.C.TIME_UNSET)
      .build()
    val commands = Player.Commands.Builder()
      .addAll(
        Player.COMMAND_PLAY_PAUSE,
        Player.COMMAND_STOP,
        Player.COMMAND_SEEK_TO_NEXT,
        Player.COMMAND_SEEK_TO_NEXT_MEDIA_ITEM,
        Player.COMMAND_SEEK_TO_PREVIOUS,
        Player.COMMAND_SEEK_TO_PREVIOUS_MEDIA_ITEM,
        Player.COMMAND_SEEK_IN_CURRENT_MEDIA_ITEM,
        Player.COMMAND_GET_CURRENT_MEDIA_ITEM,
        Player.COMMAND_GET_METADATA,
        Player.COMMAND_GET_TIMELINE,
      )
      .build()
    return State.Builder()
      .setAvailableCommands(commands)
      .setPlaylist(listOf(standIn("before"), current, standIn("after")))
      .setCurrentMediaItemIndex(1)
      .setPlaybackState(Player.STATE_READY)
      .setPlayWhenReady(s.playing, Player.PLAY_WHEN_READY_CHANGE_REASON_USER_REQUEST)
      // While playing, Media3 runs the position on by itself between the page's updates.
      .setContentPositionMs(
        if (s.playing) PositionSupplier.getExtrapolating(s.positionMs, 1f)
        else PositionSupplier.getConstant(s.positionMs)
      )
      .build()
  }

  private fun standIn(id: String) = MediaItemData.Builder(id)
    .setMediaItem(MediaItem.Builder().setMediaId(id).build())
    .build()

  override fun handleSetPlayWhenReady(playWhenReady: Boolean): ListenableFuture<*> {
    MediaBridge.sendControl(if (playWhenReady) "play" else "pause")
    snap = snap?.copy(playing = playWhenReady)
    return Futures.immediateVoidFuture()
  }

  override fun handleStop(): ListenableFuture<*> {
    MediaBridge.sendControl("pause")
    snap = snap?.copy(playing = false)
    return Futures.immediateVoidFuture()
  }

  override fun handleSeek(mediaItemIndex: Int, positionMs: Long, seekCommand: Int): ListenableFuture<*> {
    when {
      mediaItemIndex > 1 -> MediaBridge.sendControl("next")
      mediaItemIndex == 0 -> MediaBridge.sendControl("previous")
      else -> {
        val ms = positionMs.coerceAtLeast(0)
        MediaBridge.sendControl("seek", ms / 1000.0)
        snap = snap?.copy(positionMs = ms)
      }
    }
    return Futures.immediateVoidFuture()
  }
}

/**
 * Where the sound goes. Android routes media itself (the newest headset or Bluetooth device wins),
 * so an app cannot pick an output; it can only say which one is in use. The page is told on every
 * change (`window.__kodamaAudioOutput`).
 */
object AudioOutputs {
  // In the order Android itself prefers them for media.
  private val preferred = buildList {
    add(AudioDeviceInfo.TYPE_BLUETOOTH_A2DP)
    if (Build.VERSION.SDK_INT >= 31) { add(AudioDeviceInfo.TYPE_BLE_HEADSET); add(AudioDeviceInfo.TYPE_BLE_SPEAKER) }
    if (Build.VERSION.SDK_INT >= 28) add(AudioDeviceInfo.TYPE_HEARING_AID)
    add(AudioDeviceInfo.TYPE_USB_HEADSET)
    add(AudioDeviceInfo.TYPE_USB_DEVICE)
    add(AudioDeviceInfo.TYPE_WIRED_HEADPHONES)
    add(AudioDeviceInfo.TYPE_WIRED_HEADSET)
  }
  private var manager: AudioManager? = null

  fun start(context: Context) {
    if (manager != null) return
    val am = context.getSystemService(Context.AUDIO_SERVICE) as AudioManager
    manager = am
    am.registerAudioDeviceCallback(object : AudioDeviceCallback() {
      override fun onAudioDevicesAdded(added: Array<out AudioDeviceInfo>) = push()
      override fun onAudioDevicesRemoved(removed: Array<out AudioDeviceInfo>) = push()
    }, Handler(Looper.getMainLooper()))
  }

  private fun push() {
    val name = JSONObject.quote(current())
    MediaBridge.runInPage("window.__kodamaAudioOutput && window.__kodamaAudioOutput($name)")
  }

  fun openPicker(context: Context) {
    try {
      if (Build.VERSION.SDK_INT >= 34 && MediaRouter2.getInstance(context).showSystemOutputSwitcher()) return
    } catch (e: Exception) { /* fall through to the older panels */ }
    val intents = listOf(
      // Android 11 to 13: the media output panel, for this app.
      Intent("com.android.settings.panel.action.MEDIA_OUTPUT")
        .putExtra("com.android.settings.panel.extra.PACKAGE_NAME", context.packageName),
      Intent(Settings.ACTION_BLUETOOTH_SETTINGS),
    )
    for (intent in intents) {
      try {
        context.startActivity(intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
        return
      } catch (e: Exception) { /* next */ }
    }
  }

  fun current(): String {
    val devices = manager?.getDevices(AudioManager.GET_DEVICES_OUTPUTS) ?: return ""
    for (type in preferred) {
      val d = devices.firstOrNull { it.type == type } ?: continue
      // Wired headsets report the phone's own model as their name, so the page names them
      // ("wired"); a device without a name of its own is "external".
      if (type == AudioDeviceInfo.TYPE_WIRED_HEADPHONES || type == AudioDeviceInfo.TYPE_WIRED_HEADSET) return "wired"
      return d.productName?.toString()?.trim().orEmpty().ifEmpty { "external" }
    }
    return ""
  }
}
