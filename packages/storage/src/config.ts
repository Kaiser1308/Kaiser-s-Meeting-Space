import { StorageError } from './errors.js';

export interface StorageConfig {
  readonly endpoint: string;
  readonly region: string;
  readonly bucket: string;
  readonly accessKey: string;
  readonly secretKey: string;
  readonly forcePathStyle: boolean;
}

type StorageConfigInputs = Pick<
  StorageConfig,
  'endpoint' | 'region' | 'bucket' | 'accessKey' | 'secretKey' | 'forcePathStyle'
>;

function createStorageConfig(parts: StorageConfigInputs): StorageConfig {
  const obj: StorageConfig = {
    endpoint: parts.endpoint,
    region: parts.region,
    bucket: parts.bucket,
    forcePathStyle: parts.forcePathStyle,
    accessKey: '',
    secretKey: '',
  } as StorageConfig;
  Object.defineProperty(obj, 'accessKey', {
    value: parts.accessKey,
    enumerable: false,
    configurable: false,
    writable: false,
  });
  Object.defineProperty(obj, 'secretKey', {
    value: parts.secretKey,
    enumerable: false,
    configurable: false,
    writable: false,
  });
  return Object.freeze(obj);
}

function isHttpUrl(value: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return false;
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false;
  if (parsed.username || parsed.password) return false;
  return true;
}

function parseForcePathStyle(raw: string | undefined): boolean {
  if (raw === undefined) return false;
  const normalized = raw.trim().toLowerCase();
  return normalized === 'true' || normalized === '1' || normalized === 'yes';
}

export function loadStorageConfig(env: Record<string, string | undefined>): StorageConfig {
  const endpoint = env.S3_ENDPOINT;
  const bucket = env.S3_BUCKET;
  const accessKey = env.S3_ACCESS_KEY;
  const secretKey = env.S3_SECRET_KEY;

  if (!endpoint?.trim() || !bucket?.trim() || !accessKey?.trim() || !secretKey?.trim()) {
    throw new StorageError('config_error');
  }
  if (!isHttpUrl(endpoint)) {
    throw new StorageError('config_error');
  }

  const region =
    env.S3_REGION && env.S3_REGION.trim().length > 0 ? env.S3_REGION.trim() : 'us-east-1';
  const forcePathStyle = parseForcePathStyle(env.S3_FORCE_PATH_STYLE);

  return createStorageConfig({ endpoint, region, bucket, accessKey, secretKey, forcePathStyle });
}

export function toSafeLoggable(config: StorageConfig): Record<string, string> {
  return {
    endpoint: '***',
    region: config.region,
    bucket: '***',
    accessKey: '***',
    secretKey: '***',
    forcePathStyle: String(config.forcePathStyle),
  };
}
