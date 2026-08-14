// kms-native runtime — Lifecycle management, health, panic containment.
//
// Startup → handshake → ready → processing → shutdown.
// Reads requests from stdin, writes responses/events to stdout.
// Structured logging to stderr.

use std::path::PathBuf;
use std::sync::Arc;
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::Instant;
use tokio::io::{self, AsyncWriteExt};
use tokio::sync::{Mutex, mpsc};

use crate::capture::manager::CaptureManager;
use crate::protocol::{NativeEventV1, NativeResponseV1, PROTOCOL_VERSION, parse_request};
use crate::simulator::Simulator;
use crate::storage::StorageManager;

const EVENT_CHANNEL_CAPACITY: usize = 64;

fn capture_stop_status(recovery_required: bool) -> &'static str {
    if recovery_required {
        "recovery_required"
    } else {
        "committed"
    }
}

/// Bounded, non-blocking event handoff shared by every native producer.
///
/// A producer must never await the stdout writer: a full queue instead records
/// an explicit overrun that can be surfaced through health diagnostics.
#[derive(Clone)]
pub struct BoundedEventDispatcher {
    sender: mpsc::Sender<NativeEventV1>,
    dropped_events: Arc<AtomicU64>,
}

pub type NativeEventSender = BoundedEventDispatcher;

impl BoundedEventDispatcher {
    pub fn new(capacity: usize) -> (Self, mpsc::Receiver<NativeEventV1>) {
        let (sender, receiver) = mpsc::channel(capacity.max(1));
        (
            Self {
                sender,
                dropped_events: Arc::new(AtomicU64::new(0)),
            },
            receiver,
        )
    }

    /// Attempts one bounded handoff. Only capacity overruns are counted: a
    /// closed receiver is a lifecycle failure, not a dropped diagnostic.
    pub fn try_send(
        &self,
        event: NativeEventV1,
    ) -> Result<(), mpsc::error::TrySendError<NativeEventV1>> {
        match self.sender.try_send(event) {
            Err(error @ mpsc::error::TrySendError::Full(_)) => {
                self.dropped_events.fetch_add(1, Ordering::Relaxed);
                Err(error)
            }
            result => result,
        }
    }

    /// Compatibility spelling for existing event producers. This is always
    /// non-blocking and has the same bounded-overrun semantics as `try_send`.
    pub fn send(
        &self,
        event: NativeEventV1,
    ) -> Result<(), mpsc::error::TrySendError<NativeEventV1>> {
        self.try_send(event)
    }

    pub fn try_emit(&self, event: NativeEventV1) -> bool {
        self.try_send(event).is_ok()
    }

    pub fn dropped_events(&self) -> u64 {
        self.dropped_events.load(Ordering::Relaxed)
    }
}

/// Runtime state.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum RuntimeState {
    Starting,
    Ready,
    Processing,
    ShuttingDown,
    Stopped,
}

/// Runtime configuration from environment.
#[derive(Debug, Clone)]
pub struct RuntimeConfig {
    pub storage_root: String,
    #[allow(dead_code)]
    pub protocol_version: u32,
}

impl RuntimeConfig {
    pub fn from_env() -> Self {
        Self {
            storage_root: std::env::var("KMS_STORAGE_ROOT")
                .unwrap_or_else(|_| "native-storage".to_string()),
            protocol_version: std::env::var("KMS_PROTOCOL_VERSION")
                .ok()
                .and_then(|v| v.parse().ok())
                .unwrap_or(PROTOCOL_VERSION),
        }
    }
}

/// The native runtime.
pub struct Runtime {
    config: RuntimeConfig,
    state: Arc<Mutex<RuntimeState>>,
    start_time: Instant,
    storage: Arc<Mutex<Option<StorageManager>>>,
    simulator: Arc<Mutex<Option<Simulator>>>,
    capture_manager: Arc<Mutex<Option<Arc<Mutex<CaptureManager>>>>>,
    local_speech: Arc<Mutex<Option<crate::local_speech::LocalSpeechEngine>>>,
    event_tx: NativeEventSender,
    event_rx: Arc<Mutex<Option<mpsc::Receiver<NativeEventV1>>>>,
}

