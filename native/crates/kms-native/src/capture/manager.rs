// kms-native audio capture — Capture Manager.
//
// Orchestrates capture stream threads, performs downmixing, persistent
// resampling, monotonic timeline alignment, level metering, and chunk writing.

use opus::{Application, Channels, Encoder};
use std::collections::VecDeque;
use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};
use tokio::sync::{Mutex, mpsc, oneshot};
use uuid::Uuid;

use crate::capture::device::{enumerate_devices, get_default_device, resolve_requested_device_id};
use crate::capture::mix::LevelMeter;
use crate::capture::monitor::DeviceMonitor;
use crate::capture::resample::AudioResampler;
use crate::capture::timeline::TimelineAligner;
use crate::capture::wasapi::{
    CaptureConfig, CaptureFormat, CaptureGapRecord, CaptureHandoff, CapturePacket,
    WasapiCaptureStream,
};
use crate::protocol::NativeEventV1;
use crate::runtime::NativeEventSender;
use crate::storage::StorageManager;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
struct SourceFormat {
    sample_rate: u32,
    channels: u16,
}

impl SourceFormat {
    const fn pcm_float(sample_rate: u32, channels: u16) -> Self {
        Self {
            sample_rate,
            channels,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct SourceRange {
    start_sample: u64,
    end_sample: u64,
}

#[derive(Debug, Clone, Copy, Default)]
struct PacketProvenance {
    format: Option<CaptureFormat>,
    raw_frames: u64,
    device_start: Option<u64>,
    device_end: Option<u64>,
    qpc_start: Option<u64>,
    qpc_end: Option<u64>,
}

impl PacketProvenance {
    fn observe(&mut self, packet: &CapturePacket) {
        self.format = Some(packet.format);
        self.raw_frames = self.raw_frames.saturating_add(packet.frames as u64);
        self.device_start.get_or_insert(packet.device_position);
        self.qpc_start.get_or_insert(packet.qpc_position);
        self.device_end = Some(packet.device_position.saturating_add(packet.frames as u64));
        self.qpc_end = Some(
            packet
                .qpc_position
                .saturating_add(qpc_duration(packet.frames, packet.format.sample_rate)),
        );
    }

    fn source_format(self, fallback: SourceFormat) -> SourceFormat {
        self.format.map_or(fallback, |format| {
            SourceFormat::pcm_float(format.sample_rate, format.channels)
        })
    }
}

#[derive(Debug, Clone, Copy)]
struct PacketSegment {
    format: CaptureFormat,
    frames: u64,
    device_position: u64,
    qpc_position: u64,
}

impl PacketSegment {
    fn from_packet(packet: &CapturePacket) -> Self {
        Self {
            format: packet.format,
            frames: packet.frames as u64,
            device_position: packet.device_position,
            qpc_position: packet.qpc_position,
        }
    }

    fn take_prefix(&mut self, frames: u64) -> Self {
        let taken = frames.min(self.frames);
        let prefix = Self {
            format: self.format,
            frames: taken,
            device_position: self.device_position,
            qpc_position: self.qpc_position,
        };
        self.frames -= taken;
        self.device_position = self.device_position.saturating_add(taken);
        self.qpc_position = self
            .qpc_position
            .saturating_add(qpc_duration(taken as u32, self.format.sample_rate));
        prefix
    }
}

fn qpc_duration(frames: u32, sample_rate: u32) -> u64 {
    if sample_rate == 0 {
        return 0;
    }
    u64::from(frames).saturating_mul(10_000_000) / u64::from(sample_rate)
}

fn take_packet_provenance(
    segments: &mut VecDeque<PacketSegment>,
    frames: u64,
) -> Option<PacketProvenance> {
    let mut remaining = frames;
    let mut provenance = PacketProvenance::default();
    while remaining > 0 {
        let segment = segments.front_mut()?;
        let part = segment.take_prefix(remaining);
        provenance.format = Some(part.format);
        provenance.raw_frames = provenance.raw_frames.saturating_add(part.frames);
        provenance.device_start.get_or_insert(part.device_position);
        provenance.qpc_start.get_or_insert(part.qpc_position);
        provenance.device_end = Some(part.device_position.saturating_add(part.frames));
        provenance.qpc_end = Some(
            part.qpc_position
                .saturating_add(qpc_duration(part.frames as u32, part.format.sample_rate)),
        );
        remaining -= part.frames;
        if segment.frames == 0 {
            segments.pop_front();
        }
    }
    Some(provenance)
}

fn process_derived_packet(
    resampler: &mut AudioResampler,
    negotiated: CaptureFormat,
    samples: &[f32],
) -> Result<Vec<f32>, String> {
    let mut output = Vec::new();
    if resampler.input_rate() != negotiated.sample_rate {
        output.extend(resampler.flush()?);
        *resampler = AudioResampler::new(negotiated.sample_rate, 48_000)?;
    }
    output.extend(resampler.process(samples)?);
    Ok(output)
}

fn starts_new_format_epoch(previous: Option<CaptureFormat>, incoming: CaptureFormat) -> bool {
    previous.is_some_and(|format| format != incoming)
}

impl SourceRange {
    const fn new(start_sample: u64, end_sample: u64) -> Self {
        Self {
            start_sample,
            end_sample,
        }
    }
}

struct SerializedSourceChunk {
    bytes: Vec<u8>,
    input_format: SourceFormat,
    range: SourceRange,
    canonical_sample_count: u64,
    input_sample_count: u64,
}

impl SerializedSourceChunk {
    const fn filename_extension(&self) -> &'static str {
        "webm"
    }
    const fn sample_rate(&self) -> u32 {
        48_000
    }
    const fn channels(&self) -> u16 {
        1
    }
    const fn sample_count(&self) -> u64 {
        self.canonical_sample_count
    }
    const fn range(&self) -> SourceRange {
        self.range
    }
}

/// Canonical P00 source profile. This is deliberately separate from timeline
/// alignment: it only performs the fixed capture-profile conversion required
/// to make each source chunk independently playable (48 kHz mono Opus/WebM).
/// Padding, drift correction, and mixing remain derived-only consumers.
fn serialize_source_chunk(
    samples: &[f32],
    format: SourceFormat,
    range: SourceRange,
) -> Result<SerializedSourceChunk, String> {
    if range.end_sample.saturating_sub(range.start_sample) != samples.len() as u64 {
        return Err("source range does not match input sample count".to_string());
    }
    let canonical = capture_profile_resample(samples, format.sample_rate);
    let bytes = mux_opus_webm(&canonical)?;
    Ok(SerializedSourceChunk {
        bytes,
        input_format: format,
        range,
        canonical_sample_count: canonical.len() as u64,
        input_sample_count: samples.len() as u64,
    })
}

fn capture_profile_resample(samples: &[f32], input_rate: u32) -> Vec<f32> {
    if input_rate == 48_000 {
        return samples.to_vec();
    }
    let output_len = (samples.len() as u64 * 48_000 / input_rate as u64) as usize;
    (0..output_len)
        .map(|index| {
            let source = index as f64 * input_rate as f64 / 48_000.0;
            let left = source.floor() as usize;
            let right = (left + 1).min(samples.len().saturating_sub(1));
            let fraction = (source - left as f64) as f32;
            samples[left] + (samples[right] - samples[left]) * fraction
        })
        .collect()
}

fn ebml_size(out: &mut Vec<u8>, value: usize) {
    for width in 1..=8 {
        if value < (1usize << (7 * width)) - 1 {
            let encoded = (value | (1usize << (7 * width))).to_be_bytes();
            out.extend_from_slice(&encoded[encoded.len() - width..]);
            return;
        }
    }
    unreachable!("WebM element is too large");
}
fn element(out: &mut Vec<u8>, id: &[u8], data: &[u8]) {
    out.extend_from_slice(id);
    ebml_size(out, data.len());
    out.extend_from_slice(data);
}
fn uint(value: u64) -> Vec<u8> {
    let bytes = value.to_be_bytes();
    bytes[bytes.iter().position(|&b| b != 0).unwrap_or(7)..].to_vec()
}

fn signed_int(value: i64) -> Vec<u8> {
    for width in 1..=8 {
        let minimum = -(1_i64 << (width * 8 - 1));
        let maximum = (1_i64 << (width * 8 - 1)) - 1;
        if (minimum..=maximum).contains(&value) {
            return value.to_be_bytes()[8 - width..].to_vec();
        }
    }
    value.to_be_bytes().to_vec()
}

struct EncodedOpusFrame {
    packet: Vec<u8>,
    discard_padding_samples: u16,
}

fn encode_opus_frames(samples: &[f32]) -> Result<Vec<EncodedOpusFrame>, String> {
    let mut encoder =
        Encoder::new(48_000, Channels::Mono, Application::Audio).map_err(|e| e.to_string())?;
    samples
        .chunks(960)
        .map(|frame| {
            let mut pcm = [0.0_f32; 960];
            pcm[..frame.len()].copy_from_slice(frame);
            let mut encoded = [0_u8; 4000];
            let size = encoder
                .encode_float(&pcm, &mut encoded)
                .map_err(|e| e.to_string())?;
            Ok(EncodedOpusFrame {
                packet: encoded[..size].to_vec(),
                discard_padding_samples: (960 - frame.len()) as u16,
            })
        })
        .collect()
}

fn mux_opus_webm(samples: &[f32]) -> Result<Vec<u8>, String> {
    let frames = encode_opus_frames(samples)?;
    let mut ebml = Vec::new();
    element(&mut ebml, &[0x42, 0x86], &[1]);
    element(&mut ebml, &[0x42, 0xf7], &[1]);
    element(&mut ebml, &[0x42, 0xf2], &[4]);
    element(&mut ebml, &[0x42, 0xf3], &[8]);
    element(&mut ebml, &[0x42, 0x82], b"webm");
    element(&mut ebml, &[0x42, 0x87], &[2]);
    element(&mut ebml, &[0x42, 0x85], &[2]);
    let mut info = Vec::new();
    element(&mut info, &[0x2a, 0xd7, 0xb1], &uint(1_000_000));
    element(
        &mut info,
        &[0x44, 0x89],
        &(samples.len() as f64 / 48.0).to_be_bytes(),
    );
    element(&mut info, &[0x4d, 0x80], b"kms-native");
    element(&mut info, &[0x57, 0x41], b"kms-native");
    let mut audio = Vec::new();
    element(&mut audio, &[0xb5], &48_000_f64.to_be_bytes());
    element(&mut audio, &[0x9f], &[1]);
    let mut track = Vec::new();
    element(&mut track, &[0xd7], &[1]);
    element(&mut track, &[0x73, 0xc5], &[1]);
    element(&mut track, &[0x83], &[2]);
    element(&mut track, &[0x86], b"A_OPUS");
    element(
        &mut track,
        &[0x63, 0xa2],
        b"OpusHead\x01\x01\x00\x00\xbb\x80\x00\x00\x00\x00\x00",
    );
    element(&mut track, &[0xe1], &audio);
    let mut tracks = Vec::new();
    element(&mut tracks, &[0xae], &track);
    let mut out = vec![0x1a, 0x45, 0xdf, 0xa3];
    ebml_size(&mut out, ebml.len());
    out.extend_from_slice(&ebml);
    out.extend_from_slice(&[
        0x18, 0x53, 0x80, 0x67, 0x01, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff,
    ]);
    element(&mut out, &[0x15, 0x49, 0xa9, 0x66], &info);
    element(&mut out, &[0x16, 0x54, 0xae, 0x6b], &tracks);
    // SimpleBlock's signed 16-bit relative timecode limits a cluster. Rotate
    // at 30 seconds so long recordings remain valid WebM, then use BlockGroup
    // plus DiscardPadding for the final partial Opus frame.
    for (cluster_index, cluster_frames) in frames.chunks(1_500).enumerate() {
        let mut cluster = Vec::new();
        let cluster_timecode_ms = (cluster_index * 30_000) as u64;
        element(&mut cluster, &[0xe7], &uint(cluster_timecode_ms));
        for (relative_index, frame) in cluster_frames.iter().enumerate() {
            let relative_timecode_ms = (relative_index * 20) as i16;
            let mut block = vec![
                0x81,
                (relative_timecode_ms >> 8) as u8,
                relative_timecode_ms as u8,
                0x80,
            ];
            block.extend_from_slice(&frame.packet);
            if frame.discard_padding_samples == 0 {
                element(&mut cluster, &[0xa3], &block);
            } else {
                let mut group = Vec::new();
                element(&mut group, &[0xa1], &block);
                // Matroska DiscardPadding is signed: a positive value trims
                // samples from the *end* of this Block. The final Opus packet
                // was zero-padded for the encoder, so it must use end trim.
                let discard_padding_ns =
                    i64::from(frame.discard_padding_samples) * 1_000_000_000 / 48_000;
                element(&mut group, &[0x75, 0xa2], &signed_int(discard_padding_ns));
                element(&mut cluster, &[0xa0], &group);
            }
        }
        element(&mut out, &[0x1f, 0x43, 0xb6, 0x75], &cluster);
    }
    Ok(out)
}

#[derive(Debug, Default, PartialEq, Eq)]
struct WebmOpusAccounting {
    block_group_count: u64,
    discard_padding_ns: Vec<i64>,
    decoded_samples: u64,
    playable_samples: u64,
}

/// Minimal structured EBML reader for the subset we write. It deliberately
/// parses element boundaries and BlockGroup children rather than searching raw
/// bytes, because Opus payload data may contain any element-ID byte sequence.
fn parse_webm_opus_accounting(bytes: &[u8]) -> Result<WebmOpusAccounting, String> {
    let mut accounting = WebmOpusAccounting::default();
    parse_ebml_elements(bytes, &mut accounting)?;
    accounting.playable_samples = accounting.decoded_samples.saturating_sub(
        accounting
            .discard_padding_ns
            .iter()
            .filter(|padding| **padding > 0)
            // DiscardPadding is integer nanoseconds while Opus accounting is
            // whole samples. The mux rounds down ns, so recover the intended
            // sample trim with a ceiling conversion.
            .map(|padding| {
                (*padding as u64)
                    .saturating_mul(48_000)
                    .div_ceil(1_000_000_000)
            })
            .sum::<u64>(),
    );
    Ok(accounting)
}

fn parse_ebml_elements(bytes: &[u8], accounting: &mut WebmOpusAccounting) -> Result<(), String> {
    let mut cursor = 0;
    while cursor < bytes.len() {
        let (id, id_len) = read_ebml_id(&bytes[cursor..])?;
        cursor += id_len;
        // The Segment is intentionally written with an unknown size so a
        // recording can be appended safely. At this top-level boundary its
        // payload is the remainder of this finite chunk.
        if id == 0x18538067
            && bytes[cursor..].starts_with(&[0x01, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff])
        {
            parse_ebml_elements(&bytes[cursor + 8..], accounting)?;
            return Ok(());
        }
        let (size, size_len) = read_ebml_size(&bytes[cursor..])?;
        cursor += size_len;
        let end = cursor.checked_add(size).ok_or("EBML size overflow")?;
        if end > bytes.len() {
            return Err("truncated EBML element".to_string());
        }
        let payload = &bytes[cursor..end];
        match id {
            0xa0 => parse_block_group(payload, accounting)?,
            0xa3 => {
                accounting.decoded_samples = accounting
                    .decoded_samples
                    .saturating_add(decode_block_samples(payload)?)
            }
            // Containers emitted by mux_opus_webm. Only recurse through
            // containers; codec private bytes and Opus packets are opaque.
            0x1a45dfa3 | 0x18538067 | 0x1549a966 | 0x1654ae6b | 0xae | 0xe1 | 0x1f43b675 => {
                parse_ebml_elements(payload, accounting)?
            }
            _ => {}
        }
        cursor = end;
    }
    Ok(())
}

fn parse_block_group(payload: &[u8], accounting: &mut WebmOpusAccounting) -> Result<(), String> {
    accounting.block_group_count = accounting.block_group_count.saturating_add(1);
    let mut cursor = 0;
    let mut saw_block = false;
    while cursor < payload.len() {
        let (id, id_len) = read_ebml_id(&payload[cursor..])?;
        cursor += id_len;
        let (size, size_len) = read_ebml_size(&payload[cursor..])?;
        cursor += size_len;
        let end = cursor.checked_add(size).ok_or("BlockGroup size overflow")?;
        if end > payload.len() {
            return Err("truncated BlockGroup child".to_string());
        }
        match id {
            0xa1 => {
                accounting.decoded_samples = accounting
                    .decoded_samples
                    .saturating_add(decode_block_samples(&payload[cursor..end])?);
                saw_block = true;
            }
            0x75a2 => accounting
                .discard_padding_ns
                .push(read_signed_integer(&payload[cursor..end])?),
            _ => {}
        }
        cursor = end;
    }
    if !saw_block {
        return Err("BlockGroup missing Block".to_string());
    }
    Ok(())
}

fn decode_block_samples(block: &[u8]) -> Result<u64, String> {
    let (_, track_len) = read_ebml_size(block)?;
    if block.len() < track_len + 3 {
        return Err("truncated Block header".to_string());
    }
    let packet = &block[track_len + 3..];
    let mut decoder = opus::Decoder::new(48_000, Channels::Mono).map_err(|e| e.to_string())?;
    let mut pcm = [0.0_f32; 5_760];
    decoder
        .decode_float(packet, &mut pcm, false)
        .map(|frames| frames as u64)
        .map_err(|e| e.to_string())
}

fn read_ebml_id(input: &[u8]) -> Result<(u32, usize), String> {
    let first = *input.first().ok_or("missing EBML ID")?;
    let width = (first.leading_zeros() + 1) as usize;
    if width > 4 || input.len() < width {
        return Err("invalid EBML ID".to_string());
    }
    Ok((
        input[..width]
            .iter()
            .fold(0_u32, |id, byte| (id << 8) | u32::from(*byte)),
        width,
    ))
}

fn read_ebml_size(input: &[u8]) -> Result<(usize, usize), String> {
    let first = *input.first().ok_or("missing EBML size")?;
    let width = (first.leading_zeros() + 1) as usize;
    if width == 0 || width > 8 || input.len() < width {
        return Err("invalid EBML size".to_string());
    }
    let mut value = usize::from(first & ((1_u8 << (8 - width)) - 1));
    for byte in &input[1..width] {
        value = (value << 8) | usize::from(*byte);
    }
    if value == (1_usize << (7 * width)) - 1 {
        return Err("unknown EBML size unsupported".to_string());
    }
    Ok((value, width))
}

fn read_signed_integer(bytes: &[u8]) -> Result<i64, String> {
    if bytes.is_empty() || bytes.len() > 8 {
        return Err("invalid signed EBML integer".to_string());
    }
    let sign_extend = if bytes[0] & 0x80 != 0 { 0xff } else { 0x00 };
    let mut full = [sign_extend; 8];
    full[8 - bytes.len()..].copy_from_slice(bytes);
    Ok(i64::from_be_bytes(full))
}

pub enum CaptureMessage {
    Packet {
        source: String,
        packet: CapturePacket,
    },
    Error {
        source: String,
        error: String,
    },
    Gap {
        source: String,
        gap: CaptureGapRecord,
    },
}

fn is_nonfatal_capture_error(error: &str) -> bool {
    error.starts_with("CAPTURE_FLAG:") || error.starts_with("CAPTURE_OVERFLOW:")
}

fn stop_commit_status(commit_failed: bool) -> &'static str {
    if commit_failed {
        "recovery_required"
    } else {
        "committed"
    }
}

/// The dispatcher awaits each storage transaction.  This is deliberately a
/// zero-backlog writer: at most one commit is in flight and no per-chunk task
/// can accumulate behind a slow disk.
const MAX_IN_FLIGHT_CHUNK_COMMITS: usize = 1;

const fn commit_queue_capacity() -> usize {
    0
}

fn gap_range_after_accepted_samples(next_sample: u64, missing_frames: u64) -> SourceRange {
    SourceRange::new(next_sample, next_sample.saturating_add(missing_frames))
}

fn capture_error_frames(error: &str) -> Option<u64> {
    error
        .strip_prefix("CAPTURE_OVERFLOW:")
        .or_else(|| error.strip_prefix("CAPTURE_FLAG:"))
        .and_then(|detail| detail.split(':').find(|part| part.starts_with("frames=")))
        .and_then(|frames| frames.strip_prefix("frames="))
        .and_then(|frames| frames.parse().ok())
}

fn capture_packet_flag_reason(flags: u32) -> Option<&'static str> {
    match flags & 0x7 {
        0 => None,
        1 => Some("CAPTURE_FLAG:data_discontinuity"),
        2 => Some("CAPTURE_FLAG:silent_packet"),
        4 => Some("CAPTURE_FLAG:timestamp_error"),
        3 => Some("CAPTURE_FLAG:data_discontinuity,silent_packet"),
        5 => Some("CAPTURE_FLAG:data_discontinuity,timestamp_error"),
        6 => Some("CAPTURE_FLAG:silent_packet,timestamp_error"),
        _ => Some("CAPTURE_FLAG:data_discontinuity,silent_packet,timestamp_error"),
    }
}

