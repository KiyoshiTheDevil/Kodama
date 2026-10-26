package dev.kodama.music

import android.content.Context
import android.os.Handler
import android.os.HandlerThread
import android.util.Log
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import okhttp3.Response
import okhttp3.WebSocket
import okhttp3.WebSocketListener
import org.json.JSONArray
import org.json.JSONObject
import java.util.concurrent.TimeUnit

/**
 * Discord Rich Presence on Android. There is no Discord app on the phone to talk to as the
 * desktop does (src-tauri/src/discord.rs), so this signs in to Discord's gateway with the user's
 * own account, as a second Discord client, and sets its activity there: the way Kizzy and
 * Metrolist do it. The token stays in the app's private storage and only ever goes to Discord.
 *
 * Everything runs on one thread of its own; the page's calls are posted to it.
 */
object DiscordPresence {
  private const val TAG = "KodamaDiscord"
  private const val APP_ID = "1483291004067909642" // the desktop's Discord application
  private const val API = "https://discord.com/api/v10"
  private const val GATEWAY = "wss://gateway.discord.gg/?v=10&encoding=json"
  private const val PREFS = "discord"

  private val thread = HandlerThread("discord").apply { start() }
  private val handler = Handler(thread.looper)
  private val http = OkHttpClient.Builder().callTimeout(20, TimeUnit.SECONDS).build()

  private lateinit var appContext: Context
  private var token: String? = null
  private var socket: WebSocket? = null
  private var ready = false
  private var seq: Int? = null
  private var heartbeat: Runnable? = null
  private var backoffMs = 2000L
  private var wanted: JSONObject? = null // the activity to show, or null for none
  private var lastTrack: JSONObject? = null // the page's last track, also from before a sign-in
  private val idleClose = Runnable { if (wanted == null) close() }
  private var userStatus = "online"
  private val imageCache = HashMap<String, String>()
  private var pausedAsset: String? = null
  private var pausedLooked = false

  fun init(context: Context) {
    appContext = context.applicationContext
    token = appContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString("token", null)
  }

  /** The signed-in account for the settings ({"name": …}), or "" when there is none. */
  fun account(): String {
    if (token == null) return ""
    val p = appContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
    return JSONObject().put("name", p.getString("name", "") ?: "").toString()
  }

  /** From DiscordLoginActivity once the token is in hand. */
  fun signedIn(context: Context, newToken: String) {
    handler.post {
      val me = try { get("$API/users/@me", newToken) } catch (e: Exception) { null }
      if (me == null) { tellPage("failed", null); return@post }
      val name = me.optString("global_name").takeIf { it.isNotEmpty() && it != "null" } ?: me.optString("username")
      context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit()
        .putString("token", newToken).putString("name", name).apply()
      close()
      token = newToken
      tellPage("complete", name)
      lastTrack?.let { wanted = activity(it); connect() }
    }
  }

  /** Signing out ends the token at Discord too, so a copy of it would be worth nothing. */
  fun signOut() {
    handler.post {
      val t = token
      wanted = null
      close()
      token = null
      appContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().clear().apply()
      if (t != null) try {
        http.newCall(Request.Builder().url("$API/auth/logout").header("Authorization", t)
          .post("""{"provider":null,"voip_provider":null}""".toRequestBody("application/json".toMediaType())).build())
          .execute().close()
      } catch (e: Exception) { Log.w(TAG, "logout: ${e.message}") }
    }
  }

  /** The page's track, the same values the desktop hands update_discord_rpc. */
  fun update(json: String) {
    val o = try { JSONObject(json) } catch (e: Exception) { return }
    handler.post {
      lastTrack = o
      if (token == null) return@post
      handler.removeCallbacks(idleClose)
      wanted = activity(o)
      if (socket == null) connect() else if (ready) send()
    }
  }

  fun clear() {
    handler.post {
      lastTrack = null
      if (wanted == null) return@post
      wanted = null
      if (ready) send()
      // A connected client shows the account as on the phone; with nothing to show for a
      // minute, it goes, and the next track brings it back.
      handler.removeCallbacks(idleClose)
      handler.postDelayed(idleClose, 60_000)
    }
  }