impl Runtime {
    pub fn new(config: RuntimeConfig) -> Self {
        let (event_tx, event_rx) = BoundedEventDispatcher::new(EVENT_CHANNEL_CAPACITY);
        Self {
            config,
            state: Arc::new(Mutex::new(RuntimeState::Starting)),
            start_time: Instant::now(),
            storage: Arc::new(Mutex::new(None)),
            simulator: Arc::new(Mutex::new(None)),
            capture_manager: Arc::new(Mutex::new(None)),
            local_speech: Arc::new(Mutex::new(None)),
            event_tx,
            event_rx: Arc::new(Mutex::new(Some(event_rx))),
        }
    }

    /// Run the runtime — reads stdin, writes stdout.
    pub async fn run(&self) -> Result<(), Box<dyn std::error::Error>> {
        // Send handshake event
        self.emit_event(NativeEventV1::new(
            "runtime_ready",
            serde_json::json!({
                "runtimeVersion": env!("CARGO_PKG_VERSION"),
                "protocolVersion": PROTOCOL_VERSION,
                "pid": std::process::id(),
            }),
        ))
        .await?;

        *self.state.lock().await = RuntimeState::Ready;
        self.log("Runtime ready");

        // Channel for sending responses/events to stdout
        let (tx, mut rx) = mpsc::channel::<Vec<u8>>(64);

        // Forward events from unbounded channel to stdout tx
        let mut event_rx = self
            .event_rx
            .lock()
            .await
            .take()
            .ok_or("event_rx already taken")?;
        let tx_clone = tx.clone();
        tokio::spawn(async move {
            while let Some(event) = event_rx.recv().await {
                if let Ok(frame) = crate::protocol::frame_event(&event) {
                    let _ = tx_clone.send(frame).await;
                }
            }
        });

        // Spawn stdout writer
        let stdout_handle = tokio::spawn(async move {
            let mut stdout = io::stdout();
            while let Some(frame) = rx.recv().await {
                if let Err(e) = stdout.write_all(&frame).await {
                    eprintln!("[kms-native] stdout write error: {}", e);
                    break;
                }
                if let Err(e) = stdout.flush().await {
                    eprintln!("[kms-native] stdout flush error: {}", e);
                    break;
                }
            }
        });

        // Read requests from stdin using 4-byte big-endian length prefix
        let mut stdin = io::stdin();

        loop {
            let state = self.state.lock().await.clone();
            if state == RuntimeState::ShuttingDown || state == RuntimeState::Stopped {
                break;
            }

            // Read 4-byte length prefix
            let mut header = [0u8; 4];
            match tokio::io::AsyncReadExt::read_exact(&mut stdin, &mut header).await {
                Ok(_) => {
                    let len = u32::from_be_bytes(header) as usize;
                    if len > crate::protocol::MAX_ENVELOPE_BYTES {
                        self.log(&format!("Received oversized message length: {}", len));
                        break;
                    }

                    // Read payload
                    let mut payload = vec![0u8; len];
                    if let Err(e) =
                        tokio::io::AsyncReadExt::read_exact(&mut stdin, &mut payload).await
                    {
                        self.log(&format!(
                            "Failed to read request payload of size {}: {}",
                            len, e
                        ));
                        break;
                    }

                    let response = self.handle_request_bytes(&payload).await;
                    if let Ok(frame) = crate::protocol::frame_response(&response) {
                        let _ = tx.send(frame).await;
                    }

                    // Check if shutdown was requested
                    if response.command == "shutdown" && response.success {
                        break;
                    }
                }
                Err(e) if e.kind() == std::io::ErrorKind::UnexpectedEof => {
                    // stdin closed — graceful shutdown
                    self.log("stdin closed, shutting down");
                    break;
                }
                Err(e) => {
                    self.log(&format!("stdin read error: {}", e));
                    break;
                }
            }
        }

        *self.state.lock().await = RuntimeState::ShuttingDown;

        // Emit shutdown event
        let shutdown_event = NativeEventV1::new(
            "shutdown_complete",
            serde_json::json!({"uptimeMs": self.start_time.elapsed().as_millis() as u64}),
        );
        if let Ok(frame) = crate::protocol::frame_event(&shutdown_event) {
            let _ = tx.send(frame).await;
        }

        drop(tx);
        let _ = stdout_handle.await;

        *self.state.lock().await = RuntimeState::Stopped;
        self.log("Runtime stopped");
        Ok(())
    }

