// kms-native audio capture — WASAPI stream driver.
//
// Manages the lifetime of a WASAPI shared-mode event-driven capture stream.
// Spawns background worker thread, handles buffers, downmixing, and channel handoff.

use std::sync::Arc;
use std::sync::Mutex;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::thread::JoinHandle;
use tokio::sync::mpsc::Sender;
use windows::Win32::Foundation::{CloseHandle, WAIT_OBJECT_0};
use windows::Win32::Media::Audio::*;
use windows::Win32::Media::Multimedia::WAVE_FORMAT_IEEE_FLOAT;
use windows::Win32::System::Com::*;
use windows::Win32::System::Threading::{CreateEventW, WaitForSingleObject};
use windows::core::GUID;

const WAVE_FORMAT_PCM: u16 = 1;
const WAVE_FORMAT_EXTENSIBLE: u16 = 0xFFFE;
const BUFFER_FLAG_DATA_DISCONTINUITY: u32 = 1;
const BUFFER_FLAG_SILENT: u32 = 2;
const BUFFER_FLAG_TIMESTAMP_ERROR: u32 = 4;

use crate::capture::device::ensure_com_initialized;

pub struct WasapiCaptureStream {
    thread_handle: Option<JoinHandle<()>>,
    stop_signal: Arc<AtomicBool>,
    // A bounded queue can be full while the owner requests stop.  The worker
    // must not block trying to report the final loss, so retain that exact
    // frame count for the manager to durably account after join.
    unreported_overflow_frames: Arc<AtomicU64>,
    unreported_overflow_flags: Arc<AtomicU64>,
    unreported_overflow_device_start: Arc<AtomicU64>,
    unreported_overflow_device_end: Arc<AtomicU64>,
    unreported_overflow_qpc_start: Arc<AtomicU64>,
    unreported_overflow_qpc_end: Arc<AtomicU64>,
    has_unreported_overflow: Arc<AtomicBool>,
    unreported_worker_error: Arc<AtomicBool>,
    // Written only after the realtime loop has stopped and joined; this
    // bounded shutdown handoff never takes a callback-side lock.
    unreported_overflows: Arc<Mutex<Vec<CaptureGapRecord>>>,
}

pub struct CaptureConfig {
    pub device_id: String,
    pub device_type: String, // "microphone" or "system_audio"
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct CaptureFormat {
    pub sample_rate: u32,
    pub channels: u16,
    pub bits_per_sample: u16,
    pub is_float: bool,
}

impl CaptureFormat {
    pub const fn pcm(sample_rate: u32, channels: u16, bits_per_sample: u16) -> Self {
        Self {
            sample_rate,
            channels,
            bits_per_sample,
            is_float: false,
        }
    }
}

pub const MAX_PACKET_BYTES: usize = 65_536;

/// Fixed-size handoff record. WASAPI's event thread only copies the negotiated
/// packet into this pre-sized slot and `try_send`s it; decoding/allocation is a
/// writer-side concern. A packet too large for a slot is represented as a gap.
pub struct CapturePacket {
    pub bytes: [u8; MAX_PACKET_BYTES],
    pub byte_len: usize,
    pub format: CaptureFormat,
    pub frames: u32,
    pub device_position: u64,
    pub qpc_position: u64,
    pub flags: u32,
}

/// Allocation-free loss metadata emitted by the WASAPI event thread.  This is
/// deliberately typed: turning it into a diagnostic string belongs to the
/// manager/writer side of the handoff, never to the realtime callback.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]
pub struct CaptureGapRecord {
    pub frames: u64,
    pub flags: u32,
    pub device_start: u64,
    pub device_end: u64,
    pub qpc_start: u64,
    pub qpc_end: u64,
}

/// Every realtime handoff is fixed-size except the pre-sized packet slot.
/// In particular, overload reporting cannot allocate a `String`.
pub enum CaptureHandoff {
    Packet(CapturePacket),
    Gap(CaptureGapRecord),
    WorkerFailure,
}

impl CapturePacket {
    #[cfg(test)]
    pub fn for_test(bytes: &[u8], format: CaptureFormat, frames: u32, qpc_position: u64) -> Self {
        assert!(bytes.len() <= MAX_PACKET_BYTES);
        let mut slot = [0; MAX_PACKET_BYTES];
        slot[..bytes.len()].copy_from_slice(bytes);
        Self {
            bytes: slot,
            byte_len: bytes.len(),
            format,
            frames,
            device_position: 0,
            qpc_position,
            flags: 0,
        }
    }

