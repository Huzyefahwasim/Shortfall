import assert from 'node:assert/strict';
import { chromium, expect } from '@playwright/test';
import { mkdirSync } from 'node:fs';
mkdirSync('.deploy', { recursive: true });
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const baseURL = process.env.TEST_BASE_URL || 'http://localhost:3000';
const page = await browser.newPage({ baseURL, viewport: { width: 1440, height: 1050 } });
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));
const shortViewports = [
  { width: 1280, height: 500 },
  { width: 1280, height: 550 },
  { width: 1010, height: 500 },
];
async function checkFits(controls) {
  for (const control of controls) {
    await expect(control).toBeVisible();
    await expect(control).toBeInViewport({ ratio: 0.99 });
  }
  const overflows = await page.evaluate(() => {
    const failures = [];
    if (
      document.documentElement.scrollWidth > innerWidth + 2 ||
      document.documentElement.scrollHeight > innerHeight + 2
    )
      failures.push('document');
    for (const element of document.querySelectorAll('main, main *')) {
      if (!(element instanceof HTMLElement) || !element.clientHeight) continue;
      const overflow = getComputedStyle(element).overflowY;
      if (
        ['auto', 'scroll', 'hidden', 'clip'].includes(overflow) &&
        element.scrollHeight > element.clientHeight + 2
      )
        failures.push(element.className || element.tagName);
      const overflowX = getComputedStyle(element).overflowX;
      if (
        ['auto', 'scroll', 'hidden', 'clip'].includes(overflowX) &&
        element.scrollWidth > element.clientWidth + 2
      )
        failures.push(`${element.className || element.tagName} (horizontal)`);
    }
    return failures;
  });
  assert.deepEqual(overflows, [], 'Content must fit without nested scrolling or clipping.');
}
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
for (const viewport of shortViewports) {
  await page.setViewportSize(viewport);
  await checkFits([
    page.getByRole('button', { name: /^Explore a sample case/ }),
    page.getByRole('button', { name: /^Create your own case/ }),
  ]);
  await page.screenshot({
    path: `.deploy/layout-v3-entry-${viewport.width}x${viewport.height}.png`,
  });
}
await page.setViewportSize({ width: 1440, height: 1050 });
await page.getByRole('button', { name: /Explore a sample case/ }).click();
await page.getByRole('heading', { name: 'The exception desk' }).waitFor({ timeout: 60000 });
const started = await page.request.get('/api/workspace');
assert.equal(started.status(), 200, 'Explore must explicitly start the sample session.');
const workspace = await started.json();
const workspaceId = workspace.workspace.id;
await page.screenshot({ path: '.deploy/preview-desktop.png', fullPage: true });
const desktopOverflow = await page.evaluate(
  () => document.documentElement.scrollWidth > innerWidth,
);
for (const viewport of shortViewports) {
  await page.setViewportSize(viewport);
  await checkFits([
    page.getByRole('button', { name: 'Prepare resolution', exact: true }),
    page.getByRole('button', { name: 'Add receipt', exact: true }),
    page.getByRole('button', { name: 'Record supplier credit', exact: true }),
    page.locator('.matching-panel'),
    page.locator('.resolution-panel'),
  ]);
  await page.screenshot({
    path: `.deploy/layout-v3-overview-${viewport.width}x${viewport.height}.png`,
  });
  await page.getByRole('button', { name: 'Home', exact: true }).click();
  await checkFits([
    page.getByRole('button', { name: 'Return to workspace', exact: true }),
    page.getByRole('button', { name: /^Explore a sample case/ }),
    page.getByRole('button', { name: /^Create your own case/ }),
  ]);
  await page.screenshot({
    path: `.deploy/layout-v3-home-${viewport.width}x${viewport.height}.png`,
  });
  await page.getByRole('button', { name: 'Return to workspace', exact: true }).click();
}
await page.setViewportSize({ width: 1440, height: 1050 });
await page.getByRole('tab', { name: /^Documents/ }).click();
await expect(page.locator('.document-paper pre')).toHaveCount(0);
const sample = workspace.cases.find((record) => record.poNumber === 'PO-1042');
const invoice = sample.documents.find((document) => document.kind === 'invoice');
await page.locator(`[data-document-id="${invoice.id}"]`).click();
await expect(
  page.getByRole('combobox', { name: 'Inspect source field', exact: true }),
).toBeVisible();
await page.screenshot({ path: '.deploy/preview-documents.png', fullPage: true });
await page.getByRole('button', { name: 'Close source', exact: true }).click();
await page.getByRole('tab', { name: 'Overview', exact: true }).click();
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
