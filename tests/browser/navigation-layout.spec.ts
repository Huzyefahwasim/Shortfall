import { expect, test, type Locator, type Page } from '@playwright/test';
import type { CaseRecord, WorkspaceResponse } from '../../src/lib/types';

const origin = process.env.TEST_BASE_URL || 'http://localhost:3000';
const viewports = [
  { width: 1280, height: 560 },
  { width: 1366, height: 650 },
  { width: 1440, height: 760 },
  { width: 390, height: 700 },
];

async function expectPageFits(page: Page, desktop: boolean) {
  const dimensions = await page.evaluate(() => ({
    width: innerWidth,
    height: innerHeight,
    documentWidth: document.documentElement.scrollWidth,
    bodyWidth: document.body.scrollWidth,
    documentHeight: document.documentElement.scrollHeight,
    bodyHeight: document.body.scrollHeight,
    top: scrollY,
  }));
  expect(dimensions.documentWidth, 'document horizontal overflow').toBeLessThanOrEqual(
    dimensions.width + 2,
  );
  expect(dimensions.bodyWidth, 'body horizontal overflow').toBeLessThanOrEqual(
    dimensions.width + 2,
  );
  if (desktop) {
    expect(dimensions.documentHeight, 'desktop document vertical overflow').toBeLessThanOrEqual(
      dimensions.height + 2,
    );
    expect(dimensions.bodyHeight, 'desktop body vertical overflow').toBeLessThanOrEqual(
      dimensions.height + 2,
    );
    expect(dimensions.top, 'desktop navigation scrolled the page itself').toBe(0);
  }
}

async function expectReachable(control: Locator) {
  await expect(control).toBeVisible();
  await control.scrollIntoViewIfNeeded();
  await expect(control).toBeInViewport({ ratio: 0.95 });
  if (await control.isEnabled()) await control.click({ trial: true });
}

async function expectKeyboardReachable(page: Page, dialog: Locator, target: Locator) {
  // Start at the named close control, then use real sequential keyboard navigation.
  await dialog.getByRole('button', { name: 'Close dialog', exact: true }).focus();
  for (let attempt = 0; attempt < 45; attempt++) {
    if (await target.evaluate((element) => element === document.activeElement)) {
      await expect(target).toBeInViewport({ ratio: 0.95 });
      return;
    }
    await page.keyboard.press('Tab');
  }
  throw new Error('Dialog primary action was not reachable by sequential keyboard navigation.');
}

async function inspectDialog(page: Page, heading: string, primaryName: string, desktop: boolean) {
  const dialog = page.getByRole('dialog', { name: heading, exact: true });
  await expect(dialog).toBeVisible();
  const bounds = await dialog.boundingBox();
  expect(bounds).not.toBeNull();
  const viewport = page.viewportSize()!;
  expect(bounds!.x).toBeGreaterThanOrEqual(-2);
  expect(bounds!.y).toBeGreaterThanOrEqual(-2);
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(viewport.width + 2);
  expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(viewport.height + 2);
  const primary = dialog.getByRole('button', { name: primaryName, exact: true });
  await expectReachable(primary);
  // Upload deliberately remains unavailable in CI without an inference key.
  if (await primary.isEnabled()) await expectKeyboardReachable(page, dialog, primary);
  else await expectKeyboardReachable(page, dialog, dialog.getByRole('button', { name: 'Cancel' }));
  await expectPageFits(page, desktop);
  await page.keyboard.press('Escape');
  await expect(dialog).not.toBeVisible();
}

async function enterSample(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: /Explore a sample case/ }).click({ timeout: 45000 });
  await expect(page.getByRole('heading', { name: 'The exception desk' })).toBeVisible({
    timeout: 45000,
  });
  const northstar = page.getByRole('button', { name: /Northstar Components/ });
  // The guided entry already opens a case on narrow screens; the queue is then hidden.
  if (await northstar.isVisible()) await northstar.click();
}

