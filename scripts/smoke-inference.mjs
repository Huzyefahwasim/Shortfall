import { request } from '@playwright/test';
import { readFileSync, writeFileSync } from 'node:fs';
const baseURL = process.env.TEST_BASE_URL || 'http://localhost:3000';
const context = await request.newContext({ baseURL, extraHTTPHeaders: { Origin: baseURL } });
async function json(response) {
  if (!response.ok())
    throw new Error(
      `Application request returned ${response.status()}: ${(await response.text()).slice(0, 250)}`,
    );
  return response.json();
}
await json(await context.post('/api/session', { data: {} }));
const workspace = await json(await context.get('/api/workspace'));
let item = workspace.cases.find((c) => c.poNumber === 'PO-1042');
const actions = (data) => context.post(`/api/cases/${item.id}/actions`, { data }).then(json);
item = await actions({ action: 'propose' });
const oldProposal = item.proposals.at(-1);
async function upload(kind, file, reference) {
  item = await json(
    await context.post(`/api/cases/${item.id}/documents`, {
      multipart: {
        kind,
        reference,
        file: {
          name: file,
          mimeType: 'text/plain',
          buffer: readFileSync(`public/samples/${file}`),
        },
      },
    }),
  );
  const documentId = item.documents.at(-1).id;
  const started = Date.now();
  while (Date.now() - started < 180000) {
    await new Promise((resolve) => setTimeout(resolve, 2000));
    item = await json(await context.get(`/api/cases/${item.id}`));
    const document = item.documents.find((d) => d.id === documentId);
    if (document.status === 'verified') {
      if (document.model !== 'claude-opus-5-5') throw new Error('Unexpected extraction model');
      console.log(
        JSON.stringify({
          kind,
          status: document.status,
          model: document.model,
          evidenceFields: document.evidence.length,
          elapsedMs: Date.now() - started,
        }),
      );
      return;
    }
    if (document.status === 'needs_review')
      throw new Error(`Extraction requires review: ${document.extractionError}`);
  }
  throw new Error('Extraction exceeded smoke-test timeout.');
}
try {
  await upload('receipt', 'receipt-late.txt', 'RCV-2042');
  const units = item.receipts.reduce((sum, r) => sum + r.quantity, 0);
  if (units !== 110)
    throw new Error('Receipt extraction produced an unexpected accepted quantity.');
  const stale = await context.post(`/api/cases/${item.id}/actions`, {
    data: { action: 'approve', proposalId: oldProposal.id },
  });
  if (stale.status() !== 409) throw new Error('Stale proposal was not rejected.');
  item = await actions({ action: 'propose' });
  if (item.proposals.at(-1).amountCents !== 40000)
    throw new Error('Unexpected revised discrepancy.');
  item = await actions({ action: 'approve', proposalId: item.proposals.at(-1).id });
  for (let i = 0; i < 30 && item.heldCents !== 40000; i++) {
    await new Promise((r) => setTimeout(r, 1000));
    item = await json(await context.get(`/api/cases/${item.id}`));
  }
  if (item.heldCents !== 40000) throw new Error('Approved hold did not execute.');
  await upload('credit', 'credit-note.txt', 'CN-8821-01');
  item = await actions({ action: 'propose' });
  item = await actions({ action: 'approve', proposalId: item.proposals.at(-1).id });
  for (let i = 0; i < 30 && item.status !== 'resolved'; i++) {
    await new Promise((r) => setTimeout(r, 1000));
    item = await json(await context.get(`/api/cases/${item.id}`));
  }
  if (item.status !== 'resolved' || item.appliedCreditCents !== 40000 || item.heldCents !== 0)
    throw new Error('Credit reconciliation did not complete.');
  const report = {
    at: new Date().toISOString(),
    caseId: item.id,
    model: 'claude-opus-5-5',
    status: item.status,
    netCents: item.invoicedUnits * item.unitPriceCents - item.appliedCreditCents,
    openPoUnits: item.orderedUnits - item.receipts.reduce((s, r) => s + r.quantity, 0),
    staleApprovalRejected: true,
  };
  writeFileSync('.deploy/inference-smoke.json', JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report));
} finally {
  await context.dispose();
}
