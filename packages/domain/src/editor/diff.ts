import type { MinutesDocumentV1, EditorNode } from './schema.js';

export interface NodeDiff {
  readonly added: readonly EditorNode[];
  readonly removed: readonly EditorNode[];
  readonly changed: readonly { before: EditorNode; after: EditorNode }[];
}

export function diffMinutesDocuments(before: MinutesDocumentV1, after: MinutesDocumentV1): NodeDiff {
  const beforeById = new Map(before.nodes.map((node) => [node.id, node]));
  const afterById = new Map(after.nodes.map((node) => [node.id, node]));
  const added: EditorNode[] = [];
  const removed: EditorNode[] = [];
  const changed: { before: EditorNode; after: EditorNode }[] = [];
  for (const [id, afterNode] of afterById) {
    const beforeNode = beforeById.get(id);
    if (!beforeNode) added.push(afterNode);
    else if (JSON.stringify(beforeNode) !== JSON.stringify(afterNode))
      changed.push({ before: beforeNode, after: afterNode });
  }
  for (const [id, beforeNode] of beforeById) {
    if (!afterById.has(id)) removed.push(beforeNode);
  }
  return { added, removed, changed };
}

export function hasNoStructuralChange(diff: NodeDiff): boolean {
  return diff.added.length === 0 && diff.removed.length === 0 && diff.changed.length === 0;
}