    pub fn to_mono_f32(&self) -> Result<Vec<f32>, String> {
        let mut mono = Vec::with_capacity(self.frames as usize);
        if self.flags & BUFFER_FLAG_SILENT != 0 {
            return Ok(vec![0.0; self.frames as usize]);
        }
        let channels = self.format.channels as usize;
        if channels == 0 {
            return Err("CAPTURE_UNSUPPORTED_FORMAT:zero_channels".to_string());
        }
        if self.format.is_float {
            for frame in self.bytes[..self.byte_len].chunks_exact(channels * 4) {
                mono.push(
                    frame
                        .chunks_exact(4)
                        .map(|sample| f32::from_le_bytes(sample.try_into().expect("f32")))
                        .sum::<f32>()
                        / channels as f32,
                );
            }
        } else if self.format.bits_per_sample == 16 {
            for frame in self.bytes[..self.byte_len].chunks_exact(channels * 2) {
                mono.push(
                    frame
                        .chunks_exact(2)
                        .map(|sample| {
                            i16::from_le_bytes(sample.try_into().expect("i16")) as f32 / 32768.0
                        })
                        .sum::<f32>()
                        / channels as f32,
                );
            }
        } else if self.format.bits_per_sample == 24 {
            for frame in self.bytes[..self.byte_len].chunks_exact(channels * 3) {
                mono.push(
                    frame
                        .chunks_exact(3)
                        .map(|sample| {
                            let unsigned = i32::from(sample[0])
                                | (i32::from(sample[1]) << 8)
                                | (i32::from(sample[2]) << 16);
                            let signed = if unsigned & 0x80_0000 != 0 {
                                unsigned | !0x00ff_ffff
                            } else {
                                unsigned
                            };
                            signed as f32 / 8_388_608.0
                        })
                        .sum::<f32>()
                        / channels as f32,
                );
            }
        } else {
            return Err(format!(
                "CAPTURE_UNSUPPORTED_FORMAT:pcm_bits={}",
                self.format.bits_per_sample
            ));
        }
        if mono.len() != self.frames as usize {
            return Err(format!(
                "CAPTURE_UNSUPPORTED_FORMAT:truncated_packet:expected_frames={}:decoded_frames={}",
                self.frames,
                mono.len()
            ));
        }
        Ok(mono)
    }
}

const CAPTURE_FLAG_MASK: u32 =
    BUFFER_FLAG_DATA_DISCONTINUITY | BUFFER_FLAG_SILENT | BUFFER_FLAG_TIMESTAMP_ERROR;

fn packet_flag_reason_suffix(flags: u32) -> &'static str {
    match flags & CAPTURE_FLAG_MASK {
        0 => "",
        BUFFER_FLAG_DATA_DISCONTINUITY => ":flags=data_discontinuity",
        BUFFER_FLAG_SILENT => ":flags=silent_packet",
        BUFFER_FLAG_TIMESTAMP_ERROR => ":flags=timestamp_error",
        BUFFER_FLAG_DATA_DISCONTINUITY | BUFFER_FLAG_SILENT => {
            ":flags=data_discontinuity,silent_packet"
        }
        BUFFER_FLAG_DATA_DISCONTINUITY | BUFFER_FLAG_TIMESTAMP_ERROR => {
            ":flags=data_discontinuity,timestamp_error"
        }
        BUFFER_FLAG_SILENT | BUFFER_FLAG_TIMESTAMP_ERROR => ":flags=silent_packet,timestamp_error",
        _ => ":flags=data_discontinuity,silent_packet,timestamp_error",
    }
}

struct PendingOverflow {
    // This queue is allocated before `IAudioClient::Start`; recording a
    // dropped packet only writes into its reserved capacity. Each entry is a
    // contiguous device/QPC interval—never an invented span across a route
    // reset or other discontinuity.
    records: Vec<CaptureGapRecord>,
    terminal: Option<CaptureGapRecord>,
}