  fun tellPage(type: String, value: String?) {
    val payload = JSONObject().put("type", type).put("value", value ?: "")
    MediaBridge.runInPage("window.__kodamaDiscord && window.__kodamaDiscord($payload)")
  }

  // ── The activity ────────────────────────────────────────────────────────────

  // Discord turns down the whole activity for a field shorter than 2 or longer than 128.
  private fun clamp(s: String): String? = s.trim().take(128).takeIf { it.length >= 2 }

  private fun activity(o: JSONObject): JSONObject {
    val paused = o.optBoolean("paused")
    val a = JSONObject()
      .put("name", "Kodama")
      .put("type", 2) // Listening
      .put("application_id", APP_ID)
      .put("status_display_type", when (o.optString("statusDisplay")) { "artist" -> 1; "app" -> 0; else -> 2 })
    clamp(o.optString("title"))?.let { a.put("details", it) }
    clamp(o.optString("artist"))?.let { a.put("state", it) }

    val assets = JSONObject()
    o.optString("thumbnail").takeIf { it.startsWith("http") }?.let { url -> image(url)?.let { assets.put("large_image", it) } }
    clamp(o.optString("album"))?.let { assets.put("large_text", it) }
    if (paused) pausedImage()?.let { assets.put("small_image", it).put("small_text", "Paused") }
    if (assets.length() > 0) a.put("assets", assets)

    if (!paused) {
      val now = System.currentTimeMillis()
      val elapsed = (o.optDouble("elapsed", 0.0) * 1000).toLong()
      val duration = (o.optDouble("duration", 0.0) * 1000).toLong()
      val ts = JSONObject().put("start", now - elapsed)
      if (duration > 0) ts.put("end", now - elapsed + duration)
      a.put("timestamps", ts)
    }

    // A user's own client sends button labels and their links apart.
    val labels = JSONArray(); val urls = JSONArray()
    o.optString("togetherUrl").takeIf { it.startsWith("https://") && it.length <= 512 }?.let { labels.put("Listen along"); urls.put(it) }
    o.optString("videoId").takeIf { it.isNotEmpty() }?.let { labels.put("Listen on YouTube Music"); urls.put("https://music.youtube.com/watch?v=$it") }
    if (labels.length() > 0) a.put("buttons", labels).put("metadata", JSONObject().put("button_urls", urls))

    val size = o.optInt("partySize", 0); val max = o.optInt("partyMax", 0); val pid = o.optString("partyId")
    if (size >= 1 && max >= size && pid.isNotEmpty() && pid != "null") a.put("party", JSONObject().put("id", pid).put("size", JSONArray().put(size).put(max)))
    return a
  }

  // A cover from anywhere has to go through Discord's media proxy first: the application's
  // external-assets endpoint answers with a path the activity can name as "mp:<path>".
  private fun image(url: String): String? {
    imageCache[url]?.let { return it }
    val t = token ?: return null
    return try {
      val body = JSONObject().put("urls", JSONArray().put(url)).toString()
      http.newCall(Request.Builder().url("$API/applications/$APP_ID/external-assets").header("Authorization", t)
        .post(body.toRequestBody("application/json".toMediaType())).build()).execute().use { r ->
        if (!r.isSuccessful) return null
        val path = JSONArray(r.body?.string() ?: "[]").optJSONObject(0)?.optString("external_asset_path") ?: return null
        "mp:$path".also { if (imageCache.size > 200) imageCache.clear(); imageCache[url] = it }
      }
    } catch (e: Exception) { Log.w(TAG, "external asset: ${e.message}"); null }
  }

  // The desktop's paused badge is an art asset named "paused"; a gateway activity names it by id.
  private fun pausedImage(): String? {
    if (pausedLooked) return pausedAsset
    pausedLooked = true
    pausedAsset = try {
      http.newCall(Request.Builder().url("$API/oauth2/applications/$APP_ID/assets").build()).execute().use { r ->
        val arr = JSONArray(r.body?.string() ?: "[]")
        (0 until arr.length()).map { arr.getJSONObject(it) }.firstOrNull { it.optString("name") == "paused" }?.optString("id")
      }
    } catch (e: Exception) { null }
    return pausedAsset
  }

