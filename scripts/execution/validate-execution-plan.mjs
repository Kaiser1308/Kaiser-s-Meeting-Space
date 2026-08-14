import { access, readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { renderFormattedPhasePrompts } from './generate-phase-prompts.mjs';
import { canonicalPhaseIds, extractSection, loadExecutionModel } from './plan-model.mjs';

const REQUIRED_SECTIONS = [
  'Outcome',
  'Authoritative context',
  'Preconditions and external prerequisites',
  'Dependency gate',
  'Scope firewall',
  'Contracts and invariants',
  'File and ownership map',
  'Ordered task packets',
  'Subagent work packages',
  'Failure and debugging matrix',
  'Integrated verification',
  'Acceptance gate',
  'Migration, rollout, and rollback',
  'Required documentation updates',
  'Conversation boundary',
  'Handoff record',
];

const LIFECYCLES = new Set(['IMPLEMENTED', 'VERIFIED']);
const AMBIGUOUS_MARKER =
  /\b(?:TBD|TODO|implement later|fill in|similar to|appropriate handling)\b/i;

export async function validateExecutionPlan(rootDir) {
  const errors = [];
  let model;
  try {
    model = await loadExecutionModel(rootDir);
  } catch (error) {
    return {
      errors: [issue('MODEL_PARSE', 'docs/execution', error.message)],
      counts: { packets: 0, tasks: 0, acceptance: 0, prompts: 0, brokenLinks: 0 },
    };
  }

  const canonicalIds = canonicalPhaseIds();
  const packetIds = model.packets.map(({ id }) => id);
  if (packetIds.length !== canonicalIds.length || packetIds.join(',') !== canonicalIds.join(',')) {
    errors.push(
      issue(
        'PACKET_COUNT',
        'docs/execution/phases',
        `expected ${canonicalIds.join(',')}; found ${packetIds.join(',')}`,
      ),
    );
  }

  const seenTasks = new Set();
  const seenAcceptance = new Set();
  for (const packet of model.packets) {
    validatePacket(packet, errors, seenTasks, seenAcceptance);
    validateDependencyRows(packet, errors);
  }
  errors.push(...(await findActivePlanningMarkers(rootDir)));

  validateGraph(model.packets, errors);
  validateProgressSymmetry(model, errors);
  validateMasterSymmetry(model, errors);

  let brokenLinks = 0;
  for (const packet of model.packets) {
    const broken = await findBrokenLinks(rootDir, packet);
    brokenLinks += broken.length;
    errors.push(...broken);
  }

  const prompts = await countPromptBlocks(rootDir);
  if (prompts > 0) {
    const promptMarkdown = await readFile(
      path.join(rootDir, 'docs', 'execution', 'PHASE_PROMPTS.md'),
      'utf8',
    );
    if (promptMarkdown !== (await renderFormattedPhasePrompts(model))) {
      errors.push(
        issue(
          'PROMPT_STALE',
          'docs/execution/PHASE_PROMPTS.md',
          'generated prompts differ from packet metadata',
        ),
      );
    }
  }
  return {
    errors: sortIssues(errors),
    counts: {
      packets: model.packets.length,
      tasks: [...seenTasks].length,
      acceptance: [...seenAcceptance].length,
      prompts,
      brokenLinks,
    },
  };
}

function validatePacket(packet, errors, seenTasks, seenAcceptance) {
  if (packet.packetStatus !== 'ACCEPTED') {
    errors.push(
      issue(
        'PACKET_STATUS',
        packet.path,
        `packet_status must be ACCEPTED; found ${packet.packetStatus ?? 'missing'}`,
      ),
    );
  }
  if (packet.legacyStatus !== undefined) {
    errors.push(
      issue('LIFECYCLE_DUPLICATED', packet.path, 'remove runtime status from packet frontmatter'),
    );
  }
  const ambiguous = packet.markdown.match(AMBIGUOUS_MARKER)?.[0];
  if (ambiguous) {
    errors.push(issue('AMBIGUOUS_MARKER', packet.path, `active packet contains "${ambiguous}"`));
  }

  for (const heading of REQUIRED_SECTIONS) {
    try {
      extractSection(packet.markdown, heading);
    } catch {
      errors.push(issue('SECTION_MISSING', packet.path, `missing # ${heading}`));
    }
  }

  if (packet.commandRows.length === 0 || packet.commandRows.some((row) => !row.command)) {
    errors.push(
      issue(
        'COMMAND_CONTRACT_EMPTY',
        packet.path,
        'Integrated verification needs an exact command',
      ),
    );
  }

  validateIds(packet.taskIds, seenTasks, 'TASK_ID_DUPLICATE', packet.path, errors);
  validateIds(packet.acceptanceIds, seenAcceptance, 'ACCEPTANCE_ID_DUPLICATE', packet.path, errors);
}

function validateIds(ids, seen, duplicateCode, filePath, errors) {
  for (const id of ids) {
    if (seen.has(id)) {
      errors.push(issue(duplicateCode, filePath, `duplicate ID ${id}`));
    }
    seen.add(id);
  }
}

function validateDependencyRows(packet, errors) {
  if (packet.dependsOn.length === 0) return;
  for (const dependency of packet.dependsOn) {
    const rows = packet.dependencyGate.filter((row) => row.dependency === dependency);
    if (rows.length !== 1) {
      errors.push(
        issue(
          'DEPENDENCY_GATE_MISSING',
          packet.path,
          `expected one dependency-gate row for ${dependency}; found ${rows.length}`,
        ),
      );
      continue;
    }
    const [row] = rows;
    if (!LIFECYCLES.has(row.minimumLifecycle)) {
      errors.push(
        issue(
          'DEPENDENCY_LIFECYCLE_INVALID',
          packet.path,
          `${dependency} minimum lifecycle is ${row.minimumLifecycle}`,
        ),
      );
    }
    if (
      row.minimumLifecycle === 'IMPLEMENTED' &&
      !/EVIDENCE\.md(?:#|$)/i.test(row.requiredEvidence)
    ) {
      errors.push(
        issue(
          'DEPENDENCY_EVIDENCE_MISSING',
          packet.path,
          `${dependency} IMPLEMENTED gate needs an EVIDENCE.md link`,
        ),
      );
    }
  }
}

function validateGraph(packets, errors) {
  const graph = new Map(packets.map((packet) => [packet.id, packet.dependsOn]));
  const visiting = new Set();
  const visited = new Set();

  function visit(id, trail) {
    if (visiting.has(id)) {
      errors.push(issue('DEPENDENCY_CYCLE', 'docs/execution/phases', [...trail, id].join(' -> ')));
      return;
    }
    if (visited.has(id)) return;
    visiting.add(id);
    for (const dependency of graph.get(id) ?? []) {
      if (!graph.has(dependency)) {
        errors.push(
          issue('DEPENDENCY_UNKNOWN', `docs/execution/phases/${id}`, `unknown ${dependency}`),
        );
      } else {
        visit(dependency, [...trail, id]);
      }
    }
    visiting.delete(id);
    visited.add(id);
  }

  for (const id of graph.keys()) visit(id, []);
}

function validateProgressSymmetry(model, errors) {
  for (const packet of model.packets) {
    const progress = model.progress.get(packet.id);
    if (!progress) {
      errors.push(issue('PROGRESS_PHASE_MISSING', 'docs/execution/PROGRESS.md', packet.id));
      continue;
    }
    if (progress.dependsOn.join(',') !== packet.dependsOn.join(',')) {
      errors.push(
        issue(
          'DEPENDENCY_PROGRESS_MISMATCH',
          packet.path,
          `${packet.id}: packet=${packet.dependsOn.join(',')} progress=${progress.dependsOn.join(',')}`,
        ),
      );
    }
    if (progress.tasks.total !== packet.taskIds.length) {
      errors.push(
        issue(
          'TASK_TOTAL_MISMATCH',
          packet.path,
          `${packet.id}: packet=${packet.taskIds.length} progress=${progress.tasks.total}`,
        ),
      );
    }
  }
}

function validateMasterSymmetry(model, errors) {
  const masterDependencies = parseMasterDependencies(model.masterPlanMarkdown);
  for (const packet of model.packets) {
    const master = masterDependencies.get(packet.id);
    if (!master) {
      errors.push(issue('MASTER_PHASE_MISSING', 'docs/execution/MASTER_PLAN.md', packet.id));
      continue;
    }
    if (master.join(',') !== packet.dependsOn.join(',')) {
      errors.push(
        issue(
          'DEPENDENCY_MASTER_MISMATCH',
          packet.path,
          `${packet.id}: packet=${packet.dependsOn.join(',')} master=${master.join(',')}`,
        ),
      );
    }
  }
}

function parseMasterDependencies(markdown) {
  const result = new Map();
  for (const line of markdown.split(/\r?\n/)) {
    const cells = splitTableLine(line);
    const phase = cells?.[0].match(/P\d{2}/)?.[0];
    if (!cells || !phase) continue;
    const dependencyCell = cells.findLast((cell) => cell === '-' || /P\d{2}/.test(cell)) ?? '-';
    result.set(
      phase,
      dependencyCell === '-'
        ? []
        : [...dependencyCell.matchAll(/P\d{2}/g)].map((match) => match[0]),
    );
  }
  return result;
}

async function findBrokenLinks(rootDir, packet) {
  const errors = [];
  for (const match of packet.markdown.matchAll(/\[[^\]]*]\(([^)]+)\)/g)) {
    const target = match[1].split('#')[0];
    if (!target || /^(?:https?:|mailto:)/i.test(target)) continue;
    const absolute = path.resolve(rootDir, path.dirname(packet.path), decodeURIComponent(target));
    const exactCase = await hasExactPathCase(rootDir, absolute);
    if (exactCase === false) {
      errors.push(issue('LINK_CASE_MISMATCH', packet.path, target));
      continue;
    }
    try {
      await access(absolute);
    } catch {
      errors.push(issue('LINK_BROKEN', packet.path, target));
    }
  }
  return errors;
}