impl PendingOverflow {
    fn new() -> Self {
        Self {
            records: Vec::with_capacity(32),
            terminal: None,
        }
    }

    fn reason_suffix(&self) -> &'static str {
        self.records
            .first()
            .map_or("", |record| packet_flag_reason_suffix(record.flags))
    }
}

// GUID constants for audio subformats
const KSDATAFORMAT_SUBTYPE_IEEE_FLOAT: GUID = GUID::from_values(
    0x00000003,
    0x0000,
    0x0010,
    [0x80, 0x00, 0x00, 0xaa, 0x00, 0x38, 0x9b, 0x71],
);
const KSDATAFORMAT_SUBTYPE_PCM: GUID = GUID::from_values(
    0x00000001,
    0x0000,
    0x0010,
    [0x80, 0x00, 0x00, 0xaa, 0x00, 0x38, 0x9b, 0x71],
);

impl WasapiCaptureStream {
    pub fn start(config: CaptureConfig, sender: Sender<CaptureHandoff>) -> Result<Self, String> {
        ensure_com_initialized();

        let stop_signal = Arc::new(AtomicBool::new(false));
        let stop_signal_clone = stop_signal.clone();
        let unreported_overflow_frames = Arc::new(AtomicU64::new(0));
        let unreported_overflow_frames_clone = unreported_overflow_frames.clone();
        let unreported_overflow_flags = Arc::new(AtomicU64::new(0));
        let unreported_overflow_flags_clone = unreported_overflow_flags.clone();
        let unreported_overflow_device_start = Arc::new(AtomicU64::new(0));
        let unreported_overflow_device_start_clone = unreported_overflow_device_start.clone();
        let unreported_overflow_device_end = Arc::new(AtomicU64::new(0));
        let unreported_overflow_device_end_clone = unreported_overflow_device_end.clone();
        let unreported_overflow_qpc_start = Arc::new(AtomicU64::new(0));
        let unreported_overflow_qpc_start_clone = unreported_overflow_qpc_start.clone();
        let unreported_overflow_qpc_end = Arc::new(AtomicU64::new(0));
        let unreported_overflow_qpc_end_clone = unreported_overflow_qpc_end.clone();
        let has_unreported_overflow = Arc::new(AtomicBool::new(false));
        let has_unreported_overflow_clone = has_unreported_overflow.clone();
        let unreported_worker_error = Arc::new(AtomicBool::new(false));
        let unreported_overflows = Arc::new(Mutex::new(Vec::with_capacity(33)));
        let unreported_overflows_clone = unreported_overflows.clone();
        let unreported_worker_error_clone = unreported_worker_error.clone();

        let thread_handle = std::thread::spawn(move || {
            if let Err(e) = Self::run_capture_loop(
                config,
                stop_signal_clone,
                sender.clone(),
                unreported_overflow_frames_clone.clone(),
                unreported_overflow_flags_clone.clone(),
                unreported_overflow_device_start_clone,
                unreported_overflow_device_end_clone,
                unreported_overflow_qpc_start_clone,
                unreported_overflow_qpc_end_clone,
                has_unreported_overflow_clone,
                unreported_overflows_clone,
            ) {
                // Never block shutdown behind a full bounded handoff.  The
                // manager will mark recovery-required if it cannot receive
                // this diagnostic before producer close.
                let _ = e;
                if sender.try_send(CaptureHandoff::WorkerFailure).is_err() {
                    unreported_worker_error_clone.store(true, Ordering::SeqCst);
                }
            }
        });

        Ok(Self {
            thread_handle: Some(thread_handle),
            stop_signal,
            unreported_overflow_frames,
            unreported_overflow_flags,
            unreported_overflow_device_start,
            unreported_overflow_device_end,
            unreported_overflow_qpc_start,
            unreported_overflow_qpc_end,
            has_unreported_overflow,
            unreported_worker_error,
            unreported_overflows,
        })
    }

    pub fn stop(&mut self) {
        self.stop_signal.store(true, Ordering::SeqCst);
        if let Some(handle) = self.thread_handle.take() {
            let _ = handle.join();
        }
    }

