import { NextRequest, NextResponse } from 'next/server';
import { errorResponse, requireWorkspace } from '@/lib/auth';
import { getCase } from '@/lib/service';
import { calculateTotals } from '@/lib/domain';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
function csv(value: unknown): string {
  let text = String(value ?? '');
  if (/^[\s]*[=+\-@]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}
export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try { const { id } = await context.params; const c = await getCase(await requireWorkspace(request), id);
    if (request.nextUrl.searchParams.get('format') === 'csv') {
      const totals = calculateTotals(c);
      const rows: unknown[][] = [['record_type', 'reference', 'status', 'amount_cents', 'detail', 'timestamp'],
        ['case', c.invoiceNumber, c.status, totals.netCents, `Synthetic internal ledger; ${totals.openPoUnits} PO units outstanding; no payment executed.`, c.updatedAt],
        ...c.executions.map(e => ['execution', e.id, e.status, e.afterHeldCents ?? '', `proposal=${e.proposalId}; held_before=${e.beforeHeldCents ?? ''}; type=${e.type}`, e.appliedAt ?? e.createdAt]),
        ...c.history.map(e => ['audit', e.id, e.type, '', `${e.title}: ${e.detail}; actor=${e.actor}; revision=${e.revision}`, e.at]),
        ...c.documents.flatMap(d => d.evidence.map(e => ['evidence', d.reference, d.status, '', `${e.field}=${e.value}; quote=${e.quote}; offsets=${e.start}:${e.end}; hash=${d.hash}`, d.createdAt]))];
      return new NextResponse(rows.map(r => r.map(csv).join(',')).join('\r\n'), { headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="shortfall-${c.id}.csv"`, 'Cache-Control': 'no-store' } });
    }
    return NextResponse.json({ exportedAt: new Date().toISOString(), synthetic: true, paymentExecuted: false, totals: calculateTotals(c), case: c }, { headers: { 'Content-Disposition': `attachment; filename="shortfall-${c.id}.json"`, 'Cache-Control': 'no-store' } });
  } catch (error) { return errorResponse(error); }
}