fn overflow_reason(prefix: &str, flags: u32) -> String {
    match flags & 0x7 {
        0 => prefix.to_string(),
        1 => format!("{prefix}:flags=data_discontinuity"),
        2 => format!("{prefix}:flags=silent_packet"),
        4 => format!("{prefix}:flags=timestamp_error"),
        3 => format!("{prefix}:flags=data_discontinuity,silent_packet"),
        5 => format!("{prefix}:flags=data_discontinuity,timestamp_error"),
        6 => format!("{prefix}:flags=silent_packet,timestamp_error"),
        _ => format!("{prefix}:flags=data_discontinuity,silent_packet,timestamp_error"),
    }
}

#[derive(Debug, Default)]
struct CaptureDiagnosticSummary {
    count: u64,
    flags: u32,
    first_sample: Option<u64>,
    last_sample: Option<u64>,
    first_qpc: Option<u64>,
    last_qpc: Option<u64>,
}

impl CaptureDiagnosticSummary {
    fn observe(&mut self, sample: u64, qpc_position: u64, flags: u32) {
        self.count = self.count.saturating_add(1);
        self.flags |= flags;
        self.first_sample.get_or_insert(sample);
        self.last_sample = Some(sample);
        self.first_qpc.get_or_insert(qpc_position);
        self.last_qpc = Some(qpc_position);
    }