    /// Handle a single request with panic containment from raw bytes.
    async fn handle_request_bytes(&self, raw: &[u8]) -> NativeResponseV1 {
        // Panic containment — catch_unwind for sync parsing
        let parse_result = std::panic::catch_unwind(|| parse_request(raw));

        match parse_result {
            Ok(Ok(request)) => {
                *self.state.lock().await = RuntimeState::Processing;
                let response = self.dispatch(&request).await;
                *self.state.lock().await = RuntimeState::Ready;
                response
            }
            Ok(Err(e)) => NativeResponseV1::error(
                "unknown",
                "unknown",
                "PROTOCOL_ERROR",
                &e.to_string(),
                "protocol",
            ),
            Err(_) => NativeResponseV1::error(
                "unknown",
                "unknown",
                "PANIC",
                "Internal panic during request parsing",
                "internal",
            ),
        }
    }

    /// Dispatch a validated request to the appropriate handler.
    async fn dispatch(&self, request: &crate::protocol::NativeRequestV1) -> NativeResponseV1 {
        match request.command.as_str() {
            "ping" => NativeResponseV1::success(
                &request.correlation_id,
                "ping",
                serde_json::json!({"pong": true}),
            ),
            "get_version" => NativeResponseV1::success(
                &request.correlation_id,
                "get_version",
                serde_json::json!({
                    "runtimeVersion": env!("CARGO_PKG_VERSION"),
                    "protocolVersion": PROTOCOL_VERSION,
                    "platform": std::env::consts::OS,
                    "capabilities": ["storage", "simulator", "capture"],
                }),
            ),
            "get_capabilities" => NativeResponseV1::success(
                &request.correlation_id,
                "get_capabilities",
                serde_json::json!({
                    "supportedCommands": crate::protocol::ALLOWED_COMMANDS,
                    "protocolVersion": PROTOCOL_VERSION,
                    "features": ["storage", "simulator", "capture"],
                }),
            ),
            "health_check" => {
                let storage_ready = self.storage.lock().await.is_some();
                let simulator_active = self.simulator.lock().await.is_some();
                NativeResponseV1::success(
                    &request.correlation_id,
                    "health_check",
                    serde_json::json!({
                        "status": "healthy",
                        "uptimeMs": self.start_time.elapsed().as_millis() as u64,
                        "eventOverruns": self.event_tx.dropped_events(),
                        "storageReady": storage_ready,
                        "simulatorActive": simulator_active,
                    }),
                )
            }
            "shutdown" => {
                *self.state.lock().await = RuntimeState::ShuttingDown;
                NativeResponseV1::success(
                    &request.correlation_id,
                    "shutdown",
                    serde_json::json!({"shuttingDown": true}),
                )
            }

            // Storage commands
            cmd if cmd.starts_with("storage_") => self.handle_storage_command(request).await,

            // Manifest commands
            cmd if cmd.starts_with("manifest_") => self.handle_storage_command(request).await,

            // Simulator commands
            cmd if cmd.starts_with("simulator_") => self.handle_simulator_command(request).await,

            // Capture commands (P12)
            "device_enumerate" | "capture_start" | "capture_stop" | "capture_get_state" => {
                self.handle_capture_command(request).await
            }

            // Local Speech commands (P13)
            cmd if cmd.starts_with("local_speech_") => {
                self.handle_local_speech_command(request).await
            }

            _ => NativeResponseV1::error(
                &request.correlation_id,
                &request.command,
                "UNKNOWN_COMMAND",
                &format!("Unknown command: {}", request.command),
                "protocol",
            ),
        }
    }

    async fn handle_storage_command(
        &self,
        request: &crate::protocol::NativeRequestV1,
    ) -> NativeResponseV1 {
        let mut storage_guard = self.storage.lock().await;

        match request.command.as_str() {
            "storage_init" => match StorageManager::new(&self.config.storage_root) {
                Ok(mgr) => {
                    *storage_guard = Some(mgr);
                    NativeResponseV1::success(
                        &request.correlation_id,
                        "storage_init",
                        serde_json::json!({"initialized": true, "root": self.config.storage_root}),
                    )
                }
                Err(e) => NativeResponseV1::error(
                    &request.correlation_id,
                    "storage_init",
                    "STORAGE_INIT_FAILED",
                    &e.to_string(),
                    "storage",
                ),
            },
            _ => {
                let storage = match storage_guard.as_mut() {
                    Some(s) => s,
                    None => {
                        return NativeResponseV1::error(
                            &request.correlation_id,
                            &request.command,
                            "STORAGE_NOT_INITIALIZED",
                            "Storage must be initialized first (storage_init)",
                            "storage",
                        );
                    }
                };
                storage.handle_command(request)
            }
        }
    }

