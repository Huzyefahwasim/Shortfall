import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PDFParse } from 'pdf-parse';

function textPdf(text: string): Uint8Array {
  const stream = `BT /F1 12 Tf 72 720 Td (${text}) Tj ET`;
  const objects = ['<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>', `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`];
  let pdf = '%PDF-1.4\n'; const offsets = [0];
  for (let i = 0; i < objects.length; i++) { offsets.push(Buffer.byteLength(pdf)); pdf += `${i + 1} 0 obj\n${objects[i]}\nendobj\n`; }
  const start = Buffer.byteLength(pdf);
  pdf += `xref\n0 6\n0000000000 65535 f \n${offsets.slice(1).map(x => `${String(x).padStart(10, '0')} 00000 n \n`).join('')}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${start}\n%%EOF`;
  return new Uint8Array(Buffer.from(pdf));
}
test('installed PDF parser reads a real text-layer PDF without network or model access', async () => {
  const parser = new PDFParse({ data: textPdf('Synthetic invoice INV-OFFLINE - Quantity 120 - Currency USD') });
  try { assert.equal((await parser.getInfo()).total, 1); const result = await parser.getText();
    assert.equal(result.pages.length, 1); assert.match(result.pages[0].text, /INV-OFFLINE/); assert.match(result.pages[0].text, /Quantity 120/);
  } finally { await parser.destroy(); }
});
