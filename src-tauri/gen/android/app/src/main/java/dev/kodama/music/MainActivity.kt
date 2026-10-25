package dev.kodama.music

import android.graphics.Color
import android.os.Bundle
import android.view.View
import androidx.activity.SystemBarStyle
import androidx.activity.enableEdgeToEdge
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import com.chaquo.python.Python
import com.chaquo.python.android.AndroidPlatform

class MainActivity : TauriActivity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    // Light icons on the bars: Kodama is dark.
    enableEdgeToEdge(
      statusBarStyle = SystemBarStyle.dark(Color.TRANSPARENT),
      navigationBarStyle = SystemBarStyle.dark(Color.TRANSPARENT),
    )
    super.onCreate(savedInstanceState)
    keepClearOfSystemBars()
    startBackend()
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

  companion object {
    @Volatile private var backendStarted = false
  }
}