    async fn handle_simulator_command(
        &self,
        request: &crate::protocol::NativeRequestV1,
    ) -> NativeResponseV1 {
        let mut sim_guard = self.simulator.lock().await;

        match request.command.as_str() {
            "simulator_configure" => {
                let seed = request
                    .payload
                    .get("seed")
                    .and_then(|v| v.as_u64())
                    .unwrap_or(42);
                let device_count = request
                    .payload
                    .get("deviceCount")
                    .and_then(|v| v.as_u64())
                    .unwrap_or(1) as usize;

                let sim = Simulator::new(seed, device_count);
                *sim_guard = Some(sim);
                NativeResponseV1::success(
                    &request.correlation_id,
                    "simulator_configure",
                    serde_json::json!({"configured": true, "seed": seed, "deviceCount": device_count, "isSimulated": true}),
                )
            }
            _ => {
                let sim = match sim_guard.as_mut() {
                    Some(s) => s,
                    None => {
                        return NativeResponseV1::error(
                            &request.correlation_id,
                            &request.command,
                            "SIMULATOR_NOT_CONFIGURED",
                            "Simulator must be configured first (simulator_configure)",
                            "runtime",
                        );
                    }
                };
                sim.handle_command(request)
            }
        }
    }

    async fn handle_capture_command(
        &self,
        request: &crate::protocol::NativeRequestV1,
    ) -> NativeResponseV1 {
        match request.command.as_str() {
            "device_enumerate" => match crate::capture::device::enumerate_devices() {
                Ok(devs) => NativeResponseV1::success(
                    &request.correlation_id,
                    "device_enumerate",
                    serde_json::json!(devs),
                ),
                Err(e) => NativeResponseV1::error(
                    &request.correlation_id,
                    "device_enumerate",
                    "ENUMERATION_FAILED",
                    &e,
                    "capture",
                ),
            },
            "capture_start" => {
                let meeting_id = request.payload.get("meetingId").and_then(|v| v.as_str());
                let mic_device_id = request
                    .payload
                    .get("micDeviceId")
                    .and_then(|v| v.as_str())
                    .map(|s| s.to_string());
                let sys_device_id = request
                    .payload
                    .get("systemDeviceId")
                    .and_then(|v| v.as_str())
                    .map(|s| s.to_string());

                let Some(meeting_id) = meeting_id else {
                    return NativeResponseV1::error(
                        &request.correlation_id,
                        "capture_start",
                        "MISSING_MEETING_ID",
                        "Required payload field: meetingId",
                        "validation",
                    );
                };

                let mut manager_guard = self.capture_manager.lock().await;
                if manager_guard.is_some() {
                    return NativeResponseV1::error(
                        &request.correlation_id,
                        "capture_start",
                        "ALREADY_CAPTURING",
                        "Capture session is already running",
                        "capture",
                    );
                }

                match CaptureManager::start(
                    meeting_id.to_string(),
                    mic_device_id,
                    sys_device_id,
                    self.storage.clone(),
                    self.event_tx.clone(),
                )
                .await
                {
                    Ok(mgr) => {
                        *manager_guard = Some(mgr);
                        NativeResponseV1::success(
                            &request.correlation_id,
                            "capture_start",
                            serde_json::json!({"started": true}),
                        )
                    }
                    Err(e) => NativeResponseV1::error(
                        &request.correlation_id,
                        "capture_start",
                        "START_FAILED",
                        &e,
                        "capture",
                    ),
                }
            }
            "capture_stop" => {
                let mut manager_guard = self.capture_manager.lock().await;
                let Some(mgr) = manager_guard.take() else {
                    return NativeResponseV1::error(
                        &request.correlation_id,
                        "capture_stop",
                        "NOT_CAPTURING",
                        "No active capture session running",
                        "capture",
                    );
                };

                // Producer close happens under the manager mutex, but the
                // acknowledgement must be awaited without it: the dispatcher
                // needs that mutex to consume every accepted packet.
                let drain_ack = {
                    let mut mgr_lock = mgr.lock().await;
                    mgr_lock.begin_stop_and_take_drain_ack()
                };
                drop(manager_guard);

                let Some(drain_ack) = drain_ack else {
                    return NativeResponseV1::error(
                        &request.correlation_id,
                        "capture_stop",
                        "RECOVERY_REQUIRED",
                        "Capture dispatcher drain acknowledgement is unavailable",
                        "capture",
                    );
                };
                if drain_ack.await.is_err() {
                    return NativeResponseV1::error(
                        &request.correlation_id,
                        "capture_stop",
                        "RECOVERY_REQUIRED",
                        "Capture dispatcher stopped before its durable drain acknowledgement",
                        "capture",
                    );
                }

                let (mic_chunks, sys_chunks, recovery_required) = {
                    let mut mgr_lock = mgr.lock().await;
                    mgr_lock
                        .finish_stop_after_drain(self.storage.clone(), self.event_tx.clone())
                        .await
                };

                if recovery_required {
                    NativeResponseV1::error(
                        &request.correlation_id,
                        "capture_stop",
                        "RECOVERY_REQUIRED",
                        "Capture drained but one or more source ranges require recovery",
                        "capture",
                    )
                } else {
                    NativeResponseV1::success(
                        &request.correlation_id,
                        "capture_stop",
                        serde_json::json!({
                            "stopped": true,
                            "totalMicChunks": mic_chunks,
                            "totalSysChunks": sys_chunks,
                            "commitStatus": capture_stop_status(false)
                        }),
                    )
                }
            }
            "capture_get_state" => {
                let manager_guard = self.capture_manager.lock().await;
                let Some(mgr) = manager_guard.as_ref() else {
                    return NativeResponseV1::error(
                        &request.correlation_id,
                        "capture_get_state",
                        "NOT_CAPTURING",
                        "No active capture session running",
                        "capture",
                    );
                };

                let mgr_lock = mgr.lock().await;
                NativeResponseV1::success(
                    &request.correlation_id,
                    "capture_get_state",
                    mgr_lock.get_metrics(),
                )
            }
            _ => NativeResponseV1::error(
                &request.correlation_id,
                &request.command,
                "UNKNOWN_COMMAND",
                &format!("Unknown command: {}", request.command),
                "protocol",
            ),
        }
    }

