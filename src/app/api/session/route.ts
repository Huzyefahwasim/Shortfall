import { NextRequest, NextResponse } from 'next/server';
import {
  checkOrigin,
  clearSessionCookie,
  errorResponse,
  SESSION_COOKIE,
  sessionCreationSource,
  setSessionCookie,
} from '@/lib/auth';
import { endSession, establishSession, getWorkspace } from '@/lib/service';
export const runtime = 'nodejs';
export async function POST(request: NextRequest) {
  try {
    checkOrigin(request);
    const session = await establishSession(
      request.cookies.get(SESSION_COOKIE)?.value,
      sessionCreationSource(request),
    );
    const response = NextResponse.json(await getWorkspace(session.workspaceId));
    setSessionCookie(response, session.token, request);
    return response;
  } catch (error) {
    return errorResponse(error);
  }
}
export async function DELETE(request: NextRequest) {
  try {
    checkOrigin(request);
    await endSession(request.cookies.get(SESSION_COOKIE)?.value);
    const response = NextResponse.json({ ended: true });
    clearSessionCookie(response, request);
    return response;
  } catch (error) {
    return errorResponse(error);
  }
}