async function hasExactPathCase(rootDir, absolutePath) {
  const relative = path.relative(rootDir, absolutePath);
  if (relative.startsWith('..') || path.isAbsolute(relative)) return undefined;
  let cursor = rootDir;
  for (const segment of relative.split(path.sep).filter(Boolean)) {
    let entries;
    try {
      entries = await readdir(cursor);
    } catch {
      return undefined;
    }
    if (!entries.includes(segment)) {
      return entries.some((entry) => entry.toLowerCase() === segment.toLowerCase())
        ? false
        : undefined;
    }
    cursor = path.join(cursor, segment);
  }
  return true;
}

async function countPromptBlocks(rootDir) {
  try {
    const markdown = await readFile(
      path.join(rootDir, 'docs', 'execution', 'PHASE_PROMPTS.md'),
      'utf8',
    );
    return [...markdown.matchAll(/^## P\d{2}\b/gm)].length;
  } catch {
    return 0;
  }
}

async function findActivePlanningMarkers(rootDir) {
  const paths = [
    'docs/execution/MASTER_PLAN.md',
    'docs/execution/PROGRESS.md',
    'docs/execution/TRACEABILITY.md',
    'docs/execution/AGENT_PROMPT.md',
    'docs/execution/EXECUTION_PROTOCOL.md',
    'docs/execution/README.md',
  ];
  const errors = [];
  for (const relativePath of paths) {
    let markdown;
    try {
      markdown = await readFile(path.join(rootDir, relativePath), 'utf8');
    } catch {
      continue;
    }
    const ambiguous = markdown.match(AMBIGUOUS_MARKER)?.[0];
    if (ambiguous) {
      errors.push(issue('AMBIGUOUS_MARKER', relativePath, `active plan contains "${ambiguous}"`));
    }
  }
  return errors;
}

function splitTableLine(line) {
  if (!/^\s*\|.*\|\s*$/.test(line)) return undefined;
  return line
    .trim()
    .slice(1, -1)
    .split('|')
    .map((cell) => cell.trim());
}

function issue(code, filePath, message) {
  return { code, path: filePath.replaceAll('\\', '/'), message };
}

function sortIssues(errors) {
  return errors.sort(
    (left, right) =>
      left.path.localeCompare(right.path) ||
      left.code.localeCompare(right.code) ||
      left.message.localeCompare(right.message),
  );
}

async function main() {
  const rootDir = process.cwd();
  const result = await validateExecutionPlan(rootDir);
  if (result.errors.length) {
    for (const error of result.errors) {
      console.error(`${error.code} ${error.path}: ${error.message}`);
    }
    process.exitCode = 1;
    return;
  }
  const { packets, tasks, acceptance, prompts, brokenLinks } = result.counts;
  console.log(
    `execution plan valid: ${packets} packets, ${tasks} tasks, ${acceptance} acceptance IDs, ${prompts} prompts, ${brokenLinks} broken links`,
  );
}

const isCli = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isCli) await main();
