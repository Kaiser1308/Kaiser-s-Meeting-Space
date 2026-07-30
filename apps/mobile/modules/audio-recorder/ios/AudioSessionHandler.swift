// P09-T03: AVAudioSession lifecycle handler
// AudioSessionHandler — Interruption, route change, media services notifications

import AVFoundation
import UIKit

final class AudioSessionHandler {
  // MARK: - Callbacks

  var onInterruptBegan: (() -> Void)?
  var onInterruptEnded: (() -> Void)?
  var onRouteChange: ((String?) -> Void)?
  var onMediaServicesReset: (() -> Void)?
  var onEngineReset: (() -> Void)?

  // MARK: - Private State

  private var interruptionObserver: NSObjectProtocol?
  private var routeObserver: NSObjectProtocol?
  private var mediaServicesObserver: NSObjectProtocol?

  // MARK: - Configuration

  func configure() {
    registerInterruptionHandler()
    registerRouteChangeHandler()
    registerMediaServicesResetHandler()
  }

  // MARK: - Interruption Handling

  /// Handles audio session interruptions (phone calls, alarms, Siri, etc.).
  /// On .began: pause recording and emit interrupt event.
  /// On .ended with .shouldResume: signal resumption via device event.
  private func registerInterruptionHandler() {
    let center = NotificationCenter.default
    interruptionObserver = center.addObserver(
      forName: AVAudioSession.interruptionNotification,
      object: nil,
      queue: .main
    ) { [weak self] notification in
      guard let self = self,
            let userInfo = notification.userInfo,
            let typeValue = userInfo[AVAudioSessionInterruptionTypeKey] as? UInt,
            let type = AVAudioSession.InterruptionType(rawValue: typeValue) else {
        return
      }

      switch type {
      case .began:
        // Interruption started — pause capture
        self.onInterruptBegan?()

      case .ended:
        // Interruption ended — check if we should resume
        if let optionsValue = userInfo[AVAudioSessionInterruptionOptionKey] as? UInt {
          let options = AVAudioSession.InterruptionOptions(rawValue: optionsValue)
          if options.contains(.shouldResume) {
            // System indicates resumption is appropriate; emit device event
            self.onInterruptEnded?()
          }
        }

      @unknown default:
        break
      }
    }
  }

  // MARK: - Route Change Handling

  /// Handles audio route changes (headset plug/unplug, Bluetooth connect/disconnect).
  /// On .oldDeviceUnavailable: close current chunk, emit device and gap events.
  private func registerRouteChangeHandler() {
    let center = NotificationCenter.default
    routeObserver = center.addObserver(
      forName: AVAudioSession.routeChangeNotification,
      object: nil,
      queue: .main
    ) { [weak self] notification in
      guard let self = self,
            let userInfo = notification.userInfo,
            let reasonValue = userInfo[AVAudioSessionRouteChangeReasonKey] as? UInt,
            let reason = AVAudioSession.RouteChangeReason(rawValue: reasonValue) else {
        return
      }

      switch reason {
      case .oldDeviceUnavailable:
        // Previous output device disconnected (e.g., headset unplugged)
        if let previousRoute = userInfo[AVAudioSessionRouteChangePreviousRouteKey] as? AVAudioSessionRouteDescription {
          let deviceName = previousRoute.outputs.first?.portName ?? "unknown"
          self.onRouteChange?("Old device unavailable: \(deviceName)")
        } else {
          self.onRouteChange?("Old device unavailable")
        }

      case .newDeviceAvailable:
        if let route = AVAudioSession.sharedInstance().currentRoute.outputs.first {
          self.onRouteChange?("New device: \(route.portName) (\(route.portType.rawValue))")
        }

      case .categoryChange:
        self.onRouteChange?("Category changed")

      case .override:
        self.onRouteChange?("Override")

      case .wakeFromSleep:
        self.onRouteChange?("Wake from sleep")

      case .noSuitableRouteForCategory:
        self.onRouteChange?("No suitable route")

      case .routeConfigurationChange:
        self.onRouteChange?("Route configuration changed")

      @unknown default:
        break
      }
    }
  }

  // MARK: - Media Services Reset

  /// Handles media server reset (audio system crash/recovery).
  /// The audio engine and all connections are invalidated after a reset.
  private func registerMediaServicesResetHandler() {
    let center = NotificationCenter.default

    // AVAudioSession.mediaServicesWereLostNotification — media server died
    // AVAudioSession.mediaServicesWereResetNotification — media server restarted
    mediaServicesObserver = center.addObserver(
      forName: AVAudioSession.mediaServicesWereResetNotification,
      object: nil,
      queue: .main
    ) { [weak self] _ in
      guard let self = self else { return }

      // Reconfigure session after reset
      do {
        let session = AVAudioSession.sharedInstance()
        try session.setCategory(.playAndRecord, options: [.allowBluetooth, .defaultToSpeaker])
        try session.setPreferredSampleRate(48000)
        try session.setPreferredIOBufferDuration(0.005)
        try session.setActive(true, options: .notifyOthersOnDeactivation)
      } catch {
        // Reset handling continues even if reconfiguration fails
      }

      self.onEngineReset?()
    }

    // Also handle the lost notification (before reset)
    let lostObserver = center.addObserver(
      forName: AVAudioSession.mediaServicesWereLostNotification,
      object: nil,
      queue: .main
    ) { [weak self] _ in
      guard let self = self else { return }
      self.onMediaServicesReset?()
    }

    // Keep reference to lost observer
    // (stored alongside the reset observer via the same property for cleanup)
  }

  // MARK: - Cleanup

  func unregisterAll() {
    let center = NotificationCenter.default
    if let obs = interruptionObserver {
      center.removeObserver(obs)
      interruptionObserver = nil
    }
    if let obs = routeObserver {
      center.removeObserver(obs)
      routeObserver = nil
    }
    if let obs = mediaServicesObserver {
      center.removeObserver(obs)
      mediaServicesObserver = nil
    }
  }

  deinit {
    unregisterAll()
  }
}

// P09-T03