for (const viewport of viewports) {
  test(`pages and every dialog remain usable at ${viewport.width}x${viewport.height}`, async ({
    page,
  }) => {
    test.setTimeout(120000);
    await page.setViewportSize(viewport);
    const desktop = viewport.width >= 1000;
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Resolve an invoice exception' })).toBeVisible();
    await expectReachable(page.getByRole('button', { name: /Explore a sample case/ }));
    await expectReachable(page.getByRole('button', { name: /Create your own case/ }));
    await expectPageFits(page, desktop);
    await page.getByRole('button', { name: /Explore a sample case/ }).click();
    await expect(page.getByRole('heading', { name: 'The exception desk' })).toBeVisible({
      timeout: 45000,
    });
    await expectReachable(page.getByRole('button', { name: 'Prepare resolution', exact: true }));
    await expectPageFits(page, desktop);

    await page.getByRole('tab', { name: /^Activity/ }).click();
    await expect(page.getByRole('heading', { name: 'Case history' })).toBeVisible();
    await expectPageFits(page, desktop);
    await page.getByRole('tab', { name: 'Evidence & resolution' }).click();

    const navigation = page.getByRole('navigation', { name: 'Main navigation' });
    await navigation.getByRole('button', { name: 'Activity', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Workspace activity' })).toBeVisible();
    await expectReachable(page.getByRole('button', { name: 'Refresh', exact: true }));
    await expectPageFits(page, desktop);
    await navigation.getByRole('button', { name: /^Exceptions/ }).click();

    await navigation.getByRole('button', { name: 'Policy', exact: true }).click();
    await inspectDialog(page, 'Workspace policy', 'Understood', desktop);

    await page.getByRole('button', { name: 'New case', exact: true }).click();
    await inspectDialog(page, 'Open a new case', 'Create case', desktop);
    await page.getByRole('button', { name: 'Upload supporting document', exact: true }).click();
    await inspectDialog(page, 'Attach supporting evidence', 'Upload document', desktop);
    await page.getByRole('button', { name: 'Add receipt', exact: true }).click();
    await inspectDialog(page, 'Record accepted goods', 'Record evidence', desktop);
    await page.getByRole('button', { name: 'Record supplier credit', exact: true }).click();
    await inspectDialog(page, 'Record supplier credit', 'Record evidence', desktop);
    await page.locator('.owner-control').click();
    await inspectDialog(page, 'Assign the work', 'Save assignments', desktop);
    await page.getByRole('button', { name: 'Reset sample workspace', exact: true }).click();
    await inspectDialog(page, 'Reset this workspace?', 'Reset sample data', desktop);
    await page.getByRole('button', { name: 'Prepare resolution', exact: true }).click();
    await inspectDialog(page, 'Review the proposed hold', 'Approve changes', desktop);
    await page.getByRole('button', { name: 'End session', exact: true }).click();
    await inspectDialog(page, 'End this session?', 'End session', desktop);
    await expectPageFits(page, desktop);
  });
}

test('long source text scrolls inside the evidence panel and leaves the primary action available', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 560 });
  await enterSample(page);
  const response = await page.request.get('/api/workspace');
  expect(response.ok()).toBeTruthy();
  const workspace = (await response.json()) as WorkspaceResponse;
  const original = workspace.cases.find((item) => item.poNumber === 'PO-1042')!;
  const longRecord = structuredClone(original);
  // Render-only fixture: no upload, inference call, or mutation of the stored source.
  const invoice = longRecord.documents.find((document) => document.kind === 'invoice')!;
  invoice.text += `\n${'Long supplier reference '.repeat(80)}\n${Array.from(
    { length: 180 },
    (_, index) => `Supporting record line ${index + 1}: retained quantity evidence.`,
  ).join('\n')}\nEND OF LONG SOURCE`;
  await page.route(`**/api/cases/${original.id}`, async (route) => {
    if (route.request().method() === 'GET') await route.fulfill({ json: longRecord });
    else await route.continue();
  });
  await page.getByRole('button', { name: 'Refresh cases', exact: true }).click();
  const source = page.locator('.document-paper pre');
  await expect(source).toContainText('END OF LONG SOURCE');
  const overflow = await source.evaluate((element) => ({
    client: element.clientHeight,
    scroll: element.scrollHeight,
    overflowY: getComputedStyle(element).overflowY,
  }));
  expect(overflow.client).toBeGreaterThan(0);
  expect(overflow.scroll).toBeGreaterThan(overflow.client);
  expect(['auto', 'scroll']).toContain(overflow.overflowY);
  await source.hover();
  await page.mouse.wheel(0, 10000);
  await expect.poll(() => source.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
  await expect(
    page.getByRole('button', { name: 'Prepare resolution', exact: true }),
  ).toBeInViewport({
    ratio: 0.95,
  });
  await expectReachable(page.getByRole('button', { name: 'Prepare resolution', exact: true }));
  await expectPageFits(page, true);
});

