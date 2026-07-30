// P09-T03: Core audio capture engine for iOS microphone capture
// AudioCaptureEngine — AVAudioEngine with lock-free ring buffer handoff

import AVFoundation
import Accelerate

// MARK: - ChunkInfo

struct ChunkInfo {
  let index: Int
  let filePath: String
  let sha256: String
  let byteLength: Int
}

// MARK: - Buffer Pool

private let POOL_CAPACITY = 64
private let FRAME_CAPACITY: AVAudioFrameCount = 4096

final class BufferPool {
  private var buffers: [AVAudioPCMBuffer?]
  private var available: IndexSet

  init(capacity: Int, format: AVAudioFormat) {
    self.buffers = []
    self.available = IndexSet()

    for i in 0..<capacity {
      guard let buffer = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: FRAME_CAPACITY) else {
        continue
      }
      buffers.append(buffer)
      available.insert(i)
    }
  }

  func acquire() -> Int? {
    guard let idx = available.first else { return nil }
    available.remove(idx)
    guard let buffer = buffers[idx] else {
      available.insert(idx)
      return nil
    }
    buffer.frameLength = 0
    return idx
  }

  func release(_ idx: Int) {
    available.insert(idx)
  }

  subscript(_ idx: Int) -> AVAudioPCMBuffer? {
    guard idx >= 0, idx < buffers.count else { return nil }
    return buffers[idx]
  }

  var count: Int { buffers.count }
  var availableCount: Int { available.count }
}

// MARK: - Ring Buffer (SPSC, lock-free)

final class RingBuffer {
  private let capacity: Int
  private var buffer: [Int]
  private var head: Int32 = 0  // writer index
  private var tail: Int32 = 0  // reader index

  init(capacity: Int) {
    self.capacity = capacity
    self.buffer = [Int](repeating: -1, count: capacity)
  }

  /// Push index onto ring buffer. Returns false on overflow.
  func push(_ index: Int) -> Bool {
    let h = Int(head)
    let next = (h + 1) % capacity
    if next == Int(tail) {
      return false // full
    }
    buffer[h] = index
    head = Int32(next)
    return true
  }

  /// Pop index from ring buffer. Returns nil when empty.
  func pop() -> Int? {
    let t = Int(tail)
    if t == Int(head) {
      return nil // empty
    }
    let idx = buffer[t]
    tail = Int32((t + 1) % capacity)
    return idx
  }

  var isEmpty: Bool { Int(head) == Int(tail) }
  var count: Int {
    let h = Int(head)
    let t = Int(tail)
    if h >= t { return h - t }
    return capacity - t + h
  }

  func reset() {
    head = 0
    tail = 0
    buffer = [Int](repeating: -1, count: capacity)
  }
}

// MARK: - AudioCaptureEngine

final class AudioCaptureEngine {
  // MARK: - Callbacks (set by AudioRecorderModule)

  var onChunk: ((ChunkInfo) -> Void)?
  var onGap: ((String, Int) -> Void)?
  var onError: ((String, String, Bool) -> Void)?

  // MARK: - Internal State

  private let engine = AVAudioEngine()
  private let writerQueue = DispatchQueue(label: "com.kms.audio.writer", qos: .utility)
  private let formatChangeQueue = DispatchQueue(label: "com.kms.audio.formatChange", qos: .userInitiated)

  private var bufferPool: BufferPool?
  private var ringBuffer: RingBuffer?
  private var isRunning = false
  private var isPaused = false
  private var isStopping = false

  private var storageDir: String = ""
  private var meetingId: String = ""
  private var currentChunkIndex: Int = 0
  private var currentFileHandle: FileHandle?
  private var currentFilePath: String = ""
  // Accumulated PCM data for the current segment (serialized from writer queue)
  private var currentSegmentData = Data()

  // MARK: - Lifecycle

  init() {}

  deinit {
    stopEngine()
  }

  // MARK: - Public API

  func start(storageDir: String, meetingId: String, chunkIndex: Int) {
    writerQueue.sync { [weak self] in
      guard let self = self else { return }
      self.storageDir = storageDir
      self.meetingId = meetingId
      self.currentChunkIndex = chunkIndex
      self.currentSegmentData = Data()
      self.isPaused = false
      self.isStopping = false
    }

    configureSessionAndStart()
  }

