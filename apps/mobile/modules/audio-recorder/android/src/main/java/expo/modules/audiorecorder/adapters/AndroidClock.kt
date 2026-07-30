// P09-T02: P07 Clock adapter — Android implementation
package expo.modules.audiorecorder.adapters

import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone

/**
 * Android implementation of the P07 Clock contract.
 *
 * Provides wall-clock time (ISO 8601) and monotonic time (milliseconds).
 */
class AndroidClock {

  private val isoFormatter = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US).apply {
    timeZone = TimeZone.getTimeZone("UTC")
  }

  /**
   * Current wall-clock time as ISO 8601 string (UTC, millisecond precision).
   */
  fun now(): String {
    return isoFormatter.format(Date())
  }

  /**
   * Monotonic time in milliseconds (suitable for duration measurement).
   * Uses System.nanoTime() which is monotonic (not subject to wall-clock adjustments).
   */
  fun monotonicNow(): Long {
    return System.nanoTime() / 1_000_000L
  }
}