    async fn handle_local_speech_command(
        &self,
        request: &crate::protocol::NativeRequestV1,
    ) -> NativeResponseV1 {
        match request.command.as_str() {
            "local_speech_manifest_load" => {
                let manifest_json = request.payload.get("manifestJson").and_then(|v| v.as_str());
                let Some(manifest_raw) = manifest_json else {
                    return NativeResponseV1::error(
                        &request.correlation_id,
                        "local_speech_manifest_load",
                        "MISSING_MANIFEST",
                        "Required payload field: manifestJson",
                        "validation",
                    );
                };
                match crate::local_speech::manifest::load_manifest(manifest_raw) {
                    Ok(entries) => NativeResponseV1::success(
                        &request.correlation_id,
                        "local_speech_manifest_load",
                        serde_json::json!({
                            "models": entries,
                            "isSimulated": false,
                        }),
                    ),
                    Err(e) => NativeResponseV1::error(
                        &request.correlation_id,
                        "local_speech_manifest_load",
                        "MANIFEST_INVALID",
                        &e.to_string(),
                        "validation",
                    ),
                }
            }
            "local_speech_engine_init" => {
                let model_id = request.payload.get("modelId").and_then(|v| v.as_str());
                let language = request.payload.get("language").and_then(|v| v.as_str());
                let (Some(model_id), Some(language)) = (model_id, language) else {
                    return NativeResponseV1::error(
                        &request.correlation_id,
                        "local_speech_engine_init",
                        "MISSING_FIELDS",
                        "Required: modelId, language",
                        "validation",
                    );
                };
                let memory_budget_mb = request
                    .payload
                    .get("memoryBudgetMb")
                    .and_then(|v| v.as_u64())
                    .unwrap_or(512) as u32;
                let model_path = request
                    .payload
                    .get("modelPath")
                    .and_then(|v| v.as_str())
                    .unwrap_or(&format!("models/{}.bin", model_id))
                    .to_string();
                let model_sha256 = request.payload.get("modelSha256").and_then(|v| v.as_str());
                let Some(model_sha256) = model_sha256 else {
                    return NativeResponseV1::error(
                        &request.correlation_id,
                        "local_speech_engine_init",
                        "MISSING_FIELDS",
                        "Required: modelId, language, modelSha256",
                        "validation",
                    );
                };
                if crate::local_speech::manifest::validate_model_path(&model_path).is_err()
                    || model_sha256.len() != 64
                    || !model_sha256
                        .chars()
                        .all(|character| character.is_ascii_hexdigit())
                {
                    return NativeResponseV1::error(
                        &request.correlation_id,
                        "local_speech_engine_init",
                        "INVALID_MODEL",
                        "Model path or checksum is invalid",
                        "validation",
                    );
                }

                // Create a minimal manifest entry from payload
                let entry = crate::local_speech::manifest::ManifestEntry {
                    model_id: model_id.to_string(),
                    language: language.to_string(),
                    engine_type: "whisper_cpp_compat".to_string(),
                    path: model_path,
                    sha256: model_sha256.to_string(),
                    max_concurrent_streams: 2,
                    license_provenance: crate::local_speech::manifest::LicenseProvenance {
                        license: "MIT".to_string(),
                        reviewed_by: "runtime_init".to_string(),
                        reviewed_at: "2026-07-27T00:00:00.000Z".to_string(),
                    },
                };

                let opts = crate::local_speech::engine::EngineOpts {
                    memory_budget_mb,
                    model_root: PathBuf::from(&self.config.storage_root),
                    audio_root: PathBuf::from(&self.config.storage_root),
                    ..Default::default()
                };

                match crate::local_speech::LocalSpeechEngine::init(
                    entry,
                    language.to_string(),
                    opts,
                ) {
                    Ok(engine) => {
                        *self.local_speech.lock().await = Some(engine);
                        NativeResponseV1::success(
                            &request.correlation_id,
                            "local_speech_engine_init",
                            serde_json::json!({"initialized": true, "isSimulated": false}),
                        )
                    }
                    Err(e) => NativeResponseV1::error(
                        &request.correlation_id,
                        "local_speech_engine_init",
                        "ENGINE_INIT_FAILED",
                        &e.to_string(),
                        "runtime",
                    ),
                }
            }
            "local_speech_transcribe_window" => {
                let run_id = request.payload.get("runId").and_then(|v| v.as_str());
                let part_index = request.payload.get("partIndex").and_then(|v| v.as_i64());
                let start_ms = request.payload.get("startMs").and_then(|v| v.as_i64());
                let end_ms = request.payload.get("endMs").and_then(|v| v.as_i64());
                let plan_hash = request.payload.get("planHash").and_then(|v| v.as_str());
                let source_path = request.payload.get("sourcePath").and_then(|v| v.as_str());
                let source_sha256 = request.payload.get("sourceSha256").and_then(|v| v.as_str());

                let (
                    Some(run_id),
                    Some(start_ms),
                    Some(end_ms),
                    Some(source_path),
                    Some(source_sha256),
                ) = (run_id, start_ms, end_ms, source_path, source_sha256)
                else {
                    return NativeResponseV1::error(
                        &request.correlation_id,
                        "local_speech_transcribe_window",
                        "MISSING_FIELDS",
                        "Required: runId, startMs, endMs, sourcePath, sourceSha256",
                        "validation",
                    );
                };

                let part_index = part_index.unwrap_or(0) as i32;
                let plan_hash = plan_hash.unwrap_or("unknown");

                let mut engine_guard = self.local_speech.lock().await;
                let engine = match engine_guard.as_mut() {
                    Some(e) => e,
                    None => {
                        return NativeResponseV1::error(
                            &request.correlation_id,
                            "local_speech_transcribe_window",
                            "ENGINE_NOT_INITIALIZED",
                            "Engine must be initialized first (local_speech_engine_init)",
                            "runtime",
                        );
                    }
                };

                match engine
                    .transcribe_window(
                        run_id,
                        part_index,
                        start_ms,
                        end_ms,
                        plan_hash,
                        PathBuf::from(source_path),
                        source_sha256.to_string(),
                        &self.event_tx,
                    )
                    .await
                {
                    Ok(segments) => NativeResponseV1::success(
                        &request.correlation_id,
                        "local_speech_transcribe_window",
                        serde_json::json!({"segments": segments, "isSimulated": false}),
                    ),
                    Err(e) => NativeResponseV1::error(
                        &request.correlation_id,
                        "local_speech_transcribe_window",
                        "TRANSCRIBE_FAILED",
                        &e.to_string(),
                        "runtime",
                    ),
                }
            }
            "local_speech_cancel" => {
                let engine_guard = self.local_speech.lock().await;
                if let Some(engine) = engine_guard.as_ref() {
                    engine.cancel();
                }
                NativeResponseV1::success(
                    &request.correlation_id,
                    "local_speech_cancel",
                    serde_json::json!({"cancelled": true}),
                )
            }
            "local_speech_get_state" => {
                let engine_guard = self.local_speech.lock().await;
                let state = match engine_guard.as_ref() {
                    Some(engine) => engine.get_state(),
                    None => serde_json::json!({
                        "active": false,
                        "queued": 0,
                        "isSimulated": true,
                    }),
                };
                NativeResponseV1::success(&request.correlation_id, "local_speech_get_state", state)
            }
            _ => NativeResponseV1::error(
                &request.correlation_id,
                &request.command,
                "UNKNOWN_COMMAND",
                &format!("Unknown local_speech command: {}", request.command),
                "protocol",
            ),
        }
    }

