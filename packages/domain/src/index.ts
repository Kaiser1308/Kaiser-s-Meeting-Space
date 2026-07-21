export type Language = "vi" | "en" | "mixed";
export type MeetingMode = "record" | "record_translate";
export type MeetingStatus = "draft" | "recording" | "paused" | "processing" | "ready" | "failed";
export type MinutesTemplate = "team" | "one_on_one" | "direct_report" | "leadership" | "recurring";

export interface EvidenceRef {
  segmentId: string;
  startMs: number;
  endMs: number;
}

export interface TranscriptSegment {
  id: string;
  meetingId: string;
  sequence: number;
  speakerId: string;
  speakerLabel: string;
  language: Language;
  text: string;
  startMs: number;
  endMs: number;
  confidence?: number;
  source: "api" | "local" | "manual";
}

export interface TranscriptRevision {
  id: string;
  segmentId: string;
  originalText: string;
  revisedText: string;
  revisedAt: string;
  reason?: string;
}

export interface AudioAsset {
  id: string;
  meetingId: string;
  source: "microphone" | "system";
  storageKey: string;
  startedAt: string;
  durationMs: number;
  sha256: string;
}

export interface Meeting {
  id: string;
  title: string;
  mode: MeetingMode;
  status: MeetingStatus;
  primaryLanguage: Language;
  startedAt?: string;
  endedAt?: string;
  createdAt: string;
}

export interface MinutesSection {
  id: string;
  heading: string;
  content: string;
  evidence: EvidenceRef[];
}

export interface ActionItem {
  id: string;
  description: string;
  owner?: string;
  dueDate?: string;
  status: "open" | "done" | "needs_confirmation";
  evidence: EvidenceRef[];
}

export interface DetailedMinutes {
  id: string;
  meetingId: string;
  template: MinutesTemplate;
  language: Language;
  title: string;
  sections: MinutesSection[];
  decisions: MinutesSection[];
  openQuestions: MinutesSection[];
  actionItems: ActionItem[];
  provider: string;
  model: string;
  createdAt: string;
}

export interface GenerateMinutesInput {
  meeting: Meeting;
  transcript: readonly TranscriptSegment[];
  template: MinutesTemplate;
  outputLanguage: "vi" | "en";
  detailLevel: "verbatim" | "detailed";
}