    fn reason(&self) -> Option<&'static str> {
        capture_packet_flag_reason(self.flags)
    }
}

pub struct CaptureManager {
    session_id: String,
    meeting_id: String,
    mic_stream: Option<WasapiCaptureStream>,
    sys_stream: Option<WasapiCaptureStream>,
    device_monitor: Option<DeviceMonitor>,
    stop_signal: Arc<AtomicBool>,
    // Taken by the runtime before it releases the manager lock for End.  The
    // acknowledgement is sent only after every producer has closed and the
    // dispatcher has processed the bounded handoff queue.
    dispatcher_drain_ack: Option<oneshot::Receiver<()>>,

    // Aligner and resamplers
    mic_aligner: TimelineAligner,
    sys_aligner: TimelineAligner,
    mic_resampler: AudioResampler,
    sys_resampler: AudioResampler,

    // Evidence remains at the manager handoff boundary. This is the current
    // downmixed f32 representation, not a claim about the native WASAPI
    // packet format. Resample/alignment output never enters these buffers.
    mic_source_format: SourceFormat,
    sys_source_format: SourceFormat,
    mic_source_next_sample: u64,
    sys_source_next_sample: u64,
    mic_buffer_start_sample: u64,
    sys_buffer_start_sample: u64,
    mic_packet_provenance: PacketProvenance,
    sys_packet_provenance: PacketProvenance,
    mic_packet_segments: VecDeque<PacketSegment>,
    sys_packet_segments: VecDeque<PacketSegment>,
    mic_unreported_overflow: Vec<CaptureGapRecord>,
    sys_unreported_overflow: Vec<CaptureGapRecord>,
    mic_diagnostics: CaptureDiagnosticSummary,
    sys_diagnostics: CaptureDiagnosticSummary,
    mic_overflow_count: u64,
    mic_overflow_frames: u64,
    sys_overflow_count: u64,
    sys_overflow_frames: u64,
    unreported_worker_error: bool,

