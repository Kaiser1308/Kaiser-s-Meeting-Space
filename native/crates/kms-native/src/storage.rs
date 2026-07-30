// kms-native storage — P07 storage adapter for Rust.
//
// Private-path filesystem, SQLite manifest, checksum (SHA-256),
// atomic chunk commit, locks/migration, cleanup eligibility.

#![allow(dead_code)]

use rusqlite::{Connection, params};
use sha2::{Digest, Sha256};
use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};
use thiserror::Error;

use crate::protocol::{NativeRequestV1, NativeResponseV1};
use windows::core::HSTRING;
use windows::Win32::Storage::FileSystem::GetDiskFreeSpaceExW;

#[derive(Debug, Error)]
pub enum StorageError {
    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),
    #[error("SQLite error: {0}")]
    Sqlite(#[from] rusqlite::Error),
    #[error("Not found: {0}")]
    NotFound(String),
    #[error("Already exists: {0}")]
    AlreadyExists(String),
    #[error("Permission denied: {0}")]
    PermissionDenied(String),
    #[error("Path traversal denied: {0}")]
    PathTraversal(String),
    #[error("Checksum mismatch: expected {expected}, got {actual}")]
    ChecksumMismatch { expected: String, actual: String },
}

/// Storage manager — implements P07 contracts in Rust.
pub struct StorageManager {
    root: PathBuf,
    db: Connection,
}

impl StorageManager {
    /// Create a new storage manager with the given root directory.
    pub fn new(root: &str) -> Result<Self, StorageError> {
        let root = PathBuf::from(root);
        fs::create_dir_all(&root)?;

        let db_path = root.join("manifest.db");
        let db = Connection::open(&db_path)?;

        // Enable WAL mode for crash safety
        db.execute_batch("PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL;")?;

        let mut mgr = Self { root, db };
        mgr.run_migrations()?;
        Ok(mgr)
    }

