// P09-T02: Core audio capture engine — ring buffer, AudioRecord, writer thread
package expo.modules.audiorecorder

import android.Manifest
import android.content.pm.PackageManager
import android.media.AudioFormat
import android.media.AudioRecord
import android.media.MediaRecorder
import android.os.Handler
import android.os.HandlerThread
import android.os.Process
import android.util.Log
import expo.modules.audiorecorder.adapters.AndroidChecksum
import expo.modules.audiorecorder.adapters.AndroidClock
import expo.modules.audiorecorder.adapters.AndroidFileSystem
import java.io.File
import java.io.RandomAccessFile
import java.security.MessageDigest
import java.util.ArrayDeque
import java.util.UUID
import kotlin.math.min

// P09-T02-FUTURE: Opus/WebM encode via libopus JNI or MediaCodec.
// Current write path stores raw PCM (.pcm). The encodeFrame() method on
// WriterThread is the integration point for adding encoding in a later phase.

/**
 * Core audio capture engine.
 *
 * Owns the AudioRecord, ring buffer (preallocated ShortArray pool),
 * capture thread, and writer thread.
 *
 * Design rules:
 * - No network, provider, database, or blocking file I/O in the audio
 *   callback/capture thread.
 * - Writer thread is separate from capture thread.
 * - Ring buffer overflow emits onGap and drops oldest — never OOM.
 * - Content-free: no audio data in logs, error messages, or events.
 */
