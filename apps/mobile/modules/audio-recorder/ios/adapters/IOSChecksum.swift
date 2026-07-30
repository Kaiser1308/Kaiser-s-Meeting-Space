// P09-T03: P07 Checksum adapter — iOS implementation
// IOSChecksum — SHA-256 via CommonCrypto

import Foundation
import CommonCrypto

/// P07 Checksum adapter for iOS.
/// Computes and verifies SHA-256 checksums using CommonCrypto (CC_SHA256).
final class IOSChecksum {
  private init() {}

  // MARK: - SHA-256 Digest Length

  private static let digestLength = Int(CC_SHA256_DIGEST_LENGTH)

  // MARK: - Compute

  /// Computes the SHA-256 checksum of a file at the given path.
  /// Returns the hex-encoded digest string (64 characters).
  static func compute(path: String) -> String {
    guard let fileHandle = FileHandle(forReadingAtPath: path) else {
      // Return zeros on failure to match expected format
      return String(repeating: "0", count: digestLength * 2)
    }
    defer {
      fileHandle.closeFile()
    }

    var context = CC_SHA256_CTX()
    CC_SHA256_Init(&context)

    let bufferSize = 16 * 1024
    while autoreleasepool(invoking: {
      let data = fileHandle.readData(ofLength: bufferSize)
      if data.isEmpty {
        return false
      }
      data.withUnsafeBytes { ptr in
        guard let baseAddress = ptr.baseAddress else { return }
        CC_SHA256_Update(&context, baseAddress, CC_LONG(data.count))
      }
      return true
    }) {}

    var digest = [UInt8](repeating: 0, count: digestLength)
    CC_SHA256_Final(&digest, &context)

    return digest.map { String(format: "%02x", $0) }.joined()
  }

  // MARK: - Compute from Data

  /// Computes the SHA-256 checksum of data in memory.
  /// Returns the hex-encoded digest string (64 characters).
  static func computeData(data: Data) -> String {
    var context = CC_SHA256_CTX()
    CC_SHA256_Init(&context)

    data.withUnsafeBytes { ptr in
      guard let baseAddress = ptr.baseAddress else { return }
      CC_SHA256_Update(&context, baseAddress, CC_LONG(data.count))
    }

    var digest = [UInt8](repeating: 0, count: digestLength)
    CC_SHA256_Final(&digest, &context)

    return digest.map { String(format: "%02x", $0) }.joined()
  }

  // MARK: - Verify

  /// Verifies a file's SHA-256 checksum matches the expected value.
  /// Comparison is case-insensitive.
  static func verify(path: String, expected: String) -> Bool {
    let computed = compute(path: path)
    return computed.caseInsensitiveCompare(expected) == .orderedSame
  }
}

// P09-T03
