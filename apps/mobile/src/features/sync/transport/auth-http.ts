import type { ClientAuth } from '../../../auth/auth-client';
import { UploadTransportError } from '@kms/local-recovery';

/**
 * Authenticated HTTP fetch wrapper.
 *
 * Injects Bearer token from ClientAuth, intercepts 401 responses,
 * transparently refreshes the token, and retries the original request.
 *
 * Maps HTTP errors to UploadTransportError categories compatible with
 * the P07 UploadTransport contract.
 */

export interface AuthHttpConfig {
  /** Base URL for the API server. */
  baseUrl: string;
  /** Default request timeout in milliseconds. */
  timeoutMs?: number;
  /** Maximum content length for response body parsing. */
  maxResponseBytes?: number;
}

export class AuthHttpClient {
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly maxResponseBytes: number;

  constructor(
    private readonly clientAuth: ClientAuth,
    config: AuthHttpConfig,
  ) {
    this.baseUrl = config.baseUrl.replace(/\/$/, '');
    this.timeoutMs = config.timeoutMs ?? 30_000;
    this.maxResponseBytes = config.maxResponseBytes ?? 10 * 1024 * 1024;
  }

  /**
   * Perform an authenticated fetch. Automatically handles Bearer injection
   * and transparent token refresh on 401.
   */
  async fetch(
    path: string,
    init: RequestInit & { body?: BodyInit | Uint8Array | null } = {},
  ): Promise<Response> {
    const attempt = async (): Promise<Response> => {
      return this.doRequest(path, init);
    };

    try {
      const response = await attempt();

      // Transparent token refresh on 401
      if (response.status === 401) {
        try {
          await this.clientAuth.refresh();
        } catch {
          throw new UploadTransportError(
            'AUTH_EXPIRED',
            'Token expired and refresh failed',
            undefined,
            false,
          );
        }
        // Retry once after refresh
        return this.doRequest(path, init);
      }

      return response;
    } catch (err) {
      if (err instanceof UploadTransportError) throw err;
      if (err instanceof DOMException && err.name === 'AbortError') {
        throw new UploadTransportError('NETWORK', 'Request timed out', err, true);
      }
      if (err instanceof TypeError && err.message.includes('fetch')) {
        throw new UploadTransportError('NETWORK', 'Network unavailable', err, true);
      }
      throw new UploadTransportError('NETWORK', `Request failed: ${String(err)}`, err, true);
    }
  }

  private async doRequest(
    path: string,
    init: RequestInit & { body?: BodyInit | Uint8Array | null },
  ): Promise<Response> {
    return this.clientAuth.withAccessToken(async (token) => {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);

      try {
        const headers = new Headers(init.headers);

        // Don't set Content-Type for GET/HEAD requests with no body
        if (init.body && !headers.has('Content-Type')) {
          headers.set('Content-Type', 'application/octet-stream');
        }

        headers.set('Authorization', `Bearer ${token}`);

        const url = `${this.baseUrl}${path}`;
        const response = await fetch(url, {
          ...init,
          headers,
          signal: controller.signal,
          body: init.body as BodyInit | null | undefined,
        });

        return response;
      } finally {
        clearTimeout(timeoutId);
      }
    });
  }

  /** GET request returning parsed JSON. */
  async get<T>(path: string): Promise<T> {
    const response = await this.fetch(path, {
      method: 'GET',
      headers: { Accept: 'application/json' },
    });

    if (!response.ok) {
      await this.throwForStatus(response, path);
    }

    return this.parseJson<T>(response, path);
  }

  /** POST request with JSON body, returning parsed JSON. */
  async post<T>(path: string, body: unknown, headers?: Record<string, string>): Promise<T> {
    const response = await this.fetch(path, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        ...headers,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      await this.throwForStatus(response, path);
    }

    return this.parseJson<T>(response, path);
  }

  /** PUT binary body with required headers. */
  async putBinary(
    path: string,
    body: Uint8Array,
    requiredHeaders: Record<string, string>,
  ): Promise<Response> {
    const response = await this.fetch(path, {
      method: 'PUT',
      headers: { ...requiredHeaders },
      body: body.buffer as ArrayBuffer,
    });

    if (!response.ok) {
      throw new UploadTransportError(
        'STORAGE_ERROR',
        `Upload failed: HTTP ${response.status}`,
        undefined,
        true,
      );
    }

    return response;
  }

  private async throwForStatus(response: Response, _path: string): Promise<never> {
    const status = response.status;

    if (status === 409) {
      // Try to parse error body for code
      try {
        const body = (await response.json()) as { error?: { code?: string } };
        if (body.error?.code === 'AUDIO_CHUNK_CONFLICT') {
          throw new UploadTransportError(
            'CHECKSUM_CONFLICT',
            'Checksum mismatch with server',
            undefined,
            false,
          );
        }
      } catch {
        // Fall through to generic
      }
      throw new UploadTransportError(
        'CHECKSUM_CONFLICT',
        'Chunk conflict with server',
        undefined,
        false,
      );
    }

    if (status === 403) {
      throw new UploadTransportError('SERVER_ERROR', 'Access denied', undefined, false);
    }

    if (status >= 500) {
      throw new UploadTransportError(
        'SERVER_ERROR',
        `Server error: HTTP ${status}`,
        undefined,
        true,
      );
    }

    throw new UploadTransportError(
      'SERVER_ERROR',
      `Unexpected response: HTTP ${status}`,
      undefined,
      false,
    );
  }

  private async parseJson<T>(response: Response, path: string): Promise<T> {
    try {
      const text = await response.text();
      if (text.length > this.maxResponseBytes) {
        throw new UploadTransportError(
          'SERVER_ERROR',
          `Response too large for ${path}`,
          undefined,
          false,
        );
      }
      return JSON.parse(text) as T;
    } catch (err) {
      if (err instanceof UploadTransportError) throw err;
      throw new UploadTransportError(
        'SERVER_ERROR',
        `Malformed response from ${path}: ${String(err)}`,
        err,
        false,
      );
    }
  }
}
