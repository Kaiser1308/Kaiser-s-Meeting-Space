export interface ExportInput {
  readonly title: string;
  readonly locale: 'vi' | 'en';
  readonly sections: readonly { heading: string; content: string }[];
}
export interface RenderedArtifact {
  readonly format: 'markdown' | 'txt' | 'json' | 'audio' | 'docx' | 'pdf';
  readonly body: string;
  readonly contentType: string;
}
export interface AudioPackageInput {
  readonly tracks: readonly {
    readonly source: 'mic' | 'system';
    readonly storageKey: string;
    readonly sha256: string;
  }[];
  readonly gaps: readonly { readonly source: 'mic' | 'system'; readonly startMs: number; readonly endMs: number }[];
}

export function validateExportInput(
  input: ExportInput,
): { ok: true } | { ok: false; reason: string } {
  if (input.sections.length > 100) return { ok: false, reason: 'too many sections' };
  const totalLength = input.title.length + input.sections.reduce((sum, section) => sum + section.heading.length + section.content.length, 0);
  if (totalLength > 1_000_000) return { ok: false, reason: 'export input is too large' };
  if (input.title.length > 10_000 || input.sections.some((section) => section.heading.length > 10_000 || section.content.length > 500_000)) {
    return { ok: false, reason: 'export input is too large' };
  }
  return { ok: true };
}

function assertValidExportInput(input: ExportInput): void {
  const validation = validateExportInput(input);
  if (!validation.ok) throw new Error(validation.reason);
}
export function renderMarkdown(input: ExportInput): RenderedArtifact {
  assertValidExportInput(input);
  return {
    format: 'markdown',
    contentType: 'text/markdown',
    body: `# ${input.title}\n\n${input.sections.map((section) => `## ${section.heading}\n\n${section.content}`).join('\n\n')}\n`,
  };
}
export function renderText(input: ExportInput): RenderedArtifact {
  assertValidExportInput(input);
  return {
    format: 'txt',
    contentType: 'text/plain',
    body:
      [
        input.title,
        ...input.sections.flatMap((section) => [section.heading, section.content]),
      ].join('\n\n') + '\n',
  };
}
export function renderJson(input: ExportInput): RenderedArtifact {
  assertValidExportInput(input);
  return { format: 'json', contentType: 'application/json', body: JSON.stringify(input) };
}

export function renderAudioPackageManifest(input: AudioPackageInput): RenderedArtifact {
  const tracks = [...input.tracks].sort(
    (left, right) => left.source.localeCompare(right.source) || left.storageKey.localeCompare(right.storageKey),
  );
  if (
    tracks.some(
      (track) =>
        !/^audio\/[A-Za-z0-9_\-/]+\.webm$/.test(track.storageKey) ||
        !/^[0-9a-f]{64}$/i.test(track.sha256),
    ) ||
    input.gaps.some(
      (gap) => !Number.isInteger(gap.startMs) || !Number.isInteger(gap.endMs) || gap.startMs < 0 || gap.endMs <= gap.startMs,
    )
  ) {
    throw new Error('invalid audio package manifest');
  }
  const gaps = [...input.gaps].sort(
    (left, right) => left.source.localeCompare(right.source) || left.startMs - right.startMs || left.endMs - right.endMs,
  );
  return {
    format: 'audio',
    contentType: 'application/vnd.kms.audio-package+json',
    body: JSON.stringify({ version: 1, tracks, gaps }),
  };
}

function xmlEscape(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function createStoredZip(entries: readonly { readonly name: string; readonly body: string }[]): string {
  const localParts: Buffer[] = [];
  const centralParts: Buffer[] = [];
  let offset = 0;
  for (const entry of entries) {
    const name = Buffer.from(entry.name, 'utf8');
    const body = Buffer.from(entry.body, 'utf8');
    const local = Buffer.alloc(30 + name.length + body.length);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0, 6);
    local.writeUInt16LE(0, 8);
    local.writeUInt16LE(0, 10);
    local.writeUInt16LE(0, 12);
    local.writeUInt32LE(crc32(body), 14);
    local.writeUInt32LE(body.length, 18);
    local.writeUInt32LE(body.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);
    name.copy(local, 30);
    body.copy(local, 30 + name.length);
    localParts.push(local);

    const central = Buffer.alloc(46 + name.length);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0, 8);
    central.writeUInt16LE(0, 10);
    central.writeUInt16LE(0, 12);
    central.writeUInt16LE(0, 14);
    central.writeUInt32LE(crc32(body), 16);
    central.writeUInt32LE(body.length, 20);
    central.writeUInt32LE(body.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt16LE(0, 30);
    central.writeUInt16LE(0, 32);
    central.writeUInt16LE(0, 34);
    central.writeUInt16LE(0, 36);
    central.writeUInt32LE(0, 38);
    central.writeUInt32LE(offset, 42);
    name.copy(central, 46);
    centralParts.push(central);
    offset += local.length;
  }
  const locals = Buffer.concat(localParts);
  const central = Buffer.concat(centralParts);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(central.length, 12);
  end.writeUInt32LE(locals.length, 16);
  return Buffer.concat([locals, central, end]).toString('base64');
}

export function renderDocx(input: ExportInput): RenderedArtifact {
  assertValidExportInput(input);
  const paragraphs = [
    `<w:p><w:r><w:t>${xmlEscape(input.title)}</w:t></w:r></w:p>`,
    ...input.sections.flatMap((section) => [
      `<w:p><w:r><w:t>${xmlEscape(section.heading)}</w:t></w:r></w:p>`,
      `<w:p><w:r><w:t>${xmlEscape(section.content)}</w:t></w:r></w:p>`,
    ]),
  ].join('');
  const document = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${paragraphs}<w:sectPr/></w:body></w:document>`;
  const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>`;
  const rootRelationships = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`;
  return {
    format: 'docx',
    contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    body: createStoredZip([
      { name: '[Content_Types].xml', body: contentTypes },
      { name: '_rels/.rels', body: rootRelationships },
      { name: 'word/document.xml', body: document },
    ]),
  };
}

function pdfEscape(value: string): string {
  return value.replace(/[^\x20-\x7e]/g, '?').replace(/[\\()]/g, (character) => `\\${character}`);
}

export function renderPdf(input: ExportInput): RenderedArtifact {
  assertValidExportInput(input);
  const lines = [input.title, ...input.sections.flatMap((section) => [section.heading, section.content])];
  const commands = ['BT', '/F1 16 Tf', '72 760 Td', ...lines.flatMap((line, index) => [index === 0 ? `(${pdfEscape(line)}) Tj` : '0 -24 Td', index === 0 ? '' : `(${pdfEscape(line)}) Tj`]), 'ET'].filter(Boolean).join('\n');
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${Buffer.byteLength(commands, 'latin1')} >>\nstream\n${commands}\nendstream`,
  ];
  const parts = [`%PDF-1.4\n%\xFF\xFF\xFF\xFF\n`];
  const offsets = [0];
  let offset = Buffer.byteLength(parts[0]!, 'latin1');
  objects.forEach((object, index) => {
    offsets.push(offset);
    const serialized = `${index + 1} 0 obj\n${object}\nendobj\n`;
    parts.push(serialized);
    offset += Buffer.byteLength(serialized, 'latin1');
  });
  const xrefOffset = offset;
  const xref = [`xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`, ...offsets.slice(1).map((entry) => `${String(entry).padStart(10, '0')} 00000 n \n`), `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`].join('');
  parts.push(xref);
  return {
    format: 'pdf',
    contentType: 'application/pdf',
    body: Buffer.from(parts.join(''), 'latin1').toString('base64'),
  };
}
