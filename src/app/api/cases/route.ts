import { NextRequest, NextResponse } from 'next/server';
import { checkOrigin, errorResponse, jsonBody, requireWorkspace } from '@/lib/auth';
import { newCase } from '@/lib/service';
import type { NewCaseInput } from '@/lib/types';
export const runtime = 'nodejs';
export async function POST(request: NextRequest) {
  try {
    checkOrigin(request);
    const workspace = await requireWorkspace(request);
    const body = await jsonBody(request);
    return NextResponse.json(await newCase(workspace, body as unknown as NewCaseInput), {
      status: 201,
    });
  } catch (error) {
    return errorResponse(error);
  }
}
