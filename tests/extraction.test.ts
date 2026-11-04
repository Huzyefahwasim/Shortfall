import test from 'node:test';
import assert from 'node:assert/strict';
import {
  validateExtraction, parseExtractionResponse, extractionRequest, extractionCacheKey,
  EXTRACTION_MODEL, MAX_DOCUMENT_BYTES,
} from '../src/lib/extraction';
import {
  usageCostMicroUsd, canReserve, ATTEMPT_RESERVATION_MICROUSD,
  GLOBAL_LIMIT_MICROUSD, WORKSPACE_LIMIT_MICROUSD,
} from '../src/lib/budget';
import type { ExtractionFields } from '../src/lib/types';
import Anthropic from '@anthropic-ai/sdk';
import { extractionText, providerDiagnostic, providerRequest } from '../src/worker/provider';

const text = [
  'Invoice: INV-1001', 'Supplier: Harbour Tools', 'PO: PO-1001', 'SKU: WIDGET-01',
  'Quantity: 120', 'Unit price: USD 40.00', 'Total: USD 4,800.00', 'Currency: USD',
].join('\n');

function fixture(): ExtractionFields {
  return {
    kind: 'invoice', reference: 'INV-1001', supplier: 'Harbour Tools', poNumber: 'PO-1001',
    invoiceNumber: 'INV-1001', sku: 'WIDGET-01', quantity: 120, unitPriceCents: 4_000,
    totalCents: 480_000, currency: 'USD', evidence: [
      {field:'reference',value:'INV-1001',quote:'Invoice: INV-1001'},
      {field:'supplier',value:'Harbour Tools',quote:'Supplier: Harbour Tools'},
      {field:'poNumber',value:'PO-1001',quote:'PO: PO-1001'},
      {field:'invoiceNumber',value:'INV-1001',quote:'Invoice: INV-1001'},
      {field:'sku',value:'WIDGET-01',quote:'SKU: WIDGET-01'},
      {field:'quantity',value:'120',quote:'Quantity: 120'},
      {field:'unitPriceCents',value:'4000',quote:'Unit price: USD 40.00'},
      {field:'totalCents',value:'480000',quote:'Total: USD 4,800.00'},
      {field:'currency',value:'USD',quote:'Currency: USD'},
    ],
  };
}

test('accepted fields resolve exact UTF-16 source spans on the server', () => {
  const source = `📦 Records\n${text}`;
  const result = validateExtraction(fixture(), source, 'invoice');
  for (const evidence of result.evidence) {
    assert.equal(source.slice(evidence.start, evidence.end), evidence.quote);
    assert.equal(evidence.start, source.indexOf(evidence.quote));
  }
  assert.equal(result.totalCents, 480_000);
});

test('an ambiguous source quote requires review', () => {
  const raw = fixture();
  raw.evidence.find((item) => item.field === 'currency')!.quote = 'USD';
  assert.throws(() => validateExtraction(raw, text, 'invoice'), /missing or ambiguous/);
});

test('a real source quote cannot support an invented identifier', () => {
  const raw = fixture();
  raw.sku = 'WIDGET-99';
  raw.evidence.find((item) => item.field === 'sku')!.value = 'WIDGET-99';
  assert.throws(() => validateExtraction(raw, text, 'invoice'), /does not contain/);
});

test('schema-valid missing currency and bare-dollar evidence require review', () => {
  const raw = fixture();
  raw.currency = '';
  assert.throws(() => validateExtraction(raw, text, 'invoice'), /explicit USD/);
  const usd = fixture();
  usd.evidence.find((item) => item.field === 'currency')!.quote = 'Currency: $';
  assert.throws(() => validateExtraction(usd, text.replace('Currency: USD', 'Currency: $'), 'invoice'), /does not contain/);
});

test('invoice totals are checked independently of model assertions', () => {
  const raw = fixture();
  raw.totalCents = 490_000;
  assert.throws(() => validateExtraction(raw, text, 'invoice'), /total disagree/);
});

test('negative source money cannot support an extracted positive amount', () => {
  const raw = fixture();
  const source = text.replace('Total: USD 4,800.00', 'Total: USD -4,800.00');
  raw.evidence.find((item) => item.field === 'totalCents')!.quote = 'Total: USD -4,800.00';
  assert.throws(() => validateExtraction(raw, source, 'invoice'), /does not contain/);
});

test('negative or fractional source quantities require review', () => {
  for (const printed of ['-120', '120.5']) {
    const raw = fixture();
    const source = text.replace('Quantity: 120', `Quantity: ${printed}`);
    raw.evidence.find((item) => item.field === 'quantity')!.quote = `Quantity: ${printed}`;
    assert.throws(() => validateExtraction(raw, source, 'invoice'), /does not contain/);
  }
});

