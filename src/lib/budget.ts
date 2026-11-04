import { randomUUID } from 'node:crypto';
import type { PoolClient } from 'pg';

export const GLOBAL_LIMIT_MICROUSD = 40_000_000;
export const WORKSPACE_LIMIT_MICROUSD = 1_000_000;
export const ATTEMPT_RESERVATION_MICROUSD = 90_000;
export const MAX_WORKSPACE_ATTEMPTS = 10;

export class BudgetLimitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BudgetLimitError';
  }
}

export interface TokenUsage {
  input_tokens: number;
  output_tokens: number;
  cache_creation_input_tokens?: number | null;
  cache_read_input_tokens?: number | null;
}

export interface UsageMetadata {
  model: string;
  requestId: string;
  latencyMs: number;
}

export function usageCostMicroUsd(usage: TokenUsage): number {
  const values = [
    usage.input_tokens,
    usage.output_tokens,
    usage.cache_creation_input_tokens ?? 0,
    usage.cache_read_input_tokens ?? 0,
  ];
  if (values.some((value) => !Number.isSafeInteger(value) || value < 0))
    throw new Error('Invalid provider usage counters.');
  // No caching is requested. Unexpected cache writes are conservatively charged at twice base input cost.
  const amount = values[0] * 4 + values[1] * 20 + values[2] * 8 + values[3] * 4;
  if (!Number.isSafeInteger(amount))
    throw new Error('Provider usage exceeds supported accounting range.');
  return amount;
}

export function canReserve(
  globalUsed: number,
  workspaceUsed: number,
  workspaceAttempts: number,
): boolean {
  return (
    globalUsed + ATTEMPT_RESERVATION_MICROUSD <= GLOBAL_LIMIT_MICROUSD &&
    workspaceUsed + ATTEMPT_RESERVATION_MICROUSD <= WORKSPACE_LIMIT_MICROUSD &&
    workspaceAttempts < MAX_WORKSPACE_ATTEMPTS
  );
}

export type Transaction = <T>(fn: (client: PoolClient) => Promise<T>) => Promise<T>;

export class BudgetLedger {
  constructor(private readonly transaction: Transaction) {}

  async reserve(workspaceId: string, attemptKey: string): Promise<string> {
    return this.transaction(async (client) => {
      await client.query('SELECT id FROM inference_budget_lock WHERE id = 1 FOR UPDATE');
      const existing = await client.query(
        'SELECT id FROM inference_reservations WHERE attempt_key = $1',
        [attemptKey],
      );
      if (existing.rowCount)
        throw new BudgetLimitError(
          'This extraction attempt already has a budget reservation. Wait for its result or review the document.',
        );
      const totals = await client.query<{
        global_used: string;
        workspace_used: string;
        workspace_attempts: string;
      }>(
        `
        SELECT COALESCE(SUM(CASE WHEN status = 'settled' THEN actual_microusd WHEN status IN ('reserved','uncertain') THEN amount_microusd ELSE 0 END),0)::text AS global_used,
        COALESCE(SUM(CASE WHEN workspace_id = $1 THEN CASE WHEN status = 'settled' THEN actual_microusd WHEN status IN ('reserved','uncertain') THEN amount_microusd ELSE 0 END ELSE 0 END),0)::text AS workspace_used,
        COUNT(*) FILTER (WHERE workspace_id = $1 AND status <> 'released')::text AS workspace_attempts
        FROM inference_reservations`,
        [workspaceId],
      );
      const row = totals.rows[0];
      if (
        !canReserve(
          Number(row.global_used),
          Number(row.workspace_used),
          Number(row.workspace_attempts),
        )
      ) {
        throw new BudgetLimitError(
          'The model allowance is exhausted. Continue with manual evidence review.',
        );
      }
      const id = randomUUID();
      await client.query(
        `INSERT INTO inference_reservations(id,workspace_id,attempt_key,amount_microusd,status)
        VALUES($1,$2,$3,$4,'reserved')`,
        [id, workspaceId, attemptKey, ATTEMPT_RESERVATION_MICROUSD],
      );
      return id;
    });
  }

  async settle(id: string, usage: TokenUsage, metadata?: UsageMetadata): Promise<void> {
    const cost = usageCostMicroUsd(usage);
    await this.transaction(async (client) => {
      await client.query('SELECT id FROM inference_budget_lock WHERE id = 1 FOR UPDATE');
      await client.query(
        `UPDATE inference_reservations SET status='settled',actual_microusd=$2,
        input_tokens=$3,output_tokens=$4,model=$5,request_id=$6,latency_ms=$7,updated_at=now()
        WHERE id=$1 AND status IN ('reserved','uncertain')`,
        [
          id,
          cost,
          usage.input_tokens,
          usage.output_tokens,
          metadata?.model ?? null,
          metadata?.requestId ?? null,
          metadata?.latencyMs ?? null,
        ],
      );
    });
  }

  async uncertain(id: string): Promise<void> {
    await this.changeState(id, 'uncertain');
  }
  async release(id: string): Promise<void> {
    await this.changeState(id, 'released');
  }

  private async changeState(id: string, state: 'uncertain' | 'released'): Promise<void> {
    await this.transaction(async (client) => {
      await client.query('SELECT id FROM inference_budget_lock WHERE id = 1 FOR UPDATE');
      await client.query(
        "UPDATE inference_reservations SET status=$2,updated_at=now() WHERE id=$1 AND status='reserved'",
        [id, state],
      );
    });
  }
}
