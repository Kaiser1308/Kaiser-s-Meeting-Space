// P09-T03: Expo native module for iOS microphone capture
// AudioRecorderModule — Main Expo module class

import ExpoModulesCore

private let EVENT_CHUNK = "onChunk"
private let EVENT_DEVICE = "onDevice"
private let EVENT_INTERRUPT = "onInterrupt"
private let EVENT_STORAGE = "onStorage"
private let EVENT_GAP = "onGap"
private let EVENT_ERROR = "onError"

private let STATE_UNCONFIGURED = "unconfigured"
private let STATE_CONFIGURED = "configured"
private let STATE_RECORDING = "recording"
private let STATE_PAUSED = "paused"
private let STATE_STOPPING = "stopping"
private let STATE_FINALIZING = "finalizing"
private let STATE_ERROR = "error"

public final class AudioRecorderModule: Module {
  // MARK: - State

  private var captureEngine: AudioCaptureEngine?
  private var sessionHandler: AudioSessionHandler?
  private var currentState: String = STATE_UNCONFIGURED
  private var currentCorrelationId: String = ""
  private var currentMeetingId: String = ""
  private var currentChunkIndex: Int = 0
  private var bytesWritten: Int = 0
  private var recordingDurationMs: Int = 0
  private var monotonicStart: TimeInterval = 0
  private var wallClockStart: String = ""

  // MARK: - Module Definition

