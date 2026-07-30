export const catalog = {
  app: {
    name: "Kaiser's Meeting Space",
    tagline: 'Capture every word.',
  },
  shell: {
    error: {
      title: 'Something went wrong',
      retry: 'Try again',
    },
  },
  auth: {
    login: 'Log in',
    logout: 'Log out',
    loading: 'Loading...',
    error: {
      offline: 'You are offline. Please check your connection.',
      expired: 'Your session has expired. Please log in again.',
      revoked: 'Your session has been revoked. Please log in again.',
      generic: 'An error occurred. Please try again.',
    },
  },
  start: {
    title: 'Meeting title',
    language: {
      label: 'Language',
      vi: 'Vietnamese',
      en: 'English',
    },
    mode: {
      label: 'Meeting mode',
      meeting_only: 'Record only',
      meeting_translate: 'Translate',
    },
    source: {
      label: 'Audio source',
      mic: 'Microphone',
      system: 'System audio',
    },
    processing: {
      label: 'Transcription',
    },
    readiness: {
      label: 'System check',
    },
    consent: {
      label: 'Consent',
    },
    button: 'Start meeting',
    back: 'Back',
    next: 'Next',
  },
  choice: {
    record_only: 'Record only',
    live_cloud: 'Show live transcript using cloud',
    final_local: 'Create transcript on this computer after the meeting',
    final_cloud: 'Create transcript with cloud after the meeting',
    final_local_cloud_check: 'Create locally, then check approved difficult parts with cloud',
  },
  readiness: {
    block: {
      microphone_permission: 'Microphone permission is required',
      audio_source_invalid: 'No valid audio source available',
      storage_insufficient: 'Not enough storage space available',
    },
    delay: {
      waiting_for_desktop: 'Waiting for desktop connection',
      waiting_for_model: 'Waiting for translation model',
      provider_unavailable: 'Cloud provider unavailable',
      offline: 'You are offline',
      translation_unavailable: 'Translation not available',
    },
  },
  consent: {
    copy: 'This is a placeholder consent copy. Real copy will be provided in v0.2.',
    provider: 'Provider',
    scope: 'Scope',
    version: 'Version',
    grant: 'Grant consent',
    decline: 'Decline',
  },
  test: {
    greeting: 'Hello {name}',
  },
};
