import assert from 'node:assert/strict';
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { chromium, expect } from '@playwright/test';

// Run after the deployed web app and worker are ready:
// TEST_BASE_URL=https://your-host node scripts/record-demo.mjs
// This performs real uploads and approvals in a new private sample workspace.
// Provider requests remain subject to the application's normal budget limits.

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const baseURL = (process.env.TEST_BASE_URL || 'https://shortfall.95.179.254.189.sslip.io').replace(
  /\/$/,
  '',
);
const target = new URL(baseURL);
assert(['http:', 'https:'].includes(target.protocol), 'Use an HTTP or HTTPS application URL.');
assert(!target.username && !target.password, 'Do not put credentials in the recording URL.');
const runId = new Date().toISOString().replace(/[:.]/g, '-');
const outputDir = path.join(root, '.deploy', 'demo-video', runId);
const receiptFile = path.join(root, 'public', 'samples', 'receipt-late.txt');
const creditFile = path.join(root, 'public', 'samples', 'credit-note.txt');
const extractionTimeout = 180_000;
const minimumPresentationMs = 120_000;
const steps = [];
const runtimeErrors = [];
const startedAt = Date.now();
let browser;
let context;
let page;
let video;
let caseId;
let currentStep = 'Prepare recording';
let failure;
let videoPath;

function log(message) {
  const elapsedSeconds = ((Date.now() - startedAt) / 1000).toFixed(1);
  const line = `[${elapsedSeconds.padStart(6)}s] ${message}`;
  steps.push(line);
  console.log(line);
}

async function stage(name, work) {
  currentStep = name;
  log(`START ${name}`);
  const result = await work();
  assert.equal(runtimeErrors.length, 0, `Browser runtime error: ${runtimeErrors.join('; ')}`);
  log(`PASS  ${name}`);
  return result;
}

async function caption(text) {
  await page.evaluate((message) => {
    let element = document.getElementById('shortfall-demo-caption');
    if (!element) {
      element = document.createElement('aside');
      element.id = 'shortfall-demo-caption';
      element.setAttribute('popover', 'manual');
      element.setAttribute('role', 'status');
      element.style.cssText =
        'position:fixed;inset:auto 24px 20px auto;margin:0;width:min(850px,calc(100vw - 48px));padding:15px 21px;border:1px solid #526651;border-radius:8px;background:#203429f5;color:#fff;box-shadow:0 8px 25px #15271a25;pointer-events:none;font-family:Arial,sans-serif;z-index:2147483647;';
      const label = document.createElement('div');
      label.style.cssText = 'font-size:10px;letter-spacing:1.3px;color:#c9dabc;margin-bottom:7px;';
      label.textContent = 'WALKTHROUGH CAPTION · SYNTHETIC BUSINESS RECORDS';
      const body = document.createElement('div');
      body.dataset.captionBody = 'true';
      body.style.cssText = 'font-size:17px;line-height:1.5;font-weight:400;';
      element.append(label, body);
      document.body.append(element);
    }
    element.querySelector('[data-caption-body]').textContent = message;
    // Move only the explanatory caption above an open native dialog.
    if (element.matches(':popover-open')) element.hidePopover();
    element.showPopover();
  }, text);
}

async function pause(milliseconds = 3000) {
  await delay(milliseconds);
}

async function frame(locator) {
  await locator.evaluate((element) =>
    element.scrollIntoView({ block: 'center', behavior: 'smooth' }),
  );
  await pause(650);
}

async function readCase() {
  const response = await context.request.get(`/api/cases/${caseId}`);
  assert.equal(response.status(), 200, 'Case read failed.');
  return response.json();
}

async function waitForCase(predicate, description, timeout = 45_000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const record = await readCase();
    if (predicate(record)) return record;
    await pause(1500);
  }
  throw new Error(`Timed out waiting for ${description}.`);
}

