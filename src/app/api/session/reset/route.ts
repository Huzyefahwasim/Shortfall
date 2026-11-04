import { NextRequest, NextResponse } from 'next/server';
import { checkOrigin, errorResponse, requireWorkspace } from '@/lib/auth';
import { resetWorkspace } from '@/lib/service';
export const runtime = 'nodejs';
export async function POST(request: NextRequest) {
  try { checkOrigin(request); return NextResponse.json(await resetWorkspace(await requireWorkspace(request))); }
  catch (error) { return errorResponse(error); }
}
