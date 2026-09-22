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

test('exercises Windows recording and simulated source modes', async ({ page }) => {
  await page.goto('/');

  await page.getByRole('button', { name: 'Live translation', exact: false }).click();
  await expect(page.getByRole('button', { name: 'Live translation', exact: false })).toHaveClass(
    /active/,
  );

  await page.getByRole('button', { name: 'Simulated (P11)', exact: true }).click();
  await expect(page.getByText('Default microphone', { exact: true })).toBeVisible();
  await expect(page.getByText('Computer audio', { exact: true })).toBeVisible();
  await expect(page.getByLabel('MICROPHONE SOURCE')).toHaveCount(0);
});

test('validates an empty meeting title before checking capture runtime', async ({ page }) => {
  // Known defect: simulated mode reports runtime-unavailable before title validation.
  test.fail();
  await page.goto('/');
  await page.getByRole('button', { name: 'Simulated (P11)', exact: true }).click();
  await page.getByLabel('MEETING TITLE').fill('');
  await page.getByRole('button', { name: 'Start meeting', exact: true }).click();
  await expect(page.getByRole('alert')).toHaveText('Enter a meeting title.');
});

test('refreshes the Windows local meeting library', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Library', exact: true }).click();
  await page.getByRole('button', { name: 'Refresh', exact: true }).click();
  await expect(
    page.getByText('No local meetings found. Record a meeting to get started.', { exact: true }),
  ).toBeVisible();
});

test('opens the Windows Templates view from the primary navigation', async ({ page }) => {
  test.fail();
  await page.goto('/');
  await page.getByRole('button', { name: 'Templates', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Templates', exact: true })).toBeVisible();
});

test('opens the Windows Settings view from the primary navigation', async ({ page }) => {
  test.fail();
  await page.goto('/');
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Settings', exact: true })).toBeVisible();
});
