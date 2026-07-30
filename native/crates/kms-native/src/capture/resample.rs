// kms-native audio capture — Resampler module.
//
// Integrates Rubato for persistent, high-quality sample rate conversion
// from native endpoint rates (e.g., 44.1 kHz) to the normalized 48 kHz.

#![allow(dead_code)]

use rubato::{SincFixedIn, Resampler, SincInterpolationType, SincInterpolationParameters, WindowFunction};

pub struct AudioResampler {
    resampler: Option<SincFixedIn<f32>>,
    input_rate: u32,
    output_rate: u32,
    input_buffer: Vec<f32>,
}

impl AudioResampler {
    pub fn new(input_rate: u32, output_rate: u32) -> Result<Self, String> {
        let resampler = if input_rate != output_rate {
            let params = SincInterpolationParameters {
                sinc_len: 256,
                f_cutoff: 0.95,
                interpolation: SincInterpolationType::Cubic,
                oversampling_factor: 256,
                window: WindowFunction::BlackmanHarris2,
            };
            // In shared mode, WASAPI typically delivers ~10ms buffers.
            // For 44.1 kHz, 10ms is ~441 samples.
            // Let's set a chunk size of 441 samples.
            let chunk_size = (input_rate as f64 * 0.01) as usize;
            let chunk_size = if chunk_size == 0 { 480 } else { chunk_size };

            let res = SincFixedIn::<f32>::new(
                output_rate as f64 / input_rate as f64,
                2.0,
                params,
                chunk_size,
                1, // 1 channel mono
            ).map_err(|e| format!("Failed to create resampler: {:?}", e))?;
            Some(res)
        } else {
            None
        };

        Ok(Self {
            resampler,
            input_rate,
            output_rate,
            input_buffer: Vec::new(),
        })
    }

    /// Resample incoming mono samples. If input_rate == output_rate, returns them unchanged.
    pub fn process(&mut self, samples: &[f32]) -> Result<Vec<f32>, String> {
        let Some(resampler) = &mut self.resampler else {
            return Ok(samples.to_vec());
        };

        // Append to input buffer
        self.input_buffer.extend_from_slice(samples);

        let chunk_size = resampler.input_frames_next();
        let mut output = Vec::new();

        // Process all available full chunks
        while self.input_buffer.len() >= chunk_size {
            let chunk: Vec<f32> = self.input_buffer.drain(0..chunk_size).collect();
            let wave_in = vec![chunk];
            let wave_out = resampler
                .process(&wave_in, None)
                .map_err(|e| format!("Resampling error: {:?}", e))?;
            if let Some(chan_out) = wave_out.first() {
                output.extend_from_slice(chan_out);
            }
        }

        Ok(output)
    }

    /// Drain the samples buffered by the streaming resampler at a source
    /// boundary (pause/end/format change). Without this, a final partial
    /// input block is silently discarded.
    pub fn flush(&mut self) -> Result<Vec<f32>, String> {
        let Some(resampler) = &mut self.resampler else {
            return Ok(Vec::new());
        };

        if self.input_buffer.is_empty() {
            return Ok(Vec::new());
        }

        let pending = std::mem::take(&mut self.input_buffer);
        let wave_out = resampler
            .process_partial(Some(&[pending]), None)
            .map_err(|e| format!("Resampling flush error: {:?}", e))?;

        Ok(wave_out.first().cloned().unwrap_or_default())
    }

    pub fn input_rate(&self) -> u32 {
        self.input_rate
    }

    pub fn output_rate(&self) -> u32 {
        self.output_rate
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_resampler_passthrough() {
        let mut resampler = AudioResampler::new(48000, 48000).unwrap();
        let samples = vec![0.5f32; 100];
        let processed = resampler.process(&samples).unwrap();
        assert_eq!(processed, samples);
    }

    #[test]
    fn test_resampler_conversion_smoke() {
        // From 44.1k to 48k
        let mut resampler = AudioResampler::new(44100, 48000).unwrap();
        let mut input = vec![0.1f32; 1000];
        
        let processed = resampler.process(&input).unwrap();
        // Since conversion is buffered, first call might return some or no frames depending on chunk boundaries.
        // Let's feed more samples to flush some output.
        input.extend_from_slice(&vec![0.1f32; 1000]);
        let processed2 = resampler.process(&input).unwrap();
        
        assert!(processed.len() + processed2.len() > 0);
    }

    #[test]
    fn test_resampler_flushes_partial_tail() {
        let mut resampler = AudioResampler::new(44100, 48000).unwrap();
        let input = vec![0.1f32; 100];

        assert!(resampler.process(&input).unwrap().is_empty());
        let flushed = resampler.flush().unwrap();

        assert!(!flushed.is_empty());
        assert!(resampler.flush().unwrap().is_empty());
    }
}