test('Home and browser history preserve a case; End session revokes it until explicit re-entry', async ({
  page,
  playwright,
}) => {
  test.setTimeout(120000);
  const sessionCreations: string[] = [];
  page.on('request', (request) => {
    if (request.method() === 'POST' && new URL(request.url()).pathname === '/api/session')
      sessionCreations.push(request.url());
  });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Resolve an invoice exception' })).toBeVisible();
  expect(sessionCreations).toHaveLength(0);
  await page.getByRole('button', { name: /Create your own case/ }).click();
  const create = page.getByRole('dialog', { name: 'Open a new case' });
  await create.getByLabel('Supplier', { exact: true }).fill('Navigation Test Supply');
  await create.getByLabel('Item description', { exact: true }).fill('Returnable storage boxes');
  await create.getByLabel('Purchase order reference', { exact: true }).fill('NAV-PO-45');
  await create.getByLabel('Invoice reference', { exact: true }).fill('NAV-INV-45');
  await create.getByLabel('Exact SKU', { exact: true }).fill('NAV-BOX');
  await create.getByLabel('Unit price (USD)', { exact: true }).fill('12.50');
  await create.getByLabel('Ordered units', { exact: true }).fill('45');
  await create.getByLabel('Invoiced units', { exact: true }).fill('45');
  await create.getByLabel('Accepted units so far', { exact: true }).fill('38');
  await create.getByRole('button', { name: 'Create case', exact: true }).click();
  await expect(create).not.toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'Navigation Test Supply', exact: true }),
  ).toBeVisible();
  await expect(page).toHaveURL(/#exceptions$/);
  expect(sessionCreations).toHaveLength(1);
  const priorWorkspace = (await (
    await page.request.get('/api/workspace')
  ).json()) as WorkspaceResponse;
  const created = priorWorkspace.cases.find((item) => item.invoiceNumber === 'NAV-INV-45')!;
  expect(created).toBeTruthy();
  const priorCookie = (await page.context().cookies(origin)).find(
    (cookie) => cookie.name === 'shortfall_session',
  )!;
  expect(priorCookie).toBeTruthy();

  const navigation = page.getByRole('navigation', { name: 'Main navigation' });
  await navigation.getByRole('button', { name: 'Activity', exact: true }).click();
  await expect(page).toHaveURL(/#activity$/);
  await navigation.getByRole('button', { name: 'Home', exact: true }).click();
  await expect(page).toHaveURL(/#home$/);
  await expect(page.getByRole('heading', { name: 'Resolve an invoice exception' })).toBeVisible();
  expect(
    (await page.context().cookies(origin)).find((cookie) => cookie.name === 'shortfall_session')
      ?.value,
  ).toBe(priorCookie.value);
  const preserved = (await (
    await page.request.get(`/api/cases/${created.id}`)
  ).json()) as CaseRecord;
  expect(preserved.invoiceNumber).toBe('NAV-INV-45');
  expect(preserved.sourceRevision).toBe(created.sourceRevision);

  await page.goBack();
  await expect(page).toHaveURL(/#activity$/);
  await expect(page.getByRole('heading', { name: 'Workspace activity' })).toBeVisible();
  await page.goBack();
  await expect(page).toHaveURL(/#exceptions$/);
  await expect(
    page.getByRole('heading', { name: 'Navigation Test Supply', exact: true }),
  ).toBeVisible();
  await page.goForward();
  await expect(page).toHaveURL(/#activity$/);
  await page.goForward();
  await expect(page).toHaveURL(/#home$/);
  await page.getByRole('button', { name: 'Return to workspace', exact: true }).click();
  await page.getByRole('link', { name: 'Skip to workspace', exact: true }).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { name: 'Workspace activity' })).toBeVisible();
  await expect(page.locator('#main-content')).toBeFocused();
  const otherTab = await page.context().newPage();
  await otherTab.goto('/');
  await expect(otherTab.getByRole('heading', { name: 'The exception desk' })).toBeVisible();
  await page.getByRole('button', { name: 'End session', exact: true }).click();
  const ending = page.getByRole('dialog', { name: 'End this session?', exact: true });
  await ending.getByRole('button', { name: 'Keep working', exact: true }).click();
  expect(
    (await page.context().cookies(origin)).find((cookie) => cookie.name === 'shortfall_session')
      ?.value,
  ).toBe(priorCookie.value);
  await page.getByRole('button', { name: 'End session', exact: true }).click();
  await ending.getByRole('button', { name: 'End session', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Resolve an invoice exception' })).toBeVisible();
  await expect(page).toHaveURL(/#home$/);
  await expect(
    otherTab.getByRole('heading', { name: 'Resolve an invoice exception' }),
  ).toBeVisible();
  await otherTab.close();
  expect(
    (await page.context().cookies(origin)).find((cookie) => cookie.name === 'shortfall_session'),
  ).toBeUndefined();
  expect((await page.request.get('/api/workspace')).status()).toBe(401);
  const oldSession = await playwright.request.newContext({
    baseURL: origin,
    extraHTTPHeaders: { Cookie: `shortfall_session=${priorCookie.value}` },
  });
  expect((await oldSession.get('/api/workspace')).status()).toBe(401);
  await oldSession.dispose();
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Resolve an invoice exception' })).toBeVisible();
  expect(sessionCreations).toHaveLength(1);
  expect((await page.request.get('/api/workspace')).status()).toBe(401);

  await page.getByRole('button', { name: /Explore a sample case/ }).click();
  await expect(page.getByRole('heading', { name: 'The exception desk' })).toBeVisible();
  expect(sessionCreations).toHaveLength(2);
  const freshWorkspace = (await (
    await page.request.get('/api/workspace')
  ).json()) as WorkspaceResponse;
  expect(freshWorkspace.workspace.id).not.toBe(priorWorkspace.workspace.id);
  expect(freshWorkspace.cases.some((item) => item.id === created.id)).toBeFalsy();
  expect((await page.request.get(`/api/cases/${created.id}`)).status()).toBe(404);
  const newCookie = (await page.context().cookies(origin)).find(
    (cookie) => cookie.name === 'shortfall_session',
  )!;
  expect(newCookie.value).not.toBe(priorCookie.value);
});
