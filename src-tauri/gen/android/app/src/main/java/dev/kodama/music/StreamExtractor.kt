package dev.kodama.music

import android.media.MediaCodec
import android.media.MediaExtractor
import android.media.MediaFormat
import android.media.AudioFormat
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
import org.schabi.newpipe.extractor.stream.AudioStream
import org.schabi.newpipe.extractor.stream.StreamInfo
import java.io.File
import java.nio.ByteOrder
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
  fun audioUrl(videoId: String): String? =
    progressiveAudio(videoId)?.maxByOrNull { it.averageBitrate }?.content

  // Progressive only: the web view's audio and video elements, the backend's range proxy and
  // MediaExtractor all want one file, not a DASH or HLS manifest.
  private fun info(videoId: String): StreamInfo? = try {
    ensureInit()
    StreamInfo.getInfo(ServiceList.YouTube, "https://www.youtube.com/watch?v=$videoId")
  } catch (e: Exception) {
    Log.w(TAG, "$videoId: ${e.javaClass.simpleName}: ${e.message}")
    null
  }

  private fun progressiveAudio(videoId: String): List<AudioStream>? {
    val streams = info(videoId)?.audioStreams
      ?.filter { it.deliveryMethod == DeliveryMethod.PROGRESSIVE_HTTP && it.isUrl }
    if (streams != null && streams.isEmpty()) Log.w(TAG, "$videoId: no progressive audio stream")
    return streams?.ifEmpty { null }
  }

  /**
   * The picture for video sync (python-backend/server.py, /video-sync/stream): a video-only
   * stream, since the song's own audio keeps playing and the video element is muted. H.264
   * first, which every web view decodes; at most [maxHeight] lines when it is above 0.
   */
  @JvmStatic
  fun videoUrl(videoId: String, maxHeight: Int): String? {
    val info = info(videoId) ?: return null
    val all = (info.videoOnlyStreams + info.videoStreams)
      .filter { it.deliveryMethod == DeliveryMethod.PROGRESSIVE_HTTP && it.isUrl }
    val fitting = if (maxHeight > 0) all.filter { it.height <= maxHeight }.ifEmpty { all } else all
    val best = fitting.maxWithOrNull(
      compareBy({ it.codec?.startsWith("avc") == true }, { it.height })
    )
    if (best == null) Log.w(TAG, "$videoId: no progressive video stream")
    return best?.content
  }

  /**
   * The loudness of a song's first [seconds], one RMS value per [windowSeconds] of mono audio:
   * what video sync lines the song and its music video up by (server.py,
   * `_android_video_sync_offset`). The desktop gets the same curve from FFmpeg and numpy, which
   * a phone does not have; Android decodes the audio itself here. The smallest AAC stream is
   * enough, only the loudness over time matters.
   *
   * The clip is fetched first, as one byte range: MediaExtractor reading the address itself got
   * the throttled pace YouTube gives an open-ended request, 35 to 60 s for 100 s of audio.
   */
  @JvmStatic
  fun audioEnvelope(videoId: String, seconds: Double, windowSeconds: Double): FloatArray? {
    val t0 = System.currentTimeMillis()
    val streams = progressiveAudio(videoId) ?: return null
    val t1 = System.currentTimeMillis()
    val stream = streams.filter { it.format == org.schabi.newpipe.extractor.MediaFormat.M4A }
      .ifEmpty { streams }.minByOrNull { it.averageBitrate } ?: return null
    val extractor = MediaExtractor()
    var codec: MediaCodec? = null
    val clip = File.createTempFile("envelope", ".m4a")
    return try {
      // averageBitrate is in kbit/s; a fifth more for the container, and the header on top.
      val bytes = (stream.averageBitrate.coerceAtLeast(64) * 125L * seconds * 1.2).toLong() + 65_536
      val request = okhttp3.Request.Builder().url(stream.content)
        .header("User-Agent", OkHttpDownloader.USER_AGENT)
        .header("Range", "bytes=0-${bytes - 1}")
        .build()
      OkHttpDownloader.client.newCall(request).execute().use { response ->
        if (!response.isSuccessful) throw java.io.IOException("HTTP ${response.code}")
        clip.outputStream().use { out -> response.body!!.byteStream().copyTo(out) }
      }
      val tFetch = System.currentTimeMillis()
      extractor.setDataSource(clip.path)
      val track = (0 until extractor.trackCount).firstOrNull {
        extractor.getTrackFormat(it).getString(MediaFormat.KEY_MIME)?.startsWith("audio/") == true
      } ?: return null
      extractor.selectTrack(track)
      val format = extractor.getTrackFormat(track)
      val decoder = MediaCodec.createDecoderByType(format.getString(MediaFormat.KEY_MIME)!!)
      codec = decoder
      decoder.configure(format, null, null, 0)
      decoder.start()

      var sampleRate = format.getInteger(MediaFormat.KEY_SAMPLE_RATE)
      var channels = format.getInteger(MediaFormat.KEY_CHANNEL_COUNT)
      var floatPcm = false
      var window = (sampleRate * windowSeconds).toInt().coerceAtLeast(1)
      val limitUs = (seconds * 1_000_000).toLong()
      val envelope = ArrayList<Float>()
      var sum = 0.0
      var count = 0
      val bufferInfo = MediaCodec.BufferInfo()
      var inputDone = false

      while (true) {
        if (!inputDone) {
          val i = decoder.dequeueInputBuffer(10_000)
          if (i >= 0) {
            // The clip is cut mid-fragment; whatever cannot be read any more is its end.
            val size = try { extractor.readSampleData(decoder.getInputBuffer(i)!!, 0) } catch (_: Exception) { -1 }
            if (size < 0 || extractor.sampleTime > limitUs) {
              decoder.queueInputBuffer(i, 0, 0, 0, MediaCodec.BUFFER_FLAG_END_OF_STREAM)
              inputDone = true
            } else {
              decoder.queueInputBuffer(i, 0, size, extractor.sampleTime, 0)
              extractor.advance()
            }
          }
        }
        val o = decoder.dequeueOutputBuffer(bufferInfo, 10_000)
        if (o == MediaCodec.INFO_OUTPUT_FORMAT_CHANGED) {
          val out = decoder.outputFormat
          sampleRate = out.getInteger(MediaFormat.KEY_SAMPLE_RATE)
          channels = out.getInteger(MediaFormat.KEY_CHANNEL_COUNT)
          floatPcm = out.containsKey(MediaFormat.KEY_PCM_ENCODING) &&
            out.getInteger(MediaFormat.KEY_PCM_ENCODING) == AudioFormat.ENCODING_PCM_FLOAT
          window = (sampleRate * windowSeconds).toInt().coerceAtLeast(1)
        } else if (o >= 0) {
          val buf = decoder.getOutputBuffer(o)!!.order(ByteOrder.nativeOrder())
          buf.position(bufferInfo.offset)
          buf.limit(bufferInfo.offset + bufferInfo.size)
          // Interleaved frames, averaged to mono, squared and summed per window.
          if (floatPcm) {
            val pcm = buf.asFloatBuffer()
            while (pcm.remaining() >= channels) {
              var m = 0.0
              repeat(channels) { m += pcm.get() }
              m /= channels
              sum += m * m
              if (++count == window) { envelope.add(Math.sqrt(sum / count).toFloat()); sum = 0.0; count = 0 }
            }
          } else {
            val pcm = buf.asShortBuffer()
            while (pcm.remaining() >= channels) {
              var m = 0.0
              repeat(channels) { m += pcm.get() / 32768.0 }
              m /= channels
              sum += m * m
              if (++count == window) { envelope.add(Math.sqrt(sum / count).toFloat()); sum = 0.0; count = 0 }
            }
          }
          decoder.releaseOutputBuffer(o, false)
          if (bufferInfo.flags and MediaCodec.BUFFER_FLAG_END_OF_STREAM != 0) break
        }
      }
      Log.i(TAG, "$videoId envelope: resolve ${t1 - t0} ms, fetch ${tFetch - t1} ms, decode ${System.currentTimeMillis() - tFetch} ms")
      envelope.toFloatArray()
    } catch (e: Exception) {
      Log.w(TAG, "$videoId envelope: ${e.javaClass.simpleName}: ${e.message}")
      null
    } finally {
      try { codec?.stop() } catch (_: Exception) {}
      codec?.release()
      extractor.release()
      clip.delete()
    }
  }
}

/** NewPipeExtractor brings no HTTP client of its own; this is the one it is handed. */
internal object OkHttpDownloader : Downloader() {
  const val USER_AGENT =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:140.0) Gecko/20100101 Firefox/140.0"

  val client: OkHttpClient = OkHttpClient.Builder()
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