    // Buffers and indices
    mic_buffer: Vec<f32>,
    sys_buffer: Vec<f32>,
    mic_chunk_index: u64,
    sys_chunk_index: u64,
    // Once a source commit has been converted into a durable recovery gap,
    // End must not claim a clean local-safe commit.
    commit_recovery_required: bool,

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
        event_sender: NativeEventSender,
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
            return Err(
                "At least one audio capture source (mic or system) must be selected".to_string(),
            );
        }

        // The actual shared-mode stream format is negotiated by WASAPI. These
        // placeholders are reset from the first CapturePacket, never from the
        // endpoint enumeration metadata.
        let mic_resampler = AudioResampler::new(48_000, 48_000)?;
        let sys_resampler = AudioResampler::new(48_000, 48_000)?;

        let stop_signal = Arc::new(AtomicBool::new(false));
        let (tx, mut rx) = mpsc::channel::<CaptureMessage>(2000);
        let (dispatcher_done_tx, dispatcher_done_rx) = oneshot::channel();

        // 4. Start WASAPI streams
        let mut mic_stream = None;
        if let Some(id) = mic_id {
            let stream_sender = mpsc::channel::<CaptureHandoff>(100);
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
                while let Some(handoff) = stream_rx.recv().await {
                    match handoff {
                        CaptureHandoff::Packet(packet) => {
                            let _ = tx_forward
                                .send(CaptureMessage::Packet {
                                    source: "microphone".to_string(),
                                    packet,
                                })
                                .await;
                        }
                        CaptureHandoff::Gap(gap) => {
                            let _ = tx_forward
                                .send(CaptureMessage::Gap {
                                    source: "microphone".to_string(),
                                    gap,
                                })
                                .await;
                        }
                        CaptureHandoff::WorkerFailure => {
                            let _ = tx_forward
                                .send(CaptureMessage::Error {
                                    source: "microphone".to_string(),
                                    error: "CAPTURE_WORKER_FAILURE".to_string(),
                                })
                                .await;
                        }
                    }
                }
            });
            mic_stream = Some(stream);
        }

        let mut sys_stream = None;
        if let Some(id) = sys_id {
            let stream_sender = mpsc::channel::<CaptureHandoff>(100);
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
                while let Some(handoff) = stream_rx.recv().await {
                    match handoff {
                        CaptureHandoff::Packet(packet) => {
                            let _ = tx_forward
                                .send(CaptureMessage::Packet {
                                    source: "system_audio".to_string(),
                                    packet,
                                })
                                .await;
                        }
                        CaptureHandoff::Gap(gap) => {
                            let _ = tx_forward
                                .send(CaptureMessage::Gap {
                                    source: "system_audio".to_string(),
                                    gap,
                                })
                                .await;
                        }
                        CaptureHandoff::WorkerFailure => {
                            let _ = tx_forward
                                .send(CaptureMessage::Error {
                                    source: "system_audio".to_string(),
                                    error: "CAPTURE_WORKER_FAILURE".to_string(),
                                })
                                .await;
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
            dispatcher_drain_ack: Some(dispatcher_done_rx),
            mic_aligner: TimelineAligner::new(),
            sys_aligner: TimelineAligner::new(),
            mic_resampler,
            sys_resampler,
            mic_source_format: SourceFormat::pcm_float(48_000, 1),
            sys_source_format: SourceFormat::pcm_float(48_000, 1),
            mic_source_next_sample: 0,
            sys_source_next_sample: 0,
            mic_buffer_start_sample: 0,
            sys_buffer_start_sample: 0,
            mic_packet_provenance: PacketProvenance::default(),
            sys_packet_provenance: PacketProvenance::default(),
            mic_packet_segments: VecDeque::new(),
            sys_packet_segments: VecDeque::new(),
            mic_unreported_overflow: Vec::new(),
            sys_unreported_overflow: Vec::new(),
            mic_diagnostics: CaptureDiagnosticSummary::default(),
            sys_diagnostics: CaptureDiagnosticSummary::default(),
            mic_overflow_count: 0,
            mic_overflow_frames: 0,
            sys_overflow_count: 0,
            sys_overflow_frames: 0,
            unreported_worker_error: false,
            mic_buffer: Vec::new(),
            sys_buffer: Vec::new(),
            mic_chunk_index: 0,
            sys_chunk_index: 0,
            commit_recovery_required: false,
            mic_level: LevelMeter::compute(&[]),
            sys_level: LevelMeter::compute(&[]),
        }));

        // 5. Emit start capture event
        let _ = event_sender.try_send(NativeEventV1::new(
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
            while let Some(msg) = rx.recv().await {
                let mut mgr = manager_clone.lock().await;

                match msg {
                    CaptureMessage::Packet { source, packet } => {
                        // Preserve the native packet's negotiated format and
                        // device/QPC accounting before downmixing.  The mono
                        // samples below are only the canonical capture-profile
                        // input; provenance is never inferred from enumeration.
                        let data = match packet.to_mono_f32() {
                            Ok(data) => data,
                            Err(error) => {
                                // `parse_wave_format` rejects unsupported PCM
                                // formats before this boundary.  Keep this
                                // defensive branch explicit rather than
                                // converting a malformed packet into an empty
                                // source range.
                                let _ = event_sender.try_send(NativeEventV1::new(
                                    "error",
                                    serde_json::json!({"code": "CAPTURE_UNSUPPORTED_FORMAT", "message": error, "category": "capture", "fatal": true}),
                                ));
                                mgr.commit_recovery_required = true;
                                continue;
                            }
                        };
                        if capture_packet_flag_reason(packet.flags).is_some() {
                            let next_sample = if source == "microphone" {
                                mgr.mic_source_next_sample
                            } else {
                                mgr.sys_source_next_sample
                            };
                            if source == "microphone" {
                                mgr.mic_diagnostics.observe(
                                    next_sample,
                                    packet.qpc_position,
                                    packet.flags,
                                );
                            } else {
                                mgr.sys_diagnostics.observe(
                                    next_sample,
                                    packet.qpc_position,
                                    packet.flags,
                                );
                            }
                        }
                        if source == "microphone" {
                            if starts_new_format_epoch(
                                mgr.mic_packet_provenance.format,
                                packet.format,
                            ) && !mgr.mic_buffer.is_empty()
                            {
                                let chunk = std::mem::take(&mut mgr.mic_buffer);
                                let index = mgr.mic_chunk_index;
                                mgr.mic_chunk_index += 1;
                                let range = SourceRange::new(
                                    mgr.mic_buffer_start_sample,
                                    mgr.mic_buffer_start_sample + chunk.len() as u64,
                                );
                                mgr.mic_buffer_start_sample = range.end_sample;
                                let old_format = mgr.mic_source_format;
                                let old_provenance = take_packet_provenance(
                                    &mut mgr.mic_packet_segments,
                                    chunk.len() as u64,
                                )
                                .unwrap_or_default();
                                if Self::write_chunk_or_record_recovery_gap(
                                    &mgr.meeting_id,
                                    "microphone",
                                    index,
                                    &chunk,
                                    old_format,
                                    range,
                                    old_provenance,
                                    storage.clone(),
                                    event_sender.clone(),
                                    mgr.session_id.clone(),
                                )
                                .await
                                .is_err()
                                {
                                    mgr.commit_recovery_required = true;
                                }
                                mgr.mic_packet_segments.clear();
                                mgr.mic_packet_provenance = PacketProvenance::default();
                                if let Ok(resampler) =
                                    AudioResampler::new(packet.format.sample_rate, 48_000)
                                {
                                    mgr.mic_resampler = resampler;
                                } else {
                                    mgr.commit_recovery_required = true;
                                }
                            }
                            mgr.mic_packet_provenance.observe(&packet);
                            mgr.mic_packet_segments
                                .push_back(PacketSegment::from_packet(&packet));
                            mgr.mic_source_format =
                                SourceFormat::pcm_float(packet.format.sample_rate, 1);
                            // Keep the manager-handoff sample sequence intact. The DSP
                            // path below is derived only and never feeds mic_buffer.
                            let source_start = mgr.mic_source_next_sample;
                            mgr.mic_source_next_sample += data.len() as u64;
                            if mgr.mic_buffer.is_empty() {
                                mgr.mic_buffer_start_sample = source_start;
                            }
                            mgr.mic_buffer.extend_from_slice(&data);
                            // Commit source evidence before running optional derived DSP.
                            let source_chunk_size_limit =
                                mgr.mic_source_format.sample_rate as usize * 5;
                            if mgr.mic_buffer.len() >= source_chunk_size_limit {
                                let chunk: Vec<f32> =
                                    mgr.mic_buffer.drain(0..source_chunk_size_limit).collect();
                                let idx = mgr.mic_chunk_index;
                                mgr.mic_chunk_index += 1;
                                let source_format = mgr.mic_source_format;
                                let packet_provenance = take_packet_provenance(
                                    &mut mgr.mic_packet_segments,
                                    chunk.len() as u64,
                                )
                                .unwrap_or_default();
                                let source_range = SourceRange::new(
                                    mgr.mic_buffer_start_sample,
                                    mgr.mic_buffer_start_sample + chunk.len() as u64,
                                );
                                mgr.mic_buffer_start_sample = source_range.end_sample;
                                if Self::write_chunk_or_record_recovery_gap(
                                    &mgr.meeting_id,
                                    "microphone",
                                    idx,
                                    &chunk,
                                    source_format,
                                    source_range,
                                    packet_provenance,
                                    storage.clone(),
                                    event_sender.clone(),
                                    mgr.session_id.clone(),
                                )
                                .await
                                .is_err()
                                {
                                    mgr.commit_recovery_required = true;
                                }
                            }
                            if let Ok(resampled) =
                                process_derived_packet(&mut mgr.mic_resampler, packet.format, &data)
                            {
                                let (gap, _aligned, _state) = mgr.mic_aligner.align(
                                    &resampled,
                                    packet.device_position,
                                    packet.frames,
                                    packet.format.sample_rate,
                                );
                                if gap > 0 {
                                    let _ = event_sender.try_send(NativeEventV1::new(
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
                            }
                        } else if source == "system_audio" {
                            if starts_new_format_epoch(
                                mgr.sys_packet_provenance.format,
                                packet.format,
                            ) && !mgr.sys_buffer.is_empty()
                            {
                                let chunk = std::mem::take(&mut mgr.sys_buffer);
                                let index = mgr.sys_chunk_index;
                                mgr.sys_chunk_index += 1;
                                let range = SourceRange::new(
                                    mgr.sys_buffer_start_sample,
                                    mgr.sys_buffer_start_sample + chunk.len() as u64,
                                );
                                mgr.sys_buffer_start_sample = range.end_sample;
                                let old_format = mgr.sys_source_format;
                                let old_provenance = take_packet_provenance(
                                    &mut mgr.sys_packet_segments,
                                    chunk.len() as u64,
                                )
                                .unwrap_or_default();
                                if Self::write_chunk_or_record_recovery_gap(
                                    &mgr.meeting_id,
                                    "system_audio",
                                    index,
                                    &chunk,
                                    old_format,
                                    range,
                                    old_provenance,
                                    storage.clone(),
                                    event_sender.clone(),
                                    mgr.session_id.clone(),
                                )
                                .await
                                .is_err()
                                {
                                    mgr.commit_recovery_required = true;
                                }
                                mgr.sys_packet_segments.clear();
                                mgr.sys_packet_provenance = PacketProvenance::default();
                                if let Ok(resampler) =
                                    AudioResampler::new(packet.format.sample_rate, 48_000)
                                {
                                    mgr.sys_resampler = resampler;
                                } else {
                                    mgr.commit_recovery_required = true;
                                }
                            }
                            mgr.sys_packet_provenance.observe(&packet);
                            mgr.sys_packet_segments
                                .push_back(PacketSegment::from_packet(&packet));
                            mgr.sys_source_format =
                                SourceFormat::pcm_float(packet.format.sample_rate, 1);
                            let source_start = mgr.sys_source_next_sample;
                            mgr.sys_source_next_sample += data.len() as u64;
                            if mgr.sys_buffer.is_empty() {
                                mgr.sys_buffer_start_sample = source_start;
                            }
                            mgr.sys_buffer.extend_from_slice(&data);
                            let source_chunk_size_limit =
                                mgr.sys_source_format.sample_rate as usize * 5;
                            let should_commit = mgr.sys_buffer.len() >= source_chunk_size_limit;
                            if should_commit {
                                let chunk: Vec<f32> =
                                    mgr.sys_buffer.drain(0..source_chunk_size_limit).collect();
                                let idx = mgr.sys_chunk_index;
                                mgr.sys_chunk_index += 1;
                                let source_format = mgr.sys_source_format;
                                let packet_provenance = take_packet_provenance(
                                    &mut mgr.sys_packet_segments,
                                    chunk.len() as u64,
                                )
                                .unwrap_or_default();
                                let source_range = SourceRange::new(
                                    mgr.sys_buffer_start_sample,
                                    mgr.sys_buffer_start_sample + chunk.len() as u64,
                                );
                                mgr.sys_buffer_start_sample = source_range.end_sample;
                                if Self::write_chunk_or_record_recovery_gap(
                                    &mgr.meeting_id,
                                    "system_audio",
                                    idx,
                                    &chunk,
                                    source_format,
                                    source_range,
                                    packet_provenance,
                                    storage.clone(),
                                    event_sender.clone(),
                                    mgr.session_id.clone(),
                                )
                                .await
                                .is_err()
                                {
                                    mgr.commit_recovery_required = true;
                                }
                            }
                            if let Ok(resampled) =
                                process_derived_packet(&mut mgr.sys_resampler, packet.format, &data)
                            {
                                let (gap, _aligned, _state) = mgr.sys_aligner.align(
                                    &resampled,
                                    packet.device_position,
                                    packet.frames,
                                    packet.format.sample_rate,
                                );
                                if gap > 0 {
                                    let _ = event_sender.try_send(NativeEventV1::new(
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
                            }
                        }
                    }
                    CaptureMessage::Gap { source, gap } => {
                        Self::dispatch_message(
                            &mut mgr,
                            CaptureMessage::Gap { source, gap },
                            storage.clone(),
                            event_sender.clone(),
                        )
                        .await;
                    }
                    CaptureMessage::Error { source, error } => {
                        Self::dispatch_message(
                            &mut mgr,
                            CaptureMessage::Error { source, error },
                            storage.clone(),
                            event_sender.clone(),
                        )
                        .await;
                    }
                }
            }
            let _ = dispatcher_done_tx.send(());
        });

        Ok(manager)
    }

    async fn dispatch_message(
        mgr: &mut Self,
        message: CaptureMessage,
        storage: Arc<Mutex<Option<StorageManager>>>,
        event_sender: NativeEventSender,
    ) {
        match message {
            CaptureMessage::Gap { source, gap } => {
                let missing_frames = gap.frames;
                if source == "microphone" {
                    mgr.mic_overflow_count = mgr.mic_overflow_count.saturating_add(1);
                    mgr.mic_overflow_frames = mgr
                        .mic_overflow_frames
                        .saturating_add(u64::from(missing_frames));
                } else {
                    mgr.sys_overflow_count = mgr.sys_overflow_count.saturating_add(1);
                    mgr.sys_overflow_frames = mgr
                        .sys_overflow_frames
                        .saturating_add(u64::from(missing_frames));
                }
                if source == "microphone" && !mgr.mic_buffer.is_empty() {
                    let chunk = std::mem::take(&mut mgr.mic_buffer);
                    let index = mgr.mic_chunk_index;
                    mgr.mic_chunk_index += 1;
                    let range = SourceRange::new(
                        mgr.mic_buffer_start_sample,
                        mgr.mic_buffer_start_sample + chunk.len() as u64,
                    );
                    mgr.mic_buffer_start_sample = range.end_sample;
                    let meeting_id = mgr.meeting_id.clone();
                    let source_format = mgr.mic_source_format;
                    let session_id = mgr.session_id.clone();
                    let packet_provenance =
                        take_packet_provenance(&mut mgr.mic_packet_segments, chunk.len() as u64)
                            .unwrap_or_default();
                    if Self::write_chunk_or_record_recovery_gap(
                        &meeting_id,
                        "microphone",
                        index,
                        &chunk,
                        source_format,
                        range,
                        packet_provenance,
                        storage.clone(),
                        event_sender.clone(),
                        session_id,
                    )
                    .await
                    .is_err()
                    {
                        mgr.commit_recovery_required = true;
                    }
                } else if source == "system_audio" && !mgr.sys_buffer.is_empty() {
                    let chunk = std::mem::take(&mut mgr.sys_buffer);
                    let index = mgr.sys_chunk_index;
                    mgr.sys_chunk_index += 1;
                    let range = SourceRange::new(
                        mgr.sys_buffer_start_sample,
                        mgr.sys_buffer_start_sample + chunk.len() as u64,
                    );
                    mgr.sys_buffer_start_sample = range.end_sample;
                    let meeting_id = mgr.meeting_id.clone();
                    let source_format = mgr.sys_source_format;
                    let session_id = mgr.session_id.clone();
                    let packet_provenance =
                        take_packet_provenance(&mut mgr.sys_packet_segments, chunk.len() as u64)
                            .unwrap_or_default();
                    if Self::write_chunk_or_record_recovery_gap(
                        &meeting_id,
                        "system_audio",
                        index,
                        &chunk,
                        source_format,
                        range,
                        packet_provenance,
                        storage.clone(),
                        event_sender.clone(),
                        session_id,
                    )
                    .await
                    .is_err()
                    {
                        mgr.commit_recovery_required = true;
                    }
                }
                let (gap_range, format) = if source == "microphone" {
                    let range = gap_range_after_accepted_samples(
                        mgr.mic_source_next_sample,
                        missing_frames,
                    );
                    mgr.mic_source_next_sample = range.end_sample;
                    mgr.mic_buffer_start_sample = range.end_sample;
                    (range, mgr.mic_source_format)
                } else {
                    let range = gap_range_after_accepted_samples(
                        mgr.sys_source_next_sample,
                        missing_frames,
                    );
                    mgr.sys_source_next_sample = range.end_sample;
                    mgr.sys_buffer_start_sample = range.end_sample;
                    (range, mgr.sys_source_format)
                };
                let reason = overflow_reason("CAPTURE_OVERFLOW", gap.flags);
                if Self::record_durable_capture_gap(
                    &mgr.meeting_id,
                    &source,
                    gap_range,
                    format,
                    &reason,
                    Some(gap.device_start),
                    Some(gap.device_end),
                    Some(gap.qpc_start),
                    Some(gap.qpc_end),
                    storage,
                    event_sender.clone(),
                    mgr.session_id.clone(),
                )
                .await
                .is_err()
                {
                    mgr.commit_recovery_required = true;
                }
            }
            CaptureMessage::Error { source, error } => {
                let nonfatal = is_nonfatal_capture_error(&error);
                if nonfatal && let Some(missing_frames) = capture_error_frames(&error) {
                    // A discontinuity cannot live inside a chunk range.
                    // Commit the contiguous prefix first, then make the
                    // missing interval durable.
                    if source == "microphone" && !mgr.mic_buffer.is_empty() {
                        let chunk = std::mem::take(&mut mgr.mic_buffer);
                        let index = mgr.mic_chunk_index;
                        mgr.mic_chunk_index += 1;
                        let range = SourceRange::new(
                            mgr.mic_buffer_start_sample,
                            mgr.mic_buffer_start_sample + chunk.len() as u64,
                        );
                        mgr.mic_buffer_start_sample = range.end_sample;
                        let meeting_id = mgr.meeting_id.clone();
                        let source_format = mgr.mic_source_format;
                        let session_id = mgr.session_id.clone();
                        let packet_provenance = take_packet_provenance(
                            &mut mgr.mic_packet_segments,
                            chunk.len() as u64,
                        )
                        .unwrap_or_default();
                        if Self::write_chunk_or_record_recovery_gap(
                            &meeting_id,
                            "microphone",
                            index,
                            &chunk,
                            source_format,
                            range,
                            packet_provenance,
                            storage.clone(),
                            event_sender.clone(),
                            session_id,
                        )
                        .await
                        .is_err()
                        {
                            mgr.commit_recovery_required = true;
                        }
                    } else if source == "system_audio" && !mgr.sys_buffer.is_empty() {
                        let chunk = std::mem::take(&mut mgr.sys_buffer);
                        let index = mgr.sys_chunk_index;
                        mgr.sys_chunk_index += 1;
                        let range = SourceRange::new(
                            mgr.sys_buffer_start_sample,
                            mgr.sys_buffer_start_sample + chunk.len() as u64,
                        );
                        mgr.sys_buffer_start_sample = range.end_sample;
                        let meeting_id = mgr.meeting_id.clone();
                        let source_format = mgr.sys_source_format;
                        let session_id = mgr.session_id.clone();
                        let packet_provenance = take_packet_provenance(
                            &mut mgr.sys_packet_segments,
                            chunk.len() as u64,
                        )
                        .unwrap_or_default();
                        if Self::write_chunk_or_record_recovery_gap(
                            &meeting_id,
                            "system_audio",
                            index,
                            &chunk,
                            source_format,
                            range,
                            packet_provenance,
                            storage.clone(),
                            event_sender.clone(),
                            session_id,
                        )
                        .await
                        .is_err()
                        {
                            mgr.commit_recovery_required = true;
                        }
                    }
                    let (gap_range, format) = if source == "microphone" {
                        let range = gap_range_after_accepted_samples(
                            mgr.mic_source_next_sample,
                            missing_frames,
                        );
                        mgr.mic_source_next_sample = range.end_sample;
                        mgr.mic_buffer_start_sample = range.end_sample;
                        (range, mgr.mic_source_format)
                    } else {
                        let range = gap_range_after_accepted_samples(
                            mgr.sys_source_next_sample,
                            missing_frames,
                        );
                        mgr.sys_source_next_sample = range.end_sample;
                        mgr.sys_buffer_start_sample = range.end_sample;
                        (range, mgr.sys_source_format)
                    };
                    if Self::record_durable_capture_gap(
                        &mgr.meeting_id,
                        &source,
                        gap_range,
                        format,
                        &error,
                        None,
                        None,
                        None,
                        None,
                        storage,
                        event_sender.clone(),
                        mgr.session_id.clone(),
                    )
                    .await
                    .is_err()
                    {
                        mgr.commit_recovery_required = true;
                    }
                }
                let _ = event_sender.try_send(NativeEventV1::new(
                    if nonfatal { "capture_event" } else { "error" },
                    serde_json::json!({
                        "code": if nonfatal { "CAPTURE_GAP" } else { "CAPTURE_ERROR" },
                        "message": format!("Error in capture source {}: {}", source, error),
                        "category": "capture",
                        "fatal": !nonfatal
                    }),
                ));
            }
            CaptureMessage::Packet { .. } => unreachable!("packet handled by the start loop"),
        }
    }

    /// Stops producer ownership, then returns the drain acknowledgement.  The
    /// caller must release the manager mutex and await it before finalizing.
    pub fn begin_stop_and_take_drain_ack(&mut self) -> Option<oneshot::Receiver<()>> {
        self.stop_signal.store(true, Ordering::SeqCst);

        if let Some(mut stream) = self.mic_stream.take() {
            stream.stop();
            self.mic_unreported_overflow = stream.take_unreported_overflows();
            self.commit_recovery_required |= !self.mic_unreported_overflow.is_empty();
            self.unreported_worker_error |= stream.take_unreported_worker_error();
        }
        if let Some(mut stream) = self.sys_stream.take() {
            stream.stop();
            self.sys_unreported_overflow = stream.take_unreported_overflows();
            self.commit_recovery_required |= !self.sys_unreported_overflow.is_empty();
            self.unreported_worker_error |= stream.take_unreported_worker_error();
        }
        if let Some(mut monitor) = self.device_monitor.take() {
            monitor.stop();
        }

        self.dispatcher_drain_ack.take()
    }

    /// Must run only after `begin_stop_and_take_drain_ack` has acknowledged
    /// producer close and dispatcher drain.
    pub async fn finish_stop_after_drain(
        &mut self,
        storage: Arc<Mutex<Option<StorageManager>>>,
        event_sender: NativeEventSender,
    ) -> (u64, u64, bool) {
        // Flush derived processors independently. Their tail is intentionally
        // excluded from the immutable source buffers.
        if let Ok(tail) = self.mic_resampler.flush()
            && !tail.is_empty()
        {
            let _ = self.mic_aligner.append_tail(&tail);
        }
        if let Ok(tail) = self.sys_resampler.flush()
            && !tail.is_empty()
        {
            let _ = self.sys_aligner.append_tail(&tail);
        }

        let mut commit_failed = self.commit_recovery_required;
        // A final queue overflow cannot be sent once the producer is stopping.
        // Convert it to durable evidence here; failure to do so forces the
        // End acknowledgement into recovery_required.
        for gap in std::mem::take(&mut self.mic_unreported_overflow) {
            let range = gap_range_after_accepted_samples(self.mic_source_next_sample, gap.frames);
            self.mic_source_next_sample = range.end_sample;
            let reason = overflow_reason("CAPTURE_OVERFLOW:final_pending_on_stop", gap.flags);
            if Self::record_durable_capture_gap(
                &self.meeting_id,
                "microphone",
                range,
                self.mic_source_format,
                &reason,
                Some(gap.device_start),
                Some(gap.device_end),
                Some(gap.qpc_start),
                Some(gap.qpc_end),
                storage.clone(),
                event_sender.clone(),
                self.session_id.clone(),
            )
            .await
            .is_err()
            {
                commit_failed = true;
            }
        }
        for gap in std::mem::take(&mut self.sys_unreported_overflow) {
            let range = gap_range_after_accepted_samples(self.sys_source_next_sample, gap.frames);
            self.sys_source_next_sample = range.end_sample;
            let reason = overflow_reason("CAPTURE_OVERFLOW:final_pending_on_stop", gap.flags);
            if Self::record_durable_capture_gap(
                &self.meeting_id,
                "system_audio",
                range,
                self.sys_source_format,
                &reason,
                Some(gap.device_start),
                Some(gap.device_end),
                Some(gap.qpc_start),
                Some(gap.qpc_end),
                storage.clone(),
                event_sender.clone(),
                self.session_id.clone(),
            )
            .await
            .is_err()
            {
                commit_failed = true;
            }
        }
        if self.unreported_worker_error {
            commit_failed = true;
        }

        // Flush remaining mic samples
        if !self.mic_buffer.is_empty() {
            let chunk = std::mem::take(&mut self.mic_buffer);
            let idx = self.mic_chunk_index;
            self.mic_chunk_index += 1;
            let range_start = self.mic_buffer_start_sample;
            let range_end = range_start + chunk.len() as u64;
            self.mic_buffer_start_sample = range_end;
            if Self::write_chunk_or_record_recovery_gap(
                &self.meeting_id,
                "microphone",
                idx,
                &chunk,
                self.mic_source_format,
                SourceRange::new(range_start, range_end),
                take_packet_provenance(&mut self.mic_packet_segments, chunk.len() as u64)
                    .unwrap_or_default(),
                storage.clone(),
                event_sender.clone(),
                self.session_id.clone(),
            )
            .await
            .is_err()
            {
                commit_failed = true;
            }
        }

        // Flush remaining system audio samples
        if !self.sys_buffer.is_empty() {
            let chunk = std::mem::take(&mut self.sys_buffer);
            let idx = self.sys_chunk_index;
            self.sys_chunk_index += 1;
            let range_start = self.sys_buffer_start_sample;
            let range_end = range_start + chunk.len() as u64;
            self.sys_buffer_start_sample = range_end;
            if Self::write_chunk_or_record_recovery_gap(
                &self.meeting_id,
                "system_audio",
                idx,
                &chunk,
                self.sys_source_format,
                SourceRange::new(range_start, range_end),
                take_packet_provenance(&mut self.sys_packet_segments, chunk.len() as u64)
                    .unwrap_or_default(),
                storage.clone(),
                event_sender.clone(),
                self.session_id.clone(),
            )
            .await
            .is_err()
            {
                commit_failed = true;
            }
        }

        for (source, diagnostics) in [
            ("microphone", std::mem::take(&mut self.mic_diagnostics)),
            ("system_audio", std::mem::take(&mut self.sys_diagnostics)),
        ] {
            if diagnostics.count > 0
                && Self::record_durable_capture_event(
                    &self.meeting_id,
                    source,
                    diagnostics,
                    storage.clone(),
                    event_sender.clone(),
                    self.session_id.clone(),
                )
                .await
                .is_err()
            {
                commit_failed = true;
            }
        }

        let event_kind = if commit_failed {
            "recovery_required"
        } else {
            "local_safe"
        };
        let _ = event_sender.try_send(NativeEventV1::new(
            "capture_event",
            serde_json::json!({
                "sessionId": self.session_id.clone(),
                "eventKind": event_kind,
                "isSimulated": false,
                "details": if commit_failed { "Physical capture stopped; recovery is required for one or more source ranges" } else { "Physical capture drained and committed locally" },
                "commitStatus": stop_commit_status(commit_failed)
            }),
        ));

        (self.mic_chunk_index, self.sys_chunk_index, commit_failed)
    }

    /// Retrieve the diagnostic state of levels, gaps, and drift.
    pub fn get_metrics(&self) -> serde_json::Value {
        let mic_timeline = self.mic_aligner.state();
        let sys_timeline = self.sys_aligner.state();
        serde_json::json!({
            "mic": {
                "rms": self.mic_level.rms(),
                "peak": self.mic_level.peak(),
                "clipped": self.mic_level.clipped(),
                "sourceGapCount": mic_timeline.gap_count,
                "missingSourceFrames": mic_timeline.total_gap_samples,
                "overflowCount": self.mic_overflow_count,
                "overflowFrames": self.mic_overflow_frames,
                "diagnosticCount": self.mic_diagnostics.count,
                "diagnosticReasons": self.mic_diagnostics.reason().into_iter().collect::<Vec<_>>(),
                "gapCount": mic_timeline.gap_count,
            },
            "sys": {
                "rms": self.sys_level.rms(),
                "peak": self.sys_level.peak(),
                "clipped": self.sys_level.clipped(),
                "sourceGapCount": sys_timeline.gap_count,
                "missingSourceFrames": sys_timeline.total_gap_samples,
                "overflowCount": self.sys_overflow_count,
                "overflowFrames": self.sys_overflow_frames,
                "diagnosticCount": self.sys_diagnostics.count,
                "diagnosticReasons": self.sys_diagnostics.reason().into_iter().collect::<Vec<_>>(),
                "gapCount": sys_timeline.gap_count,
            },
            "driftSamples": mic_timeline.drift_samples,
        })
    }

    /// Writes the immutable manager-handoff f32 stream with a truthful WAV container.
    async fn write_chunk_file(
        meeting_id: &str,
        source: &str,
        chunk_index: u64,
        samples: &[f32],
        source_format: SourceFormat,
        source_range: SourceRange,
        packet_provenance: PacketProvenance,
        storage: Arc<Mutex<Option<StorageManager>>>,
        event_sender: NativeEventSender,
        session_id: String,
    ) -> Result<(), String> {
        let serialized = serialize_source_chunk(samples, source_format, source_range)?;

        // Commit file to storage
        let storage_guard = storage.lock().await;
        let Some(mgr) = storage_guard.as_ref() else {
            return Err("Storage manager missing during write".to_string());
        };

        // Standard chunk naming pattern conformant to DB schema
        let filename = format!(
            "chunks/{}_{}_{:03}.{}",
            meeting_id,
            source,
            chunk_index,
            serialized.filename_extension()
        );

        let provenance = serde_json::json!({
            "version": 1,
            "canonical": {"container": "webm", "codec": "opus", "sampleRate": 48_000, "channels": 1, "sampleCount": serialized.sample_count()},
            "input": {"sampleRate": serialized.input_format.sample_rate, "channels": serialized.input_format.channels, "sampleCount": serialized.input_sample_count, "range": serialized.range()},
            "nativePackets": {"format": packet_provenance.format.map(|format| serde_json::json!({"sampleRate": format.sample_rate, "channels": format.channels, "bitsPerSample": format.bits_per_sample, "isFloat": format.is_float})), "rawFrameCount": packet_provenance.raw_frames, "devicePositionStart": packet_provenance.device_start, "devicePositionEnd": packet_provenance.device_end, "qpcStart": packet_provenance.qpc_start, "qpcEnd": packet_provenance.qpc_end},
            "derived": false,
        });
        match mgr.commit_source_chunk(
            meeting_id,
            source,
            chunk_index as i64,
            &filename,
            &serialized.bytes,
            &provenance,
        ) {
            Ok((sha256, byte_length)) => {
                // Notify Electron
                let _ = event_sender.try_send(NativeEventV1::new(
                    "capture_event",
                    serde_json::json!({
                        "sessionId": session_id,
                        "eventKind": "chunk_committed",
                        "chunkIndex": chunk_index,
                        "byteLength": byte_length,
                        "sha256": sha256,
                        "sourceFormat": {
                            "container": "webm",
                            "encoding": "opus",
                            "sampleRate": serialized.sample_rate(),
                            "channels": serialized.channels(),
                        },
                        "sourceSampleCount": serialized.sample_count(),
                        "inputSampleCount": serialized.input_sample_count,
                        "inputFormat": {
                            "sampleRate": serialized.input_format.sample_rate,
                            "channels": serialized.input_format.channels,
                        },
                        "sourceRange": serialized.range(),
                        "isSimulated": false,
                        "details": format!("Chunk committed to {}", filename)
                    }),
                ));

                Ok(())
            }
            Err(e) => {
                let _ = event_sender.try_send(NativeEventV1::new(
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

    /// A packet is never forgotten after it reaches the manager.  A failed
    /// chunk write is converted to a durable recovery gap for the same source
    /// range before the dispatcher continues.  If even that record cannot be
    /// written, the caller marks End as recovery-required instead of claiming
    /// a clean local-safe commit.
    async fn write_chunk_or_record_recovery_gap(
        meeting_id: &str,
        source: &str,
        chunk_index: u64,
        samples: &[f32],
        source_format: SourceFormat,
        source_range: SourceRange,
        packet_provenance: PacketProvenance,
        storage: Arc<Mutex<Option<StorageManager>>>,
        event_sender: NativeEventSender,
        session_id: String,
    ) -> Result<(), String> {
        match Self::write_chunk_file(
            meeting_id,
            source,
            chunk_index,
            samples,
            source_format,
            source_range,
            packet_provenance,
            storage.clone(),
            event_sender.clone(),
            session_id.clone(),
        )
        .await
        {
            Ok(()) => Ok(()),
            Err(write_error) => {
                let gap_result = {
                    let storage_guard = storage.lock().await;
                    let Some(mgr) = storage_guard.as_ref() else {
                        return Err(format!(
                            "chunk write failed and no storage is available for recovery gap: {write_error}"
                        ));
                    };
                    mgr.capture_record_gap(
                        meeting_id,
                        source,
                        source_range.start_sample,
                        source_range.end_sample,
                        packet_provenance.qpc_start,
                        packet_provenance.qpc_end,
                        packet_provenance.device_start,
                        packet_provenance.device_end,
                        "chunk_commit_failed",
                    )
                };
                if let Err(gap_error) = gap_result {
                    return Err(format!(
                        "chunk write failed ({write_error}) and recovery gap failed: {gap_error}"
                    ));
                }
                let _ = event_sender.try_send(NativeEventV1::new(
                    "capture_event",
                    serde_json::json!({
                        "sessionId": session_id,
                        "eventKind": "recovery_gap_recorded",
                        "source": source,
                        "chunkIndex": chunk_index,
                        "sourceRange": source_range,
                        "isSimulated": false,
                        "details": "Chunk commit failed; durable recovery gap recorded"
                    }),
                ));
                Err(format!(
                    "chunk write failed; durable recovery gap recorded: {write_error}"
                ))
            }
        }
    }

    async fn record_durable_capture_gap(
        meeting_id: &str,
        source: &str,
        source_range: SourceRange,
        _source_format: SourceFormat,
        reason: &str,
        device_start: Option<u64>,
        device_end: Option<u64>,
        qpc_start: Option<u64>,
        qpc_end: Option<u64>,
        storage: Arc<Mutex<Option<StorageManager>>>,
        event_sender: NativeEventSender,
        session_id: String,
    ) -> Result<(), String> {
        let gap_result = {
            let storage_guard = storage.lock().await;
            let Some(mgr) = storage_guard.as_ref() else {
                return Err("Storage manager missing while recording capture gap".to_string());
            };
            mgr.capture_record_gap(
                meeting_id,
                source,
                source_range.start_sample,
                source_range.end_sample,
                qpc_start,
                qpc_end,
                device_start,
                device_end,
                reason,
            )
        };
        gap_result.map_err(|error| error.to_string())?;
        let _ = event_sender.try_send(NativeEventV1::new(
            "capture_event",
            serde_json::json!({
                "sessionId": session_id,
                "eventKind": "gap_recorded",
                "source": source,
                "sourceRange": source_range,
                "isSimulated": false,
                "details": "Capture pressure was recorded as a durable source gap"
            }),
        ));
        Ok(())
    }

    /// WASAPI flags are durable diagnostics, not inferred frame loss. A zero
    /// width row preserves the exact reason/QPC without creating a source gap;
    /// silence is still committed as ordinary zero-valued content.
    async fn record_durable_capture_event(
        meeting_id: &str,
        source: &str,
        diagnostics: CaptureDiagnosticSummary,
        storage: Arc<Mutex<Option<StorageManager>>>,
        event_sender: NativeEventSender,
        session_id: String,
    ) -> Result<(), String> {
        let storage_guard = storage.lock().await;
        let Some(mgr) = storage_guard.as_ref() else {
            return Err("Storage manager missing while recording capture diagnostic".to_string());
        };
        let reason = diagnostics.reason().unwrap_or("CAPTURE_FLAG:unknown");
        let start_sample = diagnostics.first_sample.unwrap_or(0);
        // Diagnostics are not source-loss rows: retain a zero-width range so
        // source integrity queries cannot mistake their aggregate for a gap.
        let end_sample = start_sample;
        mgr.capture_record_gap(
            meeting_id,
            source,
            start_sample,
            end_sample,
            diagnostics.first_qpc,
            diagnostics.last_qpc,
            None,
            None,
            &format!("CAPTURE_DIAGNOSTIC:count={}:{}", diagnostics.count, reason),
        )
        .map_err(|error| error.to_string())?;
        let _ = event_sender.try_send(NativeEventV1::new(
            "capture_event",
            serde_json::json!({
                "sessionId": session_id,
                "eventKind": "capture_diagnostic_recorded",
                "source": source,
                "reason": reason,
                "count": diagnostics.count,
                "sourceRange": SourceRange::new(start_sample, end_sample),
                "isSimulated": false,
            }),
        ));
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    fn test_manager() -> CaptureManager {
        CaptureManager {
            session_id: "session-test".to_string(),
            meeting_id: "meeting-test".to_string(),
            mic_stream: None,
            sys_stream: None,
            device_monitor: None,
            stop_signal: Arc::new(AtomicBool::new(false)),
            dispatcher_drain_ack: None,
            mic_aligner: TimelineAligner::new(),
            sys_aligner: TimelineAligner::new(),
            mic_resampler: AudioResampler::new(48_000, 48_000).unwrap(),
            sys_resampler: AudioResampler::new(48_000, 48_000).unwrap(),
            mic_source_format: SourceFormat::pcm_float(48_000, 1),
            sys_source_format: SourceFormat::pcm_float(48_000, 1),
            mic_source_next_sample: 0,
            sys_source_next_sample: 0,
            mic_buffer_start_sample: 0,
            sys_buffer_start_sample: 0,
            mic_packet_provenance: PacketProvenance::default(),
            sys_packet_provenance: PacketProvenance::default(),
            mic_packet_segments: VecDeque::new(),
            sys_packet_segments: VecDeque::new(),
            mic_unreported_overflow: Vec::new(),
            sys_unreported_overflow: Vec::new(),
            mic_diagnostics: CaptureDiagnosticSummary::default(),
            sys_diagnostics: CaptureDiagnosticSummary::default(),
            mic_overflow_count: 0,
            mic_overflow_frames: 0,
            sys_overflow_count: 0,
            sys_overflow_frames: 0,
            unreported_worker_error: false,
            mic_buffer: Vec::new(),
            sys_buffer: Vec::new(),
            mic_chunk_index: 0,
            sys_chunk_index: 0,
            commit_recovery_required: false,
            mic_level: LevelMeter::compute(&[]),
            sys_level: LevelMeter::compute(&[]),
        }
    }

    async fn assert_dispatcher_recovery_case(
        source: &str,
        message: CaptureMessage,
        expected_reason: &str,
    ) {
        let temp = TempDir::new().unwrap();
        let storage = Arc::new(Mutex::new(Some(
            StorageManager::new(temp.path().to_str().unwrap()).unwrap(),
        )));
        let (event_sender, mut events) = NativeEventSender::new(32);
        let mut manager = test_manager();
        let format = CaptureFormat::pcm(48_000, 1, 16);
        let mut packet = CapturePacket::for_test(&[0; 1_920], format, 960, 1_000);
        packet.device_position = 10_000;
        let prefix = vec![0.25; 960];

        if source == "microphone" {
            manager.mic_buffer = prefix;
            manager.mic_source_next_sample = 960;
            manager
                .mic_packet_segments
                .push_back(PacketSegment::from_packet(&packet));
        } else {
            manager.sys_buffer = prefix;
            manager.sys_source_next_sample = 960;
            manager
                .sys_packet_segments
                .push_back(PacketSegment::from_packet(&packet));
        }

        CaptureManager::dispatch_message(&mut manager, message, storage.clone(), event_sender)
            .await;

        let live_health = manager.get_metrics();
        let health = &live_health[if source == "microphone" { "mic" } else { "sys" }];
        let expected_overflow_count = i64::from(expected_reason.starts_with("CAPTURE_OVERFLOW"));
        assert_eq!(health["overflowCount"], expected_overflow_count);
        assert_eq!(health["overflowFrames"], expected_overflow_count * 3);

        let db_path = temp.path().join("manifest.db");
        let db = rusqlite::Connection::open(db_path).unwrap();
        let manifest: (String, i64) = db
            .query_row(
                "SELECT source, chunk_index FROM manifest_entries WHERE meeting_id = 'meeting-test'",
                [],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .unwrap();
        assert_eq!(manifest, (source.to_string(), 0));
        let provenance_count: i64 = db
            .query_row(
                "SELECT COUNT(*) FROM capture_provenance WHERE meeting_id = 'meeting-test' AND source = ?1 AND chunk_index = 0",
                [source],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(provenance_count, 1);
        let gap: (i64, i64, String) = db
            .query_row(
                "SELECT start_frame, end_frame, reason FROM capture_gaps WHERE meeting_id = 'meeting-test' AND source = ?1",
                [source],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
            )
            .unwrap();
        assert_eq!(gap, (960, 963, expected_reason.to_string()));

        let first = events.try_recv().unwrap();
        let second = events.try_recv().unwrap();
        assert_eq!(first.event_type, "capture_event");
        assert_eq!(first.payload["eventKind"], "chunk_committed");
        assert_eq!(second.event_type, "capture_event");
        assert_eq!(second.payload["eventKind"], "gap_recorded");
    }

    #[tokio::test]
    async fn dispatcher_commits_prefix_then_durable_gap_for_mic_and_system_recovery() {
        for (source, message, expected_reason) in [
            (
                "microphone",
                Box::new(CaptureMessage::Gap {
                    source: "microphone".to_string(),
                    gap: CaptureGapRecord {
                        frames: 3,
                        flags: 1,
                        device_start: 10_960,
                        device_end: 10_963,
                        qpc_start: 2_000,
                        qpc_end: 2_062,
                    },
                }),
                "CAPTURE_OVERFLOW:flags=data_discontinuity",
            ),
            (
                "microphone",
                Box::new(CaptureMessage::Error {
                    source: "microphone".to_string(),
                    error: "CAPTURE_FLAG:data_discontinuity:frames=3".to_string(),
                }),
                "CAPTURE_FLAG:data_discontinuity:frames=3",
            ),
            (
                "system_audio",
                Box::new(CaptureMessage::Gap {
                    source: "system_audio".to_string(),
                    gap: CaptureGapRecord {
                        frames: 3,
                        flags: 1,
                        device_start: 10_960,
                        device_end: 10_963,
                        qpc_start: 2_000,
                        qpc_end: 2_062,
                    },
                }),
                "CAPTURE_OVERFLOW:flags=data_discontinuity",
            ),
            (
                "system_audio",
                Box::new(CaptureMessage::Error {
                    source: "system_audio".to_string(),
                    error: "CAPTURE_FLAG:data_discontinuity:frames=3".to_string(),
                }),
                "CAPTURE_FLAG:data_discontinuity:frames=3",
            ),
        ] {
            assert_dispatcher_recovery_case(source, *message, expected_reason).await;
        }
    }

    #[test]
    fn source_chunk_is_independently_marked_as_webm_opus_48k_mono() {
        let source = vec![0.25; 960];
        let serialized = serialize_source_chunk(
            &source,
            SourceFormat::pcm_float(48_000, 1),
            SourceRange::new(120, 1080),
        )
        .unwrap();

        assert_eq!(serialized.filename_extension(), "webm");
        assert_eq!(&serialized.bytes[0..4], &[0x1a, 0x45, 0xdf, 0xa3]);
        assert!(
            serialized
                .bytes
                .windows(b"A_OPUS".len())
                .any(|bytes| bytes == b"A_OPUS")
        );
        assert_eq!(serialized.sample_rate(), 48_000);
        assert_eq!(serialized.channels(), 1);
        assert_eq!(serialized.sample_count(), 960);
        assert_eq!(serialized.input_sample_count, 960);
        assert_eq!(serialized.range(), SourceRange::new(120, 1080));
    }

    #[test]
    fn opus_frames_decode_and_tail_padding_is_not_source_duration() {
        let source = vec![0.25; 961];
        let frames = encode_opus_frames(&source).unwrap();
        assert_eq!(frames.len(), 2);
        assert_eq!(frames[0].discard_padding_samples, 0);
        assert_eq!(frames[1].discard_padding_samples, 959);

        let mut decoder = opus::Decoder::new(48_000, Channels::Mono).unwrap();
        let decoded_frames: usize = frames
            .iter()
            .map(|frame| {
                let mut pcm = [0.0; 960];
                decoder
                    .decode_float(&frame.packet, &mut pcm, false)
                    .unwrap()
            })
            .sum();
        assert_eq!(decoded_frames, 1_920);
        assert_eq!(
            decoded_frames - usize::from(frames[1].discard_padding_samples),
            source.len(),
            "encoded padding must be discarded rather than reported as source audio"
        );

        let webm = mux_opus_webm(&source).unwrap();
        let accounting = parse_webm_opus_accounting(&webm).unwrap();
        assert_eq!(accounting.block_group_count, 1);
        assert_eq!(accounting.discard_padding_ns, vec![19_979_166]);
        assert_eq!(accounting.decoded_samples, 1_920);
        assert_eq!(accounting.playable_samples, source.len() as u64);
    }

    #[cfg(test)]
    #[test]
    fn local_speech_loads_finalized_webm_opus_capture_chunks() {
        use sha2::{Digest, Sha256};

        let dir = TempDir::new().unwrap();
        let source = (0..48_001)
            .map(|sample| {
                let phase = std::f32::consts::TAU * 440.0 * sample as f32 / 48_000.0;
                phase.sin() * 0.25
            })
            .collect::<Vec<_>>();
        let webm = mux_opus_webm(&source).unwrap();
        std::fs::write(dir.path().join("meeting.webm"), &webm).unwrap();
        let mut hasher = Sha256::new();
        hasher.update(&webm);

        let window = crate::local_speech_audio_test::load_audio_source(
            &crate::local_speech_audio_test::AudioSourceRequest {
                source_path: std::path::PathBuf::from("meeting.webm"),
                source_sha256: format!("{:x}", hasher.finalize()),
                start_ms: 0,
                end_ms: None,
            },
            dir.path(),
        )
        .expect("finalized WebM/Opus microphone chunks must be readable by local speech");

        assert_eq!(window.samples_16khz_mono.len(), 16_001);
        assert_eq!(window.source_end_ms, 1_001);
        let rms = (window
            .samples_16khz_mono
            .iter()
            .map(|sample| sample * sample)
            .sum::<f32>()
            / window.samples_16khz_mono.len() as f32)
            .sqrt();
        assert!(
            rms > 0.01,
            "decoded audio should contain non-silent samples"
        );
    }

    #[test]
    fn capture_flags_and_overflow_are_nonfatal_diagnostics() {
        assert!(is_nonfatal_capture_error(
            "CAPTURE_FLAG:data_discontinuity:frames=10"
        ));
        assert!(is_nonfatal_capture_error("CAPTURE_OVERFLOW:frames=10"));
        assert!(!is_nonfatal_capture_error("device disconnected"));
    }

    #[test]
    fn repeated_packet_flags_are_aggregated_without_creating_source_loss() {
        let mut diagnostics = CaptureDiagnosticSummary::default();
        for index in 0..100 {
            diagnostics.observe(index, 1_000 + index, 0x1);
        }

        assert_eq!(diagnostics.count, 100);
        assert_eq!(diagnostics.first_sample, Some(0));
        assert_eq!(diagnostics.last_sample, Some(99));
        assert_eq!(
            diagnostics.reason(),
            Some("CAPTURE_FLAG:data_discontinuity")
        );
    }

    #[test]
    fn capture_metrics_separate_diagnostics_from_source_loss() {
        let mut manager = test_manager();
        manager.mic_diagnostics.observe(480, 1_000, 0x1);
        manager.sys_diagnostics.observe(960, 2_000, 0x4);

        let metrics = manager.get_metrics();
        for source in ["mic", "sys"] {
            let health = &metrics[source];
            assert_eq!(health["sourceGapCount"], 0);
            assert_eq!(health["missingSourceFrames"], 0);
            assert_eq!(health["overflowCount"], 0);
            assert_eq!(health["overflowFrames"], 0);
            assert_eq!(health["diagnosticCount"], 1);
            assert_eq!(health["gapCount"], health["sourceGapCount"]);
        }
        assert_eq!(
            metrics["mic"]["diagnosticReasons"],
            serde_json::json!(["CAPTURE_FLAG:data_discontinuity"])
        );
        assert_eq!(
            metrics["sys"]["diagnosticReasons"],
            serde_json::json!(["CAPTURE_FLAG:timestamp_error"])
        );
    }

    #[tokio::test]
    async fn aggregated_packet_flags_persist_one_zero_width_diagnostic() {
        let temp = TempDir::new().unwrap();
        let storage = Arc::new(Mutex::new(Some(
            StorageManager::new(temp.path().to_str().unwrap()).unwrap(),
        )));
        let (event_sender, mut events) = NativeEventSender::new(4);
        let mut diagnostics = CaptureDiagnosticSummary::default();
        for index in 0..100 {
            diagnostics.observe(4_800 + index, 10_000 + index, 0x1);
        }

        CaptureManager::record_durable_capture_event(
            "meeting-test",
            "microphone",
            diagnostics,
            storage,
            event_sender,
            "session-test".to_string(),
        )
        .await
        .unwrap();

        let db = rusqlite::Connection::open(temp.path().join("manifest.db")).unwrap();
        let row: (i64, i64, i64, i64, String) = db
            .query_row(
                "SELECT start_frame, end_frame, qpc_start, qpc_end, reason FROM capture_gaps WHERE meeting_id = 'meeting-test'",
                [],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?, row.get(4)?)),
            )
            .unwrap();
        assert_eq!(row.0, 4_800);
        assert_eq!(row.1, 4_800, "diagnostics must not create source loss");
        assert_eq!((row.2, row.3), (10_000, 10_099));
        assert_eq!(
            row.4,
            "CAPTURE_DIAGNOSTIC:count=100:CAPTURE_FLAG:data_discontinuity"
        );

        let event = events.try_recv().unwrap();
        assert_eq!(event.payload["eventKind"], "capture_diagnostic_recorded");
        assert_eq!(event.payload["count"], 100);
    }

    #[test]
    fn typed_realtime_gap_preserves_device_and_qpc_boundaries() {
        let gap = CaptureGapRecord {
            frames: 960,
            flags: 5,
            device_start: 12,
            device_end: 972,
            qpc_start: 1_000,
            qpc_end: 201_000,
        };
        assert_eq!(gap.frames, 960);
        assert_eq!((gap.device_start, gap.device_end), (12, 972));
        assert_eq!((gap.qpc_start, gap.qpc_end), (1_000, 201_000));
    }

    #[test]
    fn stop_status_reports_commit_recovery_requirement() {
        assert_eq!(stop_commit_status(false), "committed");
        assert_eq!(stop_commit_status(true), "recovery_required");
    }

    #[test]
    fn commit_lifecycle_allows_one_in_flight_commit_and_no_detached_backlog() {
        assert_eq!(MAX_IN_FLIGHT_CHUNK_COMMITS, 1);
        assert_eq!(commit_queue_capacity(), 0);
    }

    #[test]
    fn overflow_gap_starts_after_the_last_accepted_source_sample() {
        assert_eq!(
            gap_range_after_accepted_samples(480, 960),
            SourceRange::new(480, 1440)
        );
    }

    #[test]
    fn capture_pressure_errors_preserve_the_missing_frame_count() {
        assert_eq!(
            capture_error_frames("CAPTURE_OVERFLOW:frames=960"),
            Some(960)
        );
        assert_eq!(
            capture_error_frames(
                "CAPTURE_OVERFLOW:frames=960:flags=data_discontinuity,timestamp_error"
            ),
            Some(960)
        );
        assert_eq!(
            capture_error_frames("CAPTURE_FLAG:data_discontinuity:frames=10"),
            Some(10)
        );
        assert_eq!(capture_error_frames("device disconnected"), None);
    }

    #[test]
    fn recovery_prefixes_for_both_sources_preserve_provenance_before_gap() {
        let format = CaptureFormat::pcm(48_000, 1, 16);
        let mut packet = CapturePacket::for_test(&[0; 16], format, 8, 1_000);
        packet.device_position = 1_000;

        for (source, message) in [
            (
                "microphone",
                Box::new(CaptureMessage::Gap {
                    source: "microphone".to_string(),
                    gap: CaptureGapRecord {
                        frames: 3,
                        flags: 1,
                        device_start: 8,
                        device_end: 11,
                        qpc_start: 2_000,
                        qpc_end: 2_062,
                    },
                }),
            ),
            (
                "microphone",
                Box::new(CaptureMessage::Error {
                    source: "microphone".to_string(),
                    error: "CAPTURE_FLAG:data_discontinuity:frames=3".to_string(),
                }),
            ),
            (
                "system_audio",
                Box::new(CaptureMessage::Gap {
                    source: "system_audio".to_string(),
                    gap: CaptureGapRecord {
                        frames: 3,
                        flags: 1,
                        device_start: 8,
                        device_end: 11,
                        qpc_start: 2_000,
                        qpc_end: 2_062,
                    },
                }),
            ),
            (
                "system_audio",
                Box::new(CaptureMessage::Error {
                    source: "system_audio".to_string(),
                    error: "CAPTURE_FLAG:data_discontinuity:frames=3".to_string(),
                }),
            ),
        ] {
            let mut segments = VecDeque::from([PacketSegment::from_packet(&packet)]);
            let prefix = take_packet_provenance(&mut segments, 5).unwrap();
            assert_eq!(prefix.raw_frames, 5, "{source} prefix must be contiguous");
            assert_eq!(prefix.device_start, Some(1_000));
            assert_eq!(prefix.device_end, Some(1_005));
            assert_eq!(segments.front().map(|segment| segment.frames), Some(3));

            let missing_frames = match *message {
                CaptureMessage::Gap { gap, .. } => gap.frames,
                CaptureMessage::Error { error, .. } => {
                    assert!(is_nonfatal_capture_error(&error));
                    capture_error_frames(&error).unwrap()
                }
                CaptureMessage::Packet { .. } => unreachable!(),
            };
            assert_eq!(
                gap_range_after_accepted_samples(prefix.raw_frames, missing_frames),
                SourceRange::new(5, 8),
                "{source} durable gap must begin after the committed prefix"
            );
        }
    }

    #[test]
    fn packet_provenance_uses_capture_packet_not_device_guess() {
        let format = CaptureFormat::pcm(44_100, 2, 16);
        let mut provenance = PacketProvenance::default();
        let mut packet = CapturePacket::for_test(&[0; 8], format, 2, 42);
        packet.device_position = 11;
        provenance.observe(&packet);

        assert_eq!(
            provenance.source_format(SourceFormat::pcm_float(48_000, 1)),
            SourceFormat::pcm_float(44_100, 2)
        );
        assert_eq!(provenance.raw_frames, 2);
        assert_eq!(provenance.device_start, Some(11));
        assert_eq!(provenance.device_end, Some(13));
        assert_eq!(provenance.qpc_start, Some(42));
        assert_eq!(provenance.qpc_end, Some(42 + qpc_duration(2, 44_100)));
    }

    #[test]
    fn provenance_split_assigns_residual_packet_range_to_next_chunk() {
        // Production break caught: taking whole-packet provenance for a chunk
        // makes the next chunk claim no device/QPC range after a boundary.
        let packet = CapturePacket {
            bytes: [0; crate::capture::wasapi::MAX_PACKET_BYTES],
            byte_len: 16,
            format: CaptureFormat::pcm(48_000, 1, 16),
            frames: 8,
            device_position: 100,
            qpc_position: 1_000_000,
            flags: 0,
        };
        let mut segments = std::collections::VecDeque::from([PacketSegment::from_packet(&packet)]);

        let first = take_packet_provenance(&mut segments, 5).unwrap();
        let second = take_packet_provenance(&mut segments, 3).unwrap();

        assert_eq!(first.raw_frames, 5);
        assert_eq!(first.device_start, Some(100));
        assert_eq!(first.device_end, Some(105));
        assert_eq!(second.raw_frames, 3);
        assert_eq!(second.device_start, Some(105));
        assert_eq!(second.device_end, Some(108));
        assert!(second.qpc_start.unwrap() > first.qpc_start.unwrap());
    }

    #[test]
    fn derived_resampler_reinitializes_from_negotiated_packet_format() {
        // Production break caught: using endpoint enumeration metadata keeps a
        // 48 kHz resampler after WASAPI actually negotiates 44.1 kHz.
        let mut resampler = AudioResampler::new(48_000, 48_000).unwrap();
        let packet_format = CaptureFormat::pcm(44_100, 1, 16);

        let _ = process_derived_packet(&mut resampler, packet_format, &[0.25; 500]).unwrap();

        assert_eq!(resampler.input_rate(), 44_100);
    }

    #[test]
    fn changed_capture_format_starts_a_new_canonical_source_epoch() {
        // Production break caught: a single canonical chunk provenance record
        // cannot truthfully describe samples accepted under two WASAPI formats.
        let first = CaptureFormat::pcm(48_000, 1, 16);
        let changed = CaptureFormat::pcm(44_100, 2, 16);
        assert!(!starts_new_format_epoch(Some(first), first));
        assert!(starts_new_format_epoch(Some(first), changed));
        assert!(!starts_new_format_epoch(None, changed));
    }
}