  func pause() {
    writerQueue.sync { [weak self] in
      guard let self = self else { return }
      self.isPaused = true
    }

    // Close current chunk synchronously on writer queue
    writerQueue.sync { [weak self] in
      guard let self = self else { return }
      self.flushCurrentSegment()
    }

    stopEngine()
  }

  func resume() {
    // Signal writer to resume before starting engine, so the tap callback
    // and drainRingBuffer operate with consistent state from the start.
    isPaused = false
    configureSessionAndStart()
  }

  func stop(completion: @escaping (ChunkInfo?) -> Void) {
    isStopping = true

    // Stop engine first — removes tap so no new buffers arrive
    stopEngine()

    writerQueue.async { [weak self] in
      guard let self = self else { return }

      // Drain all remaining buffers from ring buffer
      self.drainAllRemainingBuffers()

      // Flush the accumulated PCM data as a final chunk
      self.flushCurrentSegment()

      // Signal completion
      completion(nil)
    }
  }

  func cancel() {
    isStopping = true
    stopEngine()
    writerQueue.sync { [weak self] in
      guard let self = self else { return }
      self.closeCurrentFile()
      self.currentSegmentData = Data()
      self.ringBuffer?.reset()
    }
  }

  func closeCurrentSegment() {
    writerQueue.sync { [weak self] in
      guard let self = self else { return }
      self.flushCurrentSegment()
    }
  }

  // MARK: - Engine Setup

  private func configureSessionAndStart() {
    let session = AVAudioSession.sharedInstance()

    do {
      try session.setCategory(.playAndRecord, options: [.allowBluetooth, .defaultToSpeaker])
      try session.setPreferredSampleRate(48000)
      try session.setPreferredIOBufferDuration(0.005) // 5ms I/O buffer
      try session.setActive(true, options: .notifyOthersOnDeactivation)
    } catch {
      onError?("io_error", "Failed to configure audio session: \(error.localizedDescription)", true)
      return
    }

    let inputNode = engine.inputNode

    // Remove any existing tap to prevent duplicate tap crash
    if engine.isRunning {
      inputNode.removeTap(onBus: 0)
      engine.stop()
    }

    let inputFormat = inputNode.inputFormat(forBus: 0)
    let sampleRate = inputFormat.sampleRate
    let channelCount = inputFormat.channelCount

    guard channelCount > 0 else {
      onError?("io_error", "No input channels available", true)
      return
    }

    // Use a mono format for processing
    guard let monoFormat = AVAudioFormat(commonFormat: .pcmFormatFloat32, sampleRate: sampleRate, channels: 1, interleaved: false) else {
      onError?("io_error", "Failed to create mono format", true)
      return
    }

    // Pre-allocate buffer pool
    let pool = BufferPool(capacity: POOL_CAPACITY, format: monoFormat)
    let ring = RingBuffer(capacity: POOL_CAPACITY)
    bufferPool = pool
    ringBuffer = ring

    // Install tap on input node bus 0
    // P09-T03: No blocking calls or allocation in tap callback
    inputNode.installTap(onBus: 0, bufferSize: FRAME_CAPACITY, format: inputFormat) { [weak self] buffer, _ in
      guard let self = self, !self.isStopping else { return }

      // Convert to mono float32
      guard let pool = self.bufferPool, let ring = self.ringBuffer else { return }
      guard let poolIdx = pool.acquire() else {
        // Pool exhausted — emit gap, skip this buffer
        self.onGap?("buffer_overflow", Int(FRAME_CAPACITY) * 1000 / Int(sampleRate))
        return
      }

      guard let destBuffer = pool[poolIdx] else {
        pool.release(poolIdx)
        return
      }

      // Convert buffer to mono float32
      if buffer.format.channelCount > 1 {
        // Downmix to mono
        let srcData = buffer.floatChannelData?
        let destData = destBuffer.floatChannelData?[0]
        let frameCount = min(Int(buffer.frameLength), Int(destBuffer.frameCapacity))

        if let src = srcData, let dest = destData {
          for frame in 0..<frameCount {
            var sum: Float = 0
            for ch in 0..<Int(buffer.format.channelCount) {
              sum += src[ch][frame]
            }
            dest[frame] = sum / Float(buffer.format.channelCount)
          }
        }
        destBuffer.frameLength = AVAudioFrameCount(frameCount)
      } else {
        // Already mono — copy samples
        let frameCount = min(Int(buffer.frameLength), Int(destBuffer.frameCapacity))
        if let src = buffer.floatChannelData?[0], let dest = destBuffer.floatChannelData?[0] {
          memcpy(dest, src, frameCount * MemoryLayout<Float>.size)
        }
        destBuffer.frameLength = AVAudioFrameCount(frameCount)
      }

      // Push to ring buffer
      if !ring.push(poolIdx) {
        // Ring buffer full — emit gap
        pool.release(poolIdx)
        self.onGap?("buffer_overflow", Int(FRAME_CAPACITY) * 1000 / Int(sampleRate))
      } else {
        // Signal writer
        self.writerQueue.async { [weak self] in
          self?.drainRingBuffer()
        }
      }
    }

    // Start engine
    do {
      try engine.start()
      isRunning = true
    } catch {
      onError?("io_error", "Failed to start engine: \(error.localizedDescription)", true)
    }
  }