    pub fn take_unreported_overflows(&self) -> Vec<CaptureGapRecord> {
        let mut records = self
            .unreported_overflows
            .lock()
            .expect("shutdown handoff poisoned");
        std::mem::take(&mut *records)
    }

    pub fn take_unreported_overflow(&self) -> Option<CaptureGapRecord> {
        if !self.has_unreported_overflow.swap(false, Ordering::SeqCst) {
            return None;
        }
        Some(CaptureGapRecord {
            frames: self.unreported_overflow_frames.swap(0, Ordering::SeqCst),
            flags: self.unreported_overflow_flags.swap(0, Ordering::SeqCst) as u32,
            device_start: self.unreported_overflow_device_start.load(Ordering::SeqCst),
            device_end: self.unreported_overflow_device_end.load(Ordering::SeqCst),
            qpc_start: self.unreported_overflow_qpc_start.load(Ordering::SeqCst),
            qpc_end: self.unreported_overflow_qpc_end.load(Ordering::SeqCst),
        })
    }

    pub fn take_unreported_worker_error(&self) -> bool {
        self.unreported_worker_error.swap(false, Ordering::SeqCst)
    }

    fn run_capture_loop(
        config: CaptureConfig,
        stop_signal: Arc<AtomicBool>,
        sender: Sender<CaptureHandoff>,
        unreported_overflow_frames: Arc<AtomicU64>,
        unreported_overflow_flags: Arc<AtomicU64>,
        unreported_overflow_device_start: Arc<AtomicU64>,
        unreported_overflow_device_end: Arc<AtomicU64>,
        unreported_overflow_qpc_start: Arc<AtomicU64>,
        unreported_overflow_qpc_end: Arc<AtomicU64>,
        has_unreported_overflow: Arc<AtomicBool>,
        unreported_overflows: Arc<Mutex<Vec<CaptureGapRecord>>>,
    ) -> Result<(), String> {
        ensure_com_initialized();

        unsafe {
            let enumerator: IMMDeviceEnumerator =
                CoCreateInstance(&MMDeviceEnumerator, None, CLSCTX_ALL)
                    .map_err(|e| format!("Failed to create MMDeviceEnumerator: {}", e))?;

            // Find IMMDevice by ID
            let device = if config.device_id == "default" {
                let flow = if config.device_type == "microphone" {
                    eCapture
                } else {
                    eRender
                };
                enumerator
                    .GetDefaultAudioEndpoint(flow, eConsole)
                    .map_err(|e| format!("Failed to get default device: {}", e))?
            } else {
                // Find matching device ID
                let flow = if config.device_type == "microphone" {
                    eCapture
                } else {
                    eRender
                };
                let collection = enumerator
                    .EnumAudioEndpoints(flow, DEVICE_STATE_ACTIVE)
                    .map_err(|e| format!("Failed to enum endpoints: {}", e))?;
                let count = collection.GetCount().map_err(|e| e.to_string())?;
                let mut found_device = None;
                for i in 0..count {
                    let d = collection.Item(i).map_err(|e| e.to_string())?;
                    let id_pwstr = d.GetId().map_err(|e| e.to_string())?;
                    let id_str = id_pwstr.to_string().unwrap_or_default();
                    CoTaskMemFree(Some(id_pwstr.as_ptr() as *const std::ffi::c_void));
                    if id_str == config.device_id {
                        found_device = Some(d);
                        break;
                    }
                }
                match found_device {
                    Some(d) => d,
                    None => return Err(format!("Device not found: {}", config.device_id)),
                }
            };

            // Activate IAudioClient
            let audio_client: IAudioClient = device
                .Activate(CLSCTX_ALL, None)
                .map_err(|e| format!("Failed to activate IAudioClient: {}", e))?;

            // Get Mix Format
            let wave_format_ptr = audio_client
                .GetMixFormat()
                .map_err(|e| format!("Failed to get mix format: {}", e))?;
            let wave_format = &*wave_format_ptr;

            let (_sample_rate, channels, is_float, bits_per_sample) =
                Self::parse_wave_format(wave_format)?;

            // Setup initialization flags
            let mut flags = AUDCLNT_STREAMFLAGS_EVENTCALLBACK;
            if config.device_type == "system_audio" {
                // Loopback needs this flag
                flags |= AUDCLNT_STREAMFLAGS_LOOPBACK;
            }

            // Shared mode initialization
            let share_mode = AUDCLNT_SHAREMODE_SHARED;
            let buffer_duration: i64 = 100000; // 10ms in 100ns units

            audio_client
                .Initialize(share_mode, flags, buffer_duration, 0, wave_format_ptr, None)
                .map_err(|e| format!("Failed to initialize audio client: {}", e))?;

            // Create Event handle for callbacks
            let event_handle = CreateEventW(None, false, false, None)
                .map_err(|e| format!("Failed to create event: {}", e))?;

            audio_client.SetEventHandle(event_handle).map_err(|e| {
                let _ = CloseHandle(event_handle);
                format!("Failed to set event handle: {}", e)
            })?;

            let capture_client: IAudioCaptureClient = audio_client.GetService().map_err(|e| {
                let _ = CloseHandle(event_handle);
                format!("Failed to get capture client service: {}", e)
            })?;

            audio_client.Start().map_err(|e| {
                let _ = CloseHandle(event_handle);
                format!("Failed to start audio client: {}", e)
            })?;

            // Main event capture loop
            let mut pending_overflow = PendingOverflow::new();
            while !stop_signal.load(Ordering::SeqCst) && pending_overflow.terminal.is_none() {
                let wait_res = WaitForSingleObject(event_handle, 1000);
                if wait_res != WAIT_OBJECT_0 {
                    // Check if stop signal was set while waiting
                    if stop_signal.load(Ordering::SeqCst) {
                        break;
                    }
                    continue;
                }

                // Retrieve buffer packets
                loop {
                    let mut p_data: *mut u8 = std::ptr::null_mut();
                    let mut num_frames: u32 = 0;
                    let mut flags: u32 = 0;
                    let mut device_position: u64 = 0;
                    let mut qpc_position: u64 = 0;

                    let res = capture_client.GetBuffer(
                        &mut p_data,
                        &mut num_frames,
                        &mut flags,
                        Some(&mut device_position),
                        Some(&mut qpc_position),
                    );

                    if res.is_err() {
                        // AUDCLNT_S_BUFFER_EMPTY or similar
                        break;
                    }

                    if !flush_pending_overflow_gap(&sender, &mut pending_overflow) {
                        if !record_dropped_packet(
                            &mut pending_overflow,
                            num_frames,
                            flags,
                            device_position,
                            qpc_position,
                            _sample_rate,
                        ) {
                            stop_signal.store(true, Ordering::SeqCst);
                        }
                        let _ = capture_client.ReleaseBuffer(num_frames);
                        if stop_signal.load(Ordering::SeqCst) {
                            break;
                        }
                        continue;
                    }

                    if num_frames > 0 {
                        let is_silent = flags & BUFFER_FLAG_SILENT != 0;
                        if p_data.is_null() && !is_silent {
                            if !record_dropped_packet(
                                &mut pending_overflow,
                                num_frames,
                                flags,
                                device_position,
                                qpc_position,
                                _sample_rate,
                            ) {
                                stop_signal.store(true, Ordering::SeqCst);
                            }
                            let _ = capture_client.ReleaseBuffer(num_frames);
                            if stop_signal.load(Ordering::SeqCst) {
                                break;
                            }
                            continue;
                        }
                        let bytes_per_frame = channels * (bits_per_sample as usize / 8);
                        let byte_len = num_frames as usize * bytes_per_frame;
                        // This fixed packet slot makes the callback allocation-free.
                        // Oversize packets are counted as exact dropped frames instead
                        // of attempting a fallback allocation.
                        if byte_len > MAX_PACKET_BYTES {
                            if !record_dropped_packet(
                                &mut pending_overflow,
                                num_frames,
                                flags,
                                device_position,
                                qpc_position,
                                _sample_rate,
                            ) {
                                stop_signal.store(true, Ordering::SeqCst);
                            }
                        } else {
                            let mut packet = CapturePacket {
                                bytes: [0; MAX_PACKET_BYTES],
                                byte_len,
                                frames: num_frames,
                                format: CaptureFormat {
                                    sample_rate: _sample_rate,
                                    channels: channels as u16,
                                    bits_per_sample,
                                    is_float,
                                },
                                device_position,
                                qpc_position,
                                flags,
                            };
                            if !is_silent {
                                std::ptr::copy_nonoverlapping(
                                    p_data,
                                    packet.bytes.as_mut_ptr(),
                                    byte_len,
                                );
                            }
                            if sender.try_send(CaptureHandoff::Packet(packet)).is_err() {
                                if !record_dropped_packet(
                                    &mut pending_overflow,
                                    num_frames,
                                    flags,
                                    device_position,
                                    qpc_position,
                                    _sample_rate,
                                ) {
                                    stop_signal.store(true, Ordering::SeqCst);
                                }
                            }
                        }
                    }

                    let _ = capture_client.ReleaseBuffer(num_frames);
                    if stop_signal.load(Ordering::SeqCst) {
                        break;
                    }
                }
            }

            let _ = audio_client.Stop();
            while !pending_overflow.records.is_empty()
                && !flush_pending_overflow_gap(&sender, &mut pending_overflow)
            {
                let record = pending_overflow.records.remove(0);
                unreported_overflow_frames.fetch_add(record.frames, Ordering::SeqCst);
                unreported_overflow_flags.fetch_or(record.flags as u64, Ordering::SeqCst);
                unreported_overflow_device_start.store(record.device_start, Ordering::SeqCst);
                unreported_overflow_device_end.store(record.device_end, Ordering::SeqCst);
                unreported_overflow_qpc_start.store(record.qpc_start, Ordering::SeqCst);
                unreported_overflow_qpc_end.store(record.qpc_end, Ordering::SeqCst);
                has_unreported_overflow.store(true, Ordering::SeqCst);
                unreported_overflows
                    .lock()
                    .expect("shutdown handoff poisoned")
                    .push(record);
            }
            if let Some(record) = pending_overflow.terminal {
                unreported_overflows
                    .lock()
                    .expect("shutdown handoff poisoned")
                    .push(record);
            }
            let _ = CloseHandle(event_handle);
            CoTaskMemFree(Some(wave_format_ptr as *const std::ffi::c_void));
        }

        Ok(())
    }

