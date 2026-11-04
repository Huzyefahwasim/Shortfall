import { test, expect, type APIRequestContext } from '@playwright/test';
import type { CaseRecord, WorkspaceResponse } from '../../src/lib/types';

const origin = process.env.TEST_BASE_URL || 'http://localhost:3000';
async function createSession(request: APIRequestContext) {
  const response = await request.post('/api/session', { headers: { Origin: origin } });
  expect(response.ok()).toBeTruthy();
  const state = await request.get('/api/workspace');
  expect(state.ok()).toBeTruthy();
  return (await state.json()) as WorkspaceResponse;
}
async function action(request: APIRequestContext, id: string, data: unknown) {
  return request.post(`/api/cases/${id}/actions`, { data, headers: { Origin: origin } });
}
test('stale approval, exact reconciliation, and duplicate execution are enforced by the API', async ({
  request,
}) => {
  const workspace = await createSession(request);
  let item = workspace.cases.find((c) => c.poNumber === 'PO-1042')!;
  expect(item).toBeTruthy();
  let response = await action(request, item.id, { action: 'propose' });
  expect(response.ok()).toBeTruthy();
  item = await response.json();
  const oldProposal = item.proposals.at(-1)!;
  expect(oldProposal.amountCents).toBe(80000);
  response = await action(request, item.id, {
    action: 'receive',
    quantity: 10,
    reference: 'E2E-LATE-RECEIPT',
  });
  expect(response.ok()).toBeTruthy();
  const stale = await action(request, item.id, { action: 'approve', proposalId: oldProposal.id });
  expect(stale.status()).toBe(409);
  response = await action(request, item.id, { action: 'propose' });
  item = await response.json();
  const currentProposal = item.proposals.at(-1)!;
  expect(currentProposal.amountCents).toBe(40000);
  response = await action(request, item.id, { action: 'approve', proposalId: currentProposal.id });
  expect(response.ok()).toBeTruthy();
  const repeated = await action(request, item.id, {
    action: 'approve',
    proposalId: currentProposal.id,
  });
  expect(repeated.ok()).toBeTruthy();
  await expect
    .poll(
      async () =>
        ((await (await request.get(`/api/cases/${item.id}`)).json()) as CaseRecord).heldCents,
    )
    .toBe(40000);
  response = await action(request, item.id, {
    action: 'credit',
    amountCents: 40000,
    reference: 'E2E-CREDIT-01',
  });
  expect(response.ok()).toBeTruthy();
  response = await action(request, item.id, { action: 'propose' });
  item = await response.json();
  expect(item.proposals.at(-1)!.type).toBe('reconcile');
  response = await action(request, item.id, {
    action: 'approve',
    proposalId: item.proposals.at(-1)!.id,
  });
  expect(response.ok()).toBeTruthy();
  await expect
    .poll(
      async () =>
        ((await (await request.get(`/api/cases/${item.id}`)).json()) as CaseRecord).status,
    )
    .toBe('resolved');
  item = await (await request.get(`/api/cases/${item.id}`)).json();
  expect(item.heldCents).toBe(0);
  expect(item.appliedCreditCents).toBe(40000);
  expect(item.orderedUnits - item.receipts.reduce((sum, r) => sum + r.quantity, 0)).toBe(10);
  expect(item.executions.filter((e) => e.type === 'hold' && e.status === 'applied')).toHaveLength(
    1,
  );
  expect(
    item.tasks.filter((t) => t.commandId === item.executions.find((e) => e.type === 'hold')!.id),
  ).toHaveLength(1);
  const exported = await request.get(`/api/cases/${item.id}/export?format=json`);
  expect(exported.ok()).toBeTruthy();
});

test('sessions cannot access each other and reject cross-origin writes', async ({
  request,
  playwright,
}) => {
  const own = await createSession(request);
  const other = await playwright.request.newContext({ baseURL: origin });
  await createSession(other);
  const inaccessible = await other.get(`/api/cases/${own.cases[0].id}`);
  expect([403, 404]).toContain(inaccessible.status());
  const wrongOrigin = await request.post(`/api/cases/${own.cases[0].id}/actions`, {
    data: { action: 'receive', quantity: 1, reference: 'BAD-ORIGIN' },
    headers: { Origin: 'https://unrelated.example' },
  });
  expect(wrongOrigin.status()).toBe(403);
  await other.dispose();
});

test('a new independent case persists and rejects receipt over-allocation', async ({ request }) => {
  await createSession(request);
  const response = await request.post('/api/cases', {
    headers: { Origin: origin },
    data: {
      supplier: 'Harbor Test Supplier',
      poNumber: 'TEST-PO-45',
      invoiceNumber: 'TEST-INV-45',
      sku: 'HD-12',
      description: 'Independent acceptance case',
      orderedUnits: 45,
      invoicedUnits: 45,
      receivedUnits: 38,
      unitPriceCents: 1250,
    },
  });
  expect(response.ok()).toBeTruthy();
  const item: CaseRecord = await response.json();
  expect((await (await request.get(`/api/cases/${item.id}`)).json()).supplier).toBe(
    'Harbor Test Supplier',
  );
  const over = await action(request, item.id, {
    action: 'receive',
    quantity: 8,
    reference: 'OVER-RECEIPT',
  });
  expect(over.ok()).toBeFalsy();
  const proposed = await action(request, item.id, { action: 'propose' });
  expect((await proposed.json()).proposals.at(-1).amountCents).toBe(8750);
});
