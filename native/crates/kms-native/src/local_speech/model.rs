use std::path::Path;
use std::fs;

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
            || !expected_sha256.chars().all(|character| character.is_ascii_hexdigit())
        {
            return Err(ModelError::Load);
        }
        if !path.is_file() {
            return Err(ModelError::Unavailable);
        }

        let bytes = fs::read(path).map_err(|_| ModelError::Unavailable)?;
        let actual_sha256 = format!("{:x}", Sha256::digest(&bytes));
        if !actual_sha256.eq_ignore_ascii_case(expected_sha256) {
            return Err(ModelError::Load);
        }

        let context = WhisperContext::new_with_params(
            path,
            WhisperContextParameters::default(),
        )
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
        params.set_token_timestamps(true);
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