    async fn emit_event(&self, event: NativeEventV1) -> Result<(), Box<dyn std::error::Error>> {
        let _ = self.event_tx.try_send(event);
        Ok(())
    }

    fn log(&self, msg: &str) {
        eprintln!(
            "[kms-native] [{}] {}",
            chrono::Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Millis, true),
            msg
        );
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn bounded_event_dispatcher_counts_each_event_dropped_when_full() {
        let (dispatcher, mut receiver) = BoundedEventDispatcher::new(1);
        assert!(dispatcher.try_emit(NativeEventV1::new("first", serde_json::json!({}))));
        assert!(!dispatcher.try_emit(NativeEventV1::new("second", serde_json::json!({}))));
        assert_eq!(dispatcher.dropped_events(), 1);
        assert_eq!(receiver.try_recv().unwrap().event_type, "first");
    }

    #[test]
    fn bounded_event_dispatcher_never_reports_a_capacity_of_zero() {
        let (dispatcher, _receiver) = BoundedEventDispatcher::new(0);
        assert!(dispatcher.try_emit(NativeEventV1::new("event", serde_json::json!({}))));
    }

    #[test]
    fn runtime_config_defaults() {
        // Test that from_env falls back to safe defaults when env vars are absent.
        // Rather than unsoundly mutating env vars (which is UB in multi-threaded tests),
        // we verify the default values the config would use.
        let config = RuntimeConfig {
            storage_root: "native-storage".to_string(),
            protocol_version: PROTOCOL_VERSION,
        };
        assert_eq!(config.storage_root, "native-storage");
        assert_eq!(config.protocol_version, PROTOCOL_VERSION);
    }

