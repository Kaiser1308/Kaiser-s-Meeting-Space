use std::path::PathBuf;
use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};

use crate::protocol::NativeEventV1;
use crate::runtime::NativeEventSender;
use thiserror::Error;

use super::manifest::ManifestEntry;
use super::{audio, model};

#[derive(Debug, Error)]
pub enum EngineError {
    #[error("Engine busy: queue full, retry later")]
    Busy,
    #[error("Out of memory: requested exceeds {0} MB budget")]
    OutOfMemory(u32),
    #[error("Model not loaded")]
    ModelNotLoaded,
    #[error("Invalid window: {0}")]
    InvalidWindow(String),
    #[error("Cancelled")]
    Cancelled,
    #[error("Audio unavailable")]
    AudioUnavailable,
    #[error("Model unavailable")]
    ModelUnavailable,
    #[error("Model transcription failed")]
    ModelTranscriptionFailed,
}

pub struct EngineOpts {
    pub memory_budget_mb: u32,
    pub thread_pool_size: u32,
    pub model_root: PathBuf,
    pub audio_root: PathBuf,
}

impl Default for EngineOpts {
    fn default() -> Self {
        Self {
            memory_budget_mb: 512,
            thread_pool_size: 2,
            model_root: PathBuf::from("."),
            audio_root: PathBuf::from("."),
        }
    }
}

pub struct LocalSpeechEngine {
    manifest_entry: ManifestEntry,
    language: String,
    stop_signal: Arc<AtomicBool>,
    active: bool,
    queued: u32,
    memory_budget_mb: u32,
    thread_pool_size: u32,
    model_path: PathBuf,
    audio_root: PathBuf,
    model: Option<model::WhisperModel>,
}

impl LocalSpeechEngine {
    pub fn init(
        entry: ManifestEntry,
        language: String,
        opts: EngineOpts,
    ) -> Result<Self, EngineError> {
        if entry.language != language {
            return Err(EngineError::InvalidWindow(format!(
                "language mismatch: manifest {} vs requested {}",
                entry.language, language
            )));
        }
        if entry.max_concurrent_streams < 1 {
            return Err(EngineError::ModelNotLoaded);
        }
        if language != "vi" && language != "en" {
            return Err(EngineError::InvalidWindow(
                "language must be vi or en".into(),
            ));
        }

        let model_path = opts.model_root.join(&entry.path);
        Ok(Self {
            manifest_entry: entry,
            language,
            stop_signal: Arc::new(AtomicBool::new(false)),
            active: false,
            queued: 0,
            memory_budget_mb: opts.memory_budget_mb,
            thread_pool_size: opts.thread_pool_size.max(1),
            model_path,
            audio_root: opts.audio_root,
            model: None,
        })
    }

    pub async fn transcribe_window(
        &mut self,
        run_id: &str,
        part_index: i32,
        start_ms: i64,
        end_ms: i64,
        _plan_hash: &str,
        source_path: PathBuf,
        source_sha256: String,
        event_tx: &NativeEventSender,
    ) -> Result<Vec<model::SyntheticSegment>, EngineError> {
        if self.stop_signal.load(Ordering::Relaxed) {
            return Err(EngineError::Cancelled);
        }
        if start_ms >= end_ms {
            return Err(EngineError::InvalidWindow(
                "start_ms must be < end_ms".into(),
            ));
        }

        self.active = true;
        self.queued = self.queued.saturating_add(1);
        let finish = |engine: &mut Self| {
            engine.active = false;
            engine.queued = engine.queued.saturating_sub(1);
        };

        let _ = event_tx.send(NativeEventV1::new(
            "local_speech_event",
            serde_json::json!({
                "runId": run_id,
                "eventKind": "started",
                "partIndex": part_index,
                "isSimulated": false,
            }),
        ));

        let window = match audio::load_audio_window(
            &audio::AudioWindowRequest {
                source_path,
                source_sha256,
                start_ms,
                end_ms,
            },
            &self.audio_root,
        ) {
            Ok(window) => window,
            Err(_) => {
                finish(self);
                return Err(EngineError::AudioUnavailable);
            }
        };

        if self.stop_signal.load(Ordering::Relaxed) {
            finish(self);
            let _ = event_tx.send(NativeEventV1::new(
                "local_speech_event",
                serde_json::json!({
                    "runId": run_id,
                    "eventKind": "cancelled",
                    "partIndex": part_index,
                    "isSimulated": false,
                }),
            ));
            return Err(EngineError::Cancelled);
        }

        if self.model.is_none() {
            self.model = match model::WhisperModel::load(
                &self.model_path,
                &self.manifest_entry.sha256,
                &self.language,
                self.thread_pool_size as usize,
            ) {
                Ok(model) => Some(model),
                Err(_) => {
                    finish(self);
                    return Err(EngineError::ModelUnavailable);
                }
            };
        }

        let result = self
            .model
            .as_mut()
            .ok_or(EngineError::ModelUnavailable)
            .and_then(|model| {
                model
                    .transcribe(&window.samples_16khz_mono, window.source_start_ms)
                    .map_err(|_| EngineError::ModelTranscriptionFailed)
            });

        finish(self);
        match result {
            Ok(segments) => {
                let _ = event_tx.send(NativeEventV1::new(
                    "local_speech_event",
                    serde_json::json!({
                        "runId": run_id,
                        "eventKind": "window_complete",
                        "partIndex": part_index,
                        "isSimulated": false,
                    }),
                ));
                Ok(segments)
            }
            Err(error) => {
                let _ = event_tx.send(NativeEventV1::new(
                    "local_speech_event",
                    serde_json::json!({
                        "runId": run_id,
                        "eventKind": "window_failed",
                        "partIndex": part_index,
                        "isSimulated": false,
                    }),
                ));
                Err(error)
            }
        }
    }

