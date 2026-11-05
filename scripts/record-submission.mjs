import assert from 'node:assert/strict';
import { access, mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';
import { setTimeout as pause } from 'node:timers/promises';
import { chromium, expect } from '@playwright/test';

// Run only after the current interface and public repository have been deployed:
// node scripts/record-submission.mjs --record
// Uploads and approvals use a fresh ordinary workspace and the real provider budget.
// The browser footage is never accelerated. Mix each sentence at timeline.json's
// startSeconds, trimming its source WAV to sourceStart/sourceEnd; leave overruns silent.
assert(process.argv.includes('--record'), 'Explicit --record is required.');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const baseURL = (process.env.TEST_BASE_URL || 'https://shortfall.95.179.254.189.sslip.io').replace(
  /\/$/,
  '',
);
const repository = (
  process.env.RECORDING_REPOSITORY_URL || 'https://github.com/Huzyefahwasim/vultr-hackathon'
).replace(/\/$/, '');
for (const value of [baseURL, repository]) {
  const url = new URL(value);
  assert(
    ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password,
    'Use an HTTP(S) URL without embedded credentials.',
  );
}
const runId = new Date().toISOString().replace(/[:.]/g, '-');
const outputDir = path.join(root, '.deploy', 'submission-recording', runId);
const narrationDir = path.join(root, '.deploy', 'media', 'narration');
const manifest = JSON.parse(await readFile(path.join(narrationDir, 'manifest.json'), 'utf8'));
const receiptFile = path.join(root, 'public', 'samples', 'receipt-late.txt');
const creditFile = path.join(root, 'public', 'samples', 'credit-note.txt');
const architectureURL = `${repository}#how-vultr-powers-the-application`;
const evaluationURL = `${repository}/blob/main/docs/evaluation-results.md`;
const comparisonURL = `${repository}/blob/main/docs/pitch.md#7`;
const viewport = { width: 1600, height: 900 };
const expectedCueCounts = [5, 5, 14, 12, 5, 5, 5, 3];
const showCaptions = process.env.RECORDING_CAPTIONS !== 'false';
assert.equal(manifest.segments.length, 8, 'Expected eight narration segments.');
assert.equal(manifest.sampleRate, 24000, 'Unexpected narration sample rate.');
for (const [index, segment] of manifest.segments.entries()) {
  assert.equal(segment.segment, index + 1);
  assert.equal(
    segment.cues.length,
    expectedCueCounts[index],
    `Segment ${index + 1} cue mapping changed.`,
  );
  assert(/^segment-[1-8]\.wav$/.test(segment.file), 'Unexpected narration filename.');
  await access(path.join(narrationDir, segment.file));
  let previousEnd = 0;
  for (const cue of segment.cues) {
    assert(typeof cue.text === 'string' && cue.text.trim());
    assert(cue.start >= previousEnd && cue.end > cue.start && cue.end <= segment.duration);
    previousEnd = cue.end;
  }
}
await Promise.all([access(receiptFile), access(creditFile)]);
await mkdir(outputDir, { recursive: true });

const steps = [];
const timeline = [];
const runtimeErrors = [];
const processStartedAt = Date.now();
let videoEpoch;
let videoEpochWallClock;
let readyAt;
let recordingDuration;
let browser;
let context;
let page;
let video;
let caseId;
let originalProposal;
let receiptDocument;
let verifiedReceipt;
let creditDocument;
let verifiedCredit;
let heldCase;
let resolvedCase;
let currentStage = 'Preflight';
let failure;
let currentSubtitle = '';
let recordingComplete = false;
let sessionStarts = 0;

const offset = () => (performance.now() - videoEpoch) / 1000;
function log(message) {
  const time = videoEpoch === undefined ? (Date.now() - processStartedAt) / 1000 : offset();
  const line = `[${time.toFixed(3).padStart(8)}s] ${message}`;
  steps.push(line);
  console.log(line);
}
async function persistTimeline() {
  await writeFile(
    path.join(outputDir, 'timeline.json'),
    JSON.stringify(
      {
        videoEpoch: videoEpochWallClock ?? null,
        videoFile: failure ? 'failed-video.webm' : 'video.webm',
        durationSeconds: recordingDuration ?? (videoEpoch === undefined ? null : offset()),
        cues: timeline,
        status: failure ? 'failed' : recordingComplete ? 'passed' : 'in_progress',
        baseURL,
      },
      null,
      2,
    ) + '\n',
  );
  await writeFile(path.join(outputDir, 'steps.log'), steps.join('\n') + '\n');
}
async function subtitle(text, force = false) {
  currentSubtitle = text;
  if (!showCaptions && !force) return;
  await page.evaluate((message) => {
    let element = document.getElementById('shortfall-submission-subtitle');
    if (!element) {
      element = document.createElement('aside');
      element.id = 'shortfall-submission-subtitle';
      element.setAttribute('popover', 'manual');
      element.setAttribute('aria-hidden', 'true');
      element.style.cssText =
        'position:fixed;inset:auto 32px 0 32px;margin:0 auto;max-width:1380px;width:max-content;box-sizing:border-box;padding:6px 14px;border:0;border-radius:4px;background:#101820e8;color:#fff;pointer-events:none;font:400 18px/1.45 Arial,sans-serif;text-align:center;z-index:2147483647;';
      document.body.append(element);
    }
    element.textContent = message;
    if (element.matches(':popover-open')) element.hidePopover();
    if (message) element.showPopover();
  }, text);
}
async function narrate(segmentNumber, cueIndex, action = async () => {}) {
  const segment = manifest.segments[segmentNumber - 1];
  const cue = segment.cues[cueIndex];
  assert(cue, `Missing narration cue ${segmentNumber}:${cueIndex}.`);
  currentStage = `Segment ${segmentNumber}, cue ${cueIndex}: ${segment.stage}`;
  await subtitle(cue.text);
  const start = offset();
  const duration = cue.end - cue.start;
  const entry = {
    segment: segmentNumber,
    cue: cueIndex,
    startSeconds: start,
    endSeconds: start + duration,
    text: cue.text,
    sourceFile: segment.file,
    sourceStart: cue.start,
    sourceEnd: cue.end,
    audioDurationSeconds: duration,
  };
  timeline.push(entry);
  log(`CUE ${segmentNumber}:${cueIndex} starts; narration=${duration.toFixed(3)}s`);
  await persistTimeline();
  try {
    await Promise.all([
      (async () => {
        await action();
        entry.actionEndSeconds = offset();
      })(),
      pause((duration + 0.25) * 1000),
    ]);
    entry.completedAtSeconds = offset();
    assert.equal(runtimeErrors.length, 0, `Application runtime error: ${runtimeErrors.join('; ')}`);
    log(
      `PASS ${segmentNumber}:${cueIndex}; action=${(entry.actionEndSeconds - start).toFixed(3)}s`,
    );
  } catch (error) {
    entry.completedAtSeconds = offset();
    entry.failed = true;
    throw error;
  } finally {
    await persistTimeline();
  }
}
async function frame(locator) {
  await expect(locator).toBeVisible();
  await locator.evaluate((element) => {
    const scroll = element.closest('.case-scroll');
    if (scroll && scroll !== element) {
      const bounds = element.getBoundingClientRect();
      const container = scroll.getBoundingClientRect();
      const padding = Math.max(
        0,
        (scroll.clientHeight - Math.min(bounds.height, scroll.clientHeight)) / 2,
      );
      scroll.scrollTo({
        top: Math.max(0, scroll.scrollTop + bounds.top - container.top - padding),
        behavior: 'smooth',
      });
    } else element.scrollIntoView({ block: 'center', behavior: 'smooth' });
  });
  await pause(350);
  await expect(locator).toBeInViewport();
}
async function inspectStartedWorkspace() {
  const response = await context.request.get('/api/workspace');
  assert.equal(response.status(), 200);
  const workspace = await response.json();
  assert(
    workspace.service.workerOnline && workspace.service.inferenceEnabled,
    'The live worker and extraction service must be online.',
  );
  const selected = workspace.cases.find(
    (record) => record.poNumber === 'PO-1042' && record.invoiceNumber === 'INV-8821',
  );
  assert(selected?.synthetic, 'The expected synthetic Northstar case was not found.');
  assert.equal(selected.proposals.length, 0, 'Recording requires a fresh ordinary workspace.');
  assert.equal(selected.heldCents, 0);
  assert.equal(
    selected.receipts.reduce((sum, receipt) => sum + receipt.quantity, 0),
    100,
  );
  caseId = selected.id;
  log(
    'SESSION started by the visible Create your own case choice; seeded case and live worker verified.',
  );
}
async function readCase() {
  const response = await context.request.get(`/api/cases/${caseId}`);
  assert.equal(response.status(), 200, 'Persisted case read failed.');
  return response.json();
}
async function waitForCase(predicate, description, timeout = 45_000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const record = await readCase();
    if (predicate(record)) return record;
    await pause(1000);
  }
  throw new Error(`Timed out waiting for ${description}.`);
}
async function clickAction(action, locator, status = 200) {
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
  const result = await response.json();
  assert.equal(response.status(), status, `${action}: ${result.error || response.status()}`);
  if (currentSubtitle) await subtitle(currentSubtitle);
  return result;
}
async function upload(kind, reference, file) {
  await page.getByRole('tab', { name: 'Evidence & resolution', exact: true }).click();
  await frame(page.locator('.evidence-panel'));
  await page.getByRole('button', { name: 'Upload supporting document', exact: true }).click();
  const dialog = page.locator('dialog[open]');
  await expect(
    dialog.getByRole('heading', { name: 'Attach supporting evidence', exact: true }),
  ).toBeVisible();
  if (currentSubtitle) await subtitle(currentSubtitle);
  await dialog.locator('select[name="kind"]').selectOption(kind);
  await dialog.locator('input[name="reference"]').fill(reference);
  await dialog.locator('input[name="file"]').setInputFiles(file);
  await pause(500);
  const [response] = await Promise.all([
    page.waitForResponse(
      (candidate) =>
        candidate.request().method() === 'POST' &&
        new URL(candidate.url()).pathname === `/api/cases/${caseId}/documents`,
      { timeout: 30_000 },
    ),
    dialog.getByRole('button', { name: 'Upload document', exact: true }).click(),
  ]);
  const record = await response.json();
  assert.equal(
    response.status(),
    202,
    `Document upload failed: ${record.error || response.status()}`,
  );
  const document = record.documents.findLast(
    (entry) => entry.kind === kind && entry.reference === reference,
  );
  assert(document, 'Uploaded source is missing from the persisted case.');
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await frame(page.locator('.evidence-panel'));
  log(`UPLOAD ${reference}; actual worker processing remains visible.`);
  return document;
}
async function waitForExtraction(document) {
  const record = await waitForCase(
    (current) => {
      const found = current.documents.find((entry) => entry.id === document.id);
      assert(found, 'Uploaded source disappeared.');
      if (found.status === 'needs_review')
        throw new Error(`Extraction needs review: ${found.extractionError || document.reference}`);
      return found.status === 'verified';
    },
    `verified extraction of ${document.reference}`,
    180_000,
  );
  const verified = record.documents.find((entry) => entry.id === document.id);
  assert.equal(
    verified.model,
    'claude-opus-5-5',
    'The selected live extraction model was not recorded.',
  );
  assert(verified.evidence.length > 0, 'No source quotes were recorded.');
  for (const evidence of verified.evidence)
    assert.equal(
      verified.text.slice(evidence.start, evidence.end),
      evidence.quote,
      'A stored evidence span does not match its source.',
    );
  await expect(page.locator('.document-meta .document-status')).toHaveText('Extraction verified', {
    timeout: 15_000,
  });
  log(
    `EXTRACTION ${verified.reference}: ${verified.model}; ${verified.evidence.length} exact source quotes.`,
  );
  return { record, document: verified };
}
async function evidenceField(label) {
  const button = page.locator('.evidence-fields button').filter({ hasText: label }).first();
  await button.click();
  await expect(page.locator('.document-paper mark')).toBeVisible();
  await frame(page.locator('.evidence-panel'));
  // The application scrolls its source <pre> to the selected quote; verify that
  // nested clipping has not left the highlight outside the visible source panel.
  await expect(page.locator('.document-paper pre mark')).toBeInViewport();
}
async function navigateDocument(url, locatorFactory) {
  const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  assert(response?.ok(), `Repository page is not publicly readable: ${response?.status()}.`);
  await frame(locatorFactory());
  if (currentSubtitle) await subtitle(currentSubtitle);
}
async function exportCase() {
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('link', { name: 'Export', exact: true }).click(),
  ]);
  assert.equal(await download.failure(), null, 'Case export failed.');
  const stream = await download.createReadStream();
  assert(stream, 'Export did not provide readable bytes.');
  const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  const bytes = Buffer.concat(chunks);
  const exported = JSON.parse(bytes.toString('utf8'));
  assert.equal(exported.synthetic, true);
  assert.equal(exported.paymentExecuted, false);
  assert.equal(exported.case.status, 'resolved');
  assert.equal(exported.totals.netCents, 440_000);
  assert.equal(exported.totals.openPoUnits, 10);
  await writeFile(path.join(outputDir, 'case-export.json'), bytes);
  log('EXPORT verified: net=440000 cents; open_po_units=10; payment_executed=false.');
}

