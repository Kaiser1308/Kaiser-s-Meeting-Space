// kms-native protocol — NativeEnvelopeV1 Rust implementation.
//
// Byte-conformant with TS implementation. Validated on both sides.
// Enforces: version check, command allowlist, size limits, strict parsing.

use serde::{Deserialize, Serialize};
use thiserror::Error;

/// Maximum envelope size in bytes (1 MB + 4 KB overhead).
pub const MAX_ENVELOPE_BYTES: usize = 1_048_576 + 4096;

/// Current protocol version.
pub const PROTOCOL_VERSION: u32 = 1;

/// All allowed native commands.
pub const ALLOWED_COMMANDS: &[&str] = &[
    // Lifecycle
    "ping",
    "get_version",
    "get_capabilities",
    "health_check",
    "shutdown",
    // Storage
    "storage_init",
    "storage_atomic_write",
    "storage_read",
    "storage_delete",
    "storage_list",
    "storage_stat",
    "storage_mkdir",
    "storage_available_space",
    "storage_checksum_compute",
    "storage_checksum_verify",
    // Manifest
    "manifest_init",
    "manifest_add_entry",
    "manifest_get_entry",
    "manifest_list_entries",
    "manifest_update_upload_status",
    "manifest_get_incomplete",
    "manifest_get_orphans",
    "manifest_close",
    // Simulator
    "simulator_configure",
    "simulator_enumerate_devices",
    "simulator_device_health",
    "simulator_start_capture",
    "simulator_stop_capture",
    "simulator_inject_event",
    "simulator_get_state",
    "simulator_reset",
    // Capture (P12)
    "device_enumerate",
    "capture_start",
    "capture_stop",
    "capture_get_state",
    // Local Speech (P13)
    "local_speech_manifest_load",
    "local_speech_engine_init",
    "local_speech_transcribe_window",
    "local_speech_cancel",
    "local_speech_get_state",
];

/// Protocol errors.
#[derive(Debug, Error)]
pub enum ProtocolError {
    #[error("Oversized message: {0} bytes exceeds limit of {1}")]
    Oversized(usize, usize),
    #[allow(dead_code)]
    #[error("Malformed message: {0}")]
    Malformed(String),
    #[error("Unknown command: {0}")]
    UnknownCommand(String),
    #[error("Version mismatch: got {0}, expected {1}")]
    VersionMismatch(u32, u32),
    #[error("JSON error: {0}")]
    Json(#[from] serde_json::Error),
}

/// NativeRequestV1 — incoming request from Electron.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct NativeRequestV1 {
    pub version: u32,
    #[serde(rename = "correlationId")]
    pub correlation_id: String,
    pub command: String,
    #[serde(default)]
    pub payload: serde_json::Value,
    #[serde(rename = "timeoutMs", skip_serializing_if = "Option::is_none")]
    pub timeout_ms: Option<u64>,
    #[serde(default)]
    pub cancel: bool,
}

/// Safe error detail.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct SafeError {
    pub code: String,
    pub message: String,
    pub category: String,
    #[serde(default)]
    pub retryable: bool,
}

/// NativeResponseV1 — outgoing response to Electron.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct NativeResponseV1 {
    pub version: u32,
    #[serde(rename = "correlationId")]
    pub correlation_id: String,
    pub command: String,
    pub success: bool,
    #[serde(default)]
    pub payload: serde_json::Value,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<SafeError>,
}

/// NativeEventV1 — unsolicited event from Rust to Electron.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct NativeEventV1 {
    pub version: u32,
    #[serde(rename = "eventId")]
    pub event_id: String,
    #[serde(rename = "eventType")]
    pub event_type: String,
    #[serde(default)]
    pub payload: serde_json::Value,
    pub timestamp: String,
}

impl NativeResponseV1 {
    /// Create a success response.
    pub fn success(
        correlation_id: &str,
        command: &str,
        payload: serde_json::Value,
    ) -> Self {
        Self {
            version: PROTOCOL_VERSION,
            correlation_id: correlation_id.to_string(),
            command: command.to_string(),
            success: true,
            payload,
            error: None,
        }
    }

    /// Create an error response.
    pub fn error(
        correlation_id: &str,
        command: &str,
        code: &str,
        message: &str,
        category: &str,
    ) -> Self {
        Self {
            version: PROTOCOL_VERSION,
            correlation_id: correlation_id.to_string(),
            command: command.to_string(),
            success: false,
            payload: serde_json::Value::Object(serde_json::Map::new()),
            error: Some(SafeError {
                code: code.to_string(),
                message: message.chars().take(512).collect(),
                category: category.to_string(),
                retryable: false,
            }),
        }
    }
}

impl NativeEventV1 {
    /// Create a new event.
    pub fn new(
        event_type: &str,
        payload: serde_json::Value,
    ) -> Self {
        Self {
            version: PROTOCOL_VERSION,
            event_id: uuid::Uuid::new_v4().to_string(),
            event_type: event_type.to_string(),
            payload,
            timestamp: chrono::Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Millis, true),
        }
    }
}

/// Parse and validate a request from raw JSON bytes.
pub fn parse_request(raw: &[u8]) -> Result<NativeRequestV1, ProtocolError> {
    // Size check
    if raw.len() > MAX_ENVELOPE_BYTES {
        return Err(ProtocolError::Oversized(raw.len(), MAX_ENVELOPE_BYTES));
    }

    // Parse JSON
    let request: NativeRequestV1 = serde_json::from_slice(raw)?;

    // Version check
    if request.version != PROTOCOL_VERSION {
        return Err(ProtocolError::VersionMismatch(
            request.version,
            PROTOCOL_VERSION,
        ));
    }

    // Command allowlist check
    if !ALLOWED_COMMANDS.contains(&request.command.as_str()) {
        return Err(ProtocolError::UnknownCommand(request.command.clone()));
    }

    Ok(request)
}