  // ── The gateway ─────────────────────────────────────────────────────────────

  private fun connect() {
    val t = token ?: return
    if (socket != null) return
    // The status the account has set (online, idle, dnd, invisible): this client must not
    // overrule it, an invisible user would otherwise show up online.
    userStatus = try { get("$API/users/@me/settings", t)?.optString("status")?.ifEmpty { null } } catch (e: Exception) { null } ?: "online"
    ready = false
    seq = null
    // No call timeout here: on the socket it would cut the connection after twenty seconds.
    socket = http.newBuilder().callTimeout(0, TimeUnit.SECONDS).build().newWebSocket(Request.Builder().url(GATEWAY).build(), object : WebSocketListener() {
      override fun onMessage(webSocket: WebSocket, text: String) { handler.post { if (webSocket === socket) receive(text) } }
      override fun onClosed(webSocket: WebSocket, code: Int, reason: String) { handler.post { if (webSocket === socket) lost(code) } }
      override fun onFailure(webSocket: WebSocket, t: Throwable, response: Response?) {
        Log.w(TAG, "gateway: ${t.message}")
        handler.post { if (webSocket === socket) lost(0) }
      }
    })
  }

  private fun receive(text: String) {
    val m = try { JSONObject(text) } catch (e: Exception) { return }
    if (!m.isNull("s")) seq = m.optInt("s")
    when (m.optInt("op")) {
      10 -> { // Hello
        startHeartbeat(m.getJSONObject("d").optLong("heartbeat_interval", 41250))
        identify()
      }
      0 -> if (m.optString("t") == "READY") { ready = true; backoffMs = 2000; send() }
      1 -> beat()
      7, 9 -> { close(); handler.postDelayed({ if (wanted != null) connect() }, 3000) } // reconnect / invalid session
    }
  }

  private fun identify() {
    val d = JSONObject()
      .put("token", token)
      .put("capabilities", 65)
      .put("properties", JSONObject().put("os", "Android").put("browser", "Discord Android").put("device", "Kodama Pocket"))
      .put("presence", presence())
    socket?.send(JSONObject().put("op", 2).put("d", d).toString())
  }

  private fun presence(): JSONObject {
    val acts = JSONArray()
    wanted?.let { acts.put(it) }
    return JSONObject().put("since", 0).put("activities", acts).put("status", userStatus).put("afk", true)
  }

  private fun send() {
    socket?.send(JSONObject().put("op", 3).put("d", presence()).toString())
  }

  private fun startHeartbeat(interval: Long) {
    heartbeat?.let { handler.removeCallbacks(it) }
    val r = object : Runnable {
      override fun run() { beat(); handler.postDelayed(this, interval) }
    }
    heartbeat = r
    handler.postDelayed(r, (interval * Math.random()).toLong())
  }

  private fun beat() {
    socket?.send(JSONObject().put("op", 1).put("d", seq ?: JSONObject.NULL).toString())
  }

  private fun lost(code: Int) {
    close()
    if (code == 4004) { // the token is no longer valid: signed out elsewhere or changed password
      token = null
      appContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().clear().apply()
      tellPage("expired", null)
      return
    }
    if (token == null || wanted == null) return
    handler.postDelayed({ if (wanted != null) connect() }, backoffMs)
    backoffMs = (backoffMs * 2).coerceAtMost(5 * 60_000L)
  }

  private fun close() {
    heartbeat?.let { handler.removeCallbacks(it) }
    heartbeat = null
    ready = false
    socket?.close(1000, null)
    socket = null
  }

  private fun get(url: String, t: String): JSONObject? =
    http.newCall(Request.Builder().url(url).header("Authorization", t).build()).execute().use { r ->
      if (r.isSuccessful) JSONObject(r.body?.string() ?: "{}") else null
    }
}
