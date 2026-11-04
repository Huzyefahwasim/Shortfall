import { NextRequest, NextResponse } from 'next/server';
import { checkOrigin, errorResponse, jsonBody, requireWorkspace } from '@/lib/auth';
import { caseAction } from '@/lib/service';
import { label } from '@/lib/domain';
export const runtime = 'nodejs';
export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    checkOrigin(request);
    const workspace = await requireWorkspace(request);
    const { id } = await context.params;
    const body = await jsonBody(request);
    const action = label(body.action, 'Action');
    return NextResponse.json(await caseAction(workspace, id, action, body));
  } catch (error) {
    return errorResponse(error);
  }
}
