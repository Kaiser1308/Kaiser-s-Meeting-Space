// kms-native audio capture — WASAPI stream driver.
//
// Manages the lifetime of a WASAPI shared-mode event-driven capture stream.
// Spawns background worker thread, handles buffers, downmixing, and channel handoff.

use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};
use std::thread::JoinHandle;
use tokio::sync::mpsc::Sender;
use windows::core::GUID;
use windows::Win32::Foundation::{CloseHandle, WAIT_OBJECT_0};
use windows::Win32::Media::Audio::*;
use windows::Win32::Media::Multimedia::WAVE_FORMAT_IEEE_FLOAT;
use windows::Win32::System::Com::*;
use windows::Win32::System::Threading::{CreateEventW, WaitForSingleObject};

const WAVE_FORMAT_PCM: u16 = 1;
const WAVE_FORMAT_EXTENSIBLE: u16 = 0xFFFE;
const BUFFER_FLAG_DATA_DISCONTINUITY: u32 = 1;
const BUFFER_FLAG_SILENT: u32 = 2;
const BUFFER_FLAG_TIMESTAMP_ERROR: u32 = 4;

use crate::capture::device::ensure_com_initialized;

pub struct WasapiCaptureStream {
    thread_handle: Option<JoinHandle<()>>,
    stop_signal: Arc<AtomicBool>,
}

pub struct CaptureConfig {
    pub device_id: String,
    pub device_type: String, // "microphone" or "system_audio"
}