async function clickAction(action, locator, expectedStatus = 200) {
  const [response] = await Promise.all([
    page.waitForResponse(
      (candidate) => {
        if (
          candidate.request().method() !== 'POST' ||
          new URL(candidate.url()).pathname !== `/api/cases/${caseId}/actions`
        )
          return false;
        try {
          return candidate.request().postDataJSON()?.action === action;
        } catch {
          return false;
        }
      },
      { timeout: 30_000 },
    ),
    locator.click(),
  ]);
  const payload = await response.json();
  assert.equal(
    response.status(),
    expectedStatus,
    `${action} returned ${response.status()}: ${payload.error || 'unexpected response'}`,
  );
  return payload;
}

async function uploadDocument(kind, reference, file, explanation) {
  await frame(page.locator('.evidence-panel'));
  await page.getByRole('button', { name: 'Upload supporting document', exact: true }).click();
  const uploadDialog = page.locator('dialog[open]');
  await expect(uploadDialog).toBeVisible();
  await expect(
    uploadDialog.getByRole('heading', { name: 'Attach supporting evidence', exact: true }),
  ).toBeVisible();
  // The wrapping label also contains the select's option text. Target form names
  // so accessible-name concatenation cannot turn a valid control into a timeout.
  await uploadDialog.locator('select[name="kind"]').selectOption(kind);
  await uploadDialog.locator('input[name="reference"]').fill(reference);
  await uploadDialog.locator('input[name="file"]').setInputFiles(file);
  await expect(uploadDialog.locator('select[name="kind"]')).toHaveValue(kind);
  await expect(uploadDialog.locator('input[name="reference"]')).toHaveValue(reference);
  await expect(
    uploadDialog.getByRole('button', { name: 'Upload document', exact: true }),
  ).toBeEnabled();
  await caption(explanation);
  await pause(3500);
  const [response] = await Promise.all([
    page.waitForResponse(
      (candidate) =>
        candidate.request().method() === 'POST' &&
        new URL(candidate.url()).pathname === `/api/cases/${caseId}/documents`,
      { timeout: 30_000 },
    ),
    uploadDialog.getByRole('button', { name: 'Upload document', exact: true }).click(),
  ]);
  const result = await response.json();
  assert.equal(response.status(), 202, `Upload failed: ${result.error || response.status()}`);
  const document = result.documents.findLast(
    (entry) => entry.kind === kind && entry.reference === reference,
  );
  assert(document, 'The uploaded document is missing from the persisted case.');
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await frame(page.locator('.evidence-panel'));
  await caption(
    'The uploaded document is being checked. This recording keeps the actual processing time.',
  );
  const began = Date.now();
  const deadline = began + extractionTimeout;
  while (Date.now() < deadline) {
    const record = await readCase();
    const extracted = record.documents.find((entry) => entry.id === document.id);
    assert(extracted, 'The uploaded document disappeared.');
    if (extracted.status === 'needs_review')
      throw new Error(`Extraction requires review: ${extracted.extractionError || reference}`);
    if (extracted.status === 'verified') {
      assert(
        extracted.model && typeof extracted.model === 'string',
        'Uploaded evidence has no extraction model recorded.',
      );
      assert(extracted.evidence.length > 0, 'The extraction has no verifiable source evidence.');
      for (const evidence of extracted.evidence)
        assert.equal(
          extracted.text.slice(evidence.start, evidence.end),
          evidence.quote,
          'An evidence quote does not match the stored source.',
        );
      log(
        `EXTRACTION ${reference}: verified in ${((Date.now() - began) / 1000).toFixed(1)}s; model=${extracted.model}; source_quotes=${extracted.evidence.length}`,
      );
      await expect(page.locator('.document-meta .document-status')).toHaveText(
        'Extraction verified',
        { timeout: 15_000 },
      );
      return { record, document: extracted };
    }
    await pause(1500);
  }
  throw new Error(
    `Document ${reference} did not finish extraction within ${extractionTimeout / 1000}s.`,
  );
}