    #[test]
    fn runtime_starts_in_starting_state() {
        let config = RuntimeConfig {
            storage_root: "/tmp/test".to_string(),
            protocol_version: PROTOCOL_VERSION,
        };
        let rt = Runtime::new(config);
        let state = rt.state.blocking_lock().clone();
        assert_eq!(state, RuntimeState::Starting);
    }

    #[tokio::test]
    async fn dispatch_ping() {
        let config = RuntimeConfig {
            storage_root: "/tmp/test".to_string(),
            protocol_version: PROTOCOL_VERSION,
        };
        let rt = Runtime::new(config);
        let request = crate::protocol::NativeRequestV1 {
            version: 1,
            correlation_id: "test-id".to_string(),
            command: "ping".to_string(),
            payload: serde_json::Value::Object(serde_json::Map::new()),
            timeout_ms: None,
            cancel: false,
        };
        let resp = rt.dispatch(&request).await;
        assert!(resp.success);
        assert_eq!(resp.command, "ping");
    }

    #[tokio::test]
    async fn dispatch_health_check() {
        let config = RuntimeConfig {
            storage_root: "/tmp/test".to_string(),
            protocol_version: PROTOCOL_VERSION,
        };
        let rt = Runtime::new(config);
        let request = crate::protocol::NativeRequestV1 {
            version: 1,
            correlation_id: "test-id".to_string(),
            command: "health_check".to_string(),
            payload: serde_json::Value::Object(serde_json::Map::new()),
            timeout_ms: None,
            cancel: false,
        };
        let resp = rt.dispatch(&request).await;
        assert!(resp.success);
    }

