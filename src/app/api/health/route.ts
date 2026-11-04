import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET() {
  try { await query('SELECT 1'); const result = await query<{ online: boolean }>("SELECT EXISTS(SELECT 1 FROM worker_heartbeats WHERE last_seen>now()-interval '30 seconds') AS online");
    return NextResponse.json({ status: 'ok', database: true, workerOnline: result.rows[0].online, synthetic: true }, { headers: { 'Cache-Control': 'no-store' } });
  } catch { return NextResponse.json({ status: 'unavailable', database: false }, { status: 503 }); }
}
