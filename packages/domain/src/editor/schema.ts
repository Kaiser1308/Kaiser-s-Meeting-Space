export type EditorNode = HeadingNode | ParagraphNode | ListNode | CitationNode | ConfirmationNode;
export interface HeadingNode {
  readonly type: 'heading';
  readonly id: string;
  readonly level: 1 | 2 | 3;
  readonly text: string;
}
export interface ParagraphNode {
  readonly type: 'paragraph';
  readonly id: string;
  readonly text: string;
}
export interface ListNode {
  readonly type: 'list';
  readonly id: string;
  readonly ordered: boolean;
  readonly items: readonly string[];
}
export interface CitationNode {
  readonly type: 'citation';
  readonly id: string;
  readonly segmentId: string;
  readonly startMs: number;
  readonly endMs: number;
  readonly stale?: boolean;
}
export interface ConfirmationNode {
  readonly type: 'confirmation';
  readonly id: string;
  readonly text: string;
  readonly needsConfirmation: true;
}
export interface MinutesDocumentV1 {
  readonly version: 1;
  readonly id: string;
  readonly ownerId: string;
  readonly meetingId: string;
  readonly nodes: readonly EditorNode[];
}
const unsafe = /<\/?(script|iframe|object|embed)\b|javascript:/i;
export function validateMinutesDocument(
  value: unknown,
): { ok: true; value: MinutesDocumentV1 } | { ok: false; reason: string } {
  const doc = value as Partial<MinutesDocumentV1>;
  if (
    doc.version !== 1 ||
    typeof doc.id !== 'string' ||
    typeof doc.ownerId !== 'string' ||
    typeof doc.meetingId !== 'string' ||
    !Array.isArray(doc.nodes)
  )
    return { ok: false, reason: 'invalid document provenance' };
  const ids = new Set<string>();
  for (const node of doc.nodes as EditorNode[]) {
    if (!node || typeof node.id !== 'string' || ids.has(node.id))
      return { ok: false, reason: 'duplicate or missing node id' };
    ids.add(node.id);
    if (node.type === 'heading' && (node.level < 1 || node.level > 3 || unsafe.test(node.text)))
      return { ok: false, reason: 'invalid heading' };
    if (node.type === 'paragraph' && unsafe.test(node.text))
      return { ok: false, reason: 'unsafe paragraph' };
    if (node.type === 'list' && node.items.some((item) => unsafe.test(item)))
      return { ok: false, reason: 'unsafe list' };
    if (
      node.type === 'citation' &&
      (node.startMs > node.endMs || node.startMs < 0 || node.endMs < 0)
    )
      return { ok: false, reason: 'invalid citation range' };
    if (node.type === 'confirmation' && node.needsConfirmation !== true)
      return { ok: false, reason: 'confirmation marker missing' };
  }
  return { ok: true, value: doc as MinutesDocumentV1 };
}
export function serializeMinutesDocument(document: MinutesDocumentV1): string {
  const result = validateMinutesDocument(document);
  if (!result.ok) throw new Error(result.reason);
  return JSON.stringify(result.value);
}
