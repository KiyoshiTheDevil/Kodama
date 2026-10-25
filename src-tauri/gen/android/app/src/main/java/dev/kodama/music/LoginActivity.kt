package dev.kodama.music

import android.annotation.SuppressLint
import android.content.Context
import android.content.Intent
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.util.Log
import android.webkit.CookieManager
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.activity.enableEdgeToEdge
import androidx.appcompat.app.AppCompatActivity
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import androidx.webkit.WebViewCompat
import androidx.webkit.WebViewFeature
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONObject
import java.lang.ref.WeakReference
import java.util.concurrent.TimeUnit

/**
 * Signing in to YouTube Music on Android: the desktop's login window (open_login_window in
 * src-tauri/src/window.rs) as an activity of its own.
 *
 * Same sign-in page, same browser identity and the same confirm bar (login_init.js), then the
 * same hand-over: the cookies go to the backend's /auth/cookie-login, and the page hears how it
 * went as the desktop's login-complete / login-failed / login-cancelled.
 */
class LoginActivity : AppCompatActivity() {
  companion object {
    private const val TAG = "KodamaLogin"
    // Loaded directly. Starting blank and navigating there trips Google's check for embedded
    // browsers (see window.rs).
    private const val SIGN_IN_URL =
      "https://accounts.google.com/ServiceLogin?continue=https%3A%2F%2Fmusic.youtube.com"
    private const val MUSIC_URL = "https://music.youtube.com"

    private var open = WeakReference<LoginActivity?>(null)

    fun start(context: Context, profile: String, confirmLabel: String, switchHint: String) {
      open.get()?.finish()
      context.startActivity(
        Intent(context, LoginActivity::class.java)
          .putExtra("profile", profile)
          .putExtra("confirm", confirmLabel)
          .putExtra("hint", switchHint)
          .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      )
    }

    fun close() {
      open.get()?.finish()
    }
  }

  private val main = Handler(Looper.getMainLooper())
  private lateinit var webView: WebView
  private lateinit var profile: String
  private lateinit var userAgent: String
  private var settled = false // told the page already (complete or failed)
  private var submitting = false

  @SuppressLint("SetJavaScriptEnabled")
  override fun onCreate(savedInstanceState: Bundle?) {
    enableEdgeToEdge()
    super.onCreate(savedInstanceState)
    open = WeakReference(this)
    profile = intent.getStringExtra("profile") ?: "account_${System.currentTimeMillis()}"

    webView = WebView(this)
    setContentView(webView)
    ViewCompat.setOnApplyWindowInsetsListener(webView) { view, insets ->
      val bars = insets.getInsets(WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.ime())
      view.setPadding(bars.left, bars.top, bars.right, bars.bottom)
      WindowInsetsCompat.CONSUMED
    }

    // The web view as it is, as InnerTune and Metrolist sign in. Dressing it up as Chrome (user
    // agent, client hints, no X-Requested-With) was turned away all the same: Google sees through
    // it, and a user agent that does not match the rest is likely worse. The backend gets this
    // user agent with the cookies.
    userAgent = WebSettings.getDefaultUserAgent(this)
    webView.settings.apply {
      javaScriptEnabled = true
      domStorageEnabled = true
    }

    val labels = JSONObject()
      .put("confirm", intent.getStringExtra("confirm") ?: "Use this account")
      .put("hint", intent.getStringExtra("hint") ?: "")
    val script = "window.__KODAMA_LABELS__ = $labels;\n" +
      assets.open("login_init.js").bufferedReader().use { it.readText() }
    // Before the page's own scripts where the web view can (as the desktop's initialization
    // script does), otherwise once each page has loaded.
    val atStart = WebViewFeature.isFeatureSupported(WebViewFeature.DOCUMENT_START_SCRIPT)
    if (atStart) WebViewCompat.addDocumentStartJavaScript(webView, script, setOf(MUSIC_URL))
    // A client of its own in any case: without one, Android opens every link in the browser.
    webView.webViewClient = object : WebViewClient() {
      override fun onPageFinished(view: WebView, url: String) {
        if (!atStart && url.startsWith(MUSIC_URL)) view.evaluateJavascript(script, null)
      }
    }

    // A fresh sign-in, as the desktop's empty per-login data folder gives it. The app's own page
    // keeps nothing in these cookies.
    val cookies = CookieManager.getInstance()
    cookies.setAcceptCookie(true)
    cookies.setAcceptThirdPartyCookies(webView, true)
    cookies.removeAllCookies {
      webView.loadUrl(SIGN_IN_URL)
      main.postDelayed(::poll, 3000)
    }
  }

  // Every two seconds, as the desktop does: signed in once YouTube Music has the auth cookie,
  // done once the confirm bar was pressed (KODAMA_DONE), which lets a brand account be picked first.
  private fun poll() {
    if (isFinishing || settled || submitting) return
    val url = webView.url.orEmpty()
    if (url.contains("music.youtube.com")) {
      val found = CookieManager.getInstance().getCookie(MUSIC_URL).orEmpty()
        .split(";").mapNotNull { part ->
          val i = part.indexOf('=')
          if (i <= 0) null else part.substring(0, i).trim() to part.substring(i + 1).trim()
        }
      val hasAuth = found.any { it.first == "SAPISID" }
      val done = found.any { it.first == "KODAMA_DONE" && it.second == "1" }
      if (hasAuth && done) {
        submit(found)
        return
      }
    }
    main.postDelayed(::poll, 2000)
  }

  private fun submit(found: List<Pair<String, String>>) {
    submitting = true
    val dsid = found.firstOrNull { it.first == "KODAMA_DSID" }?.second.orEmpty()
    val cookie = found.filterNot { it.first.startsWith("KODAMA_") }.joinToString("; ") { "${it.first}=${it.second}" }
    val body = JSONObject()
      .put("cookie", cookie)
      .put("profile_name", profile)
      .put("user_agent", userAgent)
      .put("delegated_session_id", dsid)
      .toString()
    Thread {
      // What the backend answers decides whether this was a login: it tries the cookies and
      // drops them again if they do not work (see window.rs).
      val failure: String? = try {
        OkHttpClient.Builder().callTimeout(60, TimeUnit.SECONDS).build()
          .newCall(
            okhttp3.Request.Builder()
              .url("http://127.0.0.1:9847/auth/cookie-login")
              .post(body.toRequestBody("application/json".toMediaType()))
              .build()
          ).execute().use { r ->
            if (r.isSuccessful) null
            else r.body?.string()?.let { runCatching { JSONObject(it).optString("error") }.getOrNull() }
              ?.ifEmpty { null } ?: "HTTP ${r.code}"
          }
      } catch (e: Exception) {
        e.message ?: e.javaClass.simpleName
      }
      main.post {
        settled = true
        if (failure == null) tell("complete", profile) else {
          Log.w(TAG, "cookie-login rejected: $failure")
          tell("failed", failure)
        }
        finish()
      }
    }.start()
  }

  private fun tell(type: String, value: String) {
    val payload = JSONObject().put("type", type).put("value", value)
    MediaBridge.runInPage("window.__kodamaLogin && window.__kodamaLogin($payload)")
  }

  override fun onDestroy() {
    main.removeCallbacksAndMessages(null)
    if (!settled) tell("cancelled", "")
    if (open.get() === this) open = WeakReference(null)
    webView.destroy()
    super.onDestroy()
  }
}
