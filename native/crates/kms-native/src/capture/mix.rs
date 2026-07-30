// kms-native audio capture — Mixing and level metering module.
//
// Computes Peak/RMS levels for real-time diagnostics and creates
// the derived playback/transcription mix using a real-time soft-knee limiter.

#![allow(dead_code)]

pub struct LevelMeter {
    rms: f32,
    peak: f32,
    clipped: bool,
}

impl LevelMeter {
    pub fn compute(samples: &[f32]) -> Self {
        let mut max_abs = 0.0f32;
        let mut sum_sq = 0.0f32;
        for &s in samples {
            let abs = s.abs();
            if abs > max_abs {
                max_abs = abs;
            }
            sum_sq += s * s;
        }
        let rms = if samples.is_empty() {
            0.0
        } else {
            (sum_sq / samples.len() as f32).sqrt()
        };
        let clipped = max_abs >= 0.99;
        Self { rms, peak: max_abs, clipped }
    }

    pub fn rms(&self) -> f32 {
        self.rms
    }

    pub fn peak(&self) -> f32 {
        self.peak
    }

    pub fn clipped(&self) -> bool {
        self.clipped
    }
}

/// Create a derived mono mix of microphone and loopback tracks, applying a soft limiter.
pub fn mix_tracks(mic: &[f32], system: &[f32], mic_gain: f32, system_gain: f32) -> Vec<f32> {
    let len = std::cmp::max(mic.len(), system.len());
    let mut output = Vec::with_capacity(len);

    for i in 0..len {
        let m = mic.get(i).copied().unwrap_or(0.0) * mic_gain;
        let s = system.get(i).copied().unwrap_or(0.0) * system_gain;
        let mut mixed = m + s;

        // Apply a real-time soft-knee limiter at 0.95 ceiling
        if mixed > 0.95 {
            mixed = 0.95 + (mixed - 0.95) / (1.0 + (mixed - 0.95) * 20.0);
        } else if mixed < -0.95 {
            mixed = -0.95 + (mixed + 0.95) / (1.0 - (mixed + 0.95) * 20.0);
        }

        // Clamp just in case to avoid any floating-point overflow out of bounds
        output.push(mixed.clamp(-1.0, 1.0));
    }

    output
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_level_meter_flat() {
        let samples = vec![0.5f32, -0.5f32, 0.5f32, -0.5f32];
        let levels = LevelMeter::compute(&samples);
        assert!((levels.rms() - 0.5).abs() < 1e-5);
        assert_eq!(levels.peak(), 0.5);
        assert!(!levels.clipped());
    }

    #[test]
    fn test_level_meter_clipped() {
        let samples = vec![1.0f32, -0.2f32, 0.0f32];
        let levels = LevelMeter::compute(&samples);
        assert_eq!(levels.peak(), 1.0);
        assert!(levels.clipped());
    }

    #[test]
    fn test_mix_tracks_limiter() {
        let mic = vec![0.8f32, 0.9f32];
        let system = vec![0.8f32, 0.9f32];
        let mixed = mix_tracks(&mic, &system, 1.0, 1.0);
        
        // Sum would be 1.6 and 1.8 without limiter.
        // Limiter should restrict it below 1.0.
        assert!(mixed[0] < 1.0);
        assert!(mixed[1] < 1.0);
        assert!(mixed[0] > 0.95);
        assert!(mixed[1] > 0.95);
    }
}