    unsafe fn parse_wave_format(format: &WAVEFORMATEX) -> Result<(u32, usize, bool, u16), String> {
        let sample_rate = format.nSamplesPerSec;
        let channels = format.nChannels as usize;
        let bits_per_sample = format.wBitsPerSample;
        let format_tag = format.wFormatTag;

        let is_float;
        let mut actual_bits = bits_per_sample;

        if format_tag == WAVE_FORMAT_EXTENSIBLE {
            let extensible =
                unsafe { &*(format as *const WAVEFORMATEX as *const WAVEFORMATEXTENSIBLE) };
            let sub_format = extensible.SubFormat;
            if sub_format == KSDATAFORMAT_SUBTYPE_IEEE_FLOAT {
                is_float = true;
            } else if sub_format == KSDATAFORMAT_SUBTYPE_PCM {
                is_float = false;
            } else {
                return Err(format!(
                    "Unsupported WASAPI extensible subformat: {:?}",
                    sub_format
                ));
            }
            actual_bits = unsafe { extensible.Samples.wValidBitsPerSample };
        } else if format_tag == WAVE_FORMAT_IEEE_FLOAT as u16 {
            is_float = true;
        } else if format_tag == WAVE_FORMAT_PCM {
            is_float = false;
        } else {
            return Err(format!("Unsupported WASAPI format tag: {}", format_tag));
        }

        if !is_float && actual_bits != 16 && actual_bits != 24 {
            return Err(format!(
                "Unsupported PCM bit depth for capture handoff: {actual_bits} (only 16-bit and 24-bit PCM are losslessly decoded)"
            ));
        }
        Ok((sample_rate, channels, is_float, actual_bits))
    }
}

