// kms-native audio capture — Capture Manager.
//
// Orchestrates capture stream threads, performs downmixing, persistent
// resampling, monotonic timeline alignment, level metering, and chunk writing.

use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};
use tokio::sync::{mpsc, Mutex};
use uuid::Uuid;

use crate::capture::device::{
    enumerate_devices, get_default_device, resolve_requested_device_id,
};
use crate::capture::wasapi::{WasapiCaptureStream, CaptureConfig};
use crate::capture::resample::AudioResampler;
use crate::capture::timeline::TimelineAligner;
use crate::capture::mix::LevelMeter;
use crate::capture::monitor::DeviceMonitor;
use crate::storage::StorageManager;
use crate::protocol::NativeEventV1;

pub enum CaptureMessage {
    Samples { source: String, data: Vec<f32> },
    Error { source: String, error: String },
}

fn is_nonfatal_capture_error(error: &str) -> bool {
    error.starts_with("CAPTURE_FLAG:") || error.starts_with("CAPTURE_OVERFLOW:")
}

fn stop_commit_status(commit_failed: bool) -> &'static str {
    if commit_failed { "recovery_required" } else { "committed" }
}

pub struct CaptureManager {
    session_id: String,
    meeting_id: String,
    mic_stream: Option<WasapiCaptureStream>,
    sys_stream: Option<WasapiCaptureStream>,
    device_monitor: Option<DeviceMonitor>,
    stop_signal: Arc<AtomicBool>,
    
    // Aligner and resamplers
    mic_aligner: TimelineAligner,
    sys_aligner: TimelineAligner,
    mic_resampler: AudioResampler,
    sys_resampler: AudioResampler,

    // Buffers and indices
    mic_buffer: Vec<f32>,
    sys_buffer: Vec<f32>,
    mic_chunk_index: u64,
    sys_chunk_index: u64,

    // Real-time levels
    mic_level: LevelMeter,
    sys_level: LevelMeter,
}