/// Serialize a response to JSON line (newline terminated).
#[allow(dead_code)]
pub fn serialize_response(response: &NativeResponseV1) -> Result<String, ProtocolError> {
    let json = serde_json::to_string(response)?;
    Ok(format!("{}\n", json))
}

/// Serialize an event to JSON line (newline terminated).
#[allow(dead_code)]
pub fn serialize_event(event: &NativeEventV1) -> Result<String, ProtocolError> {
    let json = serde_json::to_string(event)?;
    Ok(format!("{}\n", json))
}

/// Frame a JSON string.
pub fn frame_message(json: &str) -> Vec<u8> {
    let len = json.len() as u32;
    let mut frame = Vec::with_capacity(4 + json.len());
    frame.extend_from_slice(&len.to_be_bytes());
    frame.extend_from_slice(json.as_bytes());
    frame
}

/// Serialize and frame a response.
pub fn frame_response(response: &NativeResponseV1) -> Result<Vec<u8>, ProtocolError> {
    let json = serde_json::to_string(response)?;
    Ok(frame_message(&json))
}

/// Serialize and frame an event.
pub fn frame_event(event: &NativeEventV1) -> Result<Vec<u8>, ProtocolError> {
    let json = serde_json::to_string(event)?;
    Ok(frame_message(&json))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_valid_ping_request() {
        let json = r#"{"version":1,"correlationId":"550e8400-e29b-41d4-a716-446655440000","command":"ping"}"#;
        let req = parse_request(json.as_bytes()).unwrap();
        assert_eq!(req.command, "ping");
        assert_eq!(req.version, PROTOCOL_VERSION);
    }

    #[test]
    fn reject_unknown_command() {
        let json = r#"{"version":1,"correlationId":"550e8400-e29b-41d4-a716-446655440000","command":"exec_shell"}"#;
        let err = parse_request(json.as_bytes()).unwrap_err();
        assert!(matches!(err, ProtocolError::UnknownCommand(_)));
    }

    #[test]
    fn reject_wrong_version() {
        let json = r#"{"version":99,"correlationId":"550e8400-e29b-41d4-a716-446655440000","command":"ping"}"#;
        let err = parse_request(json.as_bytes()).unwrap_err();
        assert!(matches!(err, ProtocolError::VersionMismatch(99, 1)));
    }

    #[test]
    fn reject_extra_fields() {
        let json = r#"{"version":1,"correlationId":"550e8400-e29b-41d4-a716-446655440000","command":"ping","hackerField":"evil"}"#;
        let err = parse_request(json.as_bytes()).unwrap_err();
        assert!(matches!(err, ProtocolError::Json(_)));
    }

    #[test]
    fn reject_oversized_message() {
        let huge = "x".repeat(MAX_ENVELOPE_BYTES + 1);
        let err = parse_request(huge.as_bytes()).unwrap_err();
        assert!(matches!(err, ProtocolError::Oversized(_, _)));
    }

    #[test]
    fn serialize_success_response() {
        let resp = NativeResponseV1::success(
            "550e8400-e29b-41d4-a716-446655440000",
            "ping",
            serde_json::json!({"pong": true}),
        );
        let json = serialize_response(&resp).unwrap();
        assert!(json.contains("\"success\":true"));
        assert!(json.ends_with('\n'));
    }

    #[test]
    fn serialize_error_response() {
        let resp = NativeResponseV1::error(
            "550e8400-e29b-41d4-a716-446655440000",
            "ping",
            "INTERNAL",
            "Something broke",
            "runtime",
        );
        let json = serialize_response(&resp).unwrap();
        assert!(json.contains("\"success\":false"));
        assert!(json.contains("INTERNAL"));
    }

    #[test]
    fn create_and_serialize_event() {
        let event = NativeEventV1::new(
            "runtime_ready",
            serde_json::json!({"runtimeVersion": "0.1.0", "protocolVersion": 1, "pid": 12345}),
        );
        let json = serialize_event(&event).unwrap();
        assert!(json.contains("runtime_ready"));
        assert!(json.ends_with('\n'));
    }

    #[test]
    fn allowed_commands_has_no_dangerous_patterns() {
        for cmd in ALLOWED_COMMANDS {
            assert!(!cmd.contains("exec"));
            assert!(!cmd.contains("shell"));
            assert!(!cmd.contains("eval"));
            assert!(!cmd.contains("spawn"));
        }
    }

    #[test]
    fn golden_fixture_ping_request() {
        let json = r#"{"version":1,"correlationId":"550e8400-e29b-41d4-a716-446655440000","command":"ping","payload":{},"cancel":false}"#;
        let req = parse_request(json.as_bytes()).unwrap();
        assert_eq!(req.correlation_id, "550e8400-e29b-41d4-a716-446655440000");
        assert_eq!(req.command, "ping");
        assert!(!req.cancel);
    }

    #[test]
    fn golden_fixture_storage_write_request() {
        let json = r#"{"version":1,"correlationId":"7c9e6679-7425-40de-944b-e07fc1f90ae7","command":"storage_atomic_write","payload":{"path":"chunks/chunk_000.webm","dataBase64":"AAAA"},"timeoutMs":5000}"#;
        let req = parse_request(json.as_bytes()).unwrap();
        assert_eq!(req.command, "storage_atomic_write");
        assert_eq!(req.timeout_ms, Some(5000));
    }
}