impl Drop for WasapiCaptureStream {
    fn drop(&mut self) {
        self.stop();
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tokio::sync::mpsc;

    #[test]
    fn packet_flags_preserve_every_applicable_reason() {
        assert_eq!(
            packet_flag_reason_suffix(BUFFER_FLAG_DATA_DISCONTINUITY),
            ":flags=data_discontinuity"
        );
        assert_eq!(
            packet_flag_reason_suffix(BUFFER_FLAG_SILENT),
            ":flags=silent_packet"
        );
        assert_eq!(
            packet_flag_reason_suffix(BUFFER_FLAG_TIMESTAMP_ERROR),
            ":flags=timestamp_error"
        );
        assert_eq!(
            packet_flag_reason_suffix(BUFFER_FLAG_DATA_DISCONTINUITY | BUFFER_FLAG_TIMESTAMP_ERROR),
            ":flags=data_discontinuity,timestamp_error"
        );
        assert_eq!(packet_flag_reason_suffix(0), "");
    }

    #[test]
    fn packet_decodes_signed_24_bit_pcm_without_silently_dropping_frames() {
        // Production break caught: removing the 24-bit PCM branch would turn a
        // negotiated 24-bit packet into an empty source range.
        let packet = CapturePacket::for_test(
            &[0x00, 0x00, 0x80, 0xff, 0xff, 0x7f],
            CaptureFormat::pcm(48_000, 1, 24),
            2,
            1,
        );

        assert_eq!(
            packet.to_mono_f32().unwrap(),
            vec![-1.0, 1.0 - 1.0 / 8_388_608.0]
        );
    }

    #[test]
    fn bounded_handoff_retains_overflow_as_a_deliverable_gap() {
        let (sender, mut receiver) = mpsc::channel::<CaptureHandoff>(1);
        sender.try_send(CaptureHandoff::WorkerFailure).unwrap();
        let mut pending_overflow_frames = PendingOverflow::new();

        record_dropped_packet(
            &mut pending_overflow_frames,
            480,
            BUFFER_FLAG_TIMESTAMP_ERROR,
            50,
            1_000,
            48_000,
        );
        assert!(!flush_pending_overflow_gap(
            &sender,
            &mut pending_overflow_frames
        ));
        assert_eq!(pending_overflow_frames.records[0].frames, 480);

        let _ = receiver.try_recv().unwrap();
        assert!(flush_pending_overflow_gap(
            &sender,
            &mut pending_overflow_frames
        ));
        assert!(pending_overflow_frames.records.is_empty());
        match receiver.try_recv().unwrap() {
            CaptureHandoff::Gap(gap) => {
                assert_eq!(gap.frames, 480);
                assert_eq!(gap.qpc_start, 1_000);
                assert_eq!(gap.qpc_end, 101_000);
            }
            _ => panic!("expected a typed gap"),
        }
    }

    #[test]
    fn overflow_preserves_all_packet_flag_reasons() {
        let mut pending = PendingOverflow::new();
        record_dropped_packet(
            &mut pending,
            480,
            BUFFER_FLAG_DATA_DISCONTINUITY | BUFFER_FLAG_TIMESTAMP_ERROR,
            0,
            0,
            48_000,
        );
        record_dropped_packet(&mut pending, 480, BUFFER_FLAG_SILENT, 480, 100_000, 48_000);

        assert_eq!(pending.records[0].frames, 960);
        assert_eq!(
            pending.reason_suffix(),
            ":flags=data_discontinuity,silent_packet,timestamp_error"
        );
    }

    #[test]
    fn stop_keeps_a_final_full_queue_overflow_for_manager_recovery() {
        let (sender, _receiver) = mpsc::channel::<CaptureHandoff>(1);
        sender.try_send(CaptureHandoff::WorkerFailure).unwrap();
        let mut pending = PendingOverflow::new();
        record_dropped_packet(&mut pending, 960, 0, 0, 0, 48_000);

        assert!(!flush_pending_overflow_gap(&sender, &mut pending));
        assert_eq!(
            pending.records[0].frames, 960,
            "final overflow must not be silently cleared"
        );
    }
}

fn record_dropped_packet(
    pending_overflow: &mut PendingOverflow,
    frames: u32,
    flags: u32,
    device_position: u64,
    qpc_position: u64,
    sample_rate: u32,
) -> bool {
    let device_end = device_position.saturating_add(u64::from(frames));
    let qpc_end = qpc_position.saturating_add(
        u64::from(frames).saturating_mul(10_000_000) / u64::from(sample_rate.max(1)),
    );
    if let Some(last) = pending_overflow.records.last_mut()
        && last.device_end == device_position
        && last.qpc_end == qpc_position
    {
        last.frames = last.frames.saturating_add(u64::from(frames));
        last.flags |= flags & CAPTURE_FLAG_MASK;
        last.device_end = device_end;
        last.qpc_end = qpc_end;
        return true;
    }

    // The fixed reserved capacity means this push does not allocate in the
    // realtime loop. A capacity breach is still explicit: retaining the last
    // known range is safer than fabricating a continuous gap across intervals.
    if pending_overflow.records.len() < pending_overflow.records.capacity() {
        pending_overflow.records.push(CaptureGapRecord {
            frames: u64::from(frames),
            flags: flags & CAPTURE_FLAG_MASK,
            device_start: device_position,
            device_end,
            qpc_start: qpc_position,
            qpc_end,
        });
        true
    } else {
        pending_overflow.terminal.get_or_insert(CaptureGapRecord {
            frames: u64::from(frames),
            flags: flags & CAPTURE_FLAG_MASK,
            device_start: device_position,
            device_end,
            qpc_start: qpc_position,
            qpc_end,
        });
        false
    }
}

#[cfg(test)]
mod overflow_interval_tests {
    use super::*;

