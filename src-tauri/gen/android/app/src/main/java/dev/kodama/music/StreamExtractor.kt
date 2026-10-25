package dev.kodama.music

import android.util.Log
import okhttp3.OkHttpClient
import okhttp3.RequestBody.Companion.toRequestBody
import org.schabi.newpipe.extractor.NewPipe
import org.schabi.newpipe.extractor.ServiceList
import org.schabi.newpipe.extractor.downloader.Downloader
import org.schabi.newpipe.extractor.downloader.Request
import org.schabi.newpipe.extractor.downloader.Response
import org.schabi.newpipe.extractor.exceptions.ReCaptchaException
import org.schabi.newpipe.extractor.localization.ContentCountry
import org.schabi.newpipe.extractor.localization.Localization
import org.schabi.newpipe.extractor.stream.DeliveryMethod
import org.schabi.newpipe.extractor.stream.StreamInfo
import java.util.concurrent.TimeUnit

/**
 * Stream addresses for the backend on Android.
 *
 * On the desktop yt-dlp resolves them, with a PO token minted by a bundled Node. A phone has no
 * Node, and without the token yt-dlp finds a playable format for only part of the songs.
 * NewPipeExtractor does the same work inside the JVM, deciphering included, so server.py asks
 * here first (python-backend/server.py, `_android_stream_url`) and falls back to yt-dlp.
 *
 * Called from Python on the backend's request threads, never on the main thread.
 */
object StreamExtractor {
  private const val TAG = "KodamaStream"

  @Volatile private var ready = false

  private fun ensureInit() {
    if (ready) return
    synchronized(this) {
      if (ready) return
      NewPipe.init(OkHttpDownloader, Localization("en", "US"), ContentCountry("US"))
      ready = true
    }
  }

  /**
   * The best audio-only stream of a song as a plain HTTP address, or null when there is none
   * (the reason goes to the log, and the caller tries yt-dlp next).
   */
  @JvmStatic
  fun audioUrl(videoId: String): String? {
    return try {
      ensureInit()
      val info = StreamInfo.getInfo(ServiceList.YouTube, "https://www.youtube.com/watch?v=$videoId")
      // Progressive only: the web view's audio element and the backend's range proxy both want
      // one file, not a DASH or HLS manifest.
      val best = info.audioStreams
        .filter { it.deliveryMethod == DeliveryMethod.PROGRESSIVE_HTTP && it.isUrl }
        .maxByOrNull { it.averageBitrate }
      if (best == null) Log.w(TAG, "$videoId: no progressive audio stream")
      best?.content
    } catch (e: Exception) {
      Log.w(TAG, "$videoId: ${e.javaClass.simpleName}: ${e.message}")
      null
    }
  }
}

/** NewPipeExtractor brings no HTTP client of its own; this is the one it is handed. */
private object OkHttpDownloader : Downloader() {
  private const val USER_AGENT =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:140.0) Gecko/20100101 Firefox/140.0"

  private val client = OkHttpClient.Builder()
    .readTimeout(30, TimeUnit.SECONDS)
    .build()

  override fun execute(request: Request): Response {
    val body = request.dataToSend()?.toRequestBody()
    val builder = okhttp3.Request.Builder()
      .url(request.url())
      .method(request.httpMethod(), body)
      .header("User-Agent", USER_AGENT)
    for ((name, values) in request.headers()) {
      builder.removeHeader(name)
      for (value in values) builder.addHeader(name, value)
    }
    client.newCall(builder.build()).execute().use { response ->
      if (response.code == 429) throw ReCaptchaException("reCaptcha challenge requested", request.url())
      return Response(
        response.code,
        response.message,
        response.headers.toMultimap(),
        response.body?.string(),
        response.request.url.toString(),
      )
    }
  }
}
