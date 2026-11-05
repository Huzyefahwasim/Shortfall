import { expect, type Locator, type Page } from '@playwright/test';
import { propose, receive, seedCases } from '../../src/lib/domain';
import type { CaseRecord, WorkspaceResponse } from '../../src/lib/types';

// Layout fixtures exercise the real UI without creating sessions, uploading files,
// or invoking extraction. Separate workflow tests exercise the persisted API.
export async function installLayoutWorkspace(page: Page, records: CaseRecord[] = seedCases()) {
  const workspace: WorkspaceResponse = {
    workspace: { id: 'layout-workspace', name: 'Layout test workspace', synthetic: true },
    cases: structuredClone(records),
    service: { workerOnline: true, inferenceEnabled: false, model: 'claude-opus-5-5' },
  };
  let started = false;
  await page.route('**/api/session', async (route) => {
    if (route.request().method() !== 'POST') return route.fallback();
    started = true;
    await route.fulfill({ json: { started: true } });
  });
  await page.route('**/api/workspace', async (route) => {
    await route.fulfill({
      status: started ? 200 : 401,
      json: started ? workspace : { error: 'Start a session.', code: 'UNAUTHORIZED' },
    });
  });
  await page.route('**/api/cases/*', async (route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    const id = new URL(route.request().url()).pathname.split('/').at(-1);
    const record = workspace.cases.find((item) => item.id === id);
    await route.fulfill({ status: record ? 200 : 404, json: record || { error: 'Not found.' } });
  });
  await page.route('**/api/cases/*/actions', async (route) => {
    const id = new URL(route.request().url()).pathname.split('/').at(-2);
    const record = workspace.cases.find((item) => item.id === id);
    const input = route.request().postDataJSON();
    if (!record) throw new Error('Unknown layout case.');
    if (input.action === 'propose') propose(record);
    else if (input.action === 'receive')
      receive(record, input.quantity, input.reference, input.expectedRevision);
    else throw new Error('Unexpected layout fixture mutation.');
    await route.fulfill({ json: record });
  });
  return workspace;
}

export async function expectFullyVisible(control: Locator) {
  await expect(control).toBeVisible();
  await expect(control).toBeInViewport({ ratio: 0.99 });
  const clipping = await control.evaluate((element) => {
    const bounds = element.getBoundingClientRect();
    const failures: string[] = [];
    if (
      bounds.left < -1 ||
      bounds.top < -1 ||
      bounds.right > innerWidth + 1 ||
      bounds.bottom > innerHeight + 1
    )
      failures.push('outside viewport');
    for (let parent = element.parentElement; parent; parent = parent.parentElement) {
      const style = getComputedStyle(parent);
      const box = parent.getBoundingClientRect();
      const left = box.left + parent.clientLeft;
      const top = box.top + parent.clientTop;
      if (
        ['auto', 'scroll', 'hidden', 'clip'].includes(style.overflowY) &&
        (bounds.top < top - 1 || bounds.bottom > top + parent.clientHeight + 1)
      )
        failures.push(`clipped vertically by ${parent.className || parent.tagName}`);
      if (
        ['auto', 'scroll', 'hidden', 'clip'].includes(style.overflowX) &&
        (bounds.left < left - 1 || bounds.right > left + parent.clientWidth + 1)
      )
        failures.push(`clipped horizontally by ${parent.className || parent.tagName}`);
    }
    return failures;
  });
  expect(clipping, 'control must already be visible without any scrolling').toEqual([]);
}

export async function expectNoInternalOverflow(page: Page, allowedVerticalScroll = '') {
  const overflows = await page.locator('main:visible').evaluateAll((roots, allowed) => {
    const result: { element: string; height: number; content: number; overflow: string }[] = [];
    for (const root of roots) {
      for (const element of [root, ...root.querySelectorAll('*')]) {
        if (!(element instanceof HTMLElement) || element.clientHeight === 0) continue;
        const box = element.getBoundingClientRect();
        if (box.width === 0 || box.height === 0) continue;
        const overflow = getComputedStyle(element).overflowY;
        if (
          ['auto', 'scroll', 'hidden', 'clip'].includes(overflow) &&
          element.scrollHeight > element.clientHeight + 2 &&
          !(allowed && element.matches(allowed))
        )
          result.push({
            element: element.className || element.tagName,
            height: element.clientHeight,
            content: element.scrollHeight,
            overflow,
          });
        const overflowX = getComputedStyle(element).overflowX;
        if (
          ['auto', 'scroll', 'hidden', 'clip'].includes(overflowX) &&
          element.scrollWidth > element.clientWidth + 2
        )
          result.push({
            element: `${element.className || element.tagName} (horizontal)`,
            height: element.clientWidth,
            content: element.scrollWidth,
            overflow: overflowX,
          });
      }
    }
    return result;
  }, allowedVerticalScroll);
  expect(overflows, 'main content must not rely on internal scrolling or clipped overflow').toEqual(
    [],
  );
}

export async function readAllPages(
  rows: Locator,
  pagination: Locator,
  attribute: string,
): Promise<string[]> {
  const ids: string[] = [];
  const next = pagination.getByRole('button', { name: 'Next page', exact: true });
  const previous = pagination.getByRole('button', { name: 'Previous page', exact: true });
  await expect(previous).toBeDisabled();
  for (let number = 0; number < 40; number++) {
    const current = await rows.evaluateAll(
      (elements, name) => elements.map((element) => element.getAttribute(name)),
      attribute,
    );
    expect(current.length, 'every page must contain rows').toBeGreaterThan(0);
    expect(current.every(Boolean), 'every displayed row must have an identity').toBeTruthy();
    ids.push(...(current as string[]));
    if (await next.isDisabled()) return ids;
    await next.click();
    await expect
      .poll(() =>
        rows.evaluateAll(
          (elements, name) => elements.map((element) => element.getAttribute(name)).join(','),
          attribute,
        ),
      )
      .not.toBe(current.join(','));
    await expect(previous).toBeEnabled();
  }
  throw new Error('Pagination never reached its final page.');
}
