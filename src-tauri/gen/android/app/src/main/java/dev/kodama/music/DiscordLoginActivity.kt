package dev.kodama.music

import android.annotation.SuppressLint
import android.content.Context
import android.content.Intent
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.webkit.CookieManager
import android.webkit.WebStorage
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.activity.enableEdgeToEdge
import androidx.appcompat.app.AppCompatActivity
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import org.json.JSONTokener

/**
 * Signing in to Discord for the Rich Presence on Android (DiscordPresence.kt): Discord's own web
 * sign-in in a web view, as Kizzy and Metrolist do it. Once Discord's web app has opened, the
 * account token is read from its storage and kept on the phone, nowhere else; the web view's
 * Discord data is wiped again right after, so the token lives in one place only.
 */
class DiscordLoginActivity : AppCompatActivity() {
  companion object {
    private const val LOGIN_URL = "https://discord.com/login"

    fun start(context: Context) {
      context.startActivity(Intent(context, DiscordLoginActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
    }
  }

  private val main = Handler(Looper.getMainLooper())
  private lateinit var webView: WebView
  private var settled = false

  @SuppressLint("SetJavaScriptEnabled")
  override fun onCreate(savedInstanceState: Bundle?) {
    enableEdgeToEdge()
    super.onCreate(savedInstanceState)
    webView = WebView(this)
    setContentView(webView)
    ViewCompat.setOnApplyWindowInsetsListener(webView) { view, insets ->
      val bars = insets.getInsets(WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.ime())
      view.setPadding(bars.left, bars.top, bars.right, bars.bottom)
      WindowInsetsCompat.CONSUMED
    }
    webView.settings.apply {
      javaScriptEnabled = true
      domStorageEnabled = true
    }
    webView.webViewClient = WebViewClient()
    wipe { webView.loadUrl(LOGIN_URL); main.postDelayed(::poll, 2000) }
  }

  // Discord removes window.localStorage from its own page; a fresh iframe of the same origin
  // still has it. The token is stored JSON-encoded, hence the quotes it comes back in.
  private fun poll() {
    if (isFinishing || settled) return
    val url = webView.url.orEmpty()
    if (url.contains("discord.com/channels") || url.contains("discord.com/app")) {
      webView.evaluateJavascript(
        "(function(){try{var f=document.createElement('iframe');f.style.display='none';document.body.appendChild(f);" +
          "var t=f.contentWindow.localStorage.getItem('token');f.remove();return t||'';}catch(e){return '';}})()"
      ) { raw ->
        val token = decode(raw)
        if (token.isNotEmpty() && !settled) {
          settled = true
          DiscordPresence.signedIn(applicationContext, token)
          finish()
        } else main.postDelayed(::poll, 1000)
      }
      return
    }
    main.postDelayed(::poll, 1000)
  }

  // evaluateJavascript hands back a JSON value: a string holding the stored JSON string.
  private fun decode(raw: String?): String {
    var v: Any? = try { JSONTokener(raw ?: "").nextValue() } catch (e: Exception) { null }
    if (v is String && v.startsWith("\"")) v = try { JSONTokener(v).nextValue() } catch (e: Exception) { v }
    return (v as? String).orEmpty()
  }

  private fun wipe(then: () -> Unit) {
    WebStorage.getInstance().deleteOrigin("https://discord.com")
    val cookies = CookieManager.getInstance()
    // Only Discord's cookies: the YouTube Music sign-in uses the same cookie store.
    val names = cookies.getCookie("https://discord.com").orEmpty().split(";").mapNotNull { it.substringBefore('=').trim().ifEmpty { null } }
    names.forEach { cookies.setCookie("https://discord.com", "$it=; Max-Age=0; Path=/") }
    cookies.flush()
    then()
  }

  override fun onDestroy() {
    main.removeCallbacksAndMessages(null)
    if (!settled) DiscordPresence.tellPage("cancelled", null)
    wipe {}
    webView.destroy()
    super.onDestroy()
  }
}
