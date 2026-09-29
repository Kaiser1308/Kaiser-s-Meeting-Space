// kms-native audio capture — Monotonic timeline.
//
// Aligns incoming capture streams to a unified monotonic timeline,
// detects gaps, drops, and overlaps, and calculates drift metrics.

use std::time::Instant;

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TimelineState {
    pub samples_processed: u64,
    pub elapsed_ms: u64,
    pub drift_samples: i64,
    pub gap_count: u64,
    pub total_gap_ms: u64,
}

pub struct TimelineAligner {
    start_time: Instant,
    samples_processed: u64,
    gap_count: u64,
    total_gap_samples: u64,
}

impl TimelineAligner {
    pub fn new() -> Self {
        Self {
            start_time: Instant::now(),
            samples_processed: 0,
            gap_count: 0,
            total_gap_samples: 0,
        }
    }

    /// Process a block of samples (at 48 kHz).
    /// Returns (gap_samples_detected, clean_derived_samples)
    pub fn align(&mut self, samples: &[f32]) -> (u64, Vec<f32>, TimelineState) {
        if self.samples_processed == 0 && !samples.is_empty() {
            // The first delivered packet starts the derived timeline; startup
            // latency before any packet is not evidence of dropped samples.
            self.start_time = Instant::now();
        }
        let elapsed = self.start_time.elapsed();
        let expected_samples = ((elapsed.as_secs_f64() * 48000.0) as u64)
            .saturating_sub(self.total_gap_samples);

        let mut gap_detected = 0;
        let mut derived_samples = samples.to_vec();

        // Check if there is a gap (received fewer samples than expected based on wall time)
        // Set threshold to 100ms (4800 samples)
        let threshold = 4800;
        if expected_samples > self.samples_processed + samples.len() as u64 + threshold {
            let gap_size = expected_samples - (self.samples_processed + samples.len() as u64);
            gap_detected = gap_size;
            self.gap_count += 1;
            self.total_gap_samples += gap_size;

            // Cap padding allocation to prevent OOM (max 30 seconds at 48kHz = 1,440,000 samples)
            const MAX_GAP_PADDING_SAMPLES: u64 = 48000 * 30;
            let padding_size = std::cmp::min(gap_size, MAX_GAP_PADDING_SAMPLES) as usize;

            // Derived alignment gets zero-padding (capped)
            let mut padded = vec![0.0f32; padding_size];
            padded.extend_from_slice(samples);
            derived_samples = padded;
        }

        self.samples_processed += samples.len() as u64;

        let elapsed_ms = elapsed.as_millis() as u64;
        let drift_samples = (expected_samples as i64) - (self.samples_processed as i64);

        let state = TimelineState {
            samples_processed: self.samples_processed,
            elapsed_ms,
            drift_samples,
            gap_count: self.gap_count,
            total_gap_ms: (self.total_gap_samples * 1000) / 48000,
        };

        (gap_detected, derived_samples, state)
    }

    pub fn state(&self) -> TimelineState {
        let elapsed = self.start_time.elapsed();
        let elapsed_ms = elapsed.as_millis() as u64;
        let expected_samples = (elapsed.as_secs_f64() * 48000.0) as u64;
        let drift_samples = (expected_samples as i64) - (self.samples_processed as i64);

        TimelineState {
            samples_processed: self.samples_processed,
            elapsed_ms,
            drift_samples,
            gap_count: self.gap_count,
            total_gap_ms: (self.total_gap_samples * 1000) / 48000,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::Duration;

    #[test]
    fn test_timeline_no_gaps() {
        let mut aligner = TimelineAligner::new();
        let samples = vec![0.5f32; 1000];
        let (gap, derived, state) = aligner.align(&samples);
        assert_eq!(gap, 0);
        assert_eq!(derived.len(), 1000);
        assert_eq!(state.samples_processed, 1000);
        assert_eq!(state.gap_count, 0);
    }

    #[test]
    fn first_packet_establishes_timeline_without_a_startup_gap() {
        let mut aligner = TimelineAligner::new();
        aligner.start_time = Instant::now() - Duration::from_secs(2);

        let (gap, derived, state) = aligner.align(&vec![0.1f32; 480]);

        assert_eq!(gap, 0);
        assert_eq!(derived.len(), 480);
        assert_eq!(state.gap_count, 0);
    }

    #[test]
    fn test_timeline_gap_simulation() {
        let mut aligner = TimelineAligner::new();
        let _ = aligner.align(&vec![0.1f32; 480]);
        // Artificially manipulate start_time back in time after capture starts.
        aligner.start_time = Instant::now() - Duration::from_secs(2);
        
        let samples = vec![0.1f32; 1000];
        let (gap, derived, state) = aligner.align(&samples);
        
        // Aligner should detect a gap of around 2 seconds (~96,000 samples)
        assert!(gap > 90000);
        assert_eq!(state.gap_count, 1);
        // Gap is 2 seconds (~96k samples), well within the 30-second padding cap (1.44M samples)
        // So derived length = gap padding + 1000 input samples
        assert_eq!(derived.len(), gap as usize + 1000);
        assert_eq!(derived[0], 0.0); // padded with zeros
        assert_eq!(derived[derived.len() - 1], 0.1);
    }
}
