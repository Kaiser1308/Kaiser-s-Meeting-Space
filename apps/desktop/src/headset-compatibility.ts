function normalizedHeadsetName(label: string): string | null {
  const match = label.trim().match(/^(?:Headset|Headphones)\s*\([^)]*-\s*(.+)\)$/i);
  return match?.[1]?.trim().toLocaleLowerCase() || null;
}

export function headsetCompatibilityWarning(
  microphoneLabel: string,
  systemAudioLabel: string,
): string | null {
  const microphone = normalizedHeadsetName(microphoneLabel);
  const systemAudio = normalizedHeadsetName(systemAudioLabel);
  if (!microphone || microphone !== systemAudio) return null;
  return 'This Bluetooth headset uses separate microphone and headphone profiles. No endpoint will be changed automatically.';
}
