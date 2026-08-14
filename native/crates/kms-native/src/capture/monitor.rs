// kms-native audio capture — Device monitoring and recovery.
//
// Monitors physical audio endpoints for hot-plug events, default device
// changes, and connection drops, notifying the Electron supervisor.

use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};
use std::thread::JoinHandle;

use crate::capture::device::{enumerate_devices, get_default_device};
use crate::protocol::NativeEventV1;
use crate::runtime::NativeEventSender;

pub struct DeviceMonitor {
    thread_handle: Option<JoinHandle<()>>,
    stop_signal: Arc<AtomicBool>,
}

impl DeviceMonitor {
    pub fn start(event_sender: NativeEventSender) -> Result<Self, String> {
        let stop_signal = Arc::new(AtomicBool::new(false));
        let stop_signal_clone = stop_signal.clone();

        let thread_handle = std::thread::spawn(move || {
            let mut last_default_mic = get_default_device("microphone").ok().map(|d| d.device_id);
            let mut last_default_sys = get_default_device("system_audio").ok().map(|d| d.device_id);
            let mut last_devices = enumerate_devices().unwrap_or_default();

            while !stop_signal_clone.load(Ordering::SeqCst) {
                std::thread::sleep(std::time::Duration::from_millis(500));

                // 1. Check default mic change
                if let Ok(current_mic) = get_default_device("microphone") {
                    if let Some(ref last_id) = last_default_mic {
                        if last_id != &current_mic.device_id {
                            let _ = event_sender.send(NativeEventV1::new(
                                "device_event",
                                serde_json::json!({
                                    "deviceId": current_mic.device_id.clone(),
                                    "deviceName": current_mic.device_name.clone(),
                                    "eventKind": "default_changed",
                                    "deviceType": "microphone",
                                    "isSimulated": false,
                                }),
                            ));
                            last_default_mic = Some(current_mic.device_id);
                        }
                    } else {
                        last_default_mic = Some(current_mic.device_id);
                    }
                }

                // 2. Check default system audio change
                if let Ok(current_sys) = get_default_device("system_audio") {
                    if let Some(ref last_id) = last_default_sys {
                        if last_id != &current_sys.device_id {
                            let _ = event_sender.send(NativeEventV1::new(
                                "device_event",
                                serde_json::json!({
                                    "deviceId": current_sys.device_id.clone(),
                                    "deviceName": current_sys.device_name.clone(),
                                    "eventKind": "default_changed",
                                    "deviceType": "system_audio",
                                    "isSimulated": false,
                                }),
                            ));
                            last_default_sys = Some(current_sys.device_id);
                        }
                    } else {
                        last_default_sys = Some(current_sys.device_id);
                    }
                }

                // 3. Check for hot-plug/unplug events
                if let Ok(current_devices) = enumerate_devices() {
                    // Check for disconnected devices
                    for last in &last_devices {
                        if !current_devices
                            .iter()
                            .any(|d| d.device_id == last.device_id)
                        {
                            let _ = event_sender.send(NativeEventV1::new(
                                "device_event",
                                serde_json::json!({
                                    "deviceId": last.device_id.clone(),
                                    "deviceName": last.device_name.clone(),
                                    "eventKind": "disconnected",
                                    "deviceType": last.device_type.clone(),
                                    "isSimulated": false,
                                }),
                            ));
                        }
                    }

                    // Check for connected devices
                    for current in &current_devices {
                        if !last_devices
                            .iter()
                            .any(|d| d.device_id == current.device_id)
                        {
                            let _ = event_sender.send(NativeEventV1::new(
                                "device_event",
                                serde_json::json!({
                                    "deviceId": current.device_id.clone(),
                                    "deviceName": current.device_name.clone(),
                                    "eventKind": "connected",
                                    "deviceType": current.device_type.clone(),
                                    "isSimulated": false,
                                }),
                            ));
                        }
                    }

                    last_devices = current_devices;
                }
            }
        });

        Ok(Self {
            thread_handle: Some(thread_handle),
            stop_signal,
        })
    }

    pub fn stop(&mut self) {
        self.stop_signal.store(true, Ordering::SeqCst);
        if let Some(handle) = self.thread_handle.take() {
            let _ = handle.join();
        }
    }
}
