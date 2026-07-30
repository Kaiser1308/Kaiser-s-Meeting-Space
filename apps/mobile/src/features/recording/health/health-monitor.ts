/**
 * P09-T06: Health monitor for recording sessions.
 *
 * Tracks storage thresholds, estimates remaining recording time,
 * and emits warning/critical events.
 */
import type { StorageWarningLevel } from '../reducer/types';

export interface HealthMonitorConfig {
  /** Bytes below which a warning is emitted. Default: 10% of total. */
  warningThresholdBytes?: number;
  /** Bytes below which a critical warning is emitted. Default: 5% of total. */
  criticalThresholdBytes?: number;
  /** Bytes consumed per minute of recording (96kbps mono ≈ 720KB/min). */
  bytesPerMinute?: number;
}

export interface HealthSnapshot {
  storageWarning: StorageWarningLevel;
  availableBytes: number;
  totalBytes: number;
  percentRemaining: number;
  estimatedRemainingMinutes: number;
}

const DEFAULT_BYTES_PER_MINUTE = 720_000; // ~96kbps Opus mono

export function computeHealthSnapshot(
  availableBytes: number,
  totalBytes: number,
  config?: HealthMonitorConfig,
): HealthSnapshot {
  const bytesPerMin = config?.bytesPerMinute ?? DEFAULT_BYTES_PER_MINUTE;
  const pct = totalBytes > 0 ? Math.round((availableBytes / totalBytes) * 100) : 100;

  let storageWarning: StorageWarningLevel = 'ok';
  const criticalPct = config?.criticalThresholdBytes
    ? Math.round((config.criticalThresholdBytes / totalBytes) * 100)
    : 5;
  const warningPct = config?.warningThresholdBytes
    ? Math.round((config.warningThresholdBytes / totalBytes) * 100)
    : 10;

  if (pct <= criticalPct) {
    storageWarning = 'critical';
  } else if (pct <= warningPct) {
    storageWarning = 'warning';
  }

  const estimatedRemainingMinutes = Math.floor(availableBytes / bytesPerMin);

  return {
    storageWarning,
    availableBytes,
    totalBytes,
    percentRemaining: pct,
    estimatedRemainingMinutes,
  };
}
