import assert from 'node:assert/strict';
import { test } from 'node:test';
import { NextRequest, NextResponse } from 'next/server';
import { checkOrigin, errorResponse, jsonBody, sessionCreationSource, setSessionCookie } from '../src/lib/auth';
import { DomainError } from '../src/lib/domain';

test('mutations reject missing and foreign origins', () => {
  const before = process.env.APP_ORIGIN; process.env.APP_ORIGIN = 'https://shortfall.example';
  try {
    assert.doesNotThrow(() => checkOrigin(new NextRequest('https://shortfall.example/api/session', { method: 'POST', headers: { origin: 'https://shortfall.example' } })));
    for (const origin of [undefined, 'https://different.example', 'https://shortfall.example.attacker.example']) {
      const request = new NextRequest('https://shortfall.example/api/session', { method: 'POST', headers: origin ? { origin } : {} });
      assert.throws(() => checkOrigin(request), e => e instanceof DomainError && e.code === 'INVALID_ORIGIN');
    }
    const response = NextResponse.json({ ok: true });
    setSessionCookie(response, 'test-session-placeholder', new NextRequest('https://shortfall.example'));
    assert.match(response.headers.get('set-cookie')!, /HttpOnly/i);
    assert.match(response.headers.get('set-cookie')!, /Secure/i);
    assert.match(response.headers.get('set-cookie')!, /SameSite=lax/i);
  } finally { if (before === undefined) delete process.env.APP_ORIGIN; else process.env.APP_ORIGIN = before; }
});
test('unexpected database errors do not expose connection details', async () => {
  const response = errorResponse(new Error('postgres://example-user:placeholder-password@private-host/db'));
  const body = await response.text(); assert.equal(response.status, 503);
  assert.ok(!body.includes('placeholder-password')); assert.ok(!body.includes('private-host'));
});
test('public origin remains valid behind the private HTTP reverse proxy', () => {
  const before = process.env.APP_ORIGIN; process.env.APP_ORIGIN = 'https://shortfall.example';
  try {
    assert.doesNotThrow(() => checkOrigin(new NextRequest('http://web:3000/api/session', { method: 'POST', headers: { origin: 'https://shortfall.example', 'x-forwarded-proto': 'https' } })));
  } finally { if (before === undefined) delete process.env.APP_ORIGIN; else process.env.APP_ORIGIN = before; }
});
test('session admission trusts only an explicitly configured private-proxy IP header', () => {
  const before = process.env.TRUST_PROXY_CLIENT_IP;
  const request = new NextRequest('https://shortfall.example/api/session', { headers: { 'x-shortfall-client-ip': '192.0.2.9', 'x-forwarded-for': '198.51.100.7' } });
  try {
    delete process.env.TRUST_PROXY_CLIENT_IP; assert.equal(sessionCreationSource(request), undefined);
    process.env.TRUST_PROXY_CLIENT_IP = 'true'; assert.match(sessionCreationSource(request)!, /^[a-f0-9]{64}$/);
    assert.equal(sessionCreationSource(new NextRequest('https://shortfall.example', { headers: { 'x-forwarded-for': '192.0.2.9' } })), undefined);
    assert.equal(sessionCreationSource(new NextRequest('https://shortfall.example', { headers: { 'x-shortfall-client-ip': '192.0.2.9, 198.51.100.7' } })), undefined);
  } finally { if (before === undefined) delete process.env.TRUST_PROXY_CLIENT_IP; else process.env.TRUST_PROXY_CLIENT_IP = before; }
});
test('chunked JSON input is bounded before accumulating the full request', async () => {
  const request = new NextRequest('http://localhost/api/cases', { method: 'POST', body: JSON.stringify({ payload: 'x'.repeat(20_001) }) });
  await assert.rejects(() => jsonBody(request), error => error instanceof DomainError && error.status === 413);
  const valid = new NextRequest('http://localhost/api/cases', { method: 'POST', body: JSON.stringify({ action: 'propose' }) });
  assert.deepEqual(await jsonBody(valid), { action: 'propose' });
});
