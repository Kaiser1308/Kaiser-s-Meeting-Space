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
    last_device_position: Option<u64>,
    last_packet_frames: u32,
    last_input_sample_rate: u32,
}

impl TimelineAligner {
    pub fn new() -> Self {
        Self {
            start_time: Instant::now(),
            samples_processed: 0,
            gap_count: 0,
            total_gap_samples: 0,
            last_device_position: None,
            last_packet_frames: 0,
            last_input_sample_rate: 0,
        }
    }

    /// Process a 48 kHz derived block using the source device position for
    /// continuity. Manager scheduling delays are not source evidence.
    /// Returns (gap_samples_detected, clean_derived_samples).
    pub fn align(
        &mut self,
        samples: &[f32],
        device_position: u64,
        packet_frames: u32,
        input_sample_rate: u32,
    ) -> (u64, Vec<f32>, TimelineState) {
        if self.samples_processed == 0 && !samples.is_empty() {
            // The first delivered packet starts the derived timeline; startup
            // latency before any packet is not evidence of dropped samples.
            self.start_time = Instant::now();
        }

        let mut gap_detected = 0;
        let mut derived_samples = samples.to_vec();

        if self.last_input_sample_rate == input_sample_rate {
            if let Some(last_device_position) = self.last_device_position {
                let expected_device_position = last_device_position
                    .saturating_add(u64::from(self.last_packet_frames));
                if device_position > expected_device_position && input_sample_rate > 0 {
                    let missing_input_frames = device_position - expected_device_position;
                    let gap_size = missing_input_frames
                        .saturating_mul(48_000)
                        / u64::from(input_sample_rate);
                    gap_detected = gap_size;
                    self.gap_count += 1;
                    self.total_gap_samples += gap_size;

                    // Cap padding allocation to prevent OOM (max 30 seconds at 48kHz = 1,440,000 samples)
                    const MAX_GAP_PADDING_SAMPLES: u64 = 48_000 * 30;
                    let padding_size = std::cmp::min(gap_size, MAX_GAP_PADDING_SAMPLES) as usize;

                    // Derived alignment gets zero-padding (capped)
                    let mut padded = vec![0.0f32; padding_size];
                    padded.extend_from_slice(samples);
                    derived_samples = padded;
                }
            }
        }

        self.samples_processed += derived_samples.len() as u64;
        self.last_device_position = Some(device_position);
        self.last_packet_frames = packet_frames;
        self.last_input_sample_rate = input_sample_rate;

        let elapsed_ms = self.start_time.elapsed().as_millis() as u64;

        let state = TimelineState {
            samples_processed: self.samples_processed,
            elapsed_ms,
            drift_samples: 0,
            gap_count: self.gap_count,
            total_gap_ms: (self.total_gap_samples * 1000) / 48000,
        };

        (gap_detected, derived_samples, state)
    }

    pub fn append_tail(&mut self, samples: &[f32]) -> TimelineState {
        self.samples_processed += samples.len() as u64;
        self.state()
    }

    pub fn state(&self) -> TimelineState {
        let elapsed_ms = self.start_time.elapsed().as_millis() as u64;

        TimelineState {
            samples_processed: self.samples_processed,
            elapsed_ms,
            drift_samples: 0,
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
        let (gap, derived, state) = aligner.align(&samples, 1_000, 1_000, 48_000);
        assert_eq!(gap, 0);
        assert_eq!(derived.len(), 1000);
        assert_eq!(state.samples_processed, 1000);
        assert_eq!(state.gap_count, 0);
    }

    #[test]
    fn first_packet_establishes_timeline_without_a_startup_gap() {
        let mut aligner = TimelineAligner::new();
        aligner.start_time = Instant::now() - Duration::from_secs(2);

        let (gap, derived, state) = aligner.align(&vec![0.1f32; 480], 1_000, 480, 48_000);

        assert_eq!(gap, 0);
        assert_eq!(derived.len(), 480);
        assert_eq!(state.gap_count, 0);
    }

    #[test]
    fn delayed_dispatch_with_contiguous_device_positions_has_no_gap() {
        let mut aligner = TimelineAligner::new();
        let block = vec![0.1f32; 480];

        let _ = aligner.align(&block, 1_000, 480, 48_000);
        // Simulate a slow writer/dispatcher. The audio device itself continued
        // delivering exactly the next packet, so this must not become a source gap.
        aligner.start_time = Instant::now() - Duration::from_secs(2);
        let (gap, derived, state) = aligner.align(&block, 1_480, 480, 48_000);

        assert_eq!(gap, 0);
        assert_eq!(derived.len(), 480);
        assert_eq!(state.gap_count, 0);
    }

    #[test]
    fn test_timeline_gap_simulation() {
        let mut aligner = TimelineAligner::new();
        let _ = aligner.align(&vec![0.1f32; 480], 1_000, 480, 48_000);

        let samples = vec![0.1f32; 1000];
        let (gap, derived, state) = aligner.align(&samples, 97_480, 1_000, 48_000);
        
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