impl CaptureManager {
    pub async fn start(
        meeting_id: String,
        mic_device_id: Option<String>,
        sys_device_id: Option<String>,
        storage: Arc<Mutex<Option<StorageManager>>>,
        event_sender: mpsc::UnboundedSender<NativeEventV1>,
    ) -> Result<Arc<Mutex<Self>>, String> {
        let session_id = Uuid::new_v4().to_string();

        // 1. Verify storage manager is initialized
        let has_storage = storage.lock().await.is_some();
        if !has_storage {
            return Err("Storage manager not initialized".to_string());
        }

        // 2. Resolve selected devices fail-closed. An unavailable selected
        // endpoint must not silently become a different/default source.
        let devices = enumerate_devices()?;
        let mic_default = if mic_device_id.as_deref() == Some("default") {
            Some(get_default_device("microphone")?.device_id)
        } else {
            None
        };
        let sys_default = if sys_device_id.as_deref() == Some("default") {
            Some(get_default_device("system_audio")?.device_id)
        } else {
            None
        };
        let mic_id = resolve_requested_device_id(
            mic_device_id.as_deref(),
            "microphone",
            &devices,
            mic_default.as_deref(),
        )?;
        let sys_id = resolve_requested_device_id(
            sys_device_id.as_deref(),
            "system_audio",
            &devices,
            sys_default.as_deref(),
        )?;

        if mic_id.is_none() && sys_id.is_none() {
            return Err("At least one audio capture source (mic or system) must be selected".to_string());
        }

        // 3. Query native formats to initialize resamplers
        let mut mic_rate = 48000;
        let mut sys_rate = 48000;

        if let Some(ref id) = mic_id
            && let Some(dev) = devices.iter().find(|d| &d.device_id == id) {
            mic_rate = dev.sample_rate;
        }
        if let Some(ref id) = sys_id
            && let Some(dev) = devices.iter().find(|d| &d.device_id == id) {
            sys_rate = dev.sample_rate;
        }

        let mic_resampler = AudioResampler::new(mic_rate, 48000)?;
        let sys_resampler = AudioResampler::new(sys_rate, 48000)?;

        let stop_signal = Arc::new(AtomicBool::new(false));
        let (tx, mut rx) = mpsc::channel::<CaptureMessage>(2000);

        // 4. Start WASAPI streams
        let mut mic_stream = None;
        if let Some(id) = mic_id {
            let stream_sender = mpsc::channel::<Result<Vec<f32>, String>>(100);
            let stream = WasapiCaptureStream::start(
                CaptureConfig {
                    device_id: id,
                    device_type: "microphone".to_string(),
                },
                stream_sender.0,
            )?;
            
            // Spawn intermediate forwarding task
            let tx_forward = tx.clone();
            tokio::spawn(async move {
                let mut stream_rx = stream_sender.1;
                while let Some(res) = stream_rx.recv().await {
                    match res {
                        Ok(samples) => {
                            let _ = tx_forward.send(CaptureMessage::Samples {
                                source: "microphone".to_string(),
                                data: samples,
                            }).await;
                        }
                        Err(e) => {
                            let _ = tx_forward.send(CaptureMessage::Error {
                                source: "microphone".to_string(),
                                error: e,
                            }).await;
                        }
                    }
                }
            });
            mic_stream = Some(stream);
        }

        let mut sys_stream = None;
        if let Some(id) = sys_id {
            let stream_sender = mpsc::channel::<Result<Vec<f32>, String>>(100);
            let stream = WasapiCaptureStream::start(
                CaptureConfig {
                    device_id: id,
                    device_type: "system_audio".to_string(),
                },
                stream_sender.0,
            )?;

            // Spawn intermediate forwarding task
            let tx_forward = tx.clone();
            tokio::spawn(async move {
                let mut stream_rx = stream_sender.1;
                while let Some(res) = stream_rx.recv().await {
                    match res {
                        Ok(samples) => {
                            let _ = tx_forward.send(CaptureMessage::Samples {
                                source: "system_audio".to_string(),
                                data: samples,
                            }).await;
                        }
                        Err(e) => {
                            let _ = tx_forward.send(CaptureMessage::Error {
                                source: "system_audio".to_string(),
                                error: e,
                            }).await;
                        }
                    }
                }
            });
            sys_stream = Some(stream);
        }

        // Start device monitor
        let device_monitor = Some(DeviceMonitor::start(event_sender.clone())?);

        let manager = Arc::new(Mutex::new(Self {
            session_id: session_id.clone(),
            meeting_id: meeting_id.clone(),
            mic_stream,
            sys_stream,
            device_monitor,
            stop_signal: stop_signal.clone(),
            mic_aligner: TimelineAligner::new(),
            sys_aligner: TimelineAligner::new(),
            mic_resampler,
            sys_resampler,
            mic_buffer: Vec::new(),
            sys_buffer: Vec::new(),
            mic_chunk_index: 0,
            sys_chunk_index: 0,
            mic_level: LevelMeter::compute(&[]),
            sys_level: LevelMeter::compute(&[]),
        }));

        // 5. Emit start capture event
        let _ = event_sender.send(NativeEventV1::new(
            "capture_event",
            serde_json::json!({
                "sessionId": session_id.clone(),
                "eventKind": "started",
                "isSimulated": false,
                "details": "Physical capture started successfully"
            }),
        ));

        // 6. Spawn central dispatcher loop
        let manager_clone = manager.clone();
        tokio::spawn(async move {
            let chunk_size_limit = 48000 * 5; // 5 seconds chunks

            while let Some(msg) = rx.recv().await {
                // A stop request must drain samples already handed off by the
                // realtime workers before the final buffers are committed.
                if stop_signal.load(Ordering::SeqCst) && rx.is_empty() {
                    break;
                }

                let mut mgr = manager_clone.lock().await;

                match msg {
                    CaptureMessage::Samples { source, data } => {
                        if source == "microphone" {
                            if let Ok(resampled) = mgr.mic_resampler.process(&data) {
                                let (gap, aligned, _state) = mgr.mic_aligner.align(&resampled);
                                if gap > 0 {
                                    let _ = event_sender.send(NativeEventV1::new(
                                        "capture_event",
                                        serde_json::json!({
                                            "sessionId": mgr.session_id.clone(),
                                            "eventKind": "gap_detected",
                                            "chunkIndex": mgr.mic_chunk_index,
                                            "isSimulated": false,
                                            "details": format!("Gap of {} samples detected on microphone", gap)
                                        }),
                                    ));
                                }
                                mgr.mic_level = LevelMeter::compute(&resampled);
                                mgr.mic_buffer.extend_from_slice(&aligned);

                                // Commit chunk if full
                                if mgr.mic_buffer.len() >= chunk_size_limit {
                                    let chunk: Vec<f32> = mgr.mic_buffer.drain(0..chunk_size_limit).collect();
                                    let idx = mgr.mic_chunk_index;
                                    mgr.mic_chunk_index += 1;
                                    
                                    let meeting = mgr.meeting_id.clone();
                                    let storage_arc = storage.clone();
                                    let sender_arc = event_sender.clone();
                                    let session = mgr.session_id.clone();
                                    
                                    tokio::spawn(async move {
                                        let _ = Self::write_chunk_file(&meeting, "microphone", idx, &chunk, storage_arc, sender_arc, session).await;
                                    });
                                }
                            }
                        } else if source == "system_audio"
                            && let Ok(resampled) = mgr.sys_resampler.process(&data) {
                                let (gap, aligned, _state) = mgr.sys_aligner.align(&resampled);
                                if gap > 0 {
                                    let _ = event_sender.send(NativeEventV1::new(
                                        "capture_event",
                                        serde_json::json!({
                                            "sessionId": mgr.session_id.clone(),
                                            "eventKind": "gap_detected",
                                            "chunkIndex": mgr.sys_chunk_index,
                                            "isSimulated": false,
                                            "details": format!("Gap of {} samples detected on system audio", gap)
                                        }),
                                    ));
                                }
                                mgr.sys_level = LevelMeter::compute(&resampled);
                                mgr.sys_buffer.extend_from_slice(&aligned);

                                // Commit chunk if full
                                if mgr.sys_buffer.len() >= chunk_size_limit {
                                    let chunk: Vec<f32> = mgr.sys_buffer.drain(0..chunk_size_limit).collect();
                                    let idx = mgr.sys_chunk_index;
                                    mgr.sys_chunk_index += 1;
                                    
                                    let meeting = mgr.meeting_id.clone();
                                    let storage_arc = storage.clone();
                                    let sender_arc = event_sender.clone();
                                    let session = mgr.session_id.clone();
                                    
                                    tokio::spawn(async move {
                                        let _ = Self::write_chunk_file(&meeting, "system_audio", idx, &chunk, storage_arc, sender_arc, session).await;
                                    });
                                }
                        }
                    }
                    CaptureMessage::Error { source, error } => {
                        let nonfatal = is_nonfatal_capture_error(&error);
                        let _ = event_sender.send(NativeEventV1::new(
                            if nonfatal { "capture_event" } else { "error" },
                            serde_json::json!({
                                "code": if nonfatal { "CAPTURE_GAP" } else { "CAPTURE_ERROR" },
                                "message": format!("Error in capture source {}: {}", source, error),
                                "category": "capture",
                                "fatal": !nonfatal
                            }),
                        ));
                    }
                }
            }
        });

        Ok(manager)
    }

