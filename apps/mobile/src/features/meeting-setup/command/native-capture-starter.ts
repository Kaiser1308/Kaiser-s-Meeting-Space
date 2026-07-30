import type { NativeAudioModule } from '@kms/mobile-audio';
import type { CaptureStarter } from './capture-starter';
import type { StartMeetingCommand } from './types';
import { RecordingService } from '../../recording/service/recording-service';

export interface NativeCaptureStarterOptions {
  readonly nativeModule: NativeAudioModule;
  readonly storageDirectory: string;
}

/**
 * P09 boundary: StartFlow owns validation, while this adapter owns local
 * capture setup. It never creates a fake meeting id or claims success before
 * the native service reaches `recording`.
 */
export function createNativeCaptureStarter(options: NativeCaptureStarterOptions): CaptureStarter {
  return {
    async start({ command }: { command: StartMeetingCommand }) {
      const service = new RecordingService(options.nativeModule);
      await service.initialize();
      await service.configure(command.settings.id, options.storageDirectory);
      if (
        service.getState().status !== 'idle' ||
        service.getState().meetingId !== command.settings.id
      ) {
        service.destroy();
        throw new Error('Capture configuration failed');
      }
      await service.start();
      if (service.getState().status !== 'recording') {
        service.destroy();
        throw new Error('Capture did not enter recording state');
      }
      return { started: true };
    },
  };
}
