use std::{fs::File, io::Read, path::Path};

use serde::Serialize;
use sha2::{Digest, Sha256};
use thiserror::Error;
use whisper_rs::{FullParams, SamplingStrategy, WhisperContext, WhisperContextParameters};

#[derive(Debug, Clone, Serialize)]
pub struct SyntheticSegment {
    #[serde(rename = "speakerId")]
    pub speaker_id: String,
    pub text: String,
    #[serde(rename = "startMs")]
    pub start_ms: i64,
    #[serde(rename = "endMs")]
    pub end_ms: i64,
    #[serde(rename = "sequenceInPart")]
    pub sequence_in_part: i32,
    #[serde(rename = "isSimulated")]
    pub is_simulated: bool,
}

#[derive(Debug, Error)]
pub enum ModelError {
    #[error("model unavailable")]
    Unavailable,
    #[error("model load failed")]
    Load,
    #[error("transcription failed")]
    Transcribe,
    #[error("unsupported language")]
    Language,
}

pub struct WhisperModel {
    context: WhisperContext,
    language: String,
    thread_count: usize,
}

fn hash_model_file(path: &Path) -> Result<String, ModelError> {
    let mut file = File::open(path).map_err(|_| ModelError::Unavailable)?;
    let mut hasher = Sha256::new();
    let mut buffer = [0_u8; 64 * 1024];

    loop {
        let count = file
            .read(&mut buffer)
            .map_err(|_| ModelError::Unavailable)?;
        if count == 0 {
            break;
        }
        hasher.update(&buffer[..count]);
    }

    Ok(format!("{:x}", hasher.finalize()))
}

impl WhisperModel {
    pub fn load(
        path: &Path,
        expected_sha256: &str,
        language: &str,
        thread_count: usize,
    ) -> Result<Self, ModelError> {
        if language != "vi" && language != "en" || thread_count == 0 {
            return Err(ModelError::Language);
        }
        if expected_sha256.len() != 64
            || !expected_sha256
                .chars()
                .all(|character| character.is_ascii_hexdigit())
        {
            return Err(ModelError::Load);
        }
        if !path.is_file() {
            return Err(ModelError::Unavailable);
        }

        let actual_sha256 = hash_model_file(path)?;
        if !actual_sha256.eq_ignore_ascii_case(expected_sha256) {
            return Err(ModelError::Load);
        }

        let context = WhisperContext::new_with_params(path, WhisperContextParameters::default())
            .map_err(|_| ModelError::Load)?;

        Ok(Self {
            context,
            language: language.to_string(),
            thread_count,
        })
    }

    pub fn transcribe(
        &mut self,
        samples_16khz_mono: &[f32],
        source_start_ms: i64,
    ) -> Result<Vec<SyntheticSegment>, ModelError> {
        if samples_16khz_mono.is_empty() {
            return Ok(Vec::new());
        }

        let mut state = self.context.create_state().map_err(|_| ModelError::Load)?;
        let mut params = FullParams::new(SamplingStrategy::Greedy { best_of: 0 });
        params.set_n_threads(self.thread_count as i32);
        params.set_language(Some(&self.language));
        params.set_translate(false);
        params.set_print_special(false);
        params.set_print_progress(false);
        params.set_print_realtime(false);
        params.set_print_timestamps(false);
        // Segment timestamps already provide the timeline needed by the app.
        // Token-level alignment enables Whisper's experimental DTW path and
        // makes normal local transcription prohibitively slow on CPU.
        params.set_token_timestamps(false);
        state
            .full(params, samples_16khz_mono)
            .map_err(|_| ModelError::Transcribe)?;

        let mut segments = Vec::new();
        for (sequence, segment) in state.as_iter().enumerate() {
            let text = segment.to_string().trim().to_string();
            if text.is_empty() {
                continue;
            }
            segments.push(SyntheticSegment {
                speaker_id: "unknown".to_string(),
                text,
                start_ms: source_start_ms + segment.start_timestamp(),
                end_ms: source_start_ms + segment.end_timestamp(),
                sequence_in_part: sequence as i32,
                is_simulated: false,
            });
        }
        Ok(segments)
    }
}

#[cfg(test)]
mod tests {
    use super::{hash_model_file, ModelError};

    #[test]
    fn hashes_model_file_incrementally() {
        let file = tempfile::NamedTempFile::new().expect("temporary model file");
        std::fs::write(file.path(), b"abc").expect("write model bytes");

        assert_eq!(
            hash_model_file(file.path()).expect("hash model file"),
            "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
        );
    }

    #[test]
    fn missing_model_file_is_unavailable() {
        let directory = tempfile::tempdir().expect("temporary directory");
        assert!(matches!(
            hash_model_file(&directory.path().join("missing.bin")),
            Err(ModelError::Unavailable)
        ));
    }
}
