import { test, expect } from '@playwright/test';

test('reviewer completes the receipt and credit workflow through the interface', async ({
  page,
}) => {
  test.setTimeout(120000);
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'The exception desk' })).toBeVisible({
    timeout: 45000,
  });
  await page.getByRole('button', { name: /Northstar Components/ }).click();
  await page.getByRole('button', { name: 'Add receipt', exact: true }).click();
  await page.getByLabel('Accepted quantity', { exact: true }).fill('10');
  await page.getByLabel('Receipt reference', { exact: true }).fill('UI-RCV-10');
  await page.getByRole('button', { name: 'Record evidence', exact: true }).click();
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await page.getByRole('button', { name: 'Prepare resolution', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByRole('button', { name: 'Approve changes', exact: true }).click();
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await expect(page.locator('.case-header .status-badge')).toHaveText('On hold', {
    timeout: 30000,
  });
  await page.getByRole('button', { name: 'Record supplier credit', exact: true }).click();
  await page.getByLabel('Credit amount (USD)', { exact: true }).fill('400');
  await page.getByLabel('Supplier credit reference', { exact: true }).fill('UI-CREDIT-400');
  await page.getByRole('button', { name: 'Record evidence', exact: true }).click();
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await page.getByRole('button', { name: 'Prepare resolution', exact: true }).click();
  await page.getByRole('button', { name: 'Approve changes', exact: true }).click();
  await expect(page.locator('.case-header .status-badge')).toHaveText('Resolved', {
    timeout: 30000,
  });
  const download = page.waitForEvent('download');
  await page.getByRole('link', { name: 'Export', exact: true }).click();
  expect((await download).suggestedFilename()).toMatch(/\.json$/);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'The exception desk' })).toBeVisible({
    timeout: 45000,
  });
  await page.getByRole('button', { name: /Northstar Components/ }).click();
  await expect(page.locator('.case-header .status-badge')).toHaveText('Resolved');
});

test('mobile queue and case controls fit the viewport', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'The exception desk' })).toBeVisible({
    timeout: 45000,
  });
  await expect(page.getByRole('region', { name: 'Invoice exception queue' })).toBeVisible();
  await page.getByRole('button', { name: /Northstar Components/ }).click();
  await expect(page.getByRole('button', { name: 'Back to cases', exact: true })).toBeVisible();
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
  ).toBeTruthy();
  await page.getByRole('button', { name: 'Add receipt', exact: true }).click();
  expect(
    await page
      .getByLabel('Accepted quantity', { exact: true })
      .evaluate((el) => parseFloat(getComputedStyle(el).fontSize)),
  ).toBeGreaterThanOrEqual(16);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).not.toBeVisible();
});
