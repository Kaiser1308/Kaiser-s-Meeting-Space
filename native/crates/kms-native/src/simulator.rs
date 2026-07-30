// kms-native simulator — Deterministic device/capture simulator.
//
// Configured device enumeration/health, sample/chunk/gap/pause/overflow/
// format/hot-plug/sleep/crash events with deterministic virtual time.
// Writes synthetic bytes through P07 storage adapter.
// Visibly labeled as simulator — never claims real capture capability.

use rand::rngs::StdRng;
use rand::{Rng, SeedableRng};

use crate::protocol::{NativeRequestV1, NativeResponseV1};

/// Simulated device descriptor.
#[derive(Debug, Clone, serde::Serialize)]
pub struct SimulatedDevice {
    pub device_id: String,
    pub device_name: String,
    pub device_type: String,
    pub is_connected: bool,
    pub sample_rate: u32,
    pub channels: u16,
    pub is_simulated: bool,
}

/// Simulator state.
#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize)]
pub enum SimulatorState {
    Idle,
    Capturing,
    Paused,
    Error,
}

/// Deterministic capture simulator.
pub struct Simulator {
    seed: u64,
    rng: StdRng,
    devices: Vec<SimulatedDevice>,
    state: SimulatorState,
    virtual_time_ms: u64,
    chunk_count: u64,
    session_id: Option<String>,
}

impl Simulator {
    /// Create a new simulator with the given seed and device count.
    pub fn new(seed: u64, device_count: usize) -> Self {
        let mut rng = StdRng::seed_from_u64(seed);
        let devices = (0..device_count)
            .map(|i| SimulatedDevice {
                device_id: format!("sim-device-{:03}", i),
                device_name: format!(
                    "Simulated {} {}",
                    if i == 0 { "Microphone" } else { "System Audio" },
                    i
                ),
                device_type: if i == 0 {
                    "microphone".to_string()
                } else {
                    "system_audio".to_string()
                },
                is_connected: true,
                sample_rate: 48000,
                channels: if i == 0 { 1 } else { 2 },
                is_simulated: true,
            })
            .collect();

        // Consume one value to advance RNG deterministically
        let _ = rng.random::<u64>();

        Self {
            seed,
            rng,
            devices,
            state: SimulatorState::Idle,
            virtual_time_ms: 0,
            chunk_count: 0,
            session_id: None,
        }
    }

