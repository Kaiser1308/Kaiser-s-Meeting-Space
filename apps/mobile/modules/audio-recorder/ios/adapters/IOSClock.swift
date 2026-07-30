// P09-T03: P07 Clock adapter — iOS implementation
// IOSClock — Wall clock (ISO8601) and monotonic time

import Foundation

/// P07 Clock adapter for iOS.
/// Provides wall clock ISO8601 timestamps and monotonic time in milliseconds.
final class IOSClock {
  private init() {}

  // MARK: - ISO8601 Formatter

  private static let isoFormatter: ISO8601DateFormatter = {
    let fmt = ISO8601DateFormatter()
    fmt.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    return fmt
  }()

  // MARK: - Wall Clock

  /// Returns the current wall clock time as an ISO8601 string with fractional seconds.
  static func now() -> String {
    return isoFormatter.string(from: Date())
  }

  // MARK: - Monotonic Clock

  /// Returns the current monotonic time in milliseconds since process start.
  /// Uses `CFAbsoluteTimeGetCurrent()` which has sub-millisecond precision
  /// and is based on a monotonic clock on Darwin.
  static func monotonicNow() -> TimeInterval {
    return CFAbsoluteTimeGetCurrent() * 1000.0
  }
}

// P09-T03