    #[test]
    fn non_contiguous_overflow_intervals_remain_separate_typed_gaps() {
        let mut pending = PendingOverflow::new();
        record_dropped_packet(
            &mut pending,
            480,
            BUFFER_FLAG_DATA_DISCONTINUITY,
            100,
            1_000,
            48_000,
        );
        record_dropped_packet(
            &mut pending,
            240,
            BUFFER_FLAG_TIMESTAMP_ERROR,
            2_000,
            9_000,
            48_000,
        );
        assert_eq!(pending.records.len(), 2);
        assert_eq!(
            (
                pending.records[0].frames,
                pending.records[0].flags,
                pending.records[0].device_start,
                pending.records[0].device_end,
                pending.records[0].qpc_start,
                pending.records[0].qpc_end
            ),
            (
                480,
                BUFFER_FLAG_DATA_DISCONTINUITY,
                100,
                580,
                1_000,
                101_000
            )
        );
        assert_eq!(
            (
                pending.records[1].frames,
                pending.records[1].flags,
                pending.records[1].device_start,
                pending.records[1].device_end,
                pending.records[1].qpc_start,
                pending.records[1].qpc_end
            ),
            (
                240,
                BUFFER_FLAG_TIMESTAMP_ERROR,
                2_000,
                2_240,
                9_000,
                59_000
            )
        );
    }