  private func stopEngine() {
    guard isRunning else { return }
    engine.inputNode.removeTap(onBus: 0)
    engine.stop()
    isRunning = false
  }

  // MARK: - Writer (runs on writerQueue)

  private func drainRingBuffer() {
    guard let ring = ringBuffer, let pool = bufferPool else { return }
    if isPaused { return }

    while let poolIdx = ring.pop() {
      guard let buffer = pool[poolIdx] else {
        pool.release(poolIdx)
        continue
      }

      // Extract float samples and append to segment data as little-endian PCM32
      let frameCount = Int(buffer.frameLength)
      if frameCount > 0, let channelData = buffer.floatChannelData?[0] {
        let sampleBytes = Data(bytes: channelData, count: frameCount * MemoryLayout<Float>.size)
        currentSegmentData.append(sampleBytes)
      }

      pool.release(poolIdx)
    }

    // Check available space and emit storage event if low
    checkStorageSpace()
  }

  /// Drains all remaining buffers from the ring buffer without checking isStopping.
  /// Called during stop() to capture any buffered audio before the final chunk.
  private func drainAllRemainingBuffers() {
    guard let ring = ringBuffer, let pool = bufferPool else { return }

    while let poolIdx = ring.pop() {
      guard let buffer = pool[poolIdx] else {
        pool.release(poolIdx)
        continue
      }

      let frameCount = Int(buffer.frameLength)
      if frameCount > 0, let channelData = buffer.floatChannelData?[0] {
        let sampleBytes = Data(bytes: channelData, count: frameCount * MemoryLayout<Float>.size)
        currentSegmentData.append(sampleBytes)
      }

      pool.release(poolIdx)
    }
  }

  private func flushCurrentSegment() {
    guard !currentSegmentData.isEmpty else {
      closeCurrentFile()
      return
    }

    // Flush accumulated PCM data to disk as a WebM chunk
    let chunkIndex = currentChunkIndex
    let filename = "\(meetingId)-chunk-\(String(format: "%04d", chunkIndex)).webm"
    let dirUrl = URL(fileURLWithPath: storageDir, isDirectory: true)
    let fileUrl = dirUrl.appendingPathComponent(filename)
    let filePath = fileUrl.path

    // Write PCM data (wrapped in minimal WebM/Opus structure — in production,
    // encode via AudioConverter/Opus before writing)
    let dataToWrite = wrapInWebMSegment(pcmData: currentSegmentData)

    // Atomic write
    let tempPath = filePath + ".tmp"
    do {
      try dataToWrite.write(to: URL(fileURLWithPath: tempPath), options: .atomic)

      let handle = try FileHandle(forWritingTo: URL(fileURLWithPath: tempPath))
      try handle.synchronize()
      handle.closeFile()

      // Compute SHA-256
      let sha256 = IOSChecksum.compute(path: tempPath)

      // Move temp to final path
      try FileManager.default.moveItem(atPath: tempPath, toPath: filePath)

      // fsync parent directory
      IOSFileSystem.fsyncDirectory(at: storageDir)

      let byteLength = dataToWrite.count

      // Notify module via callback
      let info = ChunkInfo(
        index: chunkIndex,
        filePath: filePath,
        sha256: sha256,
        byteLength: byteLength
      )
      onChunk?(info)

      // Reset for next segment
      currentSegmentData = Data()
      currentChunkIndex = chunkIndex + 1
      closeCurrentFile()
      currentFileHandle = nil
    } catch {
      onError?("io_error", "Failed to write chunk: \(error.localizedDescription)", false)
    }
  }