fn packet_gap_reason(flags: u32) -> Option<&'static str> {
    if flags & BUFFER_FLAG_DATA_DISCONTINUITY != 0 {
        Some("data_discontinuity")
    } else if flags & BUFFER_FLAG_SILENT != 0 {
        Some("silent_packet")
    } else if flags & BUFFER_FLAG_TIMESTAMP_ERROR != 0 {
        Some("timestamp_error")
    } else {
        None
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
    pub fn start(
        config: CaptureConfig,
        sender: Sender<Result<Vec<f32>, String>>,
    ) -> Result<Self, String> {
        ensure_com_initialized();

        let stop_signal = Arc::new(AtomicBool::new(false));
        let stop_signal_clone = stop_signal.clone();

        let thread_handle = std::thread::spawn(move || {
            if let Err(e) = Self::run_capture_loop(config, stop_signal_clone, sender.clone()) {
                let _ = sender.blocking_send(Err(e));
            }
        });

        Ok(Self {
            thread_handle: Some(thread_handle),
            stop_signal,
        })
    }

    pub fn stop(&mut self) {
        self.stop_signal.store(true, Ordering::SeqCst);
        if let Some(handle) = self.thread_handle.take() {
            let _ = handle.join();
        }
    }

    fn run_capture_loop(
        config: CaptureConfig,
        stop_signal: Arc<AtomicBool>,
        sender: Sender<Result<Vec<f32>, String>>,
    ) -> Result<(), String> {
        ensure_com_initialized();

        unsafe {
            let enumerator: IMMDeviceEnumerator = CoCreateInstance(
                &MMDeviceEnumerator,
                None,
                CLSCTX_ALL,
            )
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
                .Initialize(
                    share_mode,
                    flags,
                    buffer_duration,
                    0,
                    wave_format_ptr,
                    None,
                )
                .map_err(|e| format!("Failed to initialize audio client: {}", e))?;

            // Create Event handle for callbacks
            let event_handle = CreateEventW(None, false, false, None)
                .map_err(|e| format!("Failed to create event: {}", e))?;

            audio_client
                .SetEventHandle(event_handle)
                .map_err(|e| {
                    let _ = CloseHandle(event_handle);
                    format!("Failed to set event handle: {}", e)
                })?;

            let capture_client: IAudioCaptureClient = audio_client
                .GetService()
                .map_err(|e| {
                    let _ = CloseHandle(event_handle);
                    format!("Failed to get capture client service: {}", e)
                })?;

            audio_client
                .Start()
                .map_err(|e| {
                    let _ = CloseHandle(event_handle);
                    format!("Failed to start audio client: {}", e)
                })?;

            // Main event capture loop
            while !stop_signal.load(Ordering::SeqCst) {
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

                    if let Some(reason) = packet_gap_reason(flags) {
                        let _ = sender.try_send(Err(format!(
                            "CAPTURE_FLAG:{reason}:frames={num_frames}"
                        )));
                    }

                    if num_frames > 0 {
                        let is_silent = flags & BUFFER_FLAG_SILENT != 0;
                        if p_data.is_null() && !is_silent {
                            let _ = capture_client.ReleaseBuffer(num_frames);
                            continue;
                        }
                        let mut mono_samples = if is_silent {
                            vec![0.0f32; num_frames as usize]
                        } else {
                            Vec::with_capacity(num_frames as usize)
                        };

                        // Extract samples and downmix to mono f32
                        if !is_silent && !p_data.is_null() && is_float {
                            let slice = std::slice::from_raw_parts(
                                p_data as *const f32,
                                num_frames as usize * channels,
                            );
                            for frame in 0..num_frames as usize {
                                let mut sum = 0.0f32;
                                for c in 0..channels {
                                    sum += slice[frame * channels + c];
                                }
                                mono_samples.push(sum / channels as f32);
                            }
                        } else if !is_silent && !p_data.is_null() && bits_per_sample == 16 {
                            let slice = std::slice::from_raw_parts(
                                p_data as *const i16,
                                num_frames as usize * channels,
                            );
                            for frame in 0..num_frames as usize {
                                let mut sum = 0.0f32;
                                for c in 0..channels {
                                    sum += (slice[frame * channels + c] as f32) / 32768.0;
                                }
                                mono_samples.push(sum / channels as f32);
                            }
                        } else if !is_silent && !p_data.is_null() && bits_per_sample == 24 {
                            let slice = std::slice::from_raw_parts(
                                p_data as *const u8,
                                num_frames as usize * channels * 3,
                            );
                            for frame in 0..num_frames as usize {
                                let mut sum = 0.0f32;
                                for c in 0..channels {
                                    let idx = (frame * channels + c) * 3;
                                    let val = ((slice[idx] as i32)
                                        | ((slice[idx + 1] as i32) << 8)
                                        | (((slice[idx + 2] as i8) as i32) << 16))
                                        as f32;
                                    sum += val / 8388608.0;
                                }
                                mono_samples.push(sum / channels as f32);
                            }
                        }

                        // Send payload to consumer (use non-blocking try_send to prevent overflows/ OOM)
                        if sender.try_send(Ok(mono_samples)).is_err() {
                            // Report the dropped range through the bounded
                            // channel; never hide overflow in stderr only.
                            let _ = sender.try_send(Err(format!(
                                "CAPTURE_OVERFLOW:frames={num_frames}"
                            )));
                        }
                    }

                    let _ = capture_client.ReleaseBuffer(num_frames);
                }
            }

            let _ = audio_client.Stop();
            let _ = CloseHandle(event_handle);
            CoTaskMemFree(Some(wave_format_ptr as *const std::ffi::c_void));
        }

        Ok(())
    }

    unsafe fn parse_wave_format(
        format: &WAVEFORMATEX,
    ) -> Result<(u32, usize, bool, u16), String> {
        let sample_rate = format.nSamplesPerSec;
        let channels = format.nChannels as usize;
        let bits_per_sample = format.wBitsPerSample;
        let format_tag = format.wFormatTag;

        let is_float;
        let mut actual_bits = bits_per_sample;

        if format_tag == WAVE_FORMAT_EXTENSIBLE {
            let extensible = unsafe { &*(format as *const WAVEFORMATEX as *const WAVEFORMATEXTENSIBLE) };
            let sub_format = extensible.SubFormat;
            if sub_format == KSDATAFORMAT_SUBTYPE_IEEE_FLOAT {
                is_float = true;
            } else if sub_format == KSDATAFORMAT_SUBTYPE_PCM {
                is_float = false;
            } else {
                return Err(format!("Unsupported WASAPI extensible subformat: {:?}", sub_format));
            }
            actual_bits = unsafe { extensible.Samples.wValidBitsPerSample };
        } else if format_tag == WAVE_FORMAT_IEEE_FLOAT as u16 {
            is_float = true;
        } else if format_tag == WAVE_FORMAT_PCM {
            is_float = false;
        } else {
            return Err(format!("Unsupported WASAPI format tag: {}", format_tag));
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

    #[test]
    fn packet_flags_are_classified_as_explicit_gaps() {
        assert_eq!(packet_gap_reason(BUFFER_FLAG_DATA_DISCONTINUITY), Some("data_discontinuity"));
        assert_eq!(packet_gap_reason(BUFFER_FLAG_SILENT), Some("silent_packet"));
        assert_eq!(packet_gap_reason(BUFFER_FLAG_TIMESTAMP_ERROR), Some("timestamp_error"));
        assert_eq!(packet_gap_reason(0), None);
    }
}
