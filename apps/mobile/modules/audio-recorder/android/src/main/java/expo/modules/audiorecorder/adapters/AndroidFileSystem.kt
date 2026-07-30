// P09-T02: P07 FileSystem adapter — Android implementation
package expo.modules.audiorecorder.adapters

import android.content.Context
import android.os.StatFs
import android.util.Log
import java.io.File
import java.io.FileInputStream
import java.io.FileOutputStream
import java.io.RandomAccessFile
import java.security.MessageDigest
import java.util.UUID

/**
 * Android implementation of the P07 FileSystem contract.
 *
 * Uses context.getFilesDir() for private app storage.
 *
 * atomicWrite: write to .tmp file → FileDescriptor.sync() →
 *   SHA-256 via MessageDigest → File.renameTo() → fsync parent dir.
 */
class AndroidFileSystem(private val context: Context) {

  private val baseDir: File
    get() = context.filesDir

  // ── Core operations ──

  /**
   * Atomically write data: temp → fsync → checksum → rename → dir-fsync.
   */
  fun atomicWrite(
    path: String,
    data: ByteArray
  ): AtomicWriteResult {
    val finalFile = File(resolvePath(path))
    val dir = finalFile.parentFile ?: throw FileSystemException("No parent directory: $path")
    if (!dir.exists()) dir.mkdirs()

    val tmpFile = File(dir, ".tmp-${UUID.randomUUID()}")
    try {
      // Write to temp
      tmpFile.outputStream().use { os ->
        os.write(data)
        os.flush()
        os.channel.force(true)  // fsync
      }

      // Compute SHA-256
      val sha256 = computeSha256Raw(data)

      // Rename temp to final
      if (finalFile.exists()) finalFile.delete()
      if (!tmpFile.renameTo(finalFile)) {
        throw FileSystemException("atomicWrite rename failed: ${tmpFile} → ${finalFile}")
      }

      // Fsync parent directory
      fsyncDir(dir.absolutePath)

      return AtomicWriteResult(
        path = finalFile.absolutePath,
        sha256 = sha256,
        byteLength = data.size.toLong()
      )
    } catch (e: Exception) {
      // Clean up temp file on failure
      try { tmpFile.delete() } catch (_: Exception) {}
      throw e
    }
  }

  /**
   * Read entire file as ByteArray.
   */
  fun read(path: String): ByteArray {
    val file = File(resolvePath(path))
    if (!file.exists()) throw FileSystemException("NOT_FOUND: $path")
    return file.readBytes()
  }

  /**
   * Delete file. NOT_FOUND is not an error (idempotent).
   */
  fun delete(path: String) {
    val file = File(resolvePath(path))
    if (file.exists()) file.delete()
  }

  /**
   * List directory contents (file names only).
   */
  fun list(dir: String): List<String> {
    val directory = File(resolvePath(dir))
    if (!directory.exists() || !directory.isDirectory) {
      throw FileSystemException("NOT_FOUND: $dir")
    }
    return directory.listFiles()?.filter { it.isFile }?.map { it.name } ?: emptyList()
  }

  /**
   * Stat a path.
   */
  fun stat(path: String): StatResult {
    val file = File(resolvePath(path))
    if (!file.exists()) {
      return StatResult(
        exists = false,
        size = 0L,
        isDirectory = false,
        isFile = false,
        modifiedAt = 0L
      )
    }
    return StatResult(
      exists = true,
      size = file.length(),
      isDirectory = file.isDirectory,
      isFile = file.isFile,
      modifiedAt = file.lastModified()
    )
  }

  /**
   * Create directory recursively. No error if exists.
   */
  fun mkdir(dir: String) {
    File(resolvePath(dir)).mkdirs()
  }

  /**
   * Check path existence.
   */
  fun exists(path: String): Boolean {
    return File(resolvePath(path)).exists()
  }

  /**
   * Fsync a directory handle. Critical for rename durability.
   */
  fun fsyncDir(dir: String) {
    try {
      val directory = File(resolvePath(dir))
      if (!directory.exists()) return
      RandomAccessFile(directory, "r").use { raf ->
        raf.channel.force(true)
      }
    } catch (e: Exception) {
      // Best effort — EISDIR on some platforms
      Log.w(TAG, "fsyncDir failed (best effort): ${e.message}")
    }
  }

  /**
   * Get available disk space in bytes for the given path.
   */
  fun getAvailableSpace(path: String): Long {
    return try {
      val stat = StatFs(resolvePath(path))
      stat.availableBlocksLong * stat.blockSizeLong
    } catch (_: Exception) {
      // Fallback: generous estimate
      10L * 1024 * 1024 * 1024  // 10 GB
    }
  }

  // ── SHA-256 ──

  fun sha256(path: String): String {
    val file = File(resolvePath(path))
    val digest = MessageDigest.getInstance("SHA-256")
    FileInputStream(file).use { input ->
      val buf = ByteArray(8192)
      while (true) {
        val n = input.read(buf)
        if (n < 0) break
        digest.update(buf, 0, n)
      }
    }
    return digest.digest().joinToString("") { "%02x".format(it) }
  }

  fun verifySha256(path: String, expected: String): Boolean {
    return try {
      sha256(path) == expected
    } catch (_: Exception) {
      false
    }
  }

  // ── Helpers ──

  private fun resolvePath(path: String): String {
    // If already absolute, use as-is; otherwise resolve relative to filesDir
    val file = File(path)
    return if (file.isAbsolute) path else File(baseDir, path).absolutePath
  }

  private fun computeSha256Raw(data: ByteArray): String {
    val digest = MessageDigest.getInstance("SHA-256")
    digest.update(data)
    return digest.digest().joinToString("") { "%02x".format(it) }
  }

  // ── Data classes ──

  data class AtomicWriteResult(
    val path: String,
    val sha256: String,
    val byteLength: Long
  )

  data class StatResult(
    val exists: Boolean,
    val size: Long,
    val isDirectory: Boolean,
    val isFile: Boolean,
    val modifiedAt: Long
  )

  companion object {
    private const val TAG = "AndroidFileSystem"
  }
}

class FileSystemException(message: String) : Exception(message)
