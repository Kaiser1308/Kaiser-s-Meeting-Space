import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { countExecutedTests } from './suite-result.mjs';

describe('countExecutedTests', () => {
  it('uses Vitest total test count when available', () => {
    assert.equal(countExecutedTests({ numTotalTests: 3 }), 3);
  });

  it('falls back to assertion results for compatible JSON reports', () => {
    assert.equal(
      countExecutedTests({
        testResults: [{ assertionResults: [{}, {}] }, { assertionResults: [{}] }],
      }),
      3,
    );
  });

  it('rejects a report with zero executed tests', () => {
    assert.throws(() => countExecutedTests({ numTotalTests: 0 }), /executed zero tests/);
  });
});
