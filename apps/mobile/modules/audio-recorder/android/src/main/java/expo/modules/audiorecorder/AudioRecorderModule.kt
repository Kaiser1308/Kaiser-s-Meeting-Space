// P09-T02: Expo native module — Android microphone capture
package expo.modules.audiorecorder

import android.content.Context
import android.util.Log
import java.io.File
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.audiorecorder.adapters.AndroidChecksum
import expo.modules.audiorecorder.adapters.AndroidClock
import expo.modules.audiorecorder.adapters.AndroidFileSystem
import org.json.JSONObject

/**
 * Expo native module for Android microphone capture.
 *
 * Exposes seven async functions (configure/start/pause/resume/stop/status/cancel)
 * and six event types (onChunk/onDevice/onInterrupt/onStorage/onGap/onError).
 *
 * All commands arrive as JSON strings and return JSON string responses.
 * Events are emitted via Expo's sendEvent() with a v1 envelope.
 *
 * Content-free: no audio data in logs, error messages, or event details.
 */
class AudioRecorderModule : Module() {

  // ── Adapters ──

  private lateinit var fileSystem: AndroidFileSystem
  private lateinit var clock: AndroidClock
  private lateinit var checksum: AndroidChecksum

  // ── Engine ──

  private var captureEngine: AudioCaptureEngine? = null
  private var focusManager: AudioFocusManager? = null

  // ── State ──

  private var currentState: String = "unconfigured"
  private var currentChunkIndex: Int = 0
  private var bytesWritten: Long = 0L
  private var durationMs: Long = 0L
  private var storageDir: String = ""
  private var activeMeetingId: String = ""
  private var profileJson: String = ""

  // ── Thread safety lock for state transitions ──

  private val stateLock = Any()

  // ── React context ──

  private val reactContext: Context
    get() = appContext.reactContext
      ?: throw CodedException("ReactContext unavailable — module not initialized")

