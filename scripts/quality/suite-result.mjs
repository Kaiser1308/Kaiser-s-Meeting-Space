export function countExecutedTests(report) {
  const total =
    report.numTotalTests ??
    report.testResults?.reduce((sum, result) => sum + (result.assertionResults?.length ?? 0), 0);

  if (!Number.isInteger(total) || total <= 0) {
    throw new Error('Required test suite executed zero tests');
  }

  return total;
}
