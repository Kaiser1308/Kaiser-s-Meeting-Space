import type { BrowserWindow, IpcMain, IpcMainInvokeEvent } from 'electron';
import { isLocalModelId, isSpeechLanguage, type LocalModelId, type SpeechLanguage } from '../local-speech-models.js';
import { LOCAL_MODEL_CHANNELS } from '../local-model-channels.js';
import type { LocalModelManager } from './local-model-manager.js';

function deny(message: string): never {
  throw new Error(message);
}

function requireMainSender(event: IpcMainInvokeEvent, getMainWindow: () => BrowserWindow | null): void {
  const window = getMainWindow();
  if (!window || event.sender !== window.webContents) deny('MODEL_IPC_DENIED');
}

function modelId(payload: unknown): LocalModelId {
  const value = (payload as { modelId?: unknown } | null)?.modelId;
  if (!isLocalModelId(value)) deny('MODEL_IPC_INVALID_REQUEST');
  return value;
}

function language(payload: unknown): SpeechLanguage {
  const value = (payload as { language?: unknown } | null)?.language;
  if (!isSpeechLanguage(value)) deny('MODEL_IPC_INVALID_REQUEST');
  return value;
}

export function registerLocalModelIpc(
  ipcMain: IpcMain,
  manager: Pick<LocalModelManager, 'listModels' | 'getPreferredModel' | 'setPreferredModel' | 'download' | 'remove' | 'subscribe'>,
  getMainWindow: () => BrowserWindow | null,
): void {
  ipcMain.handle(LOCAL_MODEL_CHANNELS.list, async (event) => {
    requireMainSender(event, getMainWindow);
    return manager.listModels();
  });
  ipcMain.handle(LOCAL_MODEL_CHANNELS.preferred, async (event, payload) => {
    requireMainSender(event, getMainWindow);
    return manager.getPreferredModel(language(payload));
  });
  ipcMain.handle(LOCAL_MODEL_CHANNELS.preference, async (event, payload) => {
    requireMainSender(event, getMainWindow);
    return manager.setPreferredModel(language(payload), modelId(payload));
  });
  ipcMain.handle(LOCAL_MODEL_CHANNELS.download, async (event, payload) => {
    requireMainSender(event, getMainWindow);
    return manager.download(modelId(payload));
  });
  ipcMain.handle(LOCAL_MODEL_CHANNELS.remove, async (event, payload) => {
    requireMainSender(event, getMainWindow);
    return manager.remove(modelId(payload));
  });
}