    /// Stops the capture session, flushes any remaining buffers, and cleans up streams.
    pub async fn stop_session(&mut self, storage: Arc<Mutex<Option<StorageManager>>>, event_sender: mpsc::UnboundedSender<NativeEventV1>) -> (u64, u64) {
        self.stop_signal.store(true, Ordering::SeqCst);

        // Stop streams
        if let Some(mut stream) = self.mic_stream.take() {
            stream.stop();
        }
        if let Some(mut stream) = self.sys_stream.take() {
            stream.stop();
        }
        if let Some(mut monitor) = self.device_monitor.take() {
            monitor.stop();
        }

        // A streaming resampler may retain a partial input block. Flush it at
        // the source boundary so acknowledged samples are not silently lost.
        if let Ok(tail) = self.mic_resampler.flush()
            && !tail.is_empty() {
            let (_gap, aligned, _state) = self.mic_aligner.align(&tail);
            self.mic_buffer.extend_from_slice(&aligned);
        }
        if let Ok(tail) = self.sys_resampler.flush()
            && !tail.is_empty() {
            let (_gap, aligned, _state) = self.sys_aligner.align(&tail);
            self.sys_buffer.extend_from_slice(&aligned);
        }

        let mut commit_failed = false;

        // Flush remaining mic samples
        if !self.mic_buffer.is_empty() {
            let chunk = std::mem::take(&mut self.mic_buffer);
            let idx = self.mic_chunk_index;
            self.mic_chunk_index += 1;
            if Self::write_chunk_file(&self.meeting_id, "microphone", idx, &chunk, storage.clone(), event_sender.clone(), self.session_id.clone()).await.is_err() {
                commit_failed = true;
            }
        }

        // Flush remaining system audio samples
        if !self.sys_buffer.is_empty() {
            let chunk = std::mem::take(&mut self.sys_buffer);
            let idx = self.sys_chunk_index;
            self.sys_chunk_index += 1;
            if Self::write_chunk_file(&self.meeting_id, "system_audio", idx, &chunk, storage.clone(), event_sender.clone(), self.session_id.clone()).await.is_err() {
                commit_failed = true;
            }
        }

        let _ = event_sender.send(NativeEventV1::new(
            "capture_event",
            serde_json::json!({
                "sessionId": self.session_id.clone(),
                "eventKind": "stopped",
                "isSimulated": false,
                "details": if commit_failed { "Physical capture stopped; recovery is required for one or more uncommitted chunks" } else { "Physical capture stopped successfully" },
                "commitStatus": stop_commit_status(commit_failed)
            }),
        ));

        (self.mic_chunk_index, self.sys_chunk_index)
    }

