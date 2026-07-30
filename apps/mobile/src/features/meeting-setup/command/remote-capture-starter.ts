import type { NativeAudioModule } from '@kms/mobile-audio';
import type { CaptureStarter } from './capture-starter';
import type { MeetingApi } from './meeting-api';
import type { StartMeetingCommand } from './types';
import { RecordingService } from '../../recording/service/recording-service';

export interface RemoteCaptureStarterOptions {
  readonly nativeModule: NativeAudioModule;
  readonly meetingApi: MeetingApi;
  readonly storageDirectory: string;
}

/**
 * Coordinates the local-first boundary: create the draft, prepare and start
 * local capture, then ask the server to enter `recording`. Any server failure
 * cancels local capture so the UI never acknowledges a split-brain session.
 */
export function createRemoteCaptureStarter(options: RemoteCaptureStarterOptions): CaptureStarter {
  return {
    async start({ command }: { command: StartMeetingCommand }) {
      const created = await options.meetingApi.create(command);
      if (created.id !== command.settings.id) {
        throw new Error('Server returned a different meeting id');
      }

      const service = new RecordingService(options.nativeModule);
      await service.initialize();
      try {
        await service.configure(command.settings.id, options.storageDirectory);
        if (service.getState().status !== 'idle') throw new Error('Capture configuration failed');
        await service.start();
        if (service.getState().status !== 'recording') throw new Error('Capture did not start');
        await options.meetingApi.start(command.settings.id, command.idempotencyKey);
        return { started: true };
      } catch (error) {
        await service.cancel();
        throw error;
      }
    },
  };
}
