import { NextRequest, NextResponse } from 'next/server';
import { errorResponse, requireWorkspace } from '@/lib/auth';
import { getCase } from '@/lib/service';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    return NextResponse.json(await getCase(await requireWorkspace(request), id), {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
