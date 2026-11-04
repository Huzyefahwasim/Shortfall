import Anthropic from '@anthropic-ai/sdk';
import { BudgetLedger } from '../lib/budget';
import {
  EXTRACTION_MODEL,
  MAX_INPUT_TOKENS,
  MAX_OUTPUT_TOKENS,
  ExtractionReviewError,
  extractionRequest,
  parseExtractionResponse,
  type ValidatedExtraction,
} from '../lib/extraction';
import type { DocumentKind } from '../lib/types';

export class ProviderUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ProviderUnavailableError';
  }
}

// Nullable source fields let the model abstain. Application validation rejects incomplete outputs.
const sourceSchema: Record<string, unknown> = {
  type: 'object',
  additionalProperties: false,
  required: [
    'kind',
    'reference',
    'supplier',
    'poNumber',
    'invoiceNumber',
    'sku',
    'quantity',
    'unitPriceCents',
    'totalCents',
    'currency',
    'evidence',
  ],
  properties: {
    kind: { type: 'string', enum: ['purchase_order', 'invoice', 'receipt', 'credit'] },
    ...Object.fromEntries(
      ['reference', 'supplier', 'poNumber', 'invoiceNumber', 'sku', 'currency'].map((name) => [
        name,
        { type: ['string', 'null'] },
      ]),
    ),
    ...Object.fromEntries(
      ['quantity', 'unitPriceCents', 'totalCents'].map((name) => [
        name,
        { type: ['integer', 'null'] },
      ]),
    ),
    evidence: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['field', 'value', 'quote'],
        properties: {
          field: { type: 'string' },
          value: { type: 'string' },
          quote: { type: 'string' },
        },
      },
    },
  },
};

export function providerRequest(text: string, kind: DocumentKind) {
  const prompt = extractionRequest(text, kind);
  return {
    model: EXTRACTION_MODEL,
    system: prompt.system,
    messages: [{ role: 'user' as const, content: prompt.user }],
    output_config: {
      effort: 'low' as const,
      format: { type: 'json_schema' as const, schema: sourceSchema },
    },
    thinking: { type: 'adaptive' as const, display: 'omitted' as const },
  };
}

export function extractionText(content: readonly { type: string; text?: string }[]): string {
  if (content.some((block) => !['text', 'thinking', 'redacted_thinking'].includes(block.type))) {
    throw new ExtractionReviewError('The extraction returned an unsupported response type.');
  }
  // Thinking content is neither parsed as data nor logged, cached, or persisted.
  const text = content
    .filter((block) => block.type === 'text')
    .map((block) => block.text ?? '')
    .join('');
  if (!text.trim())
    throw new ExtractionReviewError('The model returned no complete extraction text.');
  return text;
}

export function providerDiagnostic(error: unknown): {
  errorClass: string;
  status: number | null;
  requestId: string | null;
} {
  if (!(error instanceof Anthropic.APIError))
    return { errorClass: 'ProviderError', status: null, requestId: null };
  const known = new Set([
    'APIError',
    'BadRequestError',
    'AuthenticationError',
    'PermissionDeniedError',
    'NotFoundError',
    'ConflictError',
    'UnprocessableEntityError',
    'RateLimitError',
    'InternalServerError',
    'APIConnectionError',
    'APIConnectionTimeoutError',
    'APIUserAbortError',
  ]);
  return {
    errorClass: known.has(error.constructor.name) ? error.constructor.name : 'APIError',
    status:
      Number.isInteger(error.status) && error.status! >= 100 && error.status! <= 599
        ? error.status!
        : null,
    requestId:
      typeof error.requestID === 'string' && /^req_[A-Za-z0-9_-]{1,180}$/.test(error.requestID)
        ? error.requestID
        : null,
  };
}

export interface ExtractAttempt {
  workspaceId: string;
  attemptKey: string;
  kind: DocumentKind;
  text: string;
}

export class ExtractionProvider {
  private readonly client: Anthropic | null;
  readonly enabled: boolean;

  constructor(private readonly budget: BudgetLedger) {
    const key = process.env.ANTHROPIC_API_KEY;
    const configuredModel = process.env.ANTHROPIC_MODEL || EXTRACTION_MODEL;
    if (configuredModel !== EXTRACTION_MODEL)
      throw new ProviderUnavailableError(
        'The configured model does not match the selected extraction model.',
      );
    this.enabled = Boolean(key) && process.env.INFERENCE_ENABLED !== 'false';
    const workspaceId = process.env.ANTHROPIC_WORKSPACE_ID;
    this.client = this.enabled
      ? new Anthropic({
          apiKey: key,
          maxRetries: 0,
          timeout: 45_000,
          ...(workspaceId ? { defaultHeaders: { 'anthropic-workspace-id': workspaceId } } : {}),
        })
      : null;
  }

  async extract(input: ExtractAttempt): Promise<ValidatedExtraction> {
    if (!this.client)
      throw new ProviderUnavailableError(
        'Model extraction is unavailable. Use manual evidence review.',
      );
    const request = providerRequest(input.text, input.kind);
    const reservation = await this.budget.reserve(input.workspaceId, input.attemptKey);
    let dispatched = false;
    let settled = false;
    let stage = 'token_count';
    try {
      // Count the complete request, including instructions and output schema, before generation.
      const count = await this.client.messages.countTokens(request);
      if (
        !Number.isSafeInteger(count.input_tokens) ||
        count.input_tokens < 0 ||
        count.input_tokens > MAX_INPUT_TOKENS
      ) {
        throw new ExtractionReviewError(
          'The document exceeds the 8,000-token extraction limit. Review or split the source.',
        );
      }
      dispatched = true;
      stage = 'generation';
      const startedAt = Date.now();
      const response = await this.client.messages.create({
        ...request,
        max_tokens: MAX_OUTPUT_TOKENS,
      });
      await this.budget.settle(reservation, response.usage, {
        model: response.model,
        requestId: response.id,
        latencyMs: Date.now() - startedAt,
      });
      settled = true;
      if (response.stop_reason !== 'end_turn') {
        throw new ExtractionReviewError(
          'The model refused or truncated this extraction. Review the document.',
        );
      }
      const output = extractionText(response.content);
      return parseExtractionResponse(output, input.text, input.kind);
    } catch (error) {
      if (!settled) {
        // A lost response may still be billed. Retain its reservation through restarts.
        if (dispatched) await this.budget.uncertain(reservation);
        else await this.budget.release(reservation);
      }
      if (error instanceof ExtractionReviewError) throw error;
      console.warn('Provider request failed.', { stage, ...providerDiagnostic(error) });
      if (
        error instanceof Anthropic.APIError &&
        (error.status === 401 || error.status === 403 || error.status === 404)
      ) {
        throw new ProviderUnavailableError(
          'The configured model is unavailable to this account. Review provider access; no fallback model was used.',
        );
      }
      throw new ProviderUnavailableError(
        'The extraction service did not complete the request. Its usage reservation is retained when billing is uncertain.',
      );
    }
  }
}
