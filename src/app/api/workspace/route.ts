import { NextRequest, NextResponse } from 'next/server';
import { errorResponse, requireWorkspace } from '@/lib/auth';
import { getWorkspace } from '@/lib/service';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET(request: NextRequest) {
  try { return NextResponse.json(await getWorkspace(await requireWorkspace(request)), { headers: { 'Cache-Control': 'no-store' } }); }
  catch (error) { return errorResponse(error); }
}
