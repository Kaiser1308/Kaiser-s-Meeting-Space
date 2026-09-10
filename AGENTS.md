# Agent Execution Rules

This repository is governed by `docs/execution/`.

When asked to execute a phase:

1. Read `docs/execution/EXECUTION_PROTOCOL.md`, `PROGRESS.md`, the requested phase packet and every authoritative document it names.
2. Execute only that phase. Do not implement a dependency or next phase to make progress appear green.
3. Inspect current files and Git state before editing. Preserve user changes; never reset or discard them.
4. Use subagents only for independent work packages with non-overlapping file ownership. The main agent integrates and verifies.
5. For every task: implement, run the narrow test, debug the root cause and rerun. Then run the complete phase gate.
6. Commit each completed task separately, only after its required verification passes. Stage only that task's files and use a clear, task-scoped commit message; never combine unrelated work or user changes in the commit.
7. Audio/source transcript are immutable after finalization. Derived artifacts are versioned. Recording must not depend on network/AI availability.
8. Never use real meeting content, commit secrets, log content, fake device/provider behavior or claim unavailable manual tests passed.
9. Update `STATUS.md`, `execution/TRACEABILITY.md`, `execution/PROGRESS.md` and phase evidence only after direct verification.
10. A phase is `VERIFIED` only when every binary gate has evidence. Stop after handoff; never start the next phase.

Conflict precedence:

`accepted ADR → focused product/architecture/security docs → requested phase packet → superseded consolidated plan → prototype code`.

<!-- gitnexus:start -->
# GitNexus — Code Intelligence

This project is indexed by GitNexus as **Kaiser-s-Meeting-Space** (9927 symbols, 20093 relationships, 290 execution flows). Use the GitNexus MCP tools to understand code, assess impact, and navigate safely.

> Index stale? Run `node .gitnexus/run.cjs analyze` from the project root — it auto-selects an available runner. No `.gitnexus/run.cjs` yet? `npx gitnexus analyze` (npm 11 crash → `npm i -g gitnexus`; #1939).

## Always Do

- **MUST run impact analysis before editing any symbol.** Before modifying a function, class, or method, run `impact({target: "symbolName", direction: "upstream"})` and report the blast radius (direct callers, affected processes, risk level) to the user.
- **MUST run `detect_changes()` before committing** to verify your changes only affect expected symbols and execution flows. For regression review, compare against the default branch: `detect_changes({scope: "compare", base_ref: "main"})`.
- **MUST warn the user** if impact analysis returns HIGH or CRITICAL risk before proceeding with edits.
- When exploring unfamiliar code, use `query({search_query: "concept"})` to find execution flows instead of grepping. It returns process-grouped results ranked by relevance.
- When you need full context on a specific symbol — callers, callees, which execution flows it participates in — use `context({name: "symbolName"})`.
- For security review, `explain({target: "fileOrSymbol"})` lists taint findings (source→sink flows; needs `analyze --pdg`).

## Never Do

- NEVER edit a function, class, or method without first running `impact` on it.
- NEVER ignore HIGH or CRITICAL risk warnings from impact analysis.
- NEVER rename symbols with find-and-replace — use `rename` which understands the call graph.
- NEVER commit changes without running `detect_changes()` to check affected scope.

## Resources

| Resource | Use for |
|----------|---------|
| `gitnexus://repo/Kaiser-s-Meeting-Space/context` | Codebase overview, check index freshness |
| `gitnexus://repo/Kaiser-s-Meeting-Space/clusters` | All functional areas |
| `gitnexus://repo/Kaiser-s-Meeting-Space/processes` | All execution flows |
| `gitnexus://repo/Kaiser-s-Meeting-Space/process/{name}` | Step-by-step execution trace |

## CLI

| Task | Read this skill file |
|------|---------------------|
| Understand architecture / "How does X work?" | `.claude/skills/gitnexus/gitnexus-exploring/SKILL.md` |
| Blast radius / "What breaks if I change X?" | `.claude/skills/gitnexus/gitnexus-impact-analysis/SKILL.md` |
| Trace bugs / "Why is X failing?" | `.claude/skills/gitnexus/gitnexus-debugging/SKILL.md` |
| Rename / extract / split / refactor | `.claude/skills/gitnexus/gitnexus-refactoring/SKILL.md` |
| Tools, resources, schema reference | `.claude/skills/gitnexus/gitnexus-guide/SKILL.md` |
| Index, status, clean, wiki CLI commands | `.claude/skills/gitnexus/gitnexus-cli/SKILL.md` |

<!-- gitnexus:end -->
