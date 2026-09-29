use sha2::{Digest, Sha256};
use std::fs;
use std::io::Read;
use std::path::{Path, PathBuf};
use thiserror::Error;

const MAX_AUDIO_SOURCE_BYTES: u64 = 32 * 1024 * 1024;

#[derive(Debug, Clone)]
pub struct AudioWindowRequest {
    pub source_path: PathBuf,
    pub source_sha256: String,
    pub start_ms: i64,
    pub end_ms: i64,
}

#[derive(Debug, Clone)]
pub struct AudioSourceRequest {
    pub source_path: PathBuf,
    pub source_sha256: String,
    pub start_ms: i64,
    pub end_ms: Option<i64>,
}

#[derive(Debug, Clone)]
pub struct AudioWindow {
    pub samples_16khz_mono: Vec<f32>,
    pub source_start_ms: i64,
    pub source_end_ms: i64,
}

#[derive(Debug, Error, PartialEq, Eq)]
pub enum AudioError {
    #[error("audio source is invalid")]
    InvalidSource,
    #[error("audio source integrity check failed")]
    Integrity,
    #[error("audio format is unsupported or malformed")]
    Format,
    #[error("audio range is invalid")]
    Range,
    #[error("audio source is unavailable")]
    Unavailable,
}

pub fn load_audio_window(
    request: &AudioWindowRequest,
    audio_root: &Path,
) -> Result<AudioWindow, AudioError> {
    load_audio_source(
        &AudioSourceRequest {
            source_path: request.source_path.clone(),
            source_sha256: request.source_sha256.clone(),
            start_ms: request.start_ms,
            end_ms: Some(request.end_ms),
        },
        audio_root,
    )
}

pub fn load_audio_source(
    request: &AudioSourceRequest,
    audio_root: &Path,
) -> Result<AudioWindow, AudioError> {
    if request.start_ms < 0
        || request
            .end_ms
            .is_some_and(|end_ms| end_ms <= request.start_ms)
    {
        return Err(AudioError::Range);
    }
    if request.source_path.is_absolute()
        || request
            .source_path
            .components()
            .any(|component| !matches!(component, std::path::Component::Normal(_)))
    {
        return Err(AudioError::InvalidSource);
    }

    let root = audio_root
        .canonicalize()
        .map_err(|_| AudioError::Unavailable)?;
    let path = root.join(&request.source_path);
    let canonical = path.canonicalize().map_err(|_| AudioError::Unavailable)?;
    if !canonical.starts_with(&root) {
        return Err(AudioError::InvalidSource);
    }

    let file = fs::File::open(&canonical).map_err(|_| AudioError::Unavailable)?;
    if file.metadata().map_err(|_| AudioError::Unavailable)?.len() > MAX_AUDIO_SOURCE_BYTES {
        return Err(AudioError::Format);
    }
    let mut bytes = Vec::new();
    file.take(MAX_AUDIO_SOURCE_BYTES + 1)
        .read_to_end(&mut bytes)
        .map_err(|_| AudioError::Unavailable)?;
    if bytes.len() as u64 > MAX_AUDIO_SOURCE_BYTES {
        return Err(AudioError::Format);
    }
    let mut hasher = Sha256::new();
    hasher.update(&bytes);
    let actual_hash = format!("{:x}", hasher.finalize());
    if !actual_hash.eq_ignore_ascii_case(&request.source_sha256) {
        return Err(AudioError::Integrity);
    }

    let decoded = if bytes.starts_with(b"RIFF") {
        ParsedWav::parse(&bytes)?.decode_mono(&bytes)?
    } else {
        webm::decode_opus(&bytes).map_err(|_| AudioError::Format)?
    };
    let total_frames = decoded.samples.len();
    let start_frame = frame_from_ms(request.start_ms, decoded.sample_rate)?;
    let end_frame = request
        .end_ms
        .map(|end_ms| frame_from_ms(end_ms, decoded.sample_rate))
        .transpose()?
        .unwrap_or(total_frames);
    if start_frame >= end_frame || end_frame > total_frames || start_frame >= total_frames {
        return Err(AudioError::Range);
    }

    let mono = &decoded.samples[start_frame..end_frame];

    let target_len = (mono.len() as u64 * 16_000).div_ceil(decoded.sample_rate as u64) as usize;
    let mut resampler = crate::capture::resample::AudioResampler::new(decoded.sample_rate, 16_000)
        .map_err(|_| AudioError::Format)?;
    let mut samples_16khz_mono = resampler.process(&mono).map_err(|_| AudioError::Format)?;
    samples_16khz_mono.extend(resampler.flush().map_err(|_| AudioError::Format)?);
    samples_16khz_mono.resize(target_len, 0.0);
    samples_16khz_mono.truncate(target_len);

    Ok(AudioWindow {
        samples_16khz_mono,
        source_start_ms: request.start_ms,
        source_end_ms: ((end_frame as u128 * 1_000).div_ceil(decoded.sample_rate as u128))
            .try_into()
            .map_err(|_| AudioError::Range)?,
    })
}

