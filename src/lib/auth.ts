import { NextRequest, NextResponse } from 'next/server';
import { isIP } from 'node:net';
import { createHash } from 'node:crypto';
import { DomainError } from './domain';
import { sessionWorkspace } from './service';

export const SESSION_COOKIE = 'shortfall_session';
export function sessionCreationSource(request: NextRequest): string | undefined {
  // Enable only behind a private upstream where Caddy overwrites this header.
  // Forwarded-For and arbitrary browser headers are never trusted by default.
  if (process.env.TRUST_PROXY_CLIENT_IP !== 'true') return undefined;
  const address = request.headers.get('x-shortfall-client-ip')?.trim();
  if (!address || !isIP(address)) return undefined;
  return createHash('sha256').update(`shortfall-session-source:${address}`).digest('hex');
}
export function checkOrigin(request: NextRequest): void {
  const supplied = request.headers.get('origin');
  const configured = process.env.APP_ORIGIN;
  const url = new URL(request.url);
  const forwarded = request.headers.get('x-forwarded-proto');
  const protocol = forwarded === 'https' ? 'https:' : url.protocol;
  const allowed = configured ? new URL(configured).origin : `${protocol}//${request.headers.get('host') || url.host}`;
  if (!supplied || supplied !== allowed) throw new DomainError('This request must originate from the application.', 'INVALID_ORIGIN', 403);
}
export async function requireWorkspace(request: NextRequest): Promise<string> {
  const workspaceId = await sessionWorkspace(request.cookies.get(SESSION_COOKIE)?.value);
  if (!workspaceId) throw new DomainError('Start a demo session first.', 'SESSION_REQUIRED', 401);
  return workspaceId;
}
export function setSessionCookie(response: NextResponse, token: string, request: NextRequest): void {
  const secure = (process.env.APP_ORIGIN || request.url).startsWith('https:');
  response.cookies.set(SESSION_COOKIE, token, { httpOnly: true, secure, sameSite: 'lax', path: '/', maxAge: 7 * 24 * 60 * 60 });
}
export function errorResponse(error: unknown): NextResponse {
  if (error instanceof DomainError) return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
  const pg = error as { code?: string };
  if (pg?.code === '22P02') return NextResponse.json({ error: 'Invalid record identifier.', code: 'INVALID_INPUT' }, { status: 400 });
  if (pg?.code === '23505') return NextResponse.json({ error: 'This record already exists.', code: 'CONFLICT' }, { status: 409 });
  if (error instanceof SyntaxError) return NextResponse.json({ error: 'The request body is not valid JSON.', code: 'INVALID_INPUT' }, { status: 400 });
  console.error('Request failed', error instanceof Error ? error.name : 'Unknown error');
  return NextResponse.json({ error: 'The service is temporarily unavailable. Your saved case is unchanged.', code: 'SERVICE_UNAVAILABLE' }, { status: 503 });
}
export async function jsonBody(request: NextRequest): Promise<Record<string, unknown>> {
  if (Number(request.headers.get('content-length')) > 20_000) throw new DomainError('Request is too large.', 'PAYLOAD_TOO_LARGE', 413);
  const reader = request.body?.getReader(); const chunks: Uint8Array[] = []; let size = 0;
  if (reader) while (true) { const part = await reader.read(); if (part.done) break;
    size += part.value.byteLength;
    if (size > 20_000) { await reader.cancel(); throw new DomainError('Request is too large.', 'PAYLOAD_TOO_LARGE', 413); }
    chunks.push(part.value);
  }
  const text = Buffer.concat(chunks).toString('utf8');
  const value: unknown = text ? JSON.parse(text) : {};
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new DomainError('Expected an object.');
  return value as Record<string, unknown>;
}