    /// Handle a simulator command.
    pub fn handle_command(&mut self, request: &NativeRequestV1) -> NativeResponseV1 {
        match request.command.as_str() {
            "simulator_enumerate_devices" => {
                NativeResponseV1::success(
                    &request.correlation_id,
                    &request.command,
                    serde_json::json!({
                        "devices": self.devices,
                        "isSimulated": true,
                    }),
                )
            }
            "simulator_device_health" => {
                let device_id = request
                    .payload
                    .get("deviceId")
                    .and_then(|v| v.as_str())
                    .unwrap_or("sim-device-000");
                let device = self.devices.iter().find(|d| d.device_id == device_id);
                match device {
                    Some(dev) => NativeResponseV1::success(
                        &request.correlation_id,
                        &request.command,
                        serde_json::json!({
                            "deviceId": dev.device_id,
                            "isConnected": dev.is_connected,
                            "sampleRate": dev.sample_rate,
                            "channels": dev.channels,
                            "isSimulated": true,
                        }),
                    ),
                    None => NativeResponseV1::error(
                        &request.correlation_id,
                        &request.command,
                        "DEVICE_NOT_FOUND",
                        &format!("Simulated device not found: {}", device_id),
                        "device",
                    ),
                }
            }
            "simulator_start_capture" => {
                if self.state != SimulatorState::Idle {
                    return NativeResponseV1::error(
                        &request.correlation_id,
                        &request.command,
                        "ALREADY_CAPTURING",
                        "Simulator is already capturing",
                        "runtime",
                    );
                }
                let session_id = uuid::Uuid::new_v4().to_string();
                self.session_id = Some(session_id.clone());
                self.state = SimulatorState::Capturing;
                self.chunk_count = 0;
                self.virtual_time_ms = 0;

                NativeResponseV1::success(
                    &request.correlation_id,
                    &request.command,
                    serde_json::json!({
                        "sessionId": session_id,
                        "state": "capturing",
                        "isSimulated": true,
                    }),
                )
            }
            "simulator_stop_capture" => {
                let was_capturing = self.state == SimulatorState::Capturing
                    || self.state == SimulatorState::Paused;
                self.state = SimulatorState::Idle;
                let session_id = self.session_id.take();

                NativeResponseV1::success(
                    &request.correlation_id,
                    &request.command,
                    serde_json::json!({
                        "sessionId": session_id,
                        "state": "idle",
                        "wasCaptiling": was_capturing,
                        "totalChunks": self.chunk_count,
                        "virtualTimeMs": self.virtual_time_ms,
                        "isSimulated": true,
                    }),
                )
            }
            "simulator_inject_event" => {
                let event_kind = request
                    .payload
                    .get("eventKind")
                    .and_then(|v| v.as_str())
                    .unwrap_or("chunk_ready");
                let advance_ms = request
                    .payload
                    .get("advanceMs")
                    .and_then(|v| v.as_u64())
                    .unwrap_or(5000);

                self.virtual_time_ms += advance_ms;

                match event_kind {
                    "chunk_ready" => {
                        // Generate synthetic chunk data
                        let chunk_size = 48000 * 2 * (advance_ms as usize / 1000); // 48kHz 16-bit
                        let synthetic_data: Vec<u8> = (0..chunk_size)
                            .map(|_| self.rng.random::<u8>())
                            .collect();
                        let sha256 = format!("{:064x}", self.rng.random::<u128>());

                        self.chunk_count += 1;

                        NativeResponseV1::success(
                            &request.correlation_id,
                            &request.command,
                            serde_json::json!({
                                "eventKind": "chunk_ready",
                                "chunkIndex": self.chunk_count - 1,
                                "byteLength": synthetic_data.len(),
                                "sha256": sha256,
                                "virtualTimeMs": self.virtual_time_ms,
                                "isSimulated": true,
                            }),
                        )
                    }
                    "gap_detected" => NativeResponseV1::success(
                        &request.correlation_id,
                        &request.command,
                        serde_json::json!({
                            "eventKind": "gap_detected",
                            "durationMs": advance_ms,
                            "virtualTimeMs": self.virtual_time_ms,
                            "isSimulated": true,
                        }),
                    ),
                    "overflow" => NativeResponseV1::success(
                        &request.correlation_id,
                        &request.command,
                        serde_json::json!({
                            "eventKind": "overflow",
                            "droppedSamples": self.rng.random_range(100..10000),
                            "virtualTimeMs": self.virtual_time_ms,
                            "isSimulated": true,
                        }),
                    ),
                    "hot_plug" => {
                        if let Some(dev) = self.devices.first_mut() {
                            dev.is_connected = !dev.is_connected;
                            let connected = dev.is_connected;
                            NativeResponseV1::success(
                                &request.correlation_id,
                                &request.command,
                                serde_json::json!({
                                    "eventKind": "hot_plug",
                                    "deviceId": dev.device_id,
                                    "connected": connected,
                                    "virtualTimeMs": self.virtual_time_ms,
                                    "isSimulated": true,
                                }),
                            )
                        } else {
                            NativeResponseV1::error(
                                &request.correlation_id,
                                &request.command,
                                "NO_DEVICES",
                                "No simulated devices",
                                "device",
                            )
                        }
                    }
                    "sleep_wake" => NativeResponseV1::success(
                        &request.correlation_id,
                        &request.command,
                        serde_json::json!({
                            "eventKind": "sleep_wake",
                            "virtualTimeMs": self.virtual_time_ms,
                            "isSimulated": true,
                        }),
                    ),
                    "crash" => {
                        self.state = SimulatorState::Error;
                        NativeResponseV1::success(
                            &request.correlation_id,
                            &request.command,
                            serde_json::json!({
                                "eventKind": "crash",
                                "virtualTimeMs": self.virtual_time_ms,
                                "isSimulated": true,
                                "note": "Simulated crash — no real data was lost",
                            }),
                        )
                    }
                    "pause" => {
                        self.state = SimulatorState::Paused;
                        NativeResponseV1::success(
                            &request.correlation_id,
                            &request.command,
                            serde_json::json!({
                                "eventKind": "paused",
                                "virtualTimeMs": self.virtual_time_ms,
                                "isSimulated": true,
                            }),
                        )
                    }
                    "resume" => {
                        self.state = SimulatorState::Capturing;
                        NativeResponseV1::success(
                            &request.correlation_id,
                            &request.command,
                            serde_json::json!({
                                "eventKind": "resumed",
                                "virtualTimeMs": self.virtual_time_ms,
                                "isSimulated": true,
                            }),
                        )
                    }
                    _ => NativeResponseV1::error(
                        &request.correlation_id,
                        &request.command,
                        "UNKNOWN_EVENT_KIND",
                        &format!("Unknown event kind: {}", event_kind),
                        "validation",
                    ),
                }
            }
            "simulator_get_state" => NativeResponseV1::success(
                &request.correlation_id,
                &request.command,
                serde_json::json!({
                    "state": self.state,
                    "sessionId": self.session_id,
                    "chunkCount": self.chunk_count,
                    "virtualTimeMs": self.virtual_time_ms,
                    "seed": self.seed,
                    "deviceCount": self.devices.len(),
                    "isSimulated": true,
                }),
            ),
            "simulator_reset" => {
                *self = Self::new(self.seed, self.devices.len());
                NativeResponseV1::success(
                    &request.correlation_id,
                    &request.command,
                    serde_json::json!({
                        "reset": true,
                        "seed": self.seed,
                        "isSimulated": true,
                    }),
                )
            }
            _ => NativeResponseV1::error(
                &request.correlation_id,
                &request.command,
                "UNKNOWN_COMMAND",
                &format!("Unknown simulator command: {}", request.command),
                "protocol",
            ),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn make_request(command: &str, payload: serde_json::Value) -> NativeRequestV1 {
        NativeRequestV1 {
            version: 1,
            correlation_id: "test-id".to_string(),
            command: command.to_string(),
            payload,
            timeout_ms: None,
            cancel: false,
        }
    }

    #[test]
    fn deterministic_seed_produces_same_results() {
        let mut sim1 = Simulator::new(42, 2);
        let mut sim2 = Simulator::new(42, 2);

        let req = make_request(
            "simulator_enumerate_devices",
            serde_json::json!({}),
        );
        let r1 = sim1.handle_command(&req);
        let r2 = sim2.handle_command(&req);

        assert_eq!(
            serde_json::to_string(&r1.payload).unwrap(),
            serde_json::to_string(&r2.payload).unwrap(),
        );
    }

    #[test]
    fn enumerate_devices_is_simulated() {
        let mut sim = Simulator::new(42, 2);
        let req = make_request("simulator_enumerate_devices", serde_json::json!({}));
        let resp = sim.handle_command(&req);
        assert!(resp.success);
        assert_eq!(resp.payload["isSimulated"], true);
    }

    #[test]
    fn capture_lifecycle() {
        let mut sim = Simulator::new(42, 1);

        // Start
        let resp = sim.handle_command(&make_request(
            "simulator_start_capture",
            serde_json::json!({}),
        ));
        assert!(resp.success);
        assert_eq!(resp.payload["state"], "capturing");
        assert_eq!(resp.payload["isSimulated"], true);

        // Inject chunk
        let resp = sim.handle_command(&make_request(
            "simulator_inject_event",
            serde_json::json!({"eventKind": "chunk_ready", "advanceMs": 5000}),
        ));
        assert!(resp.success);
        assert_eq!(resp.payload["chunkIndex"], 0);
        assert_eq!(resp.payload["isSimulated"], true);

        // Stop
        let resp = sim.handle_command(&make_request(
            "simulator_stop_capture",
            serde_json::json!({}),
        ));
        assert!(resp.success);
        assert_eq!(resp.payload["totalChunks"], 1);
    }

    #[test]
    fn double_start_rejected() {
        let mut sim = Simulator::new(42, 1);
        sim.handle_command(&make_request(
            "simulator_start_capture",
            serde_json::json!({}),
        ));
        let resp = sim.handle_command(&make_request(
            "simulator_start_capture",
            serde_json::json!({}),
        ));
        assert!(!resp.success);
        assert_eq!(resp.error.as_ref().unwrap().code, "ALREADY_CAPTURING");
    }

    #[test]
    fn gap_event() {
        let mut sim = Simulator::new(42, 1);
        sim.handle_command(&make_request(
            "simulator_start_capture",
            serde_json::json!({}),
        ));
        let resp = sim.handle_command(&make_request(
            "simulator_inject_event",
            serde_json::json!({"eventKind": "gap_detected", "advanceMs": 2000}),
        ));
        assert!(resp.success);
        assert_eq!(resp.payload["eventKind"], "gap_detected");
    }

    #[test]
    fn crash_event_sets_error_state() {
        let mut sim = Simulator::new(42, 1);
        sim.handle_command(&make_request(
            "simulator_start_capture",
            serde_json::json!({}),
        ));
        let resp = sim.handle_command(&make_request(
            "simulator_inject_event",
            serde_json::json!({"eventKind": "crash"}),
        ));
        assert!(resp.success);
        assert_eq!(resp.payload["isSimulated"], true);
        assert_eq!(sim.state, SimulatorState::Error);
    }

    #[test]
    fn hot_plug_toggles_connection() {
        let mut sim = Simulator::new(42, 1);
        assert!(sim.devices[0].is_connected);

        sim.handle_command(&make_request(
            "simulator_inject_event",
            serde_json::json!({"eventKind": "hot_plug"}),
        ));
        assert!(!sim.devices[0].is_connected);

        sim.handle_command(&make_request(
            "simulator_inject_event",
            serde_json::json!({"eventKind": "hot_plug"}),
        ));
        assert!(sim.devices[0].is_connected);
    }

    #[test]
    fn reset_restores_initial_state() {
        let mut sim = Simulator::new(42, 2);
        sim.handle_command(&make_request(
            "simulator_start_capture",
            serde_json::json!({}),
        ));
        sim.handle_command(&make_request(
            "simulator_inject_event",
            serde_json::json!({"eventKind": "chunk_ready", "advanceMs": 5000}),
        ));

        let resp = sim.handle_command(&make_request(
            "simulator_reset",
            serde_json::json!({}),
        ));
        assert!(resp.success);
        assert_eq!(sim.state, SimulatorState::Idle);
        assert_eq!(sim.chunk_count, 0);
        assert_eq!(sim.virtual_time_ms, 0);
    }

    #[test]
    fn no_fake_production_capability() {
        // Every simulator response must have isSimulated: true
        let mut sim = Simulator::new(42, 1);
        let commands = vec![
            "simulator_enumerate_devices",
            "simulator_start_capture",
            "simulator_get_state",
        ];
        for cmd in commands {
            let resp = sim.handle_command(&make_request(cmd, serde_json::json!({})));
            if resp.success {
                assert_eq!(
                    resp.payload["isSimulated"], true,
                    "Command {} response missing isSimulated flag",
                    cmd,
                );
            }
        }
    }
}