fn frame_from_ms(milliseconds: i64, sample_rate: u32) -> Result<usize, AudioError> {
    let frame = u64::try_from(milliseconds)
        .map_err(|_| AudioError::Range)?
        .checked_mul(u64::from(sample_rate))
        .ok_or(AudioError::Range)?
        / 1_000;
    usize::try_from(frame).map_err(|_| AudioError::Range)
}

struct DecodedAudio {
    samples: Vec<f32>,
    sample_rate: u32,
}

#[path = "audio/webm.rs"]
mod webm;

struct ParsedWav {
    data_start: usize,
    data_len: usize,
    channels: u16,
    sample_rate: u32,
    block_align: u16,
    bytes_per_sample: usize,
    audio_format: u16,
}

impl ParsedWav {
    fn parse(bytes: &[u8]) -> Result<Self, AudioError> {
        if bytes.len() < 12 || &bytes[0..4] != b"RIFF" || &bytes[8..12] != b"WAVE" {
            return Err(AudioError::Format);
        }
        let declared_end = 8usize
            .checked_add(read_u32(bytes, 4)? as usize)
            .ok_or(AudioError::Format)?;
        if declared_end > bytes.len() {
            return Err(AudioError::Format);
        }

        let mut cursor = 12usize;
        let mut fmt = None;
        let mut data = None;
        while cursor.checked_add(8).ok_or(AudioError::Format)? <= declared_end {
            let chunk_size = read_u32(bytes, cursor + 4)? as usize;
            let chunk_start = cursor + 8;
            let chunk_end = chunk_start
                .checked_add(chunk_size)
                .ok_or(AudioError::Format)?;
            if chunk_end > declared_end {
                return Err(AudioError::Format);
            }
            match &bytes[cursor..cursor + 4] {
                b"fmt " => fmt = Some((chunk_start, chunk_size)),
                b"data" => data = Some((chunk_start, chunk_size)),
                _ => {}
            }
            cursor = chunk_end + (chunk_size & 1);
        }

        let (fmt_start, fmt_len) = fmt.ok_or(AudioError::Format)?;
        if fmt_len < 16 {
            return Err(AudioError::Format);
        }
        let audio_format = read_u16(bytes, fmt_start)?;
        let channels = read_u16(bytes, fmt_start + 2)?;
        let sample_rate = read_u32(bytes, fmt_start + 4)?;
        let block_align = read_u16(bytes, fmt_start + 12)?;
        let bits_per_sample = read_u16(bytes, fmt_start + 14)?;
        if channels == 0
            || sample_rate == 0
            || !matches!((audio_format, bits_per_sample), (1, 16) | (3, 32))
            || block_align as usize != channels as usize * (bits_per_sample as usize / 8)
        {
            return Err(AudioError::Format);
        }
        let (data_start, data_len) = data.ok_or(AudioError::Format)?;
        if data_len == 0 || data_len % block_align as usize != 0 {
            return Err(AudioError::Format);
        }
        Ok(Self {
            data_start,
            data_len,
            channels,
            sample_rate,
            block_align,
            bytes_per_sample: bits_per_sample as usize / 8,
            audio_format,
        })
    }

