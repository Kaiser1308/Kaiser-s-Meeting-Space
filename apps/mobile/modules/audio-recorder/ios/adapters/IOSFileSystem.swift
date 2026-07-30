// P09-T03: P07 FileSystem adapter — iOS implementation
// IOSFileSystem — Atomic writes, storage queries, SHA-256 checksum

import Foundation

/// P07 FileSystem adapter for iOS.
/// Provides atomic file writes and storage space queries.
final class IOSFileSystem {
  private init() {}

  // MARK: - Base Path

  /// Returns the NSDocumentDirectory path as the base storage directory.
  static var documentDirectory: String {
    let paths = NSSearchPathForDirectoriesInDomains(.documentDirectory, .userDomainMask, true)
    return paths.first ?? NSTemporaryDirectory()
  }

  // MARK: - Atomic Write

  /// Atomically writes data to the specified path.
  /// 1. Writes to a .tmp file
  /// 2. Synchronizes the file handle
  /// 3. Moves to final path
  /// 4. Fsyncs the parent directory
  static func atomicWrite(data: Data, to path: String) throws {
    let tempPath = path + ".tmp"
    let tempUrl = URL(fileURLWithPath: tempPath)
    let finalUrl = URL(fileURLWithPath: path)

    // Write to temporary file atomically
    try data.write(to: tempUrl, options: .atomic)

    // Synchronize file to disk
    let handle = try FileHandle(forWritingTo: tempUrl)
    try handle.synchronize()
    handle.closeFile()

    // Move temp to final path
    _ = try FileManager.default.replaceItemAt(finalUrl, withItemAt: tempUrl)

    // Fsync parent directory
    let dirUrl = finalUrl.deletingLastPathComponent()
    let dirHandle = try FileHandle(forWritingTo: dirUrl)
    try dirHandle.synchronize()
    dirHandle.closeFile()
  }

  // MARK: - Fsync Directory

  /// Synchronizes the directory metadata to ensure file creation is persisted.
  static func fsyncDirectory(at path: String) {
    let url = URL(fileURLWithPath: path, isDirectory: true)
    guard let handle = try? FileHandle(forWritingTo: url) else { return }
    try? handle.synchronize()
    handle.closeFile()
  }

  // MARK: - Available Space

  /// Returns available storage space in bytes at the document directory.
  static func getAvailableSpace() -> Int {
    let path = documentDirectory
    guard let attrs = try? FileManager.default.attributesOfFileSystem(forPath: path) else {
      return 0
    }
    return (attrs[.systemFreeSize] as? Int) ?? 0
  }

  /// Returns total storage space in bytes at the document directory.
  static func getTotalSpace() -> Int {
    let path = documentDirectory
    guard let attrs = try? FileManager.default.attributesOfFileSystem(forPath: path) else {
      return 0
    }
    return (attrs[.systemSize] as? Int) ?? 0
  }
}

// P09-T03
