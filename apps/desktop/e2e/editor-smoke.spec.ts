import { test, expect } from '@playwright/test';

test('renders the desktop shell without an unsafe editor crash', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('body')).toBeVisible();
});

test('exposes the Windows meeting capture controls and diagnostics', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByTestId('api-status')).toBeVisible();
  await expect(page.getByTestId('storage-status')).toHaveText('LOCAL PERSISTENT');
  await expect(page.getByRole('button', { name: 'Record', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Library', exact: true })).toBeVisible();
  await expect(page.getByLabel('MEETING TITLE')).toHaveValue('New meeting');
  await expect(page.getByText('Physical Capture', { exact: true })).toBeVisible();
  await expect(page.getByText('Simulated (P11)', { exact: true })).toBeVisible();
  await expect(page.getByText('MICROPHONE SOURCE', { exact: true })).toBeVisible();
});

test('switches between the Windows Record and Library tabs', async ({ page }) => {
  await page.goto('/');

  await page.getByRole('button', { name: 'Library', exact: true }).click();
  await expect(page.getByTestId('meeting-library')).toBeVisible();
  await expect(page.getByText('Stored Meetings', { exact: true })).toBeVisible();

  await page.getByRole('button', { name: 'Record', exact: true }).click();
  await expect(page.getByLabel('MEETING TITLE')).toBeVisible();
  await expect(page.getByText('Ready when you are.', { exact: true })).toBeVisible();
});