  override fun definition() = ModuleDefinition {
    Name("AudioRecorder")

    // ── Events (P09 NativeEvent schema) ──
    Events(
      "onChunk",
      "onDevice",
      "onInterrupt",
      "onStorage",
      "onGap",
      "onError"
    )

    // ── Lifecycle ──

    OnCreate {
      fileSystem = AndroidFileSystem(reactContext)
      clock = AndroidClock()
      checksum = AndroidChecksum(fileSystem)
      focusManager = AudioFocusManager(
        context = reactContext,
        onFocusLoss = { cause, action ->
          synchronized(stateLock) { handleFocusLoss(cause, action) }
        },
        onRouteChange = { detail ->
          synchronized(stateLock) { handleRouteChange(detail) }
        }
      )
      Log.i(TAG, "AudioRecorder module created")
    }

    OnDestroy {
      synchronized(stateLock) {
        captureEngine?.shutdown()
        captureEngine = null
        focusManager?.abandonFocus()
      }
      Log.i(TAG, "AudioRecorder module destroyed")
    }

    // ── configure ──

    AsyncFunction("configure") { profileJson: String, storageDir: String, meetingId: String ->
      synchronized(stateLock) {
        if (currentState == "recording" || currentState == "paused") {
          return@AsyncFunction errorJson("invalid_state", "Cannot configure while $currentState")
        }
        val profile = try {
          JSONObject(profileJson)
        } catch (_: Exception) {
          return@AsyncFunction errorJson("invalid_profile", "Profile JSON parse failed")
        }
        // Validate required profile fields
        if (!profile.has("sampleRate") || !profile.has("channels") || !profile.has("codec") || !profile.has("container")) {
          return@AsyncFunction errorJson("invalid_profile", "Missing required profile fields")
        }
        this@AudioRecorderModule.profileJson = profileJson
        this@AudioRecorderModule.storageDir = storageDir.ifBlank {
          File(reactContext.filesDir, "recordings").apply { mkdirs() }.absolutePath
        }
        this@AudioRecorderModule.activeMeetingId = meetingId
        currentChunkIndex = 0
        bytesWritten = 0L
        durationMs = 0L
        currentState = "configured"

        Log.i(TAG, "Configured: meeting=$meetingId dir=$storageDir")
        return@AsyncFunction emitOk()
      }
    }

    // ── start ──

    AsyncFunction("start") {
      synchronized(stateLock) {
        if (currentState != "configured") {
          return@AsyncFunction errorJson("invalid_state", "Cannot start from state $currentState")
        }
        currentState = "recording"

        // Initialize capture engine
        captureEngine = AudioCaptureEngine(
          fileSystem = fileSystem,
          clock = clock,
          checksum = checksum,
          storageDir = storageDir,
          meetingId = activeMeetingId,
          profileJson = profileJson,
          onEvent = { eventName, body -> emitEvent(eventName, body) },
          onStateChange = { newState -> currentState = newState },
          onChunkComplete = { chunkIndex, written, dur ->
            currentChunkIndex = chunkIndex + 1
            bytesWritten += written
            durationMs += dur
          }
        )

        // Request audio focus
        focusManager?.requestFocus()

        // Start capture
        captureEngine?.start()
        Log.i(TAG, "Capture started")
        return@AsyncFunction emitOk()
      }
    }

    // ── pause ──

    AsyncFunction("pause") {
      synchronized(stateLock) {
        if (currentState != "recording") {
          return@AsyncFunction errorJson("invalid_state", "Cannot pause from state $currentState")
        }
        currentState = "paused"
        captureEngine?.pause()
        Log.i(TAG, "Capture paused")
        return@AsyncFunction emitOk()
      }
    }

    // ── resume ──

    AsyncFunction("resume") {
      synchronized(stateLock) {
        if (currentState != "paused") {
          return@AsyncFunction errorJson("invalid_state", "Cannot resume from state $currentState")
        }
        currentState = "recording"
        captureEngine?.resume()
        Log.i(TAG, "Capture resumed")
        return@AsyncFunction emitOk()
      }
    }

    // ── stop ──

    AsyncFunction("stop") {
      synchronized(stateLock) {
        if (currentState != "recording" && currentState != "paused") {
          return@AsyncFunction errorJson("invalid_state", "Cannot stop from state $currentState")
        }
        currentState = "stopping"
        Log.i(TAG, "Capture stopping")
      }
      // Perform async drain outside the lock to avoid blocking JS bridge
      val result = captureEngine?.stop() ?: return@AsyncFunction errorJson("io_error", "Engine not initialized")
      synchronized(stateLock) {
        currentState = "finalizing"
        currentChunkIndex = result.chunkIndex + 1
        bytesWritten += result.byteLength
        durationMs += result.durationMs
        focusManager?.abandonFocus()
        return@AsyncFunction emitOk()
      }
    }

    // ── status ──

    AsyncFunction("status") {
      synchronized(stateLock) {
        val path = storageDir.ifEmpty { reactContext.filesDir.absolutePath }
        val available = fileSystem.getAvailableSpace(path)
        return@AsyncFunction JSONObject().apply {
          put("type", "status")
          put("state", currentState)
          put("currentChunkIndex", currentChunkIndex)
          put("bytesWritten", bytesWritten)
          put("durationMs", durationMs)
          put("storageAvailable", available)
        }.toString()
      }
    }

    // ── cancel ──

    AsyncFunction("cancel") {
      synchronized(stateLock) {
        captureEngine?.shutdown()
        captureEngine = null
        focusManager?.abandonFocus()
        currentState = "unconfigured"
        currentChunkIndex = 0
        bytesWritten = 0L
        durationMs = 0L
        storageDir = ""
        activeMeetingId = ""
        Log.i(TAG, "Capture cancelled")
        return@AsyncFunction emitOk()
      }
    }
  }

  // ── Internal helpers ──

  private fun emitEvent(eventName: String, body: Map<String, Any?>) {
    try {
      sendEvent(eventName, body)
    } catch (_: Exception) {
      // Listener errors must not propagate
    }
  }

  private fun emitOk(): String {
    return """{"status":"ok"}"""
  }

  private fun errorJson(code: String, detail: String): String {
    return JSONObject().apply {
      put("status", "error")
      put("code", code)
      put("detail", detail)
    }.toString()
  }

  private fun handleFocusLoss(cause: String, action: String) {
    // P09-T02: Focus loss — pause capture, emit interrupt event
    if (currentState == "recording") {
      captureEngine?.pause()
      currentState = "paused"
      emitEvent("onInterrupt", mapOf(
        "type" to "interrupt",
        "cause" to cause,
        "action" to action
      ))
    }
  }

  private fun handleRouteChange(detail: String) {
    // P09-T02: Route change — close current chunk, emit device event
    captureEngine?.closeCurrentChunk()
    emitEvent("onDevice", mapOf(
      "type" to "device",
      "changeType" to "route_change",
      "detail" to detail
    ))
  }

  companion object {
    private const val TAG = "AudioRecorderModule"
  }
}
