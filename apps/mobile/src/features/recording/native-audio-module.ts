import { NativeEventEmitter } from 'react-native';
import { requireNativeModule } from 'expo-modules-core';
import {
  ChunkEventSchema,
  DeviceEventSchema,
  ErrorEventSchema,
  GapEventSchema,
  InterruptEventSchema,
  StorageEventSchema,
  StatusResponseSchema,
  type NativeAudioModule,
  type NativeCommand,
  type NativeEvent,
  type NativeEventListener,
  type ErrorEvent,
} from '@kms/mobile-audio';

type NativeRecorder = {
  configure(profileJson: string, storageDirectory: string, meetingId: string): Promise<string>;
  start(): Promise<string>;
  pause(): Promise<string>;
  resume(): Promise<string>;
  stop(): Promise<string>;
  status(): Promise<string>;
  cancel(): Promise<string>;
};

type EventSubscription = { remove(): void };
type EventEmitterLike = {
  addListener(eventName: string, listener: (payload: unknown) => void): EventSubscription;
};

const EVENT_NAMES = [
  'onChunk',
  'onDevice',
  'onInterrupt',
  'onStorage',
  'onGap',
  'onError',
] as const;

const EMPTY_STATUS: ReturnType<NativeAudioModule['getStatus']> = {
  state: 'unconfigured' as const,
  currentChunkIndex: 0,
  bytesWritten: 0,
  durationMs: 0,
  storageAvailable: 0,
};

export class NativeAudioCommandError extends Error {
  constructor(
    public readonly code: string,
    detail?: string,
  ) {
    super(detail ?? code);
    this.name = 'NativeAudioCommandError';
  }
}

function parseResponse(raw: string): Record<string, unknown> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new NativeAudioCommandError('io_error', 'Native command returned malformed response');
  }
  if (!parsed || typeof parsed !== 'object') {
    throw new NativeAudioCommandError('io_error', 'Native command returned malformed response');
  }
  const response = parsed as Record<string, unknown>;
  if (response.status === 'error' || response.success === false) {
    throw new NativeAudioCommandError(
      typeof response.code === 'string' ? response.code : 'unknown',
      typeof response.detail === 'string' ? response.detail : undefined,
    );
  }
  return response;
}

function normalizeEvent(payload: unknown): NativeEvent {
  const value =
    payload && typeof payload === 'object' ? { ...(payload as Record<string, unknown>) } : null;
  if (!value || typeof value.type !== 'string') {
    throw new NativeAudioCommandError('unknown', 'Native event is malformed');
  }

  // Android's current durable writer is raw PCM. Preserve the canonical
  // codec/container fields (pcm/raw) and strip only the transport extension.
  delete value.format;

  switch (value.type) {
    case 'chunk':
      return ChunkEventSchema.parse(value);
    case 'device':
      return DeviceEventSchema.parse(value);
    case 'interrupt':
      return InterruptEventSchema.parse(value);
    case 'storage':
      return StorageEventSchema.parse(value);
    case 'gap':
      return GapEventSchema.parse(value);
    case 'error':
      return ErrorEventSchema.parse(value);
    case 'status':
      return StatusResponseSchema.parse(value);
    default:
      throw new NativeAudioCommandError('unknown', 'Native event type is not supported');
  }
}

export class NativeAudioUnavailableError extends Error {
  constructor(detail: string) {
    super(`AudioRecorder native module is unavailable: ${detail}`);
    this.name = 'NativeAudioUnavailableError';
  }
}

function getNativeRecorder(): NativeRecorder {
  try {
    // Expo Modules is the authoritative registry for Expo modules. The
    // legacy React Native registry can be populated differently across
    // development/release runtimes and must not be used as a readiness gate.
    return requireNativeModule<NativeRecorder>('AudioRecorder');
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new NativeAudioUnavailableError(detail);
  }
}

export interface NativeAudioModuleOptions {
  readonly native?: NativeRecorder;
  readonly emitter?: EventEmitterLike;
}

/** Production JS adapter for the Expo AudioRecorder module. */
export function createNativeAudioModule(options: NativeAudioModuleOptions = {}): NativeAudioModule {
  const native = options.native ?? getNativeRecorder();
  const emitter = options.emitter ?? new NativeEventEmitter(native as never);
  const listeners = new Set<NativeEventListener>();
  let subscriptions: EventSubscription[] = [];
  let status = EMPTY_STATUS;

  function dispatch(payload: unknown): void {
    try {
      const event = normalizeEvent(payload);
      if (event.type === 'status') {
        status = {
          state: event.state,
          currentChunkIndex: event.currentChunkIndex,
          bytesWritten: event.bytesWritten,
          durationMs: event.durationMs,
          storageAvailable: event.storageAvailable,
        };
      }
      for (const listener of listeners) listener(event);
    } catch (error) {
      const detail = error instanceof Error ? error.message : 'Native event rejected';
      const code = error instanceof NativeAudioCommandError ? error.code : 'unknown';
      const event: ErrorEvent = {
        type: 'error',
        code: code as ErrorEvent['code'],
        detail,
        fatal: true,
      };
      for (const listener of listeners) listener(event);
    }
  }

  return {
    addEventListener(listener) {
      if (listeners.size === 0) {
        subscriptions = EVENT_NAMES.map((name) => emitter.addListener(name, dispatch));
      }
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
        if (listeners.size === 0) {
          for (const subscription of subscriptions) subscription.remove();
          subscriptions = [];
        }
      };
    },

    async sendCommand(command: NativeCommand): Promise<void> {
      let raw: string;
      switch (command.type) {
        case 'configure':
          raw = await native.configure(
            JSON.stringify(command.profile),
            command.storageDirectory,
            command.meetingId,
          );
          break;
        case 'start':
          raw = await native.start();
          break;
        case 'pause':
          raw = await native.pause();
          break;
        case 'resume':
          raw = await native.resume();
          break;
        case 'stop':
          raw = await native.stop();
          break;
        case 'status': {
          const response = parseResponse(await native.status());
          const event = StatusResponseSchema.parse(response);
          dispatch(event);
          return;
        }
        case 'cancel':
          raw = await native.cancel();
          break;
      }
      parseResponse(raw);
    },

    getStatus() {
      return status;
    },
  };
}
