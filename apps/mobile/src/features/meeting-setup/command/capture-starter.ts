import type { StartMeetingCommand } from './types';

export interface StartInput {
  command: StartMeetingCommand;
}

export interface StartOutput {
  started: boolean;
}

export interface CaptureStarter {
  start(input: StartInput): Promise<StartOutput>;
}

export function createFakeCaptureStarter(options: { started?: boolean } = {}): CaptureStarter {
  return {
    async start() {
      return { started: options.started ?? true };
    },
  };
}
