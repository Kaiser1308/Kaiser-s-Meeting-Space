export interface ExportInput {
  readonly title: string;
  readonly locale: 'vi' | 'en';
  readonly sections: readonly { heading: string; content: string }[];
}
export interface RenderedArtifact {
  readonly format: 'md' | 'txt' | 'json';
  readonly body: string;
  readonly contentType: string;
}
export function renderMarkdown(input: ExportInput): RenderedArtifact {
  return {
    format: 'md',
    contentType: 'text/markdown',
    body: `# ${input.title}\n\n${input.sections.map((section) => `## ${section.heading}\n\n${section.content}`).join('\n\n')}\n`,
  };
}
export function renderText(input: ExportInput): RenderedArtifact {
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
  return { format: 'json', contentType: 'application/json', body: JSON.stringify(input) };
}