    fn decode_mono(&self, bytes: &[u8]) -> Result<DecodedAudio, AudioError> {
        let frames = self.data_len / self.block_align as usize;
        let mut samples = Vec::with_capacity(frames);
        for frame in 0..frames {
            let frame_offset = self.data_start + frame * self.block_align as usize;
            let mut sum = 0.0f32;
            for channel in 0..self.channels as usize {
                let offset = frame_offset + channel * self.bytes_per_sample;
                sum += self.sample(&bytes[offset..offset + self.bytes_per_sample])?;
            }
            samples.push((sum / self.channels as f32).clamp(-1.0, 1.0));
        }
        Ok(DecodedAudio {
            samples,
            sample_rate: self.sample_rate,
        })
    }

    fn sample(&self, bytes: &[u8]) -> Result<f32, AudioError> {
        let value = match (self.audio_format, self.bytes_per_sample) {
            (1, 2) => {
                i16::from_le_bytes(bytes.try_into().map_err(|_| AudioError::Format)?) as f32
                    / 32_768.0
            }
            (3, 4) => f32::from_le_bytes(bytes.try_into().map_err(|_| AudioError::Format)?),
            _ => return Err(AudioError::Format),
        };
        if value.is_finite() {
            Ok(value)
        } else {
            Err(AudioError::Format)
        }
    }
}

fn read_u16(bytes: &[u8], offset: usize) -> Result<u16, AudioError> {
    let end = offset.checked_add(2).ok_or(AudioError::Format)?;
    bytes
        .get(offset..end)
        .and_then(|value| value.try_into().ok())
        .map(u16::from_le_bytes)
        .ok_or(AudioError::Format)
}

fn read_u32(bytes: &[u8], offset: usize) -> Result<u32, AudioError> {
    let end = offset.checked_add(4).ok_or(AudioError::Format)?;
    bytes
        .get(offset..end)
        .and_then(|value| value.try_into().ok())
        .map(u32::from_le_bytes)
        .ok_or(AudioError::Format)
}

#[cfg(test)]
mod tests {
    use super::*;
    use sha2::{Digest, Sha256};
    use std::fs;
    use tempfile::tempdir;

    fn write_wav(root: &Path, sample_rate: u32, channels: u16, frames: usize) -> (PathBuf, String) {
        let path = root.join("meeting.wav");
        let mut data = Vec::new();
        for frame in 0..frames {
            for channel in 0..channels {
                let value = if channel == 0 { 0.25 } else { -0.25 };
                let sample = ((value * 32767.0) as i16).to_le_bytes();
                let _ = frame;
                data.extend_from_slice(&sample);
            }
        }
        let byte_rate = sample_rate * channels as u32 * 2;
        let block_align = channels * 2;
        let mut wav = Vec::new();
        wav.extend_from_slice(b"RIFF");
        wav.extend_from_slice(&(36u32 + data.len() as u32).to_le_bytes());
        wav.extend_from_slice(b"WAVEfmt ");
        wav.extend_from_slice(&16u32.to_le_bytes());
        wav.extend_from_slice(&1u16.to_le_bytes());
        wav.extend_from_slice(&channels.to_le_bytes());
        wav.extend_from_slice(&sample_rate.to_le_bytes());
        wav.extend_from_slice(&byte_rate.to_le_bytes());
        wav.extend_from_slice(&block_align.to_le_bytes());
        wav.extend_from_slice(&16u16.to_le_bytes());
        wav.extend_from_slice(b"data");
        wav.extend_from_slice(&(data.len() as u32).to_le_bytes());
        wav.extend_from_slice(&data);
        fs::write(&path, wav).unwrap();
        let bytes = fs::read(&path).unwrap();
        let mut hasher = Sha256::new();
        hasher.update(bytes);
        (path, format!("{:x}", hasher.finalize()))
    }

