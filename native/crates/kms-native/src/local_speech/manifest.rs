use serde::{Deserialize, Serialize};
use thiserror::Error;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct LicenseProvenance {
    pub license: String,
    #[serde(rename = "reviewedBy")]
    pub reviewed_by: String,
    #[serde(rename = "reviewedAt")]
    pub reviewed_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ManifestEntry {
    #[serde(rename = "modelId")]
    pub model_id: String,
    pub language: String,
    #[serde(rename = "engineType")]
    pub engine_type: String,
    pub path: String,
    pub sha256: String,
    #[serde(rename = "maxConcurrentStreams")]
    pub max_concurrent_streams: u32,
    #[serde(rename = "licenseProvenance")]
    pub license_provenance: LicenseProvenance,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ModelManifest {
    pub version: u32,
    pub models: Vec<ManifestEntry>,
}

#[derive(Debug, Error)]
pub enum ManifestError {
    #[error("Model path invalid: {0}")]
    PathInvalid(String),
    #[error("Model corrupt: sha256 mismatch")]
    Corrupt,
    #[error("Model incompatible: engine_type must be whisper_cpp_compat")]
    Incompatible,
    #[error("Model unreviewed: licenseProvenance required")]
    Unreviewed,
    #[error("Manifest malformed: {0}")]
    Malformed(String),
}

pub fn validate_model_path(path: &str) -> Result<(), ManifestError> {
    if path.contains("..") {
        return Err(ManifestError::PathInvalid(path.to_string()));
    }
    if path.starts_with('/') {
        return Err(ManifestError::PathInvalid(path.to_string()));
    }
    if path.contains(':') {
        return Err(ManifestError::PathInvalid(path.to_string()));
    }
    if !path
        .chars()
        .all(|c| c.is_ascii_alphanumeric() | matches!(c, '_' | '.' | '/' | '-'))
    {
        return Err(ManifestError::PathInvalid(path.to_string()));
    }
    Ok(())
}

pub fn load_manifest(raw: &str) -> Result<Vec<ManifestEntry>, ManifestError> {
    let manifest: ModelManifest =
        serde_json::from_str(raw).map_err(|e| ManifestError::Malformed(e.to_string()))?;

    if manifest.version != 1 {
        return Err(ManifestError::Malformed("manifest version must be 1".into()));
    }

    let entries = manifest.models;

    if entries.is_empty() {
        return Err(ManifestError::Malformed("manifest models array is empty".into()));
    }

    for entry in &entries {
        if entry.engine_type != "whisper_cpp_compat" {
            return Err(ManifestError::Incompatible);
        }
        if entry.language != "vi" && entry.language != "en" {
            return Err(ManifestError::Malformed(format!("unsupported language: {}", entry.language)));
        }
        validate_model_path(&entry.path)?;
        if entry.sha256.len() != 64 || !entry.sha256.chars().all(|c| c.is_ascii_hexdigit()) {
            return Err(ManifestError::Malformed("sha256 must be 64 hex chars".into()));
        }
        if entry.max_concurrent_streams == 0 || entry.max_concurrent_streams > 8 {
            return Err(ManifestError::Malformed("maxConcurrentStreams must be 1-8".into()));
        }
    }

    Ok(entries)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn validate_model_path_accepts_safe() {
        assert!(validate_model_path("models/model.bin").is_ok());
        assert!(validate_model_path("data/whisper/ggml-vi.bin").is_ok());
    }

    #[test]
    fn validate_model_path_rejects_dot_dot() {
        assert!(validate_model_path("../secret/model.bin").is_err());
        assert!(validate_model_path("models/../../etc/passwd").is_err());
    }

    #[test]
    fn validate_model_path_rejects_absolute() {
        assert!(validate_model_path("/etc/models/model.bin").is_err());
    }

    #[test]
    fn validate_model_path_rejects_drive_letter() {
        assert!(validate_model_path("C:model.bin").is_err());
        assert!(validate_model_path("D:/models/model.bin").is_err());
    }

    #[test]
    fn validate_model_path_rejects_special_chars() {
        assert!(validate_model_path("model;rm -rf /").is_err());
        assert!(validate_model_path("model`ls`").is_err());
    }

    #[test]
    fn load_manifest_accepts_valid() {
        let raw = r#"{"version":1,"models":[
            {"modelId":"whisper-tiny-vi","language":"vi","engineType":"whisper_cpp_compat","path":"models/tiny-vi.bin","sha256":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","maxConcurrentStreams":2,"licenseProvenance":{"license":"MIT","reviewedBy":"engineering","reviewedAt":"2026-07-01T00:00:00.000Z"}},
            {"modelId":"whisper-small-en","language":"en","engineType":"whisper_cpp_compat","path":"models/small-en.bin","sha256":"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb","maxConcurrentStreams":1,"licenseProvenance":{"license":"Apache-2.0","reviewedBy":"legal","reviewedAt":"2026-06-15T00:00:00.000Z"}}
        ]}"#;
        let result = load_manifest(raw);
        assert!(result.is_ok());
        let entries = result.unwrap();
        assert_eq!(entries.len(), 2);
        assert_eq!(entries[0].model_id, "whisper-tiny-vi");
        assert_eq!(entries[1].language, "en");
    }

    #[test]
    fn load_manifest_rejects_incompatible_engine_type() {
        let raw = r#"{"version":1,"models":[
            {"modelId":"bad-model","language":"vi","engineType":"other_framework","path":"models/bad.bin","sha256":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","maxConcurrentStreams":1,"licenseProvenance":{"license":"MIT","reviewedBy":"eng","reviewedAt":"2026-07-01T00:00:00.000Z"}}
        ]}"#;
        assert!(matches!(load_manifest(raw).unwrap_err(), ManifestError::Incompatible));
    }

    #[test]
    fn load_manifest_rejects_unsupported_language() {
        let raw = r#"{"version":1,"models":[
            {"modelId":"fr-model","language":"fr","engineType":"whisper_cpp_compat","path":"models/fr.bin","sha256":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","maxConcurrentStreams":1,"licenseProvenance":{"license":"MIT","reviewedBy":"eng","reviewedAt":"2026-07-01T00:00:00.000Z"}}
        ]}"#;
        assert!(load_manifest(raw).is_err());
    }

    #[test]
    fn load_manifest_rejects_empty() {
        assert!(load_manifest(r#"{"version":1,"models":[]}"#).is_err());
    }

    #[test]
    fn load_manifest_rejects_malformed_json() {
        assert!(load_manifest("not json").is_err());
    }

    #[test]
    fn load_manifest_rejects_unknown_fields() {
        let raw = r#"{"version":1,"models":[
            {"modelId":"ok","language":"vi","engineType":"whisper_cpp_compat","path":"m.bin","sha256":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","maxConcurrentStreams":1,"licenseProvenance":{"license":"MIT","reviewedBy":"eng","reviewedAt":"2026-07-01T00:00:00.000Z"},"secretField":"evil"}
        ]}"#;
        assert!(load_manifest(raw).is_err());
    }
}