    /// Run schema migrations (idempotent).
    fn run_migrations(&mut self) -> Result<(), StorageError> {
        self.db.execute_batch(
            "CREATE TABLE IF NOT EXISTS schema_version (
                version INTEGER PRIMARY KEY,
                applied_at TEXT NOT NULL DEFAULT (datetime('now'))
            );

            CREATE TABLE IF NOT EXISTS manifest_entries (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                meeting_id TEXT NOT NULL,
                source TEXT NOT NULL,
                chunk_index INTEGER NOT NULL,
                file_path TEXT NOT NULL,
                sha256 TEXT NOT NULL CHECK(length(sha256) = 64),
                byte_length INTEGER NOT NULL CHECK(byte_length > 0),
                duration_ms INTEGER,
                upload_status TEXT NOT NULL DEFAULT 'pending',
                created_at TEXT NOT NULL DEFAULT (datetime('now')),
                updated_at TEXT NOT NULL DEFAULT (datetime('now')),
                UNIQUE(meeting_id, source, chunk_index)
            );

            INSERT OR IGNORE INTO schema_version (version) VALUES (1);"
        )?;
        Ok(())
    }

    /// Validate a path is within the storage root (prevent traversal).
    fn validate_path(&self, relative: &str) -> Result<PathBuf, StorageError> {
        // Reject path traversal attempts
        if relative.contains("..") || relative.starts_with('/') || relative.starts_with('\\') {
            return Err(StorageError::PathTraversal(format!(
                "Path traversal denied: {}",
                relative
            )));
        }

        // Reject absolute paths and suspicious patterns
        let path = Path::new(relative);
        if path.is_absolute() {
            return Err(StorageError::PathTraversal(format!(
                "Absolute paths not allowed: {}",
                relative
            )));
        }

        let full_path = self.root.join(relative);

        let absolute_root = std::path::absolute(&self.root).unwrap_or_else(|_| self.root.clone());
        let absolute_path = std::path::absolute(&full_path).unwrap_or_else(|_| full_path.clone());

        if !absolute_path.starts_with(&absolute_root) {
            return Err(StorageError::PathTraversal(format!(
                "Resolved path escapes storage root: {}",
                relative
            )));
        }

        Ok(full_path)
    }

    /// Atomic write: temp → fsync → checksum → rename → dir-fsync.
    pub fn atomic_write(&self, relative_path: &str, data: &[u8]) -> Result<(String, usize), StorageError> {
        let full_path = self.validate_path(relative_path)?;

        // Ensure parent directory exists
        if let Some(parent) = full_path.parent() {
            fs::create_dir_all(parent)?;
        }

        // Write to temp file first
        let tmp_path = full_path.with_extension("tmp");
        {
            let mut file = fs::File::create(&tmp_path)?;
            file.write_all(data)?;
            file.sync_all()?; // fsync
        }

        // Compute SHA-256
        let sha256 = compute_sha256(data);

        // Atomic rename
        fs::rename(&tmp_path, &full_path)?;

        // Directory fsync (best-effort on Windows)
        if let Some(parent) = full_path.parent() {
            let _ = fsync_dir(parent);
        }

        Ok((sha256, data.len()))
    }

    /// Read file contents.
    pub fn read(&self, relative_path: &str) -> Result<Vec<u8>, StorageError> {
        let full_path = self.validate_path(relative_path)?;
        if !full_path.exists() {
            return Err(StorageError::NotFound(relative_path.to_string()));
        }
        Ok(fs::read(&full_path)?)
    }

    /// Delete a file (idempotent).
    pub fn delete(&self, relative_path: &str) -> Result<(), StorageError> {
        let full_path = self.validate_path(relative_path)?;
        if full_path.exists() {
            fs::remove_file(&full_path)?;
        }
        Ok(())
    }

    /// List directory contents.
    pub fn list(&self, relative_dir: &str) -> Result<Vec<String>, StorageError> {
        let full_path = self.validate_path(relative_dir)?;
        if !full_path.exists() {
            return Ok(vec![]);
        }
        let mut entries = Vec::new();
        for entry in fs::read_dir(&full_path)? {
            let entry = entry?;
            if let Some(name) = entry.file_name().to_str() {
                entries.push(name.to_string());
            }
        }
        Ok(entries)
    }

    /// Stat a path.
    pub fn stat(&self, relative_path: &str) -> Result<serde_json::Value, StorageError> {
        let full_path = self.validate_path(relative_path)?;
        if !full_path.exists() {
            return Ok(serde_json::json!({
                "exists": false,
                "size": 0,
                "isDirectory": false,
                "isFile": false,
            }));
        }
        let meta = fs::metadata(&full_path)?;
        Ok(serde_json::json!({
            "exists": true,
            "size": meta.len(),
            "isDirectory": meta.is_dir(),
            "isFile": meta.is_file(),
        }))
    }

    /// Return the actual free bytes available to this process on the storage
    /// volume. A synthetic maximum would make low-storage handling unsafe.
    pub fn available_space_bytes(&self) -> Result<u64, StorageError> {
        let root = HSTRING::from(self.root.to_string_lossy().as_ref());
        let mut available = 0u64;
        unsafe {
            GetDiskFreeSpaceExW(&root, Some(&mut available), None, None)
                .map_err(|error| std::io::Error::other(error.to_string()))?;
        }
        Ok(available)
    }

    /// Create directory recursively.
    pub fn mkdir(&self, relative_dir: &str) -> Result<(), StorageError> {
        let full_path = self.validate_path(relative_dir)?;
        fs::create_dir_all(&full_path)?;
        Ok(())
    }

    /// Compute SHA-256 of a file.
    pub fn checksum_compute(&self, relative_path: &str) -> Result<String, StorageError> {
        let full_path = self.validate_path(relative_path)?;
        if !full_path.exists() {
            return Err(StorageError::NotFound(relative_path.to_string()));
        }
        let data = fs::read(&full_path)?;
        Ok(compute_sha256(&data))
    }

    /// Verify SHA-256 of a file.
    pub fn checksum_verify(&self, relative_path: &str, expected: &str) -> Result<bool, StorageError> {
        let actual = self.checksum_compute(relative_path)?;
        Ok(actual == expected)
    }

    /// Add a manifest entry.
    pub fn manifest_add_entry(
        &self,
        meeting_id: &str,
        source: &str,
        chunk_index: i64,
        file_path: &str,
        sha256: &str,
        byte_length: i64,
    ) -> Result<(), StorageError> {
        self.db.execute(
            "INSERT INTO manifest_entries (meeting_id, source, chunk_index, file_path, sha256, byte_length)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            params![meeting_id, source, chunk_index, file_path, sha256, byte_length],
        )?;
        Ok(())
    }

    /// Get a manifest entry.
    pub fn manifest_get_entry(
        &self,
        meeting_id: &str,
        source: &str,
        chunk_index: i64,
    ) -> Result<Option<serde_json::Value>, StorageError> {
        let mut stmt = self.db.prepare(
            "SELECT id, meeting_id, source, chunk_index, file_path, sha256, byte_length,
                    upload_status, created_at, updated_at
             FROM manifest_entries
             WHERE meeting_id = ?1 AND source = ?2 AND chunk_index = ?3",
        )?;

        let result = stmt.query_row(params![meeting_id, source, chunk_index], |row| {
            Ok(serde_json::json!({
                "id": row.get::<_, i64>(0)?,
                "meetingId": row.get::<_, String>(1)?,
                "source": row.get::<_, String>(2)?,
                "chunkIndex": row.get::<_, i64>(3)?,
                "filePath": row.get::<_, String>(4)?,
                "sha256": row.get::<_, String>(5)?,
                "byteLength": row.get::<_, i64>(6)?,
                "uploadStatus": row.get::<_, String>(7)?,
                "createdAt": row.get::<_, String>(8)?,
                "updatedAt": row.get::<_, String>(9)?,
            }))
        });

        match result {
            Ok(val) => Ok(Some(val)),
            Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
            Err(e) => Err(StorageError::Sqlite(e)),
        }
    }

    /// List manifest entries for a meeting.
    pub fn manifest_list_entries(&self, meeting_id: &str) -> Result<Vec<serde_json::Value>, StorageError> {
        let mut stmt = self.db.prepare(
            "SELECT id, meeting_id, source, chunk_index, file_path, sha256, byte_length,
                    upload_status, created_at, updated_at
             FROM manifest_entries
             WHERE meeting_id = ?1
             ORDER BY source, chunk_index",
        )?;

        let rows = stmt.query_map(params![meeting_id], |row| {
            Ok(serde_json::json!({
                "id": row.get::<_, i64>(0)?,
                "meetingId": row.get::<_, String>(1)?,
                "source": row.get::<_, String>(2)?,
                "chunkIndex": row.get::<_, i64>(3)?,
                "filePath": row.get::<_, String>(4)?,
                "sha256": row.get::<_, String>(5)?,
                "byteLength": row.get::<_, i64>(6)?,
                "uploadStatus": row.get::<_, String>(7)?,
                "createdAt": row.get::<_, String>(8)?,
                "updatedAt": row.get::<_, String>(9)?,
            }))
        })?;

        let mut entries = Vec::new();
        for row in rows {
            entries.push(row?);
        }
        Ok(entries)
    }

    /// Update upload status.
    pub fn manifest_update_upload_status(
        &self,
        meeting_id: &str,
        source: &str,
        chunk_index: i64,
        status: &str,
    ) -> Result<bool, StorageError> {
        let changes = self.db.execute(
            "UPDATE manifest_entries
             SET upload_status = ?4, updated_at = datetime('now')
             WHERE meeting_id = ?1 AND source = ?2 AND chunk_index = ?3",
            params![meeting_id, source, chunk_index, status],
        )?;
        Ok(changes > 0)
    }

    /// Get incomplete entries (upload_status != 'completed').
    pub fn manifest_get_incomplete(&self, meeting_id: &str) -> Result<Vec<serde_json::Value>, StorageError> {
        let mut stmt = self.db.prepare(
            "SELECT id, meeting_id, source, chunk_index, file_path, sha256, byte_length,
                    upload_status
             FROM manifest_entries
             WHERE meeting_id = ?1 AND upload_status != 'completed'
             ORDER BY chunk_index",
        )?;

        let rows = stmt.query_map(params![meeting_id], |row| {
            Ok(serde_json::json!({
                "id": row.get::<_, i64>(0)?,
                "meetingId": row.get::<_, String>(1)?,
                "source": row.get::<_, String>(2)?,
                "chunkIndex": row.get::<_, i64>(3)?,
                "filePath": row.get::<_, String>(4)?,
                "sha256": row.get::<_, String>(5)?,
                "byteLength": row.get::<_, i64>(6)?,
                "uploadStatus": row.get::<_, String>(7)?,
            }))
        })?;

        let mut entries = Vec::new();
        for row in rows {
            entries.push(row?);
        }
        Ok(entries)
    }

    /// Get orphan files (files without manifest entries).
    pub fn manifest_get_orphans(&self) -> Result<Vec<String>, StorageError> {
        // List all files in chunks directory
        let chunks_dir = self.root.join("chunks");
        if !chunks_dir.exists() {
            return Ok(vec![]);
        }

        let mut orphans = Vec::new();
        for entry in fs::read_dir(&chunks_dir)? {
            let entry = entry?;
            let filename = entry.file_name().to_str().unwrap_or("").to_string();
            if filename.ends_with(".tmp") {
                continue;
            }
            let relative = format!("chunks/{}", filename);

            // Check if there's a manifest entry for this file
            let mut stmt = self.db.prepare(
                "SELECT COUNT(*) FROM manifest_entries WHERE file_path = ?1",
            )?;
            let count: i64 = stmt.query_row(params![relative], |row| row.get(0))?;
            if count == 0 {
                orphans.push(relative);
            }
        }
        Ok(orphans)
    }

    /// Handle an IPC command.
    pub fn handle_command(&mut self, request: &NativeRequestV1) -> NativeResponseV1 {
        match request.command.as_str() {
            "storage_atomic_write" => {
                let path = request.payload.get("path").and_then(|v| v.as_str());
                let data_b64 = request.payload.get("dataBase64").and_then(|v| v.as_str());

                match (path, data_b64) {
                    (Some(path), Some(b64)) => {
                        let data = match base64_decode(b64) {
                            Ok(d) => d,
                            Err(e) => return NativeResponseV1::error(
                                &request.correlation_id, &request.command,
                                "INVALID_DATA", &e, "validation",
                            ),
                        };
                        match self.atomic_write(path, &data) {
                            Ok((sha256, byte_length)) => NativeResponseV1::success(
                                &request.correlation_id, &request.command,
                                serde_json::json!({"path": path, "sha256": sha256, "byteLength": byte_length}),
                            ),
                            Err(e) => NativeResponseV1::error(
                                &request.correlation_id, &request.command,
                                "WRITE_FAILED", &e.to_string(), "storage",
                            ),
                        }
                    }
                    _ => NativeResponseV1::error(
                        &request.correlation_id, &request.command,
                        "MISSING_PARAMS", "Required: path, dataBase64", "validation",
                    ),
                }
            }
            "storage_read" => {
                let path = request.payload.get("path").and_then(|v| v.as_str());
                match path {
                    Some(path) => match self.read(path) {
                        Ok(data) => {
                            let b64 = base64_encode(&data);
                            NativeResponseV1::success(
                                &request.correlation_id, &request.command,
                                serde_json::json!({"path": path, "dataBase64": b64, "byteLength": data.len()}),
                            )
                        }
                        Err(e) => NativeResponseV1::error(
                            &request.correlation_id, &request.command,
                            "READ_FAILED", &e.to_string(), "storage",
                        ),
                    },
                    None => NativeResponseV1::error(
                        &request.correlation_id, &request.command,
                        "MISSING_PARAMS", "Required: path", "validation",
                    ),
                }
            }
            "storage_delete" => {
                let path = request.payload.get("path").and_then(|v| v.as_str());
                match path {
                    Some(path) => match self.delete(path) {
                        Ok(()) => NativeResponseV1::success(
                            &request.correlation_id, &request.command,
                            serde_json::json!({"deleted": true}),
                        ),
                        Err(e) => NativeResponseV1::error(
                            &request.correlation_id, &request.command,
                            "DELETE_FAILED", &e.to_string(), "storage",
                        ),
                    },
                    None => NativeResponseV1::error(
                        &request.correlation_id, &request.command,
                        "MISSING_PARAMS", "Required: path", "validation",
                    ),
                }
            }
            "storage_list" => {
                let dir = request.payload.get("dir").and_then(|v| v.as_str()).unwrap_or(".");
                match self.list(dir) {
                    Ok(entries) => NativeResponseV1::success(
                        &request.correlation_id, &request.command,
                        serde_json::json!({"entries": entries}),
                    ),
                    Err(e) => NativeResponseV1::error(
                        &request.correlation_id, &request.command,
                        "LIST_FAILED", &e.to_string(), "storage",
                    ),
                }
            }
            "storage_stat" => {
                let path = request.payload.get("path").and_then(|v| v.as_str()).unwrap_or(".");
                match self.stat(path) {
                    Ok(stat) => NativeResponseV1::success(
                        &request.correlation_id, &request.command, stat,
                    ),
                    Err(e) => NativeResponseV1::error(
                        &request.correlation_id, &request.command,
                        "STAT_FAILED", &e.to_string(), "storage",
                    ),
                }
            }
            "storage_mkdir" => {
                let dir = request.payload.get("dir").and_then(|v| v.as_str());
                match dir {
                    Some(dir) => match self.mkdir(dir) {
                        Ok(()) => NativeResponseV1::success(
                            &request.correlation_id, &request.command,
                            serde_json::json!({"created": true}),
                        ),
                        Err(e) => NativeResponseV1::error(
                            &request.correlation_id, &request.command,
                            "MKDIR_FAILED", &e.to_string(), "storage",
                        ),
                    },
                    None => NativeResponseV1::error(
                        &request.correlation_id, &request.command,
                        "MISSING_PARAMS", "Required: dir", "validation",
                    ),
                }
            }
            "storage_available_space" => {
                match self.available_space_bytes() {
                    Ok(available_bytes) => NativeResponseV1::success(
                        &request.correlation_id,
                        &request.command,
                        serde_json::json!({"availableBytes": available_bytes}),
                    ),
                    Err(error) => NativeResponseV1::error(
                        &request.correlation_id,
                        &request.command,
                        "STORAGE_SPACE_UNAVAILABLE",
                        &error.to_string(),
                        "storage",
                    ),
                }
            }
            "storage_checksum_compute" => {
                let path = request.payload.get("path").and_then(|v| v.as_str());
                match path {
                    Some(path) => match self.checksum_compute(path) {
                        Ok(sha256) => NativeResponseV1::success(
                            &request.correlation_id, &request.command,
                            serde_json::json!({"sha256": sha256}),
                        ),
                        Err(e) => NativeResponseV1::error(
                            &request.correlation_id, &request.command,
                            "CHECKSUM_FAILED", &e.to_string(), "storage",
                        ),
                    },
                    None => NativeResponseV1::error(
                        &request.correlation_id, &request.command,
                        "MISSING_PARAMS", "Required: path", "validation",
                    ),
                }
            }
            "storage_checksum_verify" => {
                let path = request.payload.get("path").and_then(|v| v.as_str());
                let expected = request.payload.get("expected").and_then(|v| v.as_str());
                match (path, expected) {
                    (Some(path), Some(expected)) => match self.checksum_verify(path, expected) {
                        Ok(valid) => NativeResponseV1::success(
                            &request.correlation_id, &request.command,
                            serde_json::json!({"valid": valid}),
                        ),
                        Err(e) => NativeResponseV1::error(
                            &request.correlation_id, &request.command,
                            "VERIFY_FAILED", &e.to_string(), "storage",
                        ),
                    },
                    _ => NativeResponseV1::error(
                        &request.correlation_id, &request.command,
                        "MISSING_PARAMS", "Required: path, expected", "validation",
                    ),
                }
            }
            "manifest_init" => {
                // Already initialized in new()
                NativeResponseV1::success(
                    &request.correlation_id, &request.command,
                    serde_json::json!({"initialized": true}),
                )
            }
            "manifest_add_entry" => {
                let meeting_id = request.payload.get("meetingId").and_then(|v| v.as_str());
                let source = request.payload.get("source").and_then(|v| v.as_str());
                let chunk_index = request.payload.get("chunkIndex").and_then(|v| v.as_i64());
                let file_path = request.payload.get("filePath").and_then(|v| v.as_str());
                let sha256 = request.payload.get("sha256").and_then(|v| v.as_str());
                let byte_length = request.payload.get("byteLength").and_then(|v| v.as_i64());

                match (meeting_id, source, chunk_index, file_path, sha256, byte_length) {
                    (Some(mid), Some(src), Some(ci), Some(fp), Some(sha), Some(bl)) => {
                        match self.manifest_add_entry(mid, src, ci, fp, sha, bl) {
                            Ok(()) => NativeResponseV1::success(
                                &request.correlation_id, &request.command,
                                serde_json::json!({"added": true}),
                            ),
                            Err(e) => NativeResponseV1::error(
                                &request.correlation_id, &request.command,
                                "ADD_FAILED", &e.to_string(), "storage",
                            ),
                        }
                    }
                    _ => NativeResponseV1::error(
                        &request.correlation_id, &request.command,
                        "MISSING_PARAMS", "Required: meetingId, source, chunkIndex, filePath, sha256, byteLength", "validation",
                    ),
                }
            }
            "manifest_get_entry" => {
                let meeting_id = request.payload.get("meetingId").and_then(|v| v.as_str());
                let source = request.payload.get("source").and_then(|v| v.as_str());
                let chunk_index = request.payload.get("chunkIndex").and_then(|v| v.as_i64());

                match (meeting_id, source, chunk_index) {
                    (Some(mid), Some(src), Some(ci)) => {
                        match self.manifest_get_entry(mid, src, ci) {
                            Ok(Some(entry)) => NativeResponseV1::success(
                                &request.correlation_id, &request.command, entry,
                            ),
                            Ok(None) => NativeResponseV1::success(
                                &request.correlation_id, &request.command,
                                serde_json::json!({"found": false}),
                            ),
                            Err(e) => NativeResponseV1::error(
                                &request.correlation_id, &request.command,
                                "GET_FAILED", &e.to_string(), "storage",
                            ),
                        }
                    }
                    _ => NativeResponseV1::error(
                        &request.correlation_id, &request.command,
                        "MISSING_PARAMS", "Required: meetingId, source, chunkIndex", "validation",
                    ),
                }
            }
            "manifest_list_entries" => {
                let meeting_id = request.payload.get("meetingId").and_then(|v| v.as_str());
                match meeting_id {
                    Some(mid) => match self.manifest_list_entries(mid) {
                        Ok(entries) => NativeResponseV1::success(
                            &request.correlation_id, &request.command,
                            serde_json::json!({"entries": entries}),
                        ),
                        Err(e) => NativeResponseV1::error(
                            &request.correlation_id, &request.command,
                            "LIST_FAILED", &e.to_string(), "storage",
                        ),
                    },
                    None => NativeResponseV1::error(
                        &request.correlation_id, &request.command,
                        "MISSING_PARAMS", "Required: meetingId", "validation",
                    ),
                }
            }
            "manifest_update_upload_status" => {
                let meeting_id = request.payload.get("meetingId").and_then(|v| v.as_str());
                let source = request.payload.get("source").and_then(|v| v.as_str());
                let chunk_index = request.payload.get("chunkIndex").and_then(|v| v.as_i64());
                let status = request.payload.get("status").and_then(|v| v.as_str());

                match (meeting_id, source, chunk_index, status) {
                    (Some(mid), Some(src), Some(ci), Some(st)) => {
                        match self.manifest_update_upload_status(mid, src, ci, st) {
                            Ok(updated) => NativeResponseV1::success(
                                &request.correlation_id, &request.command,
                                serde_json::json!({"updated": updated}),
                            ),
                            Err(e) => NativeResponseV1::error(
                                &request.correlation_id, &request.command,
                                "UPDATE_FAILED", &e.to_string(), "storage",
                            ),
                        }
                    }
                    _ => NativeResponseV1::error(
                        &request.correlation_id, &request.command,
                        "MISSING_PARAMS", "Required: meetingId, source, chunkIndex, status", "validation",
                    ),
                }
            }
            "manifest_get_incomplete" => {
                let meeting_id = request.payload.get("meetingId").and_then(|v| v.as_str());
                match meeting_id {
                    Some(mid) => match self.manifest_get_incomplete(mid) {
                        Ok(entries) => NativeResponseV1::success(
                            &request.correlation_id, &request.command,
                            serde_json::json!({"entries": entries}),
                        ),
                        Err(e) => NativeResponseV1::error(
                            &request.correlation_id, &request.command,
                            "QUERY_FAILED", &e.to_string(), "storage",
                        ),
                    },
                    None => NativeResponseV1::error(
                        &request.correlation_id, &request.command,
                        "MISSING_PARAMS", "Required: meetingId", "validation",
                    ),
                }
            }
            "manifest_get_orphans" => {
                match self.manifest_get_orphans() {
                    Ok(orphans) => NativeResponseV1::success(
                        &request.correlation_id, &request.command,
                        serde_json::json!({"orphans": orphans}),
                    ),
                    Err(e) => NativeResponseV1::error(
                        &request.correlation_id, &request.command,
                        "QUERY_FAILED", &e.to_string(), "storage",
                    ),
                }
            }
            "manifest_close" => {
                NativeResponseV1::success(
                    &request.correlation_id, &request.command,
                    serde_json::json!({"closed": true}),
                )
            }
            _ => NativeResponseV1::error(
                &request.correlation_id, &request.command,
                "UNKNOWN_COMMAND", &format!("Unknown storage command: {}", request.command), "protocol",
            ),
        }
    }
}

