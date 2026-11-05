import assert from 'node:assert/strict';
import { chromium, expect } from '@playwright/test';
import { mkdirSync } from 'node:fs';
mkdirSync('.deploy', { recursive: true });
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const baseURL = process.env.TEST_BASE_URL || 'http://localhost:3000';
const page = await browser.newPage({ baseURL, viewport: { width: 1440, height: 1050 } });
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));
await page.goto('/');
await page
  .getByRole('heading', { name: 'Resolve an invoice exception' })
  .waitFor({ timeout: 60000 });
assert.equal(
  (await page.request.get('/api/workspace')).status(),
  401,
  'Entry must remain anonymous.',
);
await page.screenshot({ path: '.deploy/preview-entry.png', fullPage: true });
await page.getByRole('button', { name: /Explore a sample case/ }).click();
await page.getByRole('heading', { name: 'The exception desk' }).waitFor({ timeout: 60000 });
const started = await page.request.get('/api/workspace');
assert.equal(started.status(), 200, 'Explore must explicitly start the sample session.');
const workspaceId = (await started.json()).workspace.id;
await page.screenshot({ path: '.deploy/preview-desktop.png', fullPage: true });
const desktopOverflow = await page.evaluate(
  () => document.documentElement.scrollWidth > innerWidth,
);
await page.getByRole('button', { name: 'Home', exact: true }).click();
await expect(page.getByRole('button', { name: /^Explore a sample case/ })).toBeVisible();
await page.screenshot({ path: '.deploy/preview-home.png', fullPage: true });
await page.getByRole('button', { name: /^Explore a sample case/ }).click();
await expect(page.getByRole('heading', { name: 'The exception desk' })).toBeVisible();
assert.equal(
  (await (await page.request.get('/api/workspace')).json()).workspace.id,
  workspaceId,
  'Home must preserve the current session.',
);
await page.setViewportSize({ width: 390, height: 844 });
await page.getByRole('button', { name: 'Back to cases', exact: true }).click();
await page.screenshot({ path: '.deploy/preview-mobile.png', fullPage: true });
const mobileOverflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
await page.getByRole('button', { name: /Northstar Components/ }).click();
await page.screenshot({ path: '.deploy/preview-mobile-case.png', fullPage: true });
console.log(JSON.stringify({ errors, desktopOverflow, mobileOverflow }));
await browser.close();
