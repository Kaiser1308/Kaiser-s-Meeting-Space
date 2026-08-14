# P19 integrated evidence

Status: IMPLEMENTED under the deferred qualification policy. Safe versioned
editor documents, immutable database versions, restore-as-new, bounded rewrite
acceptance, citation navigation, and supported desktop editing commands are
implemented with direct focused evidence. P19 is not VERIFIED: full desktop
E2E/a11y/manual qualification and inherited P16/P17/P18 rows remain open.

Direct evidence:

- T01/T07 journal seam: 7 focused editor files / 18 tests passed, including
  two-slot corrupt-snapshot fallback; domain typecheck passed.
- T02/T05: PostgreSQL integration 6/6 passed, including CAS, idempotency,
  transaction rollback, source immutability, restore-as-new, and pagination;
  database/API typechecks passed.
- T03/T04: desktop editor/citation/accessibility focused suite 9/9 passed;
  desktop typecheck passed.
- T06: rewrite focused suite 3/3 passed; API DTO suite 2/2 passed.
- Full package unit reruns passed: domain 32 files/409 tests, desktop 9
  files/43 tests, API 16 files/69 tests.
- Playwright + axe-core desktop renderer suite is configured under
  `apps/desktop/e2e/`: shell smoke, real shell axe scan, and the synthetic
  editor fixture all passed; the production `MinutesEditor` flow and axe scan
  also pass (5/5 total). Native Electron/manual qualification remains open.
- Continuation run `RUN-20260813-1506.md` records the renderer remediation and
  direct verification; `playwright-axe-report.json` records 3/3 tests and zero
  axe violations.
- Continuation run `RUN-20260813-1515.md` records the red/green fix for
  persistent journal acknowledgement after reload.
- Continuation run `RUN-20260813-1520.md` records production component browser
  coverage; `playwright-axe-report.json` records 5/5 tests and zero violations.
- Continuation run `RUN-20260813-1536.md` records native Electron smoke 1/1,
  the preload/CSP fixes, and the reproducible native build harness;
  `native-electron-report.json` records the direct native result.
- `pnpm install` is up to date. Docker-backed integration was run only with
  synthetic fixtures; no real meeting content/provider/device/manual result is
  claimed.

Evidence artifacts: `editor-schema.json`, `minutes-version-api.json`,
`editor-ui-report.json`, `editor-citation-report.json`,
`version-history-report.json`, `rewrite-proposal-report.json`, and
`playwright-axe-report.json`.