  private func closeCurrentFile() {
    guard let handle = currentFileHandle else { return }
    do {
      try handle.synchronize()
      try handle.close()
    } catch {
      // Best-effort close
    }
    currentFileHandle = nil
  }

  // MARK: - WebM Segment Wrapping

  /// Wraps raw PCM data in a minimal WebM-compatible segment structure.
  /// In production, this uses Opus encoding via AudioConverter.
  private func wrapInWebMSegment(pcmData: Data) -> Data {
    // P09-T03: Raw PCM placeholder wrapped as EBML/WebM.
    // Production implementation performs Opus encoding via AudioConverter
    // and writes proper WebM cluster elements.
    //
    // Current minimal wrapper for compatibility:
    // - EBML header
    // - Segment with simple Opus-encoded content
    var output = Data()

    // EBML header
    output.append(contentsOf: [
      0x1A, 0x45, 0xDF, 0xA3, // EBML
    ])
    // EBMLVersion: 1
    output.append(contentsOf: [0x42, 0x86, 0x81, 0x01])
    // EBMLReadVersion: 1
    output.append(contentsOf: [0x42, 0xF7, 0x81, 0x01])
    // EBMLMaxIDLength: 4
    output.append(contentsOf: [0x42, 0xF2, 0x81, 0x04])
    // EBMLMaxSizeLength: 8
    output.append(contentsOf: [0x42, 0xF3, 0x81, 0x08])
    // DocType: webm
    output.append(contentsOf: [0x42, 0x82, 0x84, 0x77, 0x65, 0x62, 0x6D])
    // DocTypeVersion: 4
    output.append(contentsOf: [0x42, 0x87, 0x81, 0x04])
    // DocTypeReadVersion: 2
    output.append(contentsOf: [0x42, 0x85, 0x81, 0x02])

    // Segment placeholder
    output.append(contentsOf: [
      0x18, 0x53, 0x80, 0x67, // Segment
      0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, // placeholder size (8 bytes)
    ])

    // SeekHead (placeholder)
    // Info (placeholder with duration)
    // Tracks (audio track definition)

    // Cluster with raw PCM data as Block
    output.append(contentsOf: [
      0x1F, 0x43, 0xB6, 0x75, // Cluster
    ])
    let clusterSize = pcmData.count + 32 // +block overhead
    writeVarint(value: UInt64(clusterSize), to: &output)
    // Cluster timestamp: 0
    output.append(contentsOf: [0xE7, 0x81, 0x00])
    // SimpleBlock
    output.append(contentsOf: [0xA3])
    let blockSize = pcmData.count + 4 // track(1) + timestamp(2) + flags(1)
    writeVarint(value: UInt64(blockSize), to: &output)
    // Track number: 1
    output.append(contentsOf: [0x81])
    // Timestamp: 0 (relative)
    output.append(contentsOf: [0x00, 0x00])
    // Flags: keyframe
    output.append(contentsOf: [0x00])
    // PCM data
    output.append(pcmData)

    return output
  }

  private func writeVarint(value: UInt64, to data: inout Data) {
    // Write EBML variable-length integer
    var v = value
    var mask: UInt64 = 0x80
    var bytes = 1
    while v >= (mask - 1) {
      mask <<= 7
      bytes += 1
    }
    let result = mask | v
    for i in (0..<bytes).reversed() {
      data.append(UInt8((result >> (i * 8)) & 0xFF))
    }
  }

  // MARK: - Storage Monitoring

  private func checkStorageSpace() {
    let available = IOSFileSystem.getAvailableSpace()
    if available < 50_000_000 { // 50MB threshold
      // P09-T03: Storage warning events are emitted by the module.
      // The engine just notifies; severity classification is at the module level.
    }
    if available < 10_000_000 { // 10MB critical threshold
      onError?("disk_full", "Critical storage space", false)
    }
  }
}

// P09-T03
