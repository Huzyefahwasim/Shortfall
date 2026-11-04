import { NextRequest, NextResponse } from 'next/server';
import { PDFParse } from 'pdf-parse';
import { checkOrigin, errorResponse, requireWorkspace } from '@/lib/auth';
import { addDocument, getCase } from '@/lib/service';
import { digest, DomainError, label } from '@/lib/domain';
import type { DocumentKind } from '@/lib/types';
export const runtime = 'nodejs';
const MAX_FILE = 5 * 1024 * 1024;
async function boundedForm(request: NextRequest): Promise<FormData> {
  if (Number(request.headers.get('content-length')) > MAX_FILE + 50_000) throw new DomainError('Upload exceeds 5 MB.', 'PAYLOAD_TOO_LARGE', 413);
  const reader = request.body?.getReader();
  if (!reader) throw new DomainError('Upload body is missing.');
  const chunks: Uint8Array[] = []; let size = 0;
  while (true) { const item = await reader.read(); if (item.done) break; size += item.value.byteLength;
    if (size > MAX_FILE + 50_000) { await reader.cancel(); throw new DomainError('Upload exceeds 5 MB.', 'PAYLOAD_TOO_LARGE', 413); } chunks.push(item.value); }
  const bytes = Buffer.concat(chunks);
  return new Response(bytes, { headers: { 'Content-Type': request.headers.get('content-type') ?? '' } }).formData();
}
export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    checkOrigin(request); const workspace = await requireWorkspace(request); const { id } = await context.params;
    await getCase(workspace, id);
    const form = await boundedForm(request); const file = form.get('file');
    if (!(file instanceof File) || !file.size || file.size > MAX_FILE) throw new DomainError('Select a nonempty file up to 5 MB.');
    const kind = form.get('kind') as DocumentKind;
    if (!['purchase_order', 'invoice', 'receipt', 'credit'].includes(kind)) throw new DomainError('Choose a supported document type.');
    const reference = label(form.get('reference'), 'Document reference');
    const bytes = Buffer.from(await file.arrayBuffer());
    const extension = file.name.split('.').pop()?.toLowerCase();
    let text: string;
    if (extension === 'pdf') {
      if (!bytes.subarray(0, 5).equals(Buffer.from('%PDF-'))) throw new DomainError('This file is not a valid PDF.');
      const parser = new PDFParse({ data: bytes });
      try { const info = await parser.getInfo(); if (info.total > 8) throw new DomainError('Use a text PDF of eight pages or fewer.');
        const parsed = await parser.getText();
        text = parsed.pages.map(p => `[Page ${p.num}]\n${p.text}`).join('\n');
      } catch (error) {
        if (error instanceof DomainError) throw error;
        throw new DomainError('This PDF could not be read. Use an unencrypted text PDF or a supported text file.', 'NEEDS_REVIEW', 422);
      } finally { await parser.destroy(); }
      if (text.replace(/\[Page \d+\]/g, '').trim().length < 20) throw new DomainError('This PDF has no usable text. Scanned PDFs require manual review.', 'NEEDS_REVIEW', 422);
    } else {
      if (!['txt', 'csv', 'json'].includes(extension ?? '')) throw new DomainError('Supported formats: text PDF, TXT, CSV, JSON.');
      try { text = new TextDecoder('utf-8', { fatal: true }).decode(bytes); } catch { throw new DomainError('The file must use UTF-8 text.'); }
      if (extension === 'json') { let value; try { value = JSON.parse(text); } catch { throw new DomainError('The JSON document is invalid.'); }
        if (Array.isArray(value) && value.length > 100) throw new DomainError('Use at most 100 rows.'); }
      if (extension === 'csv' && text.split(/\r?\n/).filter(Boolean).length > 101) throw new DomainError('Use at most 100 data rows.');
    }
    text = text.replaceAll('\r\n', '\n').trim();
    if (!text || text.includes('\0') || Buffer.byteLength(text, 'utf8') > 20_000) throw new DomainError('Use a nonempty document with at most 20 KB of extracted text.');
    return NextResponse.json(await addDocument(workspace, id, kind, reference, text, digest(bytes)), { status: 202 });
  } catch (error) { return errorResponse(error); }
}