test('receipts may omit invoice and money fields but not receiving evidence', () => {
  const raw = fixture();
  raw.kind = 'receipt';
  raw.invoiceNumber = '';
  raw.unitPriceCents = 0;
  raw.totalCents = 0;
  raw.evidence = raw.evidence.filter((item) => !['invoiceNumber','unitPriceCents','totalCents'].includes(item.field));
  assert.equal(validateExtraction(raw, text, 'receipt').quantity, 120);
  assert.equal(validateExtraction({...raw,invoiceNumber:null,unitPriceCents:null,totalCents:null}, text, 'receipt').quantity, 120);
  raw.evidence = raw.evidence.filter((item) => item.field !== 'quantity');
  assert.throws(() => validateExtraction(raw, text, 'receipt'), /Missing source evidence for quantity/);
});

test('extra model action fields, truncated JSON, and missing required values cannot complete extraction', () => {
  assert.throws(() => validateExtraction({...fixture(), approvePayment:true}, text, 'invoice'), /incomplete/);
  assert.throws(() => parseExtractionResponse('{"quantity":120', text, 'invoice'), /complete JSON/);
  assert.throws(() => validateExtraction({...fixture(), supplier:null}, text, 'invoice'), /incomplete/);
});

test('evidence must match the field and uploaded document kind', () => {
  const raw = fixture();
  raw.evidence[0].value = 'INV-OTHER';
  assert.throws(() => validateExtraction(raw, text, 'invoice'), /Evidence value disagrees/);
  assert.throws(() => validateExtraction(fixture(), text, 'credit'), /document type/);
});

test('request preparation rejects oversized documents and fixes the selected model identity', () => {
  assert.throws(() => extractionRequest('a'.repeat(MAX_DOCUMENT_BYTES + 1), 'invoice'), /exceeds/);
  const request = extractionRequest(text, 'invoice');
  assert.match(request.system, /untrusted data/);
  assert.equal(EXTRACTION_MODEL, 'claude-opus-5-5');
  assert.notEqual(extractionCacheKey('hash','invoice'), extractionCacheKey('hash','credit'));
  assert.equal(extractionCacheKey('hash','invoice'), extractionCacheKey('hash','invoice'));
});

test('token accounting uses integer microdollars and rejects invalid usage', () => {
  assert.equal(usageCostMicroUsd({input_tokens:8_000,output_tokens:2_000}), 72_000);
  assert.equal(usageCostMicroUsd({input_tokens:6_000,output_tokens:1_200}), 48_000);
  assert.ok(ATTEMPT_RESERVATION_MICROUSD > 72_000);
  assert.throws(() => usageCostMicroUsd({input_tokens:-1,output_tokens:0}), /Invalid/);
  assert.throws(() => usageCostMicroUsd({input_tokens:1.5,output_tokens:0}), /Invalid/);
});

test('admission reserves the whole attempt under both limits and the workspace call quota', () => {
  assert.equal(canReserve(GLOBAL_LIMIT_MICROUSD - ATTEMPT_RESERVATION_MICROUSD, 0, 0), true);
  assert.equal(canReserve(GLOBAL_LIMIT_MICROUSD - ATTEMPT_RESERVATION_MICROUSD + 1, 0, 0), false);
  assert.equal(canReserve(0, WORKSPACE_LIMIT_MICROUSD - ATTEMPT_RESERVATION_MICROUSD, 9), true);
  assert.equal(canReserve(0, WORKSPACE_LIMIT_MICROUSD - ATTEMPT_RESERVATION_MICROUSD + 1, 9), false);
  assert.equal(canReserve(0, 0, 10), false);
});

test('Opus request uses supported adaptive thinking with bounded effort and structured output', () => {
  const request = providerRequest(text, 'invoice');
  assert.equal(request.model, 'claude-opus-5-5');
  assert.deepEqual(request.thinking, {type:'adaptive',display:'omitted'});
  assert.equal(request.output_config.effort, 'low');
  assert.equal(request.output_config.format.type, 'json_schema');
});

test('thinking blocks are ignored while unsupported action blocks require review', () => {
  const blocks = [
    {type:'thinking',thinking:'private intermediate content'},
    {type:'redacted_thinking',data:'opaque payload'},
    {type:'text',text:'{"quantity":120}'},
  ];
  assert.equal(extractionText(blocks), '{"quantity":120}');
  assert.throws(() => extractionText([{type:'tool_use'}]), /unsupported response/);
  assert.throws(() => extractionText([{type:'thinking'}]), /no complete extraction/);
});

test('provider diagnostics expose only class, HTTP status, and a validated request ID', () => {
  const error = new Anthropic.APIError(400, {detail:'private response body'}, 'private diagnostic message', new Headers({'request-id':'req_test_123','authorization':'private header'}));
  const diagnostic = providerDiagnostic(error);
  assert.deepEqual(diagnostic, {errorClass:'APIError',status:400,requestId:'req_test_123'});
  assert.doesNotMatch(JSON.stringify(diagnostic), /private/);
  assert.deepEqual(providerDiagnostic(new Error('private error')), {errorClass:'ProviderError',status:null,requestId:null});
});
