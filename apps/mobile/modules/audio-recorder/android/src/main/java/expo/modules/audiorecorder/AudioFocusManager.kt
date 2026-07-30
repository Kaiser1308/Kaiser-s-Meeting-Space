// P09-T02: Audio focus and route change management
package expo.modules.audiorecorder

import android.content.Context
import android.media.AudioDeviceCallback
import android.media.AudioDeviceInfo
import android.media.AudioFocusRequest
import android.media.AudioManager
import android.os.Build
import android.util.Log

/**
 * Manages audio focus requests and route change detection.
 *
 * - Requests AUDIOFOCUS_GAIN on start
 * - On focus loss: pauses capture and emits interrupt event
 * - On route change: emits device event via callback
 * - AudioDeviceCallback requires API 23+; we target minSdk 26
 */
class AudioFocusManager(
  private val context: Context,
  private val onFocusLoss: (cause: String, action: String) -> Unit,
  private val onRouteChange: (detail: String) -> Unit
) {

  private val audioManager: AudioManager?
    get() = context.getSystemService(Context.AUDIO_SERVICE) as? AudioManager

  private var focusRequest: AudioFocusRequest? = null
  private var hasFocus: Boolean = false

  // ── AudioDeviceCallback (API 23+) ──

  private val deviceCallback = if (Build.VERSION.SDK_INT >= 23) {
    object : AudioDeviceCallback() {
      override fun onAudioDevicesAdded(addedDevices: Array<AudioDeviceInfo>) {
        for (device in addedDevices) {
          val name = device.productName?.toString() ?: "unknown"
          Log.d(TAG, "Audio device added: $name (type=${device.type})")
          onRouteChange("device_connect: $name")
        }
      }

      override fun onAudioDevicesRemoved(removedDevices: Array<AudioDeviceInfo>) {
        for (device in removedDevices) {
          val name = device.productName?.toString() ?: "unknown"
          val typeName = deviceTypeName(device.type)
          Log.d(TAG, "Audio device removed: $name (type=${device.type})")
          onRouteChange("device_disconnect: $name ($typeName)")
        }
      }
    }
  } else {
    null
  }

  // ── AudioFocusChangeListener ──

  private val focusChangeListener = AudioManager.OnAudioFocusChangeListener { focusChange ->
    when (focusChange) {
      AudioManager.AUDIOFOCUS_GAIN -> {
        hasFocus = true
        Log.d(TAG, "Audio focus gained")
      }
      AudioManager.AUDIOFOCUS_LOSS -> {
        hasFocus = false
        Log.d(TAG, "Audio focus lost (permanent)")
        onFocusLoss("media_reset", "stop")
      }
      AudioManager.AUDIOFOCUS_LOSS_TRANSIENT -> {
        hasFocus = false
        Log.d(TAG, "Audio focus lost (transient)")
        onFocusLoss("phone_call", "pause")
      }
      AudioManager.AUDIOFOCUS_LOSS_TRANSIENT_CAN_DUCK -> {
        // P09-T02: Ducking is allowed — we don't stop/pause for duck-only loss
        Log.d(TAG, "Audio focus lost (can duck) — ignoring")
      }
    }
  }

  // ── Public API ──

  /**
   * Request audio focus for capture. Should be called before start().
   */
  fun requestFocus() {
    if (hasFocus) return
    val am = audioManager ?: return

    if (Build.VERSION.SDK_INT >= 26) {
      val request = AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN)
        .setOnAudioFocusChangeListener(focusChangeListener)
        .setAcceptsDelayedFocusGain(false)
        .build()
      focusRequest = request
      val result = am.requestAudioFocus(request)
      hasFocus = (result == AudioManager.AUDIOFOCUS_REQUEST_GRANTED)
      Log.d(TAG, "Audio focus request: granted=$hasFocus")
    } else {
      // Fallback for older APIs (minSdk 26 but kept for compatibility)
      @Suppress("DEPRECATION")
      val result = am.requestAudioFocus(
        focusChangeListener,
        AudioManager.STREAM_MUSIC,
        AudioManager.AUDIOFOCUS_GAIN
      )
      hasFocus = (result == AudioManager.AUDIOFOCUS_REQUEST_GRANTED)
    }

    // Register device callback
    registerDeviceCallback()
  }

  /**
   * Abandon audio focus. Should be called on stop/cancel.
   */
  fun abandonFocus() {
    if (!hasFocus) return
    val am = audioManager ?: return

    if (Build.VERSION.SDK_INT >= 26 && focusRequest != null) {
      am.abandonAudioFocusRequest(focusRequest!!)
    } else {
      @Suppress("DEPRECATION")
      am.abandonAudioFocus(focusChangeListener)
    }
    hasFocus = false
    unregisterDeviceCallback()
    Log.d(TAG, "Audio focus abandoned")
  }

  // ── Device callback registration ──

  private fun registerDeviceCallback() {
    if (Build.VERSION.SDK_INT >= 23 && deviceCallback != null) {
      audioManager?.registerAudioDeviceCallback(deviceCallback, null)
    }
  }

  private fun unregisterDeviceCallback() {
    if (Build.VERSION.SDK_INT >= 23 && deviceCallback != null) {
      audioManager?.unregisterAudioDeviceCallback(deviceCallback)
    }
  }

  // ── Helpers ──

  private fun deviceTypeName(type: Int): String = when (type) {
    AudioDeviceInfo.TYPE_BUILTIN_MIC -> "builtin_mic"
    AudioDeviceInfo.TYPE_WIRED_HEADSET -> "wired_headset"
    AudioDeviceInfo.TYPE_WIRED_HEADPHONES -> "wired_headphones"
    AudioDeviceInfo.TYPE_BLUETOOTH_SCO -> "bluetooth_sco"
    AudioDeviceInfo.TYPE_BLUETOOTH_A2DP -> "bluetooth_a2dp"
    AudioDeviceInfo.TYPE_USB_HEADSET -> "usb_headset"
    AudioDeviceInfo.TYPE_USB_DEVICE -> "usb_device"
    AudioDeviceInfo.TYPE_USB_ACCESSORY -> "usb_accessory"
    AudioDeviceInfo.TYPE_LINE_ANALOG -> "line_analog"
    AudioDeviceInfo.TYPE_LINE_DIGITAL -> "line_digital"
    AudioDeviceInfo.TYPE_HDMI -> "hdmi"
    AudioDeviceInfo.TYPE_BUILTIN_SPEAKER -> "speaker"
    else -> "unknown"
  }

  companion object {
    private const val TAG = "AudioFocusManager"
  }
}
