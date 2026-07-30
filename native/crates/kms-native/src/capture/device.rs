// kms-native audio capture — Device enumeration module.
//
// Enumerates physical input and output endpoints, handles stable IDs,
// friendly names, format queries, and fallback routing.

use std::ffi::c_void;
use windows::core::PROPVARIANT;
use windows::Win32::Devices::FunctionDiscovery::PKEY_Device_FriendlyName;
use windows::Win32::Media::Audio::*;
use windows::Win32::System::Com::StructuredStorage::{PropVariantClear, PropVariantToStringAlloc};
use windows::Win32::System::Com::*;

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AudioDevice {
    pub device_id: String,
    pub device_name: String,
    pub device_type: String, // "microphone" or "system_audio"
    pub is_connected: bool,
    pub sample_rate: u32,
    pub channels: u16,
    pub is_simulated: bool,
}

pub fn ensure_com_initialized() {
    unsafe {
        let _ = CoInitializeEx(None, COINIT_MULTITHREADED);
    }
}

unsafe fn propvariant_to_string(prop: &PROPVARIANT) -> Option<String> {
    if let Ok(pwstr) = unsafe { PropVariantToStringAlloc(prop) } {
        let s = unsafe { pwstr.to_string().ok() };
        unsafe { CoTaskMemFree(Some(pwstr.as_ptr() as *const c_void)); }
        s
    } else {
        None
    }
}

unsafe fn get_device_info(device: &IMMDevice, device_type: &str) -> Option<AudioDevice> {
    let id_pwstr = match unsafe { device.GetId() } {
        Ok(id) => id,
        Err(_) => return None,
    };
    let device_id = match unsafe { id_pwstr.to_string() } {
        Ok(s) => s,
        Err(_) => {
            unsafe { CoTaskMemFree(Some(id_pwstr.as_ptr() as *const c_void)); }
            return None;
        }
    };
    unsafe { CoTaskMemFree(Some(id_pwstr.as_ptr() as *const c_void)); }

    // Get friendly name
    let mut device_name = "Unknown Audio Device".to_string();
    if let Ok(store) = unsafe { device.OpenPropertyStore(STGM_READ) }
        && let Ok(mut prop) = unsafe { store.GetValue(&PKEY_Device_FriendlyName) } {
        if let Some(name) = unsafe { propvariant_to_string(&prop) } {
            device_name = name;
        }
        let _ = unsafe { PropVariantClear(&mut prop as *mut _) };
    }

    // Default parameters (will be refined during stream negotiation)
    let sample_rate = 48000;
    let channels = 1;

    Some(AudioDevice {
        device_id,
        device_name,
        device_type: device_type.to_string(),
        is_connected: true,
        sample_rate,
        channels,
        is_simulated: false,
    })
}

/// Enumerate all active audio capture and render endpoints.
pub fn enumerate_devices() -> Result<Vec<AudioDevice>, String> {
    ensure_com_initialized();

    let mut devices = Vec::new();
    unsafe {
        let enumerator: IMMDeviceEnumerator = match CoCreateInstance(
            &MMDeviceEnumerator,
            None,
            CLSCTX_ALL,
        ) {
            Ok(e) => e,
            Err(e) => return Err(format!("Failed to create MMDeviceEnumerator: {}", e)),
        };

        // Enumerate render endpoints (for loopback system audio capture)
        if let Ok(collection) = enumerator.EnumAudioEndpoints(eRender, DEVICE_STATE_ACTIVE)
            && let Ok(count) = collection.GetCount() {
            for i in 0..count {
                if let Ok(device) = collection.Item(i)
                    && let Some(info) = get_device_info(&device, "system_audio") {
                    devices.push(info);
                }
            }
        }

        // Enumerate capture endpoints (for microphones)
        if let Ok(collection) = enumerator.EnumAudioEndpoints(eCapture, DEVICE_STATE_ACTIVE)
            && let Ok(count) = collection.GetCount() {
            for i in 0..count {
                if let Ok(device) = collection.Item(i)
                    && let Some(info) = get_device_info(&device, "microphone") {
                    devices.push(info);
                }
            }
        }
    }

    Ok(devices)
}

/// Resolve an explicitly requested endpoint without silently substituting a
/// different device. `default_device_id` is supplied by the platform query so
/// this policy remains unit-testable without touching the host audio stack.
pub fn resolve_requested_device_id(
    requested_id: Option<&str>,
    device_type: &str,
    devices: &[AudioDevice],
    default_device_id: Option<&str>,
) -> Result<Option<String>, String> {
    let Some(requested_id) = requested_id else {
        return Ok(None);
    };

    if requested_id == "default" {
        return default_device_id
            .map(str::to_owned)
            .map(Some)
            .ok_or_else(|| format!("No default {device_type} endpoint is available"));
    }

    if devices
        .iter()
        .any(|device| device.device_id == requested_id && device.device_type == device_type && device.is_connected)
    {
        Ok(Some(requested_id.to_string()))
    } else {
        Err(format!("Selected {device_type} endpoint is unavailable: {requested_id}"))
    }
}

/// Get the default active capture or render device.
pub fn get_default_device(device_type: &str) -> Result<AudioDevice, String> {
    ensure_com_initialized();

    unsafe {
        let enumerator: IMMDeviceEnumerator = match CoCreateInstance(
            &MMDeviceEnumerator,
            None,
            CLSCTX_ALL,
        ) {
            Ok(e) => e,
            Err(e) => return Err(format!("Failed to get default MMDeviceEnumerator: {}", e)),
        };

        let flow = if device_type == "microphone" {
            eCapture
        } else {
            eRender
        };

        let device = match enumerator.GetDefaultAudioEndpoint(flow, eConsole) {
            Ok(d) => d,
            Err(e) => return Err(format!("Failed to get default endpoint: {}", e)),
        };

        match get_device_info(&device, device_type) {
            Some(info) => Ok(info),
            None => Err("Failed to extract default device info".to_string()),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn device(id: &str, device_type: &str) -> AudioDevice {
        AudioDevice {
            device_id: id.to_string(),
            device_name: id.to_string(),
            device_type: device_type.to_string(),
            is_connected: true,
            sample_rate: 48_000,
            channels: 1,
            is_simulated: false,
        }
    }

    #[test]
    fn selected_endpoint_must_exist_for_requested_source() {
        let devices = vec![device("mic-1", "microphone")];

        let resolved = resolve_requested_device_id(Some("mic-1"), "microphone", &devices, None);

        assert_eq!(resolved.unwrap(), Some("mic-1".to_string()));
    }

    #[test]
    fn unavailable_endpoint_is_rejected_instead_of_falling_back() {
        let devices = vec![device("mic-1", "microphone")];

        let resolved = resolve_requested_device_id(Some("missing"), "microphone", &devices, None);

        assert_eq!(resolved.unwrap_err(), "Selected microphone endpoint is unavailable: missing");
    }

    #[test]
    fn default_selection_requires_a_resolved_default_endpoint() {
        let devices = vec![device("mic-1", "microphone")];

        let resolved = resolve_requested_device_id(Some("default"), "microphone", &devices, Some("mic-1"));
        assert_eq!(resolved.unwrap(), Some("mic-1".to_string()));

        let missing = resolve_requested_device_id(Some("default"), "microphone", &devices, None);
        assert_eq!(missing.unwrap_err(), "No default microphone endpoint is available");
    }
}