try {
  await Promise.all([readFile(receiptFile, 'utf8'), readFile(creditFile, 'utf8')]);
  await mkdir(outputDir, { recursive: true });
  log(`Target: ${target.origin}`);
  log(
    'No mocked routes, injected business records, or altered model results. All writes use the visible application.',
  );
  browser = await chromium.launch({
    channel: process.env.BROWSER_CHANNEL || 'msedge',
    headless: true,
  });
  context = await browser.newContext({
    baseURL,
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
    acceptDownloads: true,
    recordVideo: { dir: outputDir, size: { width: 1440, height: 900 } },
  });
  page = await context.newPage();
  video = page.video();
  page.setDefaultTimeout(20_000);
  page.on('pageerror', (error) => runtimeErrors.push(error.message));

  await stage('Open the real sample workspace', async () => {
    await page.goto('/', { waitUntil: 'domcontentloaded', timeout: 60_000 });
    await expect(
      page.getByRole('heading', { name: 'The exception desk', exact: true }),
    ).toBeVisible({ timeout: 60_000 });
    const response = await context.request.get('/api/workspace');
    assert.equal(response.status(), 200);
    const workspace = await response.json();
    assert(workspace.service.workerOnline, 'The workflow worker is offline.');
    assert(workspace.service.inferenceEnabled, 'Document extraction is not enabled.');
    const record = workspace.cases.find(
      (entry) => entry.poNumber === 'PO-1042' && entry.invoiceNumber === 'INV-8821',
    );
    assert(record?.synthetic, 'The expected synthetic Northstar case was not found.');
    caseId = record.id;
    assert.equal(
      record.receipts.reduce((sum, receipt) => sum + receipt.quantity, 0),
      100,
    );
    assert.equal(record.proposals.length, 0, 'Start with a fresh private workspace.');
    assert.equal(record.heldCents, 0);
    await page.getByRole('button', { name: /Northstar Components/ }).click();
    await caption('A $4,800 invoice. 100 of 120 units received. An $800 discrepancy needs review.');
    await pause(5000);
    await frame(page.locator('.matching-panel'));
    await pause(3000);
  });

  let originalProposal;
  await stage('Prepare the original $800 proposal', async () => {
    const record = await clickAction(
      'propose',
      page.getByRole('button', { name: 'Prepare resolution', exact: true }),
    );
    originalProposal = record.proposals.at(-1);
    assert.equal(originalProposal.amountCents, 80_000);
    await expect(page.locator('.proposal-amount strong')).toHaveText('$800');
    await caption(
      'The first proposal holds $800. Approval is tied to the evidence behind this exact change.',
    );
    await pause(4500);
    await page.getByRole('button', { name: 'Close review', exact: true }).click();
  });

  await stage('Upload and verify the late receipt', async () => {
    const { record } = await uploadDocument(
      'receipt',
      'RCV-2042',
      receiptFile,
      'A late receipt arrives. Upload the synthetic document to extract its accepted quantity and source evidence.',
    );
    assert.equal(
      record.receipts.reduce((sum, receipt) => sum + receipt.quantity, 0),
      110,
    );
    assert.equal(record.heldCents, 0);
    const quantity = page
      .locator('.evidence-fields button')
      .filter({ hasText: 'Quantity' })
      .first();
    await expect(quantity).toBeVisible();
    await quantity.click();
    await expect(page.locator('.document-paper mark')).toBeVisible();
    await frame(page.locator('.evidence-panel'));
    await caption(
      'Ten more units are accepted. The extracted quantity links to its source quote. The discrepancy is now $400.',
    );
    await pause(4500);
  });

  await stage('Reject the outdated approval without a ledger write', async () => {
    await page.getByRole('button', { name: 'Previous proposals', exact: true }).click();
    await page
      .locator('.old-proposal')
      .filter({ hasText: `Revision ${originalProposal.sourceRevision}` })
      .first()
      .click();
    await expect(page.locator('.proposal-amount strong')).toHaveText('$800');
    await caption(
      'Try the earlier $800 approval after the receipt changed. The server rechecks the current evidence.',
    );
    await pause(3000);
    const rejected = await clickAction(
      'approve',
      page.getByRole('button', { name: 'Approve changes', exact: true }),
      409,
    );
    assert.equal(rejected.code, 'STALE_PROPOSAL');
    await expect(page.locator('.dialog-error')).toContainText(/outdated/i);
    const unchanged = await readCase();
    assert.equal(unchanged.heldCents, 0);
    assert.equal(unchanged.executions.length, 0);
    await caption('Outdated approval blocked. The internal ledger is unchanged.');
    await pause(4500);
  });

  await stage('Approve and verify the revised $400 hold', async () => {
    const planned = await clickAction(
      'propose',
      page.getByRole('button', { name: 'Prepare updated plan', exact: true }),
    );
    assert.equal(planned.proposals.at(-1).amountCents, 40_000);
    await expect(page.locator('.proposal-amount strong')).toHaveText('$400');
    await caption(
      'Review the corrected $400 hold, then approve the exact ledger change and follow-up task.',
    );
    await pause(3500);
    await clickAction(
      'approve',
      page.getByRole('button', { name: 'Approve changes', exact: true }),
    );
    await expect(page.getByRole('dialog')).not.toBeVisible();
    const held = await waitForCase(
      (record) => record.status === 'on_hold' && record.heldCents === 40_000,
      'the verified hold',
    );
    assert.equal(
      held.executions.filter((entry) => entry.type === 'hold' && entry.status === 'applied').length,
      1,
    );
    assert.equal(held.tasks.length, 1);
    await expect(page.locator('.case-header .status-badge')).toHaveText('On hold', {
      timeout: 15_000,
    });
    await page.getByRole('tab', { name: /^Activity/ }).click();
    await frame(page.locator('.execution-panel'));
    await caption(
      'The worker applied and verified the $400 hold. The supplier follow-up task is recorded.',
    );
    await pause(4000);
    const repeated = await clickAction(
      'retry',
      page.getByRole('button', { name: 'Check retry', exact: true }),
    );
    assert.equal(repeated.executions.length, held.executions.length);
    assert.equal(repeated.tasks.length, held.tasks.length);
    assert.equal(repeated.heldCents, 40_000);
    await caption(
      'Checking the completed command again creates no duplicate hold or follow-up task.',
    );
    await pause(3500);
    await page.getByRole('tab', { name: 'Evidence & resolution', exact: true }).click();
  });

  await stage('Upload and verify the supplier credit', async () => {
    const { record } = await uploadDocument(
      'credit',
      'CN-8821-01',
      creditFile,
      'The supplier issues a $400 credit. Upload the synthetic credit note and verify its evidence before applying it.',
    );
    const credit = record.credits.find((entry) => entry.reference === 'CN-8821-01');
    assert.equal(credit?.amountCents, 40_000);
    assert.equal(credit?.applied, false);
    assert.equal(record.heldCents, 40_000);
    const total = page.locator('.evidence-fields button').filter({ hasText: 'Total' }).first();
    if (await total.count()) {
      await total.click();
      await expect(page.locator('.document-paper mark')).toBeVisible();
    }
    await caption(
      'The $400 credit is verified against the document. It still needs approval before the ledger changes.',
    );
    await pause(3500);
  });

  await stage('Reconcile to $4,400 while keeping 10 PO units open', async () => {
    const planned = await clickAction(
      'propose',
      page.getByRole('button', { name: 'Prepare resolution', exact: true }),
    );
    const proposal = planned.proposals.at(-1);
    assert.equal(proposal.type, 'reconcile');
    assert.equal(proposal.creditCents, 40_000);
    assert.equal(proposal.amountCents, 0);
    await caption(
      'Approve the verified credit and release the internal hold. The remaining purchase order stays open.',
    );
    await pause(4000);
    await clickAction(
      'approve',
      page.getByRole('button', { name: 'Approve changes', exact: true }),
    );
    const resolved = await waitForCase(
      (record) => record.status === 'resolved',
      'the completed reconciliation',
    );
    assert.equal(resolved.heldCents, 0);
    assert.equal(resolved.appliedCreditCents, 40_000);
    assert.equal(
      resolved.invoicedUnits * resolved.unitPriceCents - resolved.appliedCreditCents,
      440_000,
    );
    assert.equal(
      resolved.orderedUnits - resolved.receipts.reduce((sum, receipt) => sum + receipt.quantity, 0),
      10,
    );
    await expect(page.locator('.case-header .status-badge')).toHaveText('Resolved', {
      timeout: 15_000,
    });
    await frame(page.locator('.discrepancy-banner'));
    await expect(page.locator('.discrepancy-banner')).toContainText('$4,400 reconciled');
    await expect(page.locator('.discrepancy-banner')).toContainText('10 units remain open');
    await caption(
      '$4,400 reconciled to 110 accepted units. The invoice exception closes; 10 purchase-order units stay open.',
    );
    await pause(5000);
  });

  await stage('Download the actual case evidence and show its history', async () => {
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('link', { name: 'Export', exact: true }).click(),
    ]);
    assert.equal(await download.failure(), null, 'The export download failed.');
    const stream = await download.createReadStream();
    assert(stream, 'The export has no readable content.');
    const chunks = [];
    for await (const chunk of stream) chunks.push(chunk);
    const exported = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    assert.equal(exported.synthetic, true);
    assert.equal(exported.paymentExecuted, false);
    assert.equal(exported.totals.netCents, 440_000);
    assert.equal(exported.totals.openPoUnits, 10);
    assert.equal(exported.case.status, 'resolved');
    log(
      `EXPORT ${download.suggestedFilename()}: verified net=440000 cents, open_po_units=10, payment_executed=false`,
    );
    await page.getByRole('tab', { name: /^Activity/ }).click();
    await frame(page.locator('.execution-panel'));
    await caption(
      'The real export contains source evidence, approvals, execution records, and the complete case history.',
    );
    await pause(5000);
    await frame(page.locator('.timeline-panel'));
    await pause(3500);
    await page.getByRole('tab', { name: 'Evidence & resolution', exact: true }).click();
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'smooth' }));
    await pause(1000);
    await caption(
      'Synthetic business records. Real extraction, approvals, and persisted changes. No payment was made.',
    );
    // Keep the draft watchable without pretending provider latency is predictable.
    const remaining = Math.max(5000, minimumPresentationMs - (Date.now() - startedAt));
    await pause(Math.min(remaining, 20_000));
  });
  log('All recorded workflow checks passed.');
} catch (error) {
  failure = error instanceof Error ? error : new Error(String(error));
  log(`FAIL  ${currentStep}: ${failure.message}`);
  if (page && !page.isClosed()) {
    await caption(
      `Recording stopped: ${currentStep} did not complete. No successful outcome is being claimed.`,
    ).catch(() => {});
    await pause(2500);
  }
  process.exitCode = 1;
} finally {
  await context?.close().catch((error) => log(`Video close warning: ${error.message}`));
  if (video) {
    try {
      const original = await video.path();
      videoPath = path.join(
        outputDir,
        failure ? 'shortfall-demo-failed.webm' : 'shortfall-demo.webm',
      );
      await video.saveAs(videoPath);
      if (
        path.resolve(original).startsWith(path.resolve(outputDir) + path.sep) &&
        path.resolve(original) !== path.resolve(videoPath)
      )
        await unlink(original);
      log(`VIDEO ${videoPath}`);
    } catch (error) {
      failure ||= error instanceof Error ? error : new Error(String(error));
      log(`Video save failed: ${failure.message}`);
      process.exitCode = 1;
    }
  }
  await browser?.close().catch(() => {});
  await mkdir(outputDir, { recursive: true });
  log(
    `Result: ${failure ? 'FAILED' : 'PASSED'}; elapsed=${((Date.now() - startedAt) / 1000).toFixed(1)}s`,
  );
  await writeFile(path.join(outputDir, 'steps.log'), `${steps.join('\n')}\n`, 'utf8');
  if (failure) console.error(failure.stack || failure.message);
}