    pub fn cancel(&self) {
        self.stop_signal.store(true, Ordering::Relaxed);
    }

    pub fn get_state(&self) -> serde_json::Value {
        serde_json::json!({
            "active": self.active,
            "queued": self.queued,
            "isSimulated": false,
            "memoryBudgetMb": self.memory_budget_mb,
            "threadPoolSize": self.thread_pool_size,
            "modelId": self.manifest_entry.model_id,
            "language": self.language,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::protocol::NativeEventV1;
    use crate::runtime::BoundedEventDispatcher;

    fn make_entry(lang: &str) -> ManifestEntry {
        ManifestEntry {
            model_id: "test-model".into(),
            language: lang.to_string(),
            engine_type: "whisper_cpp_compat".into(),
            path: "models/test.bin".into(),
            sha256: "a".repeat(64),
            max_concurrent_streams: 2,
            license_provenance: super::super::manifest::LicenseProvenance {
                license: "MIT".into(),
                reviewed_by: "eng".into(),
                reviewed_at: "2026-01-01T00:00:00.000Z".into(),
            },
        }
    }

    #[test]
    fn init_succeeds_without_loading_untrusted_model() {
        let result = LocalSpeechEngine::init(make_entry("vi"), "vi".into(), EngineOpts::default());
        assert!(result.is_ok());
    }

    #[test]
    fn init_rejects_language_mismatch() {
        let result = LocalSpeechEngine::init(make_entry("en"), "vi".into(), EngineOpts::default());
        assert!(result.is_err());
    }

    #[tokio::test]
    async fn transcribe_requires_verified_audio() {
        let mut engine =
            LocalSpeechEngine::init(make_entry("vi"), "vi".into(), EngineOpts::default()).unwrap();
        let (tx, _rx) = BoundedEventDispatcher::new(4);
        let result = engine
            .transcribe_window(
                "run-1",
                0,
                0,
                60_000,
                "hash",
                PathBuf::from("missing.wav"),
                "a".repeat(64),
                &tx,
            )
            .await;
        assert!(matches!(result, Err(EngineError::AudioUnavailable)));
    }

    #[tokio::test]
    async fn cancel_is_observed_before_io() {
        let mut engine =
            LocalSpeechEngine::init(make_entry("en"), "en".into(), EngineOpts::default()).unwrap();
        let (tx, _rx) = BoundedEventDispatcher::new(4);
        engine.cancel();
        let result = engine
            .transcribe_window(
                "run-2",
                0,
                0,
                300_000,
                "hash",
                PathBuf::from("missing.wav"),
                "a".repeat(64),
                &tx,
            )
            .await;
        assert!(matches!(result, Err(EngineError::Cancelled)));
    }

    #[test]
    fn state_is_content_free_and_real() {
        let engine =
            LocalSpeechEngine::init(make_entry("vi"), "vi".into(), EngineOpts::default()).unwrap();
        let state = engine.get_state().to_string();
        assert!(state.contains("\"isSimulated\":false"));
        assert!(!state.contains("audio"));
        assert!(!state.contains("transcript"));
    }

    #[test]
    fn local_speech_event_sink_records_backpressure_without_changing_engine_state() {
        let (tx, _rx) = BoundedEventDispatcher::new(1);
        assert!(
            tx.send(NativeEventV1::new(
                "local_speech_event",
                serde_json::json!({})
            ))
            .is_ok()
        );
        assert!(
            tx.send(NativeEventV1::new(
                "local_speech_event",
                serde_json::json!({})
            ))
            .is_err()
        );
        assert_eq!(tx.dropped_events(), 1);
    }
}
