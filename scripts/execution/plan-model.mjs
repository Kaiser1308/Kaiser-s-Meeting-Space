import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

const PHASE_FILE_PATTERN = /^(P\d{2})-[a-z0-9-]+\.md$/;

export function canonicalPhaseIds() {
  return Array.from({ length: 29 }, (_, index) => `P${String(index).padStart(2, '0')}`);
}

export function parseFrontmatter(markdown) {
  const match = markdown.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
  if (!match) {
    throw new Error('missing frontmatter');
  }

  const result = {};
  for (const line of match[1].split(/\r?\n/)) {
    if (!line.trim()) continue;
    const entry = line.match(/^([a-z_]+):\s*(.*)$/);
    if (!entry) {
      throw new Error(`invalid frontmatter line: ${line}`);
    }
    const [, key, rawValue] = entry;
    if (Object.hasOwn(result, key)) {
      throw new Error(`duplicate frontmatter key: ${key}`);
    }
    result[key] = parseFrontmatterValue(rawValue);
  }
  return result;
}

function parseFrontmatterValue(rawValue) {
  const value = rawValue.trim();
  if (value.startsWith('[') && value.endsWith(']')) {
    const inner = value.slice(1, -1).trim();
    return inner ? inner.split(',').map((item) => item.trim()) : [];
  }
  return value.replace(/^(['"])(.*)\1$/, '$2');
}

export function extractSection(markdown, heading) {
  const escaped = escapeRegExp(heading);
  const match = markdown.match(
    new RegExp(`(?:^|\\r?\\n)# ${escaped}\\s*\\r?\\n([\\s\\S]*?)(?=\\r?\\n# |$)`),
  );
  if (!match) {
    throw new Error(`missing section: ${heading}`);
  }
  return match[1].trim();
}

export function parsePhasePacket(filePath, markdown) {
  const frontmatter = parseFrontmatter(markdown);
  const filename = path.basename(filePath).replaceAll('\\', '/');
  const filenamePhase = filename.match(PHASE_FILE_PATTERN)?.[1];
  if (!filenamePhase || filenamePhase !== frontmatter.phase) {
    throw new Error(`phase/filename mismatch: ${frontmatter.phase ?? 'missing'} vs ${filename}`);
  }

  const id = frontmatter.phase;
  const dependencySection = optionalSection(markdown, 'Dependency gate');
  const verificationSection = extractSection(markdown, 'Integrated verification');
  const taskIds = [...markdown.matchAll(new RegExp(`^## (${id}-T\\d{2})\\b`, 'gm'))].map(
    (match) => match[1],
  );
  const acceptanceIds = [
    ...markdown.matchAll(new RegExp(`^- \\[ \\] (${id}-A\\d{2})\\b`, 'gm')),
  ].map((match) => match[1]);

  return {
    id,
    title: frontmatter.title,
    packetStatus: frontmatter.packet_status,
    legacyStatus: frontmatter.status,
    dependsOn: arrayValue(frontmatter.depends_on),
    requirements: arrayValue(frontmatter.requirements),
    risk: frontmatter.risk,
    outcome: extractSection(markdown, 'Outcome'),
    dependencyGate: dependencySection ? parseNamedTable(dependencySection, DEPENDENCY_COLUMNS) : [],
    commandRows: parseCommandRows(verificationSection),
    taskIds,
    acceptanceIds,
    boundary:
      optionalSection(markdown, 'Conversation boundary') ||
      extractSection(markdown, 'Handoff record'),
    path: filePath.replaceAll('\\', '/'),
    markdown,
  };
}

export function parseProgress(markdown) {
  const table = parseFirstTableContaining(markdown, ['Phase', 'State', 'Tasks']);
  const phases = new Map();
  for (const row of table) {
    if (!/^P\d{2}$/.test(row.Phase)) continue;
    const taskMatch = row.Tasks.match(/^(\d+)\/(\d+)$/);
    if (!taskMatch) {
      throw new Error(`invalid progress task count for ${row.Phase}: ${row.Tasks}`);
    }
    phases.set(row.Phase, {
      id: row.Phase,
      state: row.State,
      dependsOn: row['Direct dependencies']
        ? row['Direct dependencies']
            .split(',')
            .map((value) => value.trim())
            .filter((value) => value && value !== '-')
        : [],
      tasks: { complete: Number(taskMatch[1]), total: Number(taskMatch[2]) },
      row,
    });
  }
  return phases;
}

export async function loadExecutionModel(rootDir) {
  const phaseDir = path.join(rootDir, 'docs', 'execution', 'phases');
  const filenames = (await readdir(phaseDir))
    .filter((name) => PHASE_FILE_PATTERN.test(name))
    .sort((left, right) => left.localeCompare(right));
  const packets = await Promise.all(
    filenames.map(async (filename) => {
      const relativePath = path.posix.join('docs/execution/phases', filename);
      const markdown = await readFile(path.join(phaseDir, filename), 'utf8');
      return parsePhasePacket(relativePath, markdown);
    }),
  );
  const progressMarkdown = await readFile(
    path.join(rootDir, 'docs', 'execution', 'PROGRESS.md'),
    'utf8',
  );
  const masterPlanMarkdown = await readFile(
    path.join(rootDir, 'docs', 'execution', 'MASTER_PLAN.md'),
    'utf8',
  );

  return {
    rootDir,
    packets,
    progress: parseProgress(progressMarkdown),
    progressMarkdown,
    masterPlanMarkdown,
  };
}

const DEPENDENCY_COLUMNS = {
  Dependency: 'dependency',
  'Required capability': 'requiredCapability',
  'Required evidence': 'requiredEvidence',
  'Minimum lifecycle': 'minimumLifecycle',
};

function parseCommandRows(markdown) {
  const tables = parseTables(markdown);
  const table = tables.find(
    (rows) =>
      rows.headers.includes('Gate') &&
      rows.headers.includes('Command') &&
      rows.headers.includes('Intended signal') &&
      rows.headers.includes('Evidence'),
  );
  if (!table) return [];
  return table.rows.map((row) => ({
    gate: row.Gate,
    command: stripCode(row.Command),
    intendedSignal: row['Intended signal'],
    evidence: row.Evidence,
  }));
}

function parseNamedTable(markdown, columnMap) {
  const requiredHeaders = Object.keys(columnMap);
  const table = parseTables(markdown).find((candidate) =>
    requiredHeaders.every((header) => candidate.headers.includes(header)),
  );
  if (!table) return [];
  return table.rows.map((row) =>
    Object.fromEntries(
      Object.entries(columnMap).map(([header, property]) => [property, row[header]]),
    ),
  );
}

function parseFirstTableContaining(markdown, headers) {
  const table = parseTables(markdown).find((candidate) =>
    headers.every((header) => candidate.headers.includes(header)),
  );
  if (!table) {
    throw new Error(`missing table with headers: ${headers.join(', ')}`);
  }
  return table.rows;
}

function parseTables(markdown) {
  const lines = markdown.split(/\r?\n/);
  const tables = [];
  for (let index = 0; index < lines.length - 1; index += 1) {
    if (!isTableLine(lines[index]) || !isSeparatorLine(lines[index + 1])) continue;
    const headers = splitTableLine(lines[index]);
    const rows = [];
    let cursor = index + 2;
    while (cursor < lines.length && isTableLine(lines[cursor])) {
      const cells = splitTableLine(lines[cursor]);
      if (cells.length === headers.length) {
        rows.push(
          Object.fromEntries(headers.map((header, cellIndex) => [header, cells[cellIndex]])),
        );
      }
      cursor += 1;
    }
    tables.push({ headers, rows });
    index = cursor - 1;
  }
  return tables;
}

function isTableLine(line) {
  return /^\s*\|.*\|\s*$/.test(line);
}

function isSeparatorLine(line) {
  return splitTableLine(line).every((cell) => /^:?-{3,}:?$/.test(cell));
}

function splitTableLine(line) {
  return line
    .trim()
    .slice(1, -1)
    .split('|')
    .map((cell) => cell.trim());
}

function stripCode(value) {
  return value.replace(/^`([\s\S]*)`$/, '$1');
}

function optionalSection(markdown, heading) {
  try {
    return extractSection(markdown, heading);
  } catch {
    return '';
  }
}

function arrayValue(value) {
  if (Array.isArray(value)) return value;
  if (value === undefined || value === '') return [];
  return [String(value)];
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