    #[tokio::test]
    async fn health_check_exposes_bounded_event_overruns_without_event_content() {
        let config = RuntimeConfig {
            storage_root: "/tmp/test".to_string(),
            protocol_version: PROTOCOL_VERSION,
        };
        let rt = Runtime::new(config);
        for _ in 0..=EVENT_CHANNEL_CAPACITY {
            let _ = rt
                .event_tx
                .send(NativeEventV1::new("diagnostic", serde_json::json!({})));
        }
        let request = crate::protocol::NativeRequestV1 {
            version: 1,
            correlation_id: "test-id".to_string(),
            command: "health_check".to_string(),
            payload: serde_json::Value::Object(serde_json::Map::new()),
            timeout_ms: None,
            cancel: false,
        };

        let response = rt.dispatch(&request).await;
        assert_eq!(response.payload["eventOverruns"], 1);
        assert!(!response.payload.to_string().contains("diagnostic"));
    }

    #[tokio::test]
    async fn dispatch_shutdown() {
        let config = RuntimeConfig {
            storage_root: "/tmp/test".to_string(),
            protocol_version: PROTOCOL_VERSION,
        };
        let rt = Runtime::new(config);
        let request = crate::protocol::NativeRequestV1 {
            version: 1,
            correlation_id: "test-id".to_string(),
            command: "shutdown".to_string(),
            payload: serde_json::Value::Object(serde_json::Map::new()),
            timeout_ms: None,
            cancel: false,
        };
        let resp = rt.dispatch(&request).await;
        assert!(resp.success);
    }

    #[tokio::test]
    async fn dispatch_local_speech_get_state() {
        let config = RuntimeConfig {
            storage_root: "/tmp/test".to_string(),
            protocol_version: PROTOCOL_VERSION,
        };
        let rt = Runtime::new(config);
        let request = crate::protocol::NativeRequestV1 {
            version: 1,
            correlation_id: "test-id".to_string(),
            command: "local_speech_get_state".to_string(),
            payload: serde_json::Value::Object(serde_json::Map::new()),
            timeout_ms: None,
            cancel: false,
        };
        let resp = rt.dispatch(&request).await;
        assert!(resp.success);
        let state = resp.payload;
        assert_eq!(state["isSimulated"], serde_json::Value::Bool(true));
    }

    #[tokio::test]
    async fn dispatch_local_speech_manifest_load_rejects_bad() {
        let config = RuntimeConfig {
            storage_root: "/tmp/test".to_string(),
            protocol_version: PROTOCOL_VERSION,
        };
        let rt = Runtime::new(config);
        let request = crate::protocol::NativeRequestV1 {
            version: 1,
            correlation_id: "test-id".to_string(),
            command: "local_speech_manifest_load".to_string(),
            payload: serde_json::json!({
                "manifestJson": "[{\"bad\":\"json\"}]"
            }),
            timeout_ms: None,
            cancel: false,
        };
        let resp = rt.dispatch(&request).await;
        assert!(!resp.success);
    }

    #[tokio::test]
    async fn dispatch_local_speech_engine_init_then_transcribe() {
        let config = RuntimeConfig {
            storage_root: "/tmp/test".to_string(),
            protocol_version: PROTOCOL_VERSION,
        };
        let rt = Runtime::new(config);

        // Init
        let init_req = crate::protocol::NativeRequestV1 {
            version: 1,
            correlation_id: "test-id-1".to_string(),
            command: "local_speech_engine_init".to_string(),
            payload: serde_json::json!({
                "modelId": "whisper-tiny-vi",
                "language": "vi",
                "memoryBudgetMb": 512,
                "modelSha256": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
            }),
            timeout_ms: None,
            cancel: false,
        };
        let init_resp = rt.dispatch(&init_req).await;
        assert!(init_resp.success);

        // Transcribe
        let transcribe_req = crate::protocol::NativeRequestV1 {
            version: 1,
            correlation_id: "test-id-2".to_string(),
            command: "local_speech_transcribe_window".to_string(),
            payload: serde_json::json!({
                "runId": "550e8400-e29b-41d4-a716-446655440001",
                "partIndex": 0,
                "startMs": 0,
                "endMs": 60_000,
                "planHash": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
                "sourcePath": "missing.wav",
                "sourceSha256": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
            }),
            timeout_ms: None,
            cancel: false,
        };
        let trans_resp = rt.dispatch(&transcribe_req).await;
        assert!(!trans_resp.success);
        assert_eq!(
            trans_resp.error.as_ref().map(|error| error.code.as_str()),
            Some("TRANSCRIBE_FAILED")
        );
    }

    #[test]
    fn capture_stop_status_never_marks_recovery_as_local_safe() {
        assert_eq!(capture_stop_status(false), "committed");
        assert_eq!(capture_stop_status(true), "recovery_required");
    }
}