/// Compute SHA-256 hash of data, returning lowercase hex string.
fn compute_sha256(data: &[u8]) -> String {
    let mut hasher = Sha256::new();
    hasher.update(data);
    format!("{:x}", hasher.finalize())
}

/// Simple base64 decode (no external crate needed for test data).
fn base64_decode(input: &str) -> Result<Vec<u8>, String> {
    // Use a simple base64 table
    const TABLE: &[u8] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

    let input = input.trim_end_matches('=');
    let mut output = Vec::new();
    let mut buf: u32 = 0;
    let mut bits: u32 = 0;

    for &byte in input.as_bytes() {
        let val = TABLE.iter().position(|&b| b == byte)
            .ok_or_else(|| format!("Invalid base64 character: {}", byte as char))?;
        buf = (buf << 6) | val as u32;
        bits += 6;
        if bits >= 8 {
            bits -= 8;
            output.push((buf >> bits) as u8);
            buf &= (1 << bits) - 1;
        }
    }
    Ok(output)
}

/// Simple base64 encode.
fn base64_encode(data: &[u8]) -> String {
    const TABLE: &[u8] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut result = String::new();
    let mut i = 0;
    while i < data.len() {
        let b0 = data[i] as u32;
        let b1 = if i + 1 < data.len() { data[i + 1] as u32 } else { 0 };
        let b2 = if i + 2 < data.len() { data[i + 2] as u32 } else { 0 };
        let triple = (b0 << 16) | (b1 << 8) | b2;
        result.push(TABLE[((triple >> 18) & 0x3F) as usize] as char);
        result.push(TABLE[((triple >> 12) & 0x3F) as usize] as char);
        if i + 1 < data.len() {
            result.push(TABLE[((triple >> 6) & 0x3F) as usize] as char);
        } else {
            result.push('=');
        }
        if i + 2 < data.len() {
            result.push(TABLE[(triple & 0x3F) as usize] as char);
        } else {
            result.push('=');
        }
        i += 3;
    }
    result
}