try {
  browser = await chromium.launch({
    channel: process.env.BROWSER_CHANNEL || 'msedge',
    headless: true,
  });
  // Inspect the public documentation in a browser before starting the capture.
  // Rapid HTML requests through the API client can trigger GitHub rate limits.
  const preflight = await browser.newContext({ viewport });
  try {
    const checkPage = await preflight.newPage();
    for (const url of [repository, evaluationURL, comparisonURL]) {
      const response = await checkPage.goto(url, {
        waitUntil: 'domcontentloaded',
        timeout: 60_000,
      });
      assert.equal(
        response?.status(),
        200,
        `Publish the repository and required document before recording: ${url}`,
      );
      await pause(4000);
    }
  } finally {
    await preflight.close();
  }
  context = await browser.newContext({
    baseURL,
    viewport,
    deviceScaleFactor: 1,
    acceptDownloads: true,
    recordVideo: { dir: outputDir, size: viewport },
  });
  page = await context.newPage();
  videoEpoch = performance.now();
  videoEpochWallClock = new Date().toISOString();
  video = page.video();
  page.setDefaultTimeout(20_000);
  page.on('pageerror', (error) => {
    if (page.url().startsWith(baseURL)) runtimeErrors.push(error.message);
  });
  page.on('request', (request) => {
    if (request.method() === 'POST' && new URL(request.url()).pathname === '/api/session')
      sessionStarts++;
  });
  log(
    'Video epoch: immediately after newPage. Native browser video is retained at its original timing.',
  );
  await page.goto('/', { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await expect(page.getByRole('button', { name: /^Explore a sample case/ })).toBeVisible({
    timeout: 60_000,
  });
  const anonymous = await context.request.get('/api/workspace');
  assert.equal(
    anonymous.status(),
    401,
    'The entry page must remain anonymous until a choice starts the session.',
  );
  assert.equal(sessionStarts, 0, 'Loading the entry page cannot create a workspace.');
  const health = await context.request.get('/api/health');
  assert.equal(health.status(), 200, 'The deployed database is unavailable.');
  assert.equal((await health.json()).workerOnline, true, 'The workflow worker is offline.');
  readyAt = offset();
  log(
    `READY application; lead-in=${readyAt.toFixed(3)}s. No routes or business results are mocked.`,
  );

  for (let cue = 0; cue < 5; cue++) await narrate(1, cue);
  await narrate(2, 0);
  await narrate(2, 1, async () => {
    assert.equal(sessionStarts, 0, 'A session was created before the visible entry choice.');
    const [started] = await Promise.all([
      page.waitForResponse(
        (response) =>
          response.request().method() === 'POST' &&
          new URL(response.url()).pathname === '/api/session',
      ),
      page.getByRole('button', { name: /^Create your own case/ }).click(),
    ]);
    assert.equal(started.status(), 200, 'The explicit session start failed.');
    await expect(page.locator('dialog[open]')).toBeVisible();
    await expect(page.locator('dialog[open] input[name="supplier"]')).toBeVisible();
    await inspectStartedWorkspace();
    assert.equal(sessionStarts, 1);
    if (currentSubtitle) await subtitle(currentSubtitle);
  });
  await narrate(2, 2, async () => {
    await frame(page.locator('dialog[open]'));
  });
  await narrate(2, 3, async () => {
    await page.locator('dialog[open]').getByRole('button', { name: 'Cancel', exact: true }).click();
    await page.getByRole('button', { name: 'Home', exact: true }).click();
    await expect(page.getByRole('button', { name: /^Explore a sample case/ })).toBeVisible();
  });
  await narrate(2, 4, async () => {
    await page.getByRole('button', { name: /^Explore a sample case/ }).click();
    await expect(
      page.getByRole('heading', { name: /^(?:Invoice operations|The exception desk)$/ }),
    ).toBeVisible();
    await page.getByRole('button', { name: /Northstar Components/ }).click();
    assert.equal(
      sessionStarts,
      1,
      'Returning Home and exploring the sample must keep the existing session.',
    );
    await frame(page.locator('.discrepancy-banner'));
  });
  await narrate(3, 0, async () => {
    await frame(page.locator('.matching-panel'));
  });
  await narrate(3, 1);
  await narrate(3, 2, async () => {
    await expect(page.locator('.discrepancy-banner')).toContainText('$800');
  });
  await narrate(3, 3, async () => {
    const record = await clickAction(
      'propose',
      page.getByRole('button', { name: 'Prepare resolution', exact: true }).first(),
    );
    originalProposal = record.proposals.at(-1);
    assert.equal(originalProposal.amountCents, 80_000);
    await expect(page.locator('.proposal-amount strong')).toHaveText('$800');
  });
  await narrate(3, 4, async () => {
    await page.getByRole('button', { name: 'Close review', exact: true }).click();
    receiptDocument = await upload('receipt', 'RCV-2042', receiptFile);
  });
  await narrate(3, 5, async () => {
    verifiedReceipt = await waitForExtraction(receiptDocument);
  });
  await narrate(3, 6, async () => {
    assert.equal(
      verifiedReceipt.record.receipts.reduce((sum, receipt) => sum + receipt.quantity, 0),
      110,
    );
    assert.equal(verifiedReceipt.record.heldCents, 0);
    await frame(page.locator('.evidence-panel'));
  });
  await narrate(3, 7, async () => {
    await evidenceField('Quantity');
  });
  await narrate(3, 8, async () => {
    await frame(page.locator('.matching-panel'));
    await expect(page.locator('.discrepancy-banner')).toContainText('$400');
  });
  await narrate(3, 9, async () => {
    await page.getByRole('button', { name: /^Previous proposals/ }).click();
    await page
      .locator('.old-proposal')
      .filter({ hasText: `Revision ${originalProposal.sourceRevision}` })
      .first()
      .click();
    await expect(page.locator('.proposal-amount strong')).toHaveText('$800');
  });
  await narrate(3, 10, async () => {
    const rejected = await clickAction(
      'approve',
      page.getByRole('button', { name: 'Approve changes', exact: true }),
      409,
    );
    assert.equal(rejected.code, 'STALE_PROPOSAL');
  });
  await narrate(3, 11, async () => {
    await expect(page.locator('.dialog-error')).toContainText(/outdated/i);
  });
  await narrate(3, 12, async () => {
    const unchanged = await readCase();
    assert.equal(unchanged.heldCents, 0);
    assert.equal(unchanged.executions.length, 0);
    log('STALE APPROVAL: HTTP409, unchanged ledger, no execution.');
  });
  await narrate(3, 13);

  await narrate(4, 0, async () => {
    const updated = page.getByRole('button', { name: 'Prepare updated plan', exact: true });
    let planned;
    if (await updated.isVisible()) planned = await clickAction('propose', updated);
    else {
      await page.getByRole('button', { name: 'Close review', exact: true }).click();
      planned = await clickAction(
        'propose',
        page.getByRole('button', { name: 'Prepare resolution', exact: true }).first(),
      );
    }
    assert.equal(planned.proposals.at(-1).amountCents, 40_000);
    await expect(page.locator('.proposal-amount strong')).toHaveText('$400');
    await pause(500);
    await clickAction(
      'approve',
      page.getByRole('button', { name: 'Approve changes', exact: true }),
    );
    await expect(page.getByRole('dialog')).not.toBeVisible();
  });
  await narrate(4, 1, async () => {
    heldCase = await waitForCase(
      (record) => record.status === 'on_hold' && record.heldCents === 40_000,
      'the verified $400 hold',
    );
    assert.equal(
      heldCase.executions.filter((entry) => entry.type === 'hold' && entry.status === 'applied')
        .length,
      1,
    );
    assert.equal(heldCase.tasks.length, 1);
    await expect(page.locator('.case-header .status-badge')).toHaveText('On hold', {
      timeout: 15_000,
    });
  });
  await narrate(4, 2, async () => {
    await page.getByRole('tab', { name: /^Activity/ }).click();
    await frame(page.locator('.execution-panel'));
    const repeated = await clickAction(
      'retry',
      page.getByRole('button', { name: 'Check retry', exact: true }),
    );
    assert.equal(repeated.executions.length, heldCase.executions.length);
    assert.equal(repeated.tasks.length, heldCase.tasks.length);
    assert.equal(repeated.heldCents, 40_000);
    log('RETRY: no duplicate hold, execution, or task.');
  });
  await narrate(4, 3, async () => {
    creditDocument = await upload('credit', 'CN-8821-01', creditFile);
  });
  await narrate(4, 4, async () => {
    verifiedCredit = await waitForExtraction(creditDocument);
    await evidenceField('Total');
  });
  await narrate(4, 5, async () => {
    const credit = verifiedCredit.record.credits.find((entry) => entry.reference === 'CN-8821-01');
    assert.equal(credit?.amountCents, 40_000);
    assert.equal(credit?.applied, false);
    assert.equal(verifiedCredit.record.heldCents, 40_000);
    assert.equal(verifiedCredit.record.appliedCreditCents, 0);
    await frame(page.locator('.resolution-panel'));
  });
  await narrate(4, 6, async () => {
    const planned = await clickAction(
      'propose',
      page.getByRole('button', { name: 'Prepare resolution', exact: true }).first(),
    );
    const proposal = planned.proposals.at(-1);
    assert.equal(proposal.type, 'reconcile');
    assert.equal(proposal.creditCents, 40_000);
    assert.equal(proposal.amountCents, 0);
    await pause(500);
    await clickAction(
      'approve',
      page.getByRole('button', { name: 'Approve changes', exact: true }),
    );
  });
  await narrate(4, 7, async () => {
    resolvedCase = await waitForCase(
      (record) => record.status === 'resolved',
      'approved credit reconciliation',
    );
    assert.equal(resolvedCase.heldCents, 0);
    assert.equal(resolvedCase.appliedCreditCents, 40_000);
    assert.equal(
      resolvedCase.invoicedUnits * resolvedCase.unitPriceCents - resolvedCase.appliedCreditCents,
      440_000,
    );
    await expect(page.locator('.case-header .status-badge')).toHaveText('Resolved', {
      timeout: 15_000,
    });
    await frame(page.locator('.discrepancy-banner'));
    await expect(page.locator('.discrepancy-banner')).toContainText('$4,400 reconciled');
  });
  await narrate(4, 8, async () => {
    assert.equal(
      resolvedCase.orderedUnits -
        resolvedCase.receipts.reduce((sum, receipt) => sum + receipt.quantity, 0),
      10,
    );
    await expect(page.locator('.discrepancy-banner')).toContainText('10 units remain open');
  });
  await narrate(4, 9, exportCase);
  await narrate(4, 10, async () => {
    await page.getByRole('tab', { name: /^Activity/ }).click();
    await frame(page.locator('.timeline-panel'));
  });
  await narrate(4, 11);

  await subtitle('');
  await navigateDocument(architectureURL, () =>
    page.getByRole('heading', { name: 'How Vultr powers the application', exact: true }).first(),
  );
  await narrate(5, 0);
  await narrate(5, 1);
  await narrate(5, 2);
  await narrate(5, 3, async () => {
    await frame(page.getByText(/The custom PostgreSQL queue uses row locks/).first());
  });
  await narrate(5, 4);
  await subtitle('');
  await navigateDocument(evaluationURL, () =>
    page.getByRole('heading', { name: 'Frozen baseline', exact: true }).first(),
  );
  await narrate(6, 0);
  await narrate(6, 1);
  await narrate(6, 2, async () => {
    await frame(
      page
        .getByRole('heading', { name: 'CSV correction and separate regression', exact: true })
        .first(),
    );
    await pause(2000);
    await frame(
      page.getByRole('heading', { name: 'Fresh post-fix CSV holdout', exact: true }).first(),
    );
    await expect(page.getByText(/18 of 18|9 \/ 9 critical fields correct/).first()).toBeVisible();
  });
  await narrate(6, 3);
  await narrate(6, 4);
  await subtitle('');
  await navigateDocument(comparisonURL, () =>
    page.getByText('A focused workflow in an established category', { exact: true }).first(),
  );
  await narrate(7, 0);
  await narrate(7, 1);
  await narrate(7, 2);
  await narrate(7, 3, async () => {
    await frame(page.getByText(/Target buyer: finance manager at a small distributor/).first());
  });
  await narrate(7, 4);

  await subtitle('');
  await page.goto(baseURL, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await expect(
    page.getByRole('heading', { name: /^(?:Invoice operations|The exception desk)$/ }),
  ).toBeVisible({ timeout: 60_000 });
  await page.getByRole('button', { name: /Northstar Components/ }).click();
  await expect(page.locator('.case-header .status-badge')).toHaveText('Resolved');
  const persisted = await readCase();
  assert.equal(persisted.appliedCreditCents, 40_000);
  assert.equal(persisted.heldCents, 0);
  await frame(page.locator('.discrepancy-banner'));
  for (let cue = 0; cue < 3; cue++) await narrate(8, cue);
  await subtitle('Synthetic records · Synthesized narration', true);
  await pause(3000);
  assert.equal(
    timeline.length,
    expectedCueCounts.reduce((sum, value) => sum + value, 0),
  );
  recordingComplete = true;
  log('All recorded actions, source quotes, approvals, persisted outcomes, and exports passed.');
} catch (error) {
  failure = error instanceof Error ? error : new Error(String(error));
  log(`FAIL ${currentStage}: ${failure.message}`);
  process.exitCode = 1;
  if (page && !page.isClosed()) {
    await subtitle('Recording stopped: a required workflow check did not complete.').catch(
      () => {},
    );
    await page
      .screenshot({ path: path.join(outputDir, 'failure.png'), fullPage: false })
      .catch(() => {});
    await pause(2000);
  }
} finally {
  if (videoEpoch !== undefined) recordingDuration = offset();
  await context?.close().catch((error) => {
    failure ||= error;
    process.exitCode = 1;
  });
  if (video) {
    try {
      const original = await video.path();
      const destination = path.join(outputDir, failure ? 'failed-video.webm' : 'video.webm');
      await video.saveAs(destination);
      const resolved = path.resolve(original);
      if (
        resolved.startsWith(path.resolve(outputDir) + path.sep) &&
        resolved !== path.resolve(destination)
      )
        await unlink(resolved);
      log(`VIDEO ${destination}`);
    } catch (error) {
      failure ||= error;
      process.exitCode = 1;
    }
  }
  await browser?.close().catch(() => {});
  await writeFile(
    path.join(outputDir, 'recording.json'),
    JSON.stringify(
      {
        status: failure ? 'failed' : 'passed',
        runId,
        target: baseURL,
        repository,
        viewport,
        nativeVideoFps: 25,
        videoTiming:
          'Unmodified Playwright capture; verify exact container duration with a media probe.',
        videoEpochWallClock,
        readyAt,
        durationSeconds: recordingDuration,
        epochConvention:
          'performance.now captured immediately after newPage; starts are relative to this epoch.',
        narrationSampleRate: manifest.sampleRate,
        narrationDurationSeconds: manifest.segments.reduce(
          (sum, segment) => sum + segment.duration,
          0,
        ),
        cueCount: timeline.length,
        expectedCueCount: expectedCueCounts.reduce((sum, count) => sum + count, 0),
        timelineConvention:
          'startSeconds/endSeconds place narration; sourceStart/sourceEnd trim the source WAV; actionEndSeconds/completedAtSeconds preserve any extra real wait.',
        failure: failure?.message,
      },
      null,
      2,
    ) + '\n',
  );
  log(
    `RESULT ${failure ? 'FAILED' : 'PASSED'}; recording=${recordingDuration?.toFixed(3) ?? 'not started'}s.`,
  );
  await persistTimeline();
  if (failure) console.error(failure.stack || failure.message);
}
