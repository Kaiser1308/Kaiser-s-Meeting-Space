export interface ArtifactRef {
  readonly kind: 'prompt' | 'schema' | 'config';
  readonly name: string;
  readonly version: string;
  readonly hash: string;
  readonly body: unknown;
}
export class ArtifactRegistry {
  private readonly artifacts = new Map<string, ArtifactRef>();
  private readonly active = new Map<string, string>();
  register(artifact: ArtifactRef): void {
    const key = `${artifact.kind}:${artifact.name}:${artifact.version}`;
    const existing = this.artifacts.get(key);
    if (existing && existing.hash !== artifact.hash) throw new Error('artifact hash mismatch');
    this.artifacts.set(key, Object.freeze({ ...artifact }));
  }
  activate(kind: ArtifactRef['kind'], name: string, version: string): void {
    const key = `${kind}:${name}:${version}`;
    if (!this.artifacts.has(key)) throw new Error('unknown artifact');
    this.active.set(`${kind}:${name}`, version);
  }
  resolve(kind: ArtifactRef['kind'], name: string, version?: string): ArtifactRef {
    const selected = version ?? this.active.get(`${kind}:${name}`);
    const artifact = selected ? this.artifacts.get(`${kind}:${name}:${selected}`) : undefined;
    if (!artifact) throw new Error('artifact is not registered');
    return artifact;
  }
}
