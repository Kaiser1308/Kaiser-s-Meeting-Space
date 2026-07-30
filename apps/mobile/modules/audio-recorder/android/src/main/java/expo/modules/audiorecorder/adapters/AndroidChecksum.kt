// P09-T02: P07 Checksum adapter — Android implementation
package expo.modules.audiorecorder.adapters

import java.security.MessageDigest

/**
 * Android implementation of the P07 Checksum contract.
 *
 * SHA-256 based file verification for chunk integrity.
 */
class AndroidChecksum(private val fileSystem: AndroidFileSystem) {

  /**
   * Compute SHA-256 of file at path. Returns lowercase hex string.
   */
  fun compute(path: String): String {
    return fileSystem.sha256(path)
  }

  /**
   * Verify file at path matches expected SHA-256. Returns true iff match.
   */
  fun verify(path: String, expected: String): Boolean {
    return fileSystem.verifySha256(path, expected)
  }
}
