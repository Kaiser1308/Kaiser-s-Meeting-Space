export type SpeechLanguage = 'vi' | 'en';

export type LocalModelId =
  | 'whisper-large-v3-turbo-q5_0'
  | 'whisper-small-q5_1-vi'
  | 'whisper-small-en-q5_1';

export interface LocalModelProfileV1 {
  modelId: LocalModelId;
  displayName: string;
  fileName: string;
  relativePath: `models/${string}/${string}.bin`;
  languages: readonly SpeechLanguage[];
  engineType: 'whisper_cpp_compat';
  runtime: { platform: 'win32'; architecture: 'x64' };
  byteLength: number;
  sha256: string;
  sourceUrl: string;
  sourceRevision: string;
}

export interface LocalModelCatalogV1 {
  version: 1;
  models: Record<LocalModelId, LocalModelProfileV1>;
}

const SOURCE_REVISION = '98aa99a0a9db05ae2342309f5096248665f7cba3';
const SOURCE_ROOT = `https://huggingface.co/ggerganov/whisper.cpp/resolve/${SOURCE_REVISION}`;

function profile(
  modelId: LocalModelId,
  displayName: string,
  fileName: `${string}.bin`,
  languages: readonly SpeechLanguage[],
  byteLength: number,
  sha256: string,
): LocalModelProfileV1 {
  return {
    modelId,
    displayName,
    fileName,
    relativePath: `models/${modelId}/${fileName}`,
    languages,
    engineType: 'whisper_cpp_compat',
    runtime: { platform: 'win32', architecture: 'x64' },
    byteLength,
    sha256,
    sourceUrl: `${SOURCE_ROOT}/${fileName}`,
    sourceRevision: SOURCE_REVISION,
  };
}

export const LOCAL_MODEL_ALLOWED_HTTPS_ORIGINS = [
  'https://huggingface.co',
  'https://us.aws.cdn.hf.co',
] as const;

export const LOCAL_MODEL_CATALOG: LocalModelCatalogV1 = {
  version: 1,
  models: {
    'whisper-large-v3-turbo-q5_0': profile(
      'whisper-large-v3-turbo-q5_0',
      'Whisper Large v3 Turbo (Q5_0)',
      'ggml-large-v3-turbo-q5_0.bin',
      ['vi', 'en'],
      574_041_195,
      '394221709cd5ad1f40c46e6031ca61bce88931e6e088c188294c6d5a55ffa7e2',
    ),
    'whisper-small-q5_1-vi': profile(
      'whisper-small-q5_1-vi',
      'Whisper Small Vietnamese (Q5_1)',
      'ggml-small-q5_1.bin',
      ['vi', 'en'],
      190_085_487,
      'ae85e4a935d7a567bd102fe55afc16bb595bdb618e11b2fc7591bc08120411bb',
    ),
    'whisper-small-en-q5_1': profile(
      'whisper-small-en-q5_1',
      'Whisper Small English (Q5_1)',
      'ggml-small.en-q5_1.bin',
      ['en'],
      190_098_681,
      'bfdff4894dcb76bbf647d56263ea2a96645423f1669176f4844a1bf8e478ad30',
    ),
  },
};

export function isLocalModelId(value: unknown): value is LocalModelId {
  return typeof value === 'string' && Object.hasOwn(LOCAL_MODEL_CATALOG.models, value);
}

export function isSpeechLanguage(value: unknown): value is SpeechLanguage {
  return value === 'vi' || value === 'en';
}

export function getDefaultModelId(_language: SpeechLanguage): LocalModelId {
  return 'whisper-large-v3-turbo-q5_0';
}

export function getCompatibleModel(id: LocalModelId, language: SpeechLanguage): LocalModelProfileV1 {
  const model = LOCAL_MODEL_CATALOG.models[id];
  if (!model.languages.includes(language)) throw new Error('MODEL_LANGUAGE_UNSUPPORTED');
  return model;
}
