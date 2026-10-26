package dev.kodama.music

import android.content.Context
import android.content.pm.ActivityInfo
import android.graphics.Color
import android.os.Bundle
import android.view.View
import android.webkit.WebView
import androidx.activity.OnBackPressedCallback
import androidx.activity.SystemBarStyle
import androidx.activity.enableEdgeToEdge
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import com.chaquo.python.Python
import com.chaquo.python.android.AndroidPlatform

class MainActivity : TauriActivity() {
  // Wry would send Back to the web view's history, which Kodama does not use (it switches
  // views inside one page), so every Back left the app. The page decides instead, below.
  override val handleBackNavigation = false

  override fun onCreate(savedInstanceState: Bundle?) {
    // Light icons on the bars: Kodama is dark.
    enableEdgeToEdge(
      statusBarStyle = SystemBarStyle.dark(Color.TRANSPARENT),
      navigationBarStyle = SystemBarStyle.dark(Color.TRANSPARENT),
    )
    super.onCreate(savedInstanceState)
    holdUpright()
    keepClearOfSystemBars()
    startBackend()
  }

  // The page's line to Android: media controls and the audio output (MediaBridge.kt).
  override fun onWebViewCreate(webView: WebView) {
    MediaBridge.attach(webView)
    onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
      override fun handleOnBackPressed() = askPageToGoBack(webView)
    })
  }

  // The page closes its topmost menu, sheet or panel, or goes back a view
  // (window.__kodamaBack in src/android-back.js). With nothing left to close, the app goes to
  // the background like a music player does, instead of finishing: the music keeps playing.
  private fun askPageToGoBack(webView: WebView) {
    webView.evaluateJavascript("window.__kodamaBack ? window.__kodamaBack() : false") { result ->
      if (result != "true") moveTaskToBack(true)
    }
  }

  // Android draws the app under the status bar and the gesture bar (edge to edge, enforced for
  // apps targeting Android 15 and later), and the page laid itself out over both: the clock sat
  // on the player's head. The content view is inset by the bars instead, and by the keyboard,
  // so a focused field is not covered. The bands it leaves show the app's background colour.
  private fun keepClearOfSystemBars() {
    val content = findViewById<View>(android.R.id.content)
    content.setBackgroundColor(Color.parseColor("#0D0D0D"))
    ViewCompat.setOnApplyWindowInsetsListener(content) { view, insets ->
      val bars = insets.getInsets(WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.displayCutout())
      val ime = insets.getInsets(WindowInsetsCompat.Type.ime())
      view.setPadding(0, 0, 0, ime.bottom)
      insets
    }
  }

  // Kodama's backend (python-backend/server.py) on 127.0.0.1:9847, the port the web view asks.
  // Started once per process: Python stays up when the activity is recreated (rotation, theme),
  // and android_main.start() ignores a second call anyway. Python itself loads off the main
  // thread, since unpacking the standard library on a first start takes a moment.
  private fun startBackend() {
    if (backendStarted) return
    backendStarted = true
    val dataDir = filesDir.resolve("backend").absolutePath
    Thread {
      if (!Python.isStarted()) Python.start(AndroidPlatform(applicationContext))
      Python.getInstance().getModule("android_main").callAttr("start", dataDir)
    }.start()
  }

  // Kodama's phone layout is made for portrait; turned sideways a phone got the desktop
  // layout squeezed to 393px of height. Upright, then, apart from a video in the player
  // (MediaBridge.setOrientation). Tablets have room either way and keep turning.
  private fun holdUpright() {
    if (isPhone(this)) requestedOrientation = ActivityInfo.SCREEN_ORIENTATION_PORTRAIT
  }

  companion object {
    @Volatile private var backendStarted = false

    fun isPhone(context: Context) = context.resources.configuration.smallestScreenWidthDp < 600
  }
}
