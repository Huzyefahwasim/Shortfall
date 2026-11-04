import { NextRequest, NextResponse } from 'next/server';
import {
  checkOrigin,
  errorResponse,
  SESSION_COOKIE,
  sessionCreationSource,
  setSessionCookie,
} from '@/lib/auth';
import { establishSession, getWorkspace } from '@/lib/service';
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
