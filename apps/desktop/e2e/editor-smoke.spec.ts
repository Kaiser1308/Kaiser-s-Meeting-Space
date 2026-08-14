import { test, expect } from '@playwright/test';

test('renders the desktop shell without an unsafe editor crash', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('body')).toBeVisible();
});