  public func definition() -> ModuleDefinition {
    Name("AudioRecorder")

    Events(EVENT_CHUNK, EVENT_DEVICE, EVENT_INTERRUPT, EVENT_STORAGE, EVENT_GAP, EVENT_ERROR)

    // ── Configure ──

    AsyncFunction("configure") { (profileJson: String, storageDir: String, meetingId: String) -> String in
      let correlationId = UUID().uuidString

      guard let profileData = profileJson.data(using: .utf8),
            let profile = try? JSONSerialization.jsonObject(with: profileData, options: []) as? [String: Any] else {
        self.emitError(correlationId: correlationId, code: "unknown", detail: "Invalid profile JSON", fatal: true)
        return self.makeResponse(success: false, correlationId: correlationId, detail: "Invalid profile JSON")
      }

      guard let sampleRate = profile["sampleRate"] as? Int, sampleRate == 48000,
            let channels = profile["channels"] as? Int, channels == 1,
            let codec = profile["codec"] as? String, codec == "opus",
            let container = profile["container"] as? String, container == "webm" else {
        self.emitError(correlationId: correlationId, code: "unknown", detail: "Unsupported capture profile", fatal: true)
        return self.makeResponse(success: false, correlationId: correlationId, detail: "Unsupported capture profile")
      }

      // Create session handler
      let sessionHandler = AudioSessionHandler()
      sessionHandler.onInterruptBegan = { [weak self] in
        guard let self = self else { return }
        self.pauseCapture()
        self.emitInterrupt(cause: "phone_call", action: "pause")
      }
      sessionHandler.onInterruptEnded = { [weak self] in
        guard let self = self else { return }
        self.emitDevice(changeType: "focus_gain", detail: "Interruption ended")
      }
      sessionHandler.onRouteChange = { [weak self] detail in
        guard let self = self else { return }
        self.closeCurrentChunk()
        self.emitDevice(changeType: "route_change", detail: detail)
        self.emitGap(reason: "route_change", durationMs: 0)
      }
      sessionHandler.onMediaServicesReset = { [weak self] in
        guard let self = self else { return }
        self.emitInterrupt(cause: "media_reset", action: "stop")
        self.emitError(correlationId: nil, code: "io_error", detail: "Media services reset", fatal: false)
      }
      sessionHandler.onEngineReset = { [weak self] in
        guard let self = self else { return }
        self.closeCurrentChunk()
        self.emitInterrupt(cause: "engine_reset", action: "pause")
      }
      self.sessionHandler = sessionHandler

      // Create capture engine
      let engine = AudioCaptureEngine()
      engine.onChunk = { [weak self] chunkInfo in
        guard let self = self else { return }
        self.emitChunk(chunkInfo: chunkInfo)
      }
      engine.onGap = { [weak self] reason, durationMs in
        guard let self = self else { return }
        self.emitGap(reason: reason, durationMs: durationMs)
      }
      engine.onError = { [weak self] code, detail, fatal in
        guard let self = self else { return }
        self.emitError(correlationId: nil, code: code, detail: detail, fatal: fatal)
      }
      self.captureEngine = engine

      // Configure session
      sessionHandler.configure()

      self.currentState = STATE_CONFIGURED
      self.currentCorrelationId = correlationId
      self.currentMeetingId = meetingId
      self.currentChunkIndex = 0

      return self.makeResponse(success: true, correlationId: correlationId, detail: "Configured")
    }

    // ── Start ──

    AsyncFunction("start") { () -> String in
      let correlationId = UUID().uuidString

      guard let engine = self.captureEngine else {
        self.emitError(correlationId: correlationId, code: "io_error", detail: "Not configured", fatal: true)
        return self.makeResponse(success: false, correlationId: correlationId, detail: "Not configured")
      }

      guard self.currentState == STATE_CONFIGURED || self.currentState == STATE_PAUSED else {
        self.emitError(correlationId: correlationId, code: "io_error", detail: "Invalid state: \(self.currentState)", fatal: false)
        return self.makeResponse(success: false, correlationId: correlationId, detail: "Invalid state")
      }

      let storageDir = self.getStorageDirectory()
      let meetingId = self.currentMeetingId

      self.monotonicStart = CFAbsoluteTimeGetCurrent()
      self.wallClockStart = IOSClock.now()

      engine.start(storageDir: storageDir, meetingId: meetingId, chunkIndex: self.currentChunkIndex)

      self.currentState = STATE_RECORDING
      self.currentCorrelationId = correlationId

      return self.makeResponse(success: true, correlationId: correlationId, detail: "Recording")
    }

    // ── Pause ──

    AsyncFunction("pause") { () -> String in
      let correlationId = UUID().uuidString

      guard self.currentState == STATE_RECORDING else {
        self.emitError(correlationId: correlationId, code: "io_error", detail: "Not recording", fatal: false)
        return self.makeResponse(success: false, correlationId: correlationId, detail: "Not recording")
      }

      self.pauseCapture()
      self.currentCorrelationId = correlationId

      return self.makeResponse(success: true, correlationId: correlationId, detail: "Paused")
    }

    // ── Resume ──

    AsyncFunction("resume") { () -> String in
      let correlationId = UUID().uuidString

      guard let engine = self.captureEngine else {
        self.emitError(correlationId: correlationId, code: "io_error", detail: "Not configured", fatal: true)
        return self.makeResponse(success: false, correlationId: correlationId, detail: "Not configured")
      }

      guard self.currentState == STATE_PAUSED else {
        self.emitError(correlationId: correlationId, code: "io_error", detail: "Not paused", fatal: false)
        return self.makeResponse(success: false, correlationId: correlationId, detail: "Not paused")
      }

      engine.resume()

      self.currentState = STATE_RECORDING
      self.currentCorrelationId = correlationId

      return self.makeResponse(success: true, correlationId: correlationId, detail: "Resumed")
    }

    // ── Stop ──

    AsyncFunction("stop") { () -> String in
      let correlationId = UUID().uuidString

      guard let engine = self.captureEngine else {
        self.emitError(correlationId: correlationId, code: "io_error", detail: "Not configured", fatal: true)
        return self.makeResponse(success: false, correlationId: correlationId, detail: "Not configured")
      }

      guard self.currentState == STATE_RECORDING || self.currentState == STATE_PAUSED else {
        self.emitError(correlationId: correlationId, code: "io_error", detail: "Not recording", fatal: false)
        return self.makeResponse(success: false, correlationId: correlationId, detail: "Not recording")
      }

      self.currentState = STATE_STOPPING
      self.currentCorrelationId = correlationId

      // Drain remaining buffers and close final chunk
      engine.stop { [weak self] finalChunkInfo in
        guard let self = self else { return }
        if let chunkInfo = finalChunkInfo {
          self.emitChunk(chunkInfo: chunkInfo)
        }
        self.currentState = STATE_FINALIZING
        self.currentCorrelationId = correlationId
      }

      return self.makeResponse(success: true, correlationId: correlationId, detail: "Stopping")
    }

    // ── Status ──

    AsyncFunction("status") { () -> String in
      let correlationId = UUID().uuidString
      let available = IOSFileSystem.getAvailableSpace()

      let statusPayload: [String: Any] = [
        "type": "status",
        "correlationId": correlationId,
        "state": self.currentState,
        "currentChunkIndex": self.currentChunkIndex,
        "bytesWritten": self.bytesWritten,
        "durationMs": self.recordingDurationMs,
        "storageAvailable": available
      ]

      guard let statusData = try? JSONSerialization.data(withJSONObject: statusPayload, options: []),
            let statusJson = String(data: statusData, encoding: .utf8) else {
        return self.makeResponse(success: false, correlationId: correlationId, detail: "Serialization error")
      }
      return statusJson
    }

    // ── Cancel ──

    AsyncFunction("cancel") { () -> String in
      let correlationId = UUID().uuidString

      self.captureEngine?.cancel()
      self.captureEngine = nil
      self.sessionHandler = nil

      self.currentState = STATE_UNCONFIGURED
      self.currentChunkIndex = 0
      self.bytesWritten = 0
      self.recordingDurationMs = 0
      self.currentCorrelationId = correlationId
      self.currentMeetingId = ""

      return self.makeResponse(success: true, correlationId: correlationId, detail: "Cancelled")
    }
  }