class AudioCaptureEngine(
  private val fileSystem: AndroidFileSystem,
  private val clock: AndroidClock,
  private val checksum: AndroidChecksum,
  private val storageDir: String,
  private val meetingId: String,
  private val profileJson: String,
  private val onEvent: (eventName: String, body: Map<String, Any?>) -> Unit,
  private val onStateChange: (newState: String) -> Unit,
  private val onChunkComplete: (chunkIndex: Int, byteLength: Long, durationMs: Long) -> Unit
) {

  // ── Audio configuration ──

  companion object {
    const val SAMPLE_RATE = 48000
    const val CHANNEL_CONFIG = AudioFormat.CHANNEL_IN_MONO
    const val AUDIO_FORMAT = AudioFormat.ENCODING_PCM_16BIT
    /** Buffer size in bytes passed to AudioRecord.read(). */
    const val READ_BUFFER_BYTES = 4096
    /** Number of 16-bit samples per read buffer. */
    val READ_BUFFER_SAMPLES: Int = READ_BUFFER_BYTES / 2  // 2048
    /** Maximum number of buffers in the ring buffer (~1.3s at 20ms frames). */
    const val RING_BUFFER_CAPACITY = 64
    /** Min buffer size requested from AudioRecord. */
    val MIN_BUFFER_SIZE: Int = maxOf(
      AudioRecord.getMinBufferSize(SAMPLE_RATE, CHANNEL_CONFIG, AUDIO_FORMAT),
      READ_BUFFER_BYTES * 2  // At least 2 read buffers worth
    )
    private const val TAG = "AudioCaptureEngine"
  }

  // ── State ──

  @Volatile
  private var running: Boolean = false

  @Volatile
  private var paused: Boolean = false

  private var captureThread: HandlerThread? = null
  private var captureHandler: Handler? = null
  private var writerThread: HandlerThread? = null
  private var writerHandler: Handler? = null
  private var audioRecord: AudioRecord? = null

  // ── Ring buffer ──

  private val ringBuffer = ArrayDeque<ShortArray>(RING_BUFFER_CAPACITY)
  private val bufferPool = ShortArrayPool(RING_BUFFER_CAPACITY, READ_BUFFER_SAMPLES)

  // ── Writer state ──

  private var currentChunkIndex: Int = 0
  private var currentFilePath: String = ""
  private var currentChunkStartWall: String = ""
  private var currentChunkStartMono: Long = 0L
  private var currentChunkBytes: Long = 0L
  private var currentChunkDuration: Long = 0L
  private var currentWriter: WriterSession? = null

  // ── Gap tracking ──

  private var gapStartMs: Long = -1L

  // ── Public API ──

  /**
   * Start capturing audio. Must be called after configure().
   */
  fun start() {
    if (running) return
    running = true
    paused = false
    currentChunkIndex = 0
    openNewChunk()
    startAudioRecord()
  }

  /**
   * Pause capture — closes current chunk, emits chunk event.
   */
  fun pause() {
    if (!running || paused) return
    paused = true
    closeCurrentChunkInternal()
  }

  /**
   * Resume capture — opens new chunk and timeline interval.
   */
  fun resume() {
    if (!running || !paused) return
    paused = false
    openNewChunk()
  }

  /**
   * Stop capture and drain remaining buffers.
   * Returns metadata for the final chunk, or null if no engine.
   */
  fun stop(): ChunkResult? {
    if (!running) return null
    running = false
    paused = false

    // Stop AudioRecord
    audioRecord?.let { record ->
      try {
        if (record.recordingState == AudioRecord.RECORDSTATE_RECORDING) {
          record.stop()
        }
      } catch (_: Exception) {
        // Best effort stop
      }
      record.release()
      audioRecord = null
    }

    // Drain remaining ring buffers
    drainRingBuffer()

    // Close final chunk
    closeCurrentChunkInternal()

    // Shutdown threads
    captureThread?.quitSafely()
    captureThread = null
    captureHandler = null
    writerThread?.quitSafely()
    writerThread = null
    writerHandler = null

    return ChunkResult(
      chunkIndex = currentChunkIndex - 1,
      byteLength = currentChunkBytes,
      durationMs = currentChunkDuration
    )
  }

  /**
   * Shutdown engine immediately (cancel). Does not emit final chunk.
   */
  fun shutdown() {
    running = false
    paused = false

    audioRecord?.let { record ->
      try {
        if (record.recordingState == AudioRecord.RECORDSTATE_RECORDING) {
          record.stop()
        }
      } catch (_: Exception) {}
      record.release()
      audioRecord = null
    }

    // Delete the active temp file if present
    if (currentFilePath.isNotEmpty()) {
      try {
        File(currentFilePath).delete()
      } catch (_: Exception) {}
      currentFilePath = ""
    }

    captureThread?.quitSafely()
    captureThread = null
    captureHandler = null
    writerThread?.quitSafely()
    writerThread = null
    writerHandler = null
    ringBuffer.clear()
  }

  /**
   * Close current chunk due to route/format change.
   * Emits chunk event synchronously and opens a new chunk.
   */
  fun closeCurrentChunk() {
    if (!running || paused) return
    closeCurrentChunkInternal()
    openNewChunk()
  }

  // ── Internal: AudioRecord ──

  private fun startAudioRecord() {
    try {
      audioRecord = AudioRecord(
        MediaRecorder.AudioSource.MIC,
        SAMPLE_RATE,
        CHANNEL_CONFIG,
        AUDIO_FORMAT,
        MIN_BUFFER_SIZE
      )
    } catch (e: Exception) {
      Log.e(TAG, "Failed to create AudioRecord", e)
      onStateChange("error")
      onEvent("onError", mapOf(
        "type" to "error",
        "code" to "read_error",
        "detail" to "AudioRecord creation failed",
        "fatal" to true
      ))
      return
    }

    val record = audioRecord ?: return
    if (record.state != AudioRecord.STATE_INITIALIZED) {
      Log.e(TAG, "AudioRecord not initialized")
      record.release()
      audioRecord = null
      onStateChange("error")
      onEvent("onError", mapOf(
        "type" to "error",
        "code" to "read_error",
        "detail" to "AudioRecord not initialized",
        "fatal" to true
      ))
      return
    }

    // Start capture thread
    captureThread = HandlerThread("AudioCapture", Process.THREAD_PRIORITY_URGENT_AUDIO).apply { start() }
    captureHandler = Handler(captureThread!!.looper)

    // Start writer thread
    writerThread = HandlerThread("AudioWriter", Process.THREAD_PRIORITY_DEFAULT).apply { start() }
    writerHandler = Handler(writerThread!!.looper)

    // Start recording
    record.startRecording()

    // Post capture loop
    captureHandler?.post(captureRunnable)
  }

  private val captureRunnable: Runnable = object : Runnable {
    override fun run() {
      if (!running) return

      if (paused) {
        captureHandler?.postDelayed(this, 10)
        return
      }

      val buffer = bufferPool.obtain()
      // AudioRecord.read(ShortArray, int, int) returns number of shorts (samples) read
      val samplesRead = try {
        audioRecord?.read(buffer, 0, READ_BUFFER_SAMPLES) ?: -1
      } catch (_: Exception) {
        -1
      }

      if (samplesRead <= 0) {
        bufferPool.recycle(buffer)
        if (running) {
          // Read error
          onEvent("onError", mapOf(
            "type" to "error",
            "code" to "read_error",
            "fatal" to false
          ))
        }
        captureHandler?.postDelayed(this, 10)
        return
      }

      // Buffer is pre-allocated and zero-filled; partial reads leave trailing
      // zeros (silence) which is acceptable for PCM. No copy needed.

      // Try to enqueue; on overflow emit gap and drop oldest
      val enqueued = synchronized(ringBuffer) {
        if (ringBuffer.size >= RING_BUFFER_CAPACITY) {
          // Ring buffer full — drop oldest, emit gap
          val dropped = ringBuffer.pollFirst()
          if (dropped != null) bufferPool.recycle(dropped)
          ringBuffer.offerLast(buffer)
          false
        } else {
          ringBuffer.offerLast(buffer)
          true
        }
      }

      if (!enqueued) {
        // P09-T02: Ring buffer overflow — emit onGap event
        if (gapStartMs < 0) gapStartMs = currentChunkDuration
        val gapEnd = currentChunkDuration + (samplesRead * 1000L) / SAMPLE_RATE
        onEvent("onGap", mapOf(
          "type" to "gap",
          "reason" to "buffer_overflow",
          "startMs" to gapStartMs,
          "endMs" to gapEnd,
          "durationMs" to (gapEnd - gapStartMs)
        ))
        gapStartMs = gapEnd
      } else {
        gapStartMs = -1L
      }

      // Notify writer
      writerHandler?.post(writerRunnable)

      // Schedule next read
      captureHandler?.post(this)
    }
  }

  private val writerRunnable: Runnable = object : Runnable {
    override fun run() {
      val buffer = synchronized(ringBuffer) { ringBuffer.pollFirst() } ?: return

      try {
        currentWriter?.write(buffer)
        currentChunkBytes += buffer.size * 2L
        currentChunkDuration += (buffer.size * 1000L) / SAMPLE_RATE
      } catch (e: Exception) {
        Log.e(TAG, "Writer write failed", e)
        onEvent("onError", mapOf(
          "type" to "error",
          "code" to "io_error",
          "fatal" to false
        ))
      }

      bufferPool.recycle(buffer)
    }
  }

  // ── Chunk lifecycle ──

  private fun openNewChunk() {
    // P09-T02-FUTURE: encodeFrame() integration point for Opus/WebM encoding
    val path = "${storageDir}/${meetingId}-chunk-${String.format("%04d", currentChunkIndex)}.pcm.tmp"
    currentFilePath = path
    currentChunkStartWall = clock.now()
    currentChunkStartMono = clock.monotonicNow()
    currentChunkBytes = 0L
    currentChunkDuration = 0L
    try {
      currentWriter = WriterSession(path)
    } catch (e: Exception) {
      Log.e(TAG, "Failed to open chunk file", e)
      onEvent("onError", mapOf(
        "type" to "error",
        "code" to "io_error",
        "detail" to "Failed to open chunk file",
        "fatal" to true
      ))
    }
  }

  private fun closeCurrentChunkInternal() {
    val writer = currentWriter ?: return
    val chunkIndex = currentChunkIndex
    val startWall = currentChunkStartWall
    val startMono = currentChunkStartMono
    val duration = currentChunkDuration
    val byteLength = currentChunkBytes

    currentWriter = null

    if (byteLength <= 0L) {
      // Empty chunk — delete temp file, no event
      try { File(currentFilePath).delete() } catch (_: Exception) {}
      currentFilePath = ""
      return
    }

    try {
      writer.close()

      // Compute SHA-256
      val sha256 = computeSha256(currentFilePath)

      // Rename .pcm.tmp → .pcm
      val finalPath = currentFilePath.removeSuffix(".tmp")
      val tmpFile = File(currentFilePath)
      val finalFile = File(finalPath)
      if (finalFile.exists()) finalFile.delete()
      tmpFile.renameTo(finalFile)

      // Fsync directory
      fileSystem.fsyncDir(File(finalPath).parent ?: storageDir)

      // Emit chunk event with format: 'pcm'
      val endWall = clock.now()
      val endMono = clock.monotonicNow()
      onEvent("onChunk", mapOf(
        "type" to "chunk",
        "meetingId" to meetingId,
        "chunkIndex" to chunkIndex,
        "filePath" to finalPath,
        "sha256" to sha256,
        "byteLength" to byteLength,
        "wallClockStart" to startWall,
        "wallClockEnd" to endWall,
        "monotonicStart" to startMono,
        "monotonicEnd" to endMono,
        "durationMs" to duration,
        "sampleRate" to SAMPLE_RATE,
        "channels" to 1,
        // The current Android writer stores durable raw PCM. Advertise the actual
        // on-disk format; do not claim Opus/WebM before an encoder is integrated.
        "codec" to "pcm",
        "container" to "raw",
        "format" to "pcm"
      ))

      currentChunkIndex++
      currentFilePath = ""
      onChunkComplete(chunkIndex, byteLength, duration)
    } catch (e: Exception) {
      Log.e(TAG, "Failed to finalize chunk $chunkIndex", e)
      onEvent("onError", mapOf(
        "type" to "error",
        "code" to "io_error",
        "detail" to "Failed to finalize chunk",
        "fatal" to true
      ))
    }
  }

  private fun drainRingBuffer() {
    while (true) {
      val buffer = synchronized(ringBuffer) { ringBuffer.pollFirst() } ?: break
      try {
        currentWriter?.write(buffer)
        currentChunkBytes += buffer.size * 2L
        currentChunkDuration += (buffer.size * 1000L) / SAMPLE_RATE
      } catch (_: Exception) {}
      bufferPool.recycle(buffer)
    }
  }

  // ── SHA-256 computation ──

  private fun computeSha256(path: String): String {
    val digest = MessageDigest.getInstance("SHA-256")
    val file = File(path)
    file.inputStream().use { input ->
      val buf = ByteArray(8192)
      while (true) {
        val n = input.read(buf)
        if (n < 0) break
        digest.update(buf, 0, n)
      }
    }
    return digest.digest().joinToString("") { "%02x".format(it) }
  }

  // ── Writer session (encapsulates a single chunk file) ──

  private class WriterSession(path: String) {
    private val file = RandomAccessFile(path, "rw")
    private val channel = file.channel

    fun write(samples: ShortArray) {
      // P09-T02-FUTURE: Replace raw PCM write with encodeFrame(samples) → encoded bytes
      val bytes = ByteArray(samples.size * 2)
      for (i in samples.indices) {
        val s = samples[i].toInt()
        bytes[i * 2] = (s and 0xFF).toByte()
        bytes[i * 2 + 1] = ((s shr 8) and 0xFF).toByte()
      }
      file.write(bytes)
    }

    fun close() {
      channel.force(true)  // fsync
      file.close()
    }
  }

  // ── ShortArray pool (preallocated, avoids GC pressure) ──

  private class ShortArrayPool(private val capacity: Int, private val arraySize: Int) {
    private val pool = ArrayDeque<ShortArray>(capacity)

    init {
      // Pre-allocate all buffers
      for (i in 0 until capacity) {
        pool.offer(ShortArray(arraySize))
      }
    }

    fun obtain(): ShortArray {
      return pool.pollLast() ?: ShortArray(arraySize)
    }

    fun recycle(array: ShortArray) {
      if (pool.size < capacity) {
        pool.offer(array)
      }
    }
  }
}

data class ChunkResult(
  val chunkIndex: Int,
  val byteLength: Long,
  val durationMs: Long
)