    #[test]
    fn capacity_exhaustion_preserves_exact_terminal_record_and_stops() {
        let mut pending = PendingOverflow::new();
        for index in 0..32_u64 {
            assert!(record_dropped_packet(
                &mut pending,
                1,
                0,
                index * 10,
                index * 1_000,
                48_000
            ));
        }
        assert!(!record_dropped_packet(
            &mut pending,
            7,
            BUFFER_FLAG_TIMESTAMP_ERROR,
            999,
            88_000,
            48_000
        ));
        assert_eq!(pending.records.len(), 32);
        assert_eq!(
            pending.terminal.unwrap(),
            CaptureGapRecord {
                frames: 7,
                flags: BUFFER_FLAG_TIMESTAMP_ERROR,
                device_start: 999,
                device_end: 1006,
                qpc_start: 88_000,
                qpc_end: 89_458
            }
        );
    }
}

/// Publishes one aggregate, content-free discontinuity once the bounded
/// consumer has capacity again. Until then, subsequent dropped packets extend
/// this range rather than disappearing silently.
fn flush_pending_overflow_gap(
    sender: &Sender<CaptureHandoff>,
    pending_overflow: &mut PendingOverflow,
) -> bool {
    if pending_overflow.records.is_empty() {
        return true;
    }

    match sender.try_send(CaptureHandoff::Gap(pending_overflow.records[0])) {
        Ok(()) => {
            pending_overflow.records.remove(0);
            true
        }
        Err(_) => false,
    }
}