    #[test]
    fn loads_exact_range_and_downmixes_to_16khz_mono() {
        let dir = tempdir().unwrap();
        let (_path, hash) = write_wav(dir.path(), 48_000, 2, 72_000);
        let request = AudioWindowRequest {
            source_path: PathBuf::from("meeting.wav"),
            source_sha256: hash,
            start_ms: 500,
            end_ms: 1_500,
        };
        let window = load_audio_window(&request, dir.path()).unwrap();
        assert_eq!(window.samples_16khz_mono.len(), 16_000);
        assert_eq!(window.source_start_ms, 500);
        assert_eq!(window.source_end_ms, 1_500);
        assert!(
            window
                .samples_16khz_mono
                .iter()
                .all(|sample| sample.abs() < 0.01)
        );
    }

    #[test]
    fn rejects_path_traversal_and_checksum_mismatch() {
        let dir = tempdir().unwrap();
        let (_path, hash) = write_wav(dir.path(), 16_000, 1, 16_000);
        let traversal = AudioWindowRequest {
            source_path: PathBuf::from("../meeting.wav"),
            source_sha256: hash.clone(),
            start_ms: 0,
            end_ms: 500,
        };
        assert!(matches!(
            load_audio_window(&traversal, dir.path()),
            Err(AudioError::InvalidSource)
        ));
        let mismatch = AudioWindowRequest {
            source_path: PathBuf::from("meeting.wav"),
            source_sha256: "0".repeat(64),
            start_ms: 0,
            end_ms: 500,
        };
        assert!(matches!(
            load_audio_window(&mismatch, dir.path()),
            Err(AudioError::Integrity)
        ));
    }

    #[test]
    fn rejects_invalid_ranges() {
        let dir = tempdir().unwrap();
        let (_path, hash) = write_wav(dir.path(), 16_000, 1, 16_000);
        let request = AudioWindowRequest {
            source_path: PathBuf::from("meeting.wav"),
            source_sha256: hash,
            start_ms: 500,
            end_ms: 500,
        };
        assert!(matches!(
            load_audio_window(&request, dir.path()),
            Err(AudioError::Range)
        ));
    }

    #[test]
    fn rejects_ranges_that_overflow_frame_conversion() {
        let dir = tempdir().unwrap();
        let (_path, hash) = write_wav(dir.path(), 16_000, 1, 16_000);
        let request = AudioWindowRequest {
            source_path: PathBuf::from("meeting.wav"),
            source_sha256: hash,
            start_ms: 0,
            end_ms: i64::MAX,
        };

        assert!(matches!(
            load_audio_window(&request, dir.path()),
            Err(AudioError::Range)
        ));
    }

    #[test]
    fn rejects_truncated_and_unsupported_wav() {
        let dir = tempdir().unwrap();
        let (path, hash) = write_wav(dir.path(), 16_000, 1, 16_000);
        let mut bytes = fs::read(&path).unwrap();
        bytes.truncate(bytes.len() - 1);
        fs::write(&path, &bytes).unwrap();
        let request = AudioWindowRequest {
            source_path: PathBuf::from("meeting.wav"),
            source_sha256: {
                let mut hasher = Sha256::new();
                hasher.update(&bytes);
                format!("{:x}", hasher.finalize())
            },
            start_ms: 0,
            end_ms: 500,
        };
        assert_eq!(hash.len(), 64);
        assert!(matches!(
            load_audio_window(&request, dir.path()),
            Err(AudioError::Format)
        ));
    }

    #[test]
    fn rejects_audio_sources_larger_than_the_byte_limit_before_hashing() {
        let dir = tempdir().unwrap();
        let path = dir.path().join("oversized.webm");
        let file = fs::File::create(&path).unwrap();
        file.set_len(MAX_AUDIO_SOURCE_BYTES + 1).unwrap();
        drop(file);

        let result = load_audio_source(
            &AudioSourceRequest {
                source_path: PathBuf::from("oversized.webm"),
                source_sha256: "0".repeat(64),
                start_ms: 0,
                end_ms: None,
            },
            dir.path(),
        );
        assert_eq!(result.err(), Some(AudioError::Format));
    }
}
