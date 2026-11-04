import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { request } from '@playwright/test';

// Stop the worker before `prepare`; restart web and worker before `verify`.
// This uses synthetic records. Session state stays in the ignored .deploy directory.
const phase = process.argv[2];
assert(['prepare', 'verify'].includes(phase), 'Use prepare or verify.');
const baseURL = process.env.TEST_BASE_URL || 'http://localhost:3000';
mkdirSync('.deploy', { recursive: true });
const saved =
  phase === 'verify' ? JSON.parse(readFileSync('.deploy/recovery-state.json', 'utf8')) : undefined;
if (saved) assert.equal(saved.baseURL, baseURL, 'Verify against the original deployment.');
const context = await request.newContext({
  baseURL,
  extraHTTPHeaders: { Origin: baseURL },
  storageState: saved?.storageState,
});
async function json(response) {
  assert(response.ok(), `Application request failed: ${response.status()}`);
  return response.json();
}
try {
  if (phase === 'prepare') {
    await json(await context.post('/api/session', { data: {} }));
    const workspace = await json(await context.get('/api/workspace'));
    let item = workspace.cases.find((entry) => entry.poNumber === 'PO-1042');
    const action = (data) => context.post(`/api/cases/${item.id}/actions`, { data }).then(json);
    item = await action({ action: 'propose' });
    const proposalId = item.proposals.at(-1).id;
    item = await action({ action: 'approve', proposalId });
    assert.equal(item.heldCents, 0, 'The worker must be stopped for this check.');
    assert.equal(item.executions.at(-1).status, 'queued');
    writeFileSync(
      '.deploy/recovery-state.json',
      JSON.stringify({
        baseURL,
        caseId: item.id,
        proposalId,
        storageState: await context.storageState(),
      }),
    );
    console.log(JSON.stringify({ phase, queued: true, ledgerUnchanged: true }));
  } else {
    let item;
    for (let attempt = 0; attempt < 30; attempt++) {
      item = await json(await context.get(`/api/cases/${saved.caseId}`));
      if (item.status === 'on_hold') break;
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
    assert.equal(item.status, 'on_hold');
    assert.equal(item.heldCents, 80000);
    assert.equal(item.executions.length, 1);
    assert.equal(item.executions[0].status, 'applied');
    assert.equal(item.tasks.length, 1);
    const replay = await json(
      await context.post(`/api/cases/${saved.caseId}/actions`, {
        data: { action: 'approve', proposalId: saved.proposalId },
      }),
    );
    assert.equal(replay.heldCents, 80000);
    assert.equal(replay.executions.length, 1);
    assert.equal(replay.tasks.length, 1);
    const result = {
      at: new Date().toISOString(),
      baseURL,
      recoveredQueuedCommand: true,
      persistedSession: true,
      heldCents: 80000,
      executions: 1,
      tasks: 1,
      replayCreatedDuplicate: false,
    };
    writeFileSync('.deploy/recovery-result.json', JSON.stringify(result, null, 2));
    console.log(JSON.stringify(result));
  }
} finally {
  await context.dispose();
}