    /// Retrieve the diagnostic state of levels, gaps, and drift.
    pub fn get_metrics(&self) -> serde_json::Value {
        serde_json::json!({
            "mic": {
                "rms": self.mic_level.rms(),
                "peak": self.mic_level.peak(),
                "clipped": self.mic_level.clipped(),
                "gapCount": self.mic_aligner.state().gap_count,
            },
            "sys": {
                "rms": self.sys_level.rms(),
                "peak": self.sys_level.peak(),
                "clipped": self.sys_level.clipped(),
                "gapCount": self.sys_aligner.state().gap_count,
            },
            "driftSamples": self.mic_aligner.state().drift_samples,
        })
    }

    /// Helper to convert floats to 16-bit PCM and write a WAV file (with .webm suffix for contract conformance)
    async fn write_chunk_file(
        meeting_id: &str,
        source: &str,
        chunk_index: u64,
        samples: &[f32],
        storage: Arc<Mutex<Option<StorageManager>>>,
        event_sender: mpsc::UnboundedSender<NativeEventV1>,
        session_id: String,
    ) -> Result<(), String> {
        let pcm_samples: Vec<i16> = samples
            .iter()
            .map(|&s| {
                let clamped = s.clamp(-1.0, 1.0);
                if clamped >= 0.0 {
                    (clamped * 32767.0) as i16
                } else {
                    (clamped * 32768.0) as i16
                }
            })
            .collect();

        // 44-byte WAV header
        let mut wav_bytes = Vec::with_capacity(44 + pcm_samples.len() * 2);
        let subchunk2_size = pcm_samples.len() * 2;
        let chunk_size = 36 + subchunk2_size;

        wav_bytes.extend_from_slice(b"RIFF");
        wav_bytes.extend_from_slice(&(chunk_size as u32).to_le_bytes());
        wav_bytes.extend_from_slice(b"WAVE");
        wav_bytes.extend_from_slice(b"fmt ");
        wav_bytes.extend_from_slice(&16u32.to_le_bytes()); // subchunk1size (16 for PCM)
        wav_bytes.extend_from_slice(&1u16.to_le_bytes());  // AudioFormat = 1 (PCM)
        wav_bytes.extend_from_slice(&1u16.to_le_bytes());  // Channels = 1 (mono)
        wav_bytes.extend_from_slice(&48000u32.to_le_bytes()); // SampleRate = 48000
        wav_bytes.extend_from_slice(&96000u32.to_le_bytes()); // ByteRate = 48000 * 2
        wav_bytes.extend_from_slice(&2u16.to_le_bytes());  // BlockAlign = 2
        wav_bytes.extend_from_slice(&16u16.to_le_bytes()); // BitsPerSample = 16
        wav_bytes.extend_from_slice(b"data");
        wav_bytes.extend_from_slice(&(subchunk2_size as u32).to_le_bytes());

        // Append PCM samples
        for &s in &pcm_samples {
            wav_bytes.extend_from_slice(&s.to_le_bytes());
        }

        // Commit file to storage
        let storage_guard = storage.lock().await;
        let Some(mgr) = storage_guard.as_ref() else {
            return Err("Storage manager missing during write".to_string());
        };

        // Standard chunk naming pattern conformant to DB schema
        let filename = format!("chunks/{}_{}_{:03}.webm", meeting_id, source, chunk_index);

        match mgr.atomic_write(&filename, &wav_bytes) {
            Ok((sha256, byte_length)) => {
                // Add manifest entry
                if let Err(error) = mgr.manifest_add_entry(
                    meeting_id,
                    source,
                    chunk_index as i64,
                    &filename,
                    &sha256,
                    byte_length as i64,
                ) {
                    let _ = event_sender.send(NativeEventV1::new(
                        "error",
                        serde_json::json!({
                            "code": "MANIFEST_FAILED",
                            "message": format!("Failed to register chunk manifest {}: {}", filename, error),
                            "category": "storage",
                            "fatal": true
                        }),
                    ));
                    return Err(error.to_string());
                }

                // Notify Electron
                let _ = event_sender.send(NativeEventV1::new(
                    "capture_event",
                    serde_json::json!({
                        "sessionId": session_id,
                        "eventKind": "chunk_committed",
                        "chunkIndex": chunk_index,
                        "byteLength": byte_length,
                        "sha256": sha256,
                        "isSimulated": false,
                        "details": format!("Chunk committed to {}", filename)
                    }),
                ));

                Ok(())
            }
            Err(e) => {
                let _ = event_sender.send(NativeEventV1::new(
                    "error",
                    serde_json::json!({
                        "code": "WRITE_FAILED",
                        "message": format!("Failed to commit chunk file {}: {}", filename, e),
                        "category": "storage",
                        "fatal": false
                    }),
                ));
                Err(e.to_string())
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn capture_flags_and_overflow_are_nonfatal_diagnostics() {
        assert!(is_nonfatal_capture_error("CAPTURE_FLAG:data_discontinuity:frames=10"));
        assert!(is_nonfatal_capture_error("CAPTURE_OVERFLOW:frames=10"));
        assert!(!is_nonfatal_capture_error("device disconnected"));
    }

    #[test]
    fn stop_status_reports_commit_recovery_requirement() {
        assert_eq!(stop_commit_status(false), "committed");
        assert_eq!(stop_commit_status(true), "recovery_required");
    }
}