  // MARK: - Private Helpers

  private func pauseCapture() {
    guard let engine = captureEngine, currentState == STATE_RECORDING else { return }
    engine.pause()
    currentState = STATE_PAUSED
  }

  private func closeCurrentChunk() {
    // Instruct engine to close the current chunk file without stopping
    captureEngine?.closeCurrentSegment()
  }

  private func getStorageDirectory() -> String {
    let paths = NSSearchPathForDirectoriesInDomains(.documentDirectory, .userDomainMask, true)
    return paths.first ?? NSTemporaryDirectory()
  }

  // MARK: - Event Emission

  private func emitChunk(chunkInfo: ChunkInfo) {
    let wallClockEnd = IOSClock.now()
    let monotonicEnd = CFAbsoluteTimeGetCurrent()
    let durationMs = Int((monotonicEnd - monotonicStart) * 1000)

    let payload: [String: Any?] = [
      "type": "chunk",
      "correlationId": currentCorrelationId,
      "meetingId": currentMeetingId,
      "chunkIndex": chunkInfo.index,
      "filePath": chunkInfo.filePath,
      "sha256": chunkInfo.sha256,
      "byteLength": chunkInfo.byteLength,
      "wallClockStart": wallClockStart,
      "wallClockEnd": wallClockEnd,
      "monotonicStart": Int(monotonicStart * 1000),
      "monotonicEnd": Int(monotonicEnd * 1000),
      "durationMs": durationMs,
      "sampleRate": 48000,
      "channels": 1,
      "codec": "opus",
      "container": "webm",
      // The current engine writes PCM wrapped in a placeholder EBML segment;
      // expose this extension so the JS adapter fails closed instead of
      // treating placeholder bytes as encoded Opus.
      "format": "pcm"
    ]

    currentChunkIndex = chunkInfo.index + 1
    bytesWritten += chunkInfo.byteLength
    recordingDurationMs += durationMs

    sendEvent(EVENT_CHUNK, payload)
  }

  private func emitDevice(changeType: String, detail: String?) {
    var payload: [String: Any?] = [
      "type": "device",
      "changeType": changeType
    ]
    if let detail = detail {
      payload["detail"] = detail
    }
    sendEvent(EVENT_DEVICE, payload)
  }

  private func emitInterrupt(cause: String, action: String) {
    let payload: [String: Any?] = [
      "type": "interrupt",
      "cause": cause,
      "action": action
    ]
    sendEvent(EVENT_INTERRUPT, payload)
  }

  private func emitGap(reason: String, durationMs: Int) {
    let now = Int(CFAbsoluteTimeGetCurrent() * 1000)
    let payload: [String: Any?] = [
      "type": "gap",
      "reason": reason,
      "startMs": now - durationMs,
      "endMs": now,
      "durationMs": durationMs
    ]
    sendEvent(EVENT_GAP, payload)
  }

  private func emitError(correlationId: String?, code: String, detail: String?, fatal: Bool) {
    var payload: [String: Any?] = [
      "type": "error",
      "code": code,
      "fatal": fatal
    ]
    if let cid = correlationId {
      payload["correlationId"] = cid
    }
    if let detail = detail {
      payload["detail"] = detail
    }
    sendEvent(EVENT_ERROR, payload)
  }

  // MARK: - Response Helpers

  private func makeResponse(success: Bool, correlationId: String, detail: String) -> String {
    let response: [String: Any] = [
      "success": success,
      "correlationId": correlationId,
      "detail": detail
    ]
    guard let data = try? JSONSerialization.data(withJSONObject: response, options: []),
          let json = String(data: data, encoding: .utf8) else {
      return "{\"success\":false,\"detail\":\"Serialization error\"}"
    }
    return json
  }
}

// P09-T03