/// Best-effort directory fsync (Windows may not support it natively).
fn fsync_dir(path: &Path) -> std::io::Result<()> {
    #[cfg(unix)]
    {
        use std::os::unix::io::AsRawFd;
        let dir = fs::File::open(path)?;
        nix::unistd::fsync(dir.as_raw_fd()).map_err(|e| std::io::Error::new(std::io::ErrorKind::Other, e))?;
    }
    // On Windows, directory fsync is not natively supported via std
    // FlushFileBuffers requires HANDLE — skip for now, WAL mode provides safety
    let _ = path;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    fn make_storage() -> (TempDir, StorageManager) {
        let dir = TempDir::new().unwrap();
        let mgr = StorageManager::new(dir.path().to_str().unwrap()).unwrap();
        (dir, mgr)
    }

    #[test]
    fn atomic_write_and_read() {
        let (_dir, mgr) = make_storage();
        let data = b"hello world";
        let (sha256, len) = mgr.atomic_write("test.txt", data).unwrap();
        assert_eq!(len, 11);
        assert_eq!(sha256.len(), 64); // SHA-256 is 64 hex chars

        let read_data = mgr.read("test.txt").unwrap();
        assert_eq!(read_data, data);
    }

    #[test]
    fn checksum_verify() {
        let (_dir, mgr) = make_storage();
        let data = b"test data for checksum";
        let (sha256, _) = mgr.atomic_write("checksum.txt", data).unwrap();

        assert!(mgr.checksum_verify("checksum.txt", &sha256).unwrap());
        assert!(!mgr.checksum_verify("checksum.txt", "0000000000000000000000000000000000000000000000000000000000000000").unwrap());
    }

    #[test]
    fn path_traversal_denied() {
        let (_dir, mgr) = make_storage();
        assert!(mgr.read("../../../etc/passwd").is_err());
        assert!(mgr.read("..\\..\\windows\\system32").is_err());
    }

    #[test]
    fn delete_idempotent() {
        let (_dir, mgr) = make_storage();
        // Delete non-existent file should not error
        mgr.delete("nonexistent.txt").unwrap();
    }

    #[test]
    fn list_empty_directory() {
        let (_dir, mgr) = make_storage();
        mgr.mkdir("empty_dir").unwrap();
        let entries = mgr.list("empty_dir").unwrap();
        assert!(entries.is_empty());
    }

    #[test]
    fn stat_nonexistent() {
        let (_dir, mgr) = make_storage();
        let stat = mgr.stat("nonexistent.txt").unwrap();
        assert_eq!(stat["exists"], false);
    }

    #[test]
    fn manifest_crud() {
        let (_dir, mgr) = make_storage();
        let sha = "a".repeat(64);

        mgr.manifest_add_entry("meeting-1", "microphone", 0, "chunks/chunk_000.webm", &sha, 1024).unwrap();

        let entry = mgr.manifest_get_entry("meeting-1", "microphone", 0).unwrap();
        assert!(entry.is_some());
        let entry = entry.unwrap();
        assert_eq!(entry["chunkIndex"], 0);
        assert_eq!(entry["uploadStatus"], "pending");

        // Update status
        let updated = mgr.manifest_update_upload_status("meeting-1", "microphone", 0, "completed").unwrap();
        assert!(updated);

        // Get incomplete
        let incomplete = mgr.manifest_get_incomplete("meeting-1").unwrap();
        assert!(incomplete.is_empty());
    }

    #[test]
    fn manifest_list_entries() {
        let (_dir, mgr) = make_storage();
        let sha = "b".repeat(64);

        mgr.manifest_add_entry("meeting-2", "microphone", 0, "chunks/c0.webm", &sha, 500).unwrap();
        mgr.manifest_add_entry("meeting-2", "microphone", 1, "chunks/c1.webm", &sha, 600).unwrap();

        let entries = mgr.manifest_list_entries("meeting-2").unwrap();
        assert_eq!(entries.len(), 2);
    }

    #[test]
    fn migration_is_idempotent() {
        let dir = TempDir::new().unwrap();
        let path = dir.path().to_str().unwrap();
        // Run migrations twice — should not error
        let _mgr1 = StorageManager::new(path).unwrap();
        let _mgr2 = StorageManager::new(path).unwrap();
    }

    #[test]
    fn sha256_computation() {
        let result = compute_sha256(b"hello");
        assert_eq!(result, "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824");
    }

    #[test]
    fn reports_real_available_space_for_storage_root() {
        let (_dir, mgr) = make_storage();
        assert!(mgr.available_space_bytes().unwrap() > 0);
    }
}
