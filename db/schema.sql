CREATE TABLE IF NOT EXISTS workspaces (
  id uuid PRIMARY KEY, name text NOT NULL, synthetic boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(), expires_at timestamptz NOT NULL DEFAULT now() + interval '7 days'
);
ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS creation_source_hash text;
CREATE INDEX IF NOT EXISTS workspaces_created_idx ON workspaces(created_at);
CREATE INDEX IF NOT EXISTS workspaces_expires_idx ON workspaces(expires_at);
CREATE INDEX IF NOT EXISTS workspaces_source_created_idx ON workspaces(creation_source_hash,created_at);
CREATE TABLE IF NOT EXISTS sessions (
  token_hash text PRIMARY KEY, workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(), expires_at timestamptz NOT NULL DEFAULT now() + interval '7 days'
);
CREATE INDEX IF NOT EXISTS sessions_workspace_idx ON sessions(workspace_id);
CREATE TABLE IF NOT EXISTS cases (
  id uuid PRIMARY KEY, workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  supplier_key text NOT NULL, po_key text NOT NULL, data jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(workspace_id,supplier_key,po_key)
);
CREATE INDEX IF NOT EXISTS cases_workspace_idx ON cases(workspace_id);
CREATE TABLE IF NOT EXISTS commands (
  id uuid PRIMARY KEY, workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  case_id uuid NOT NULL REFERENCES cases(id) ON DELETE CASCADE, proposal_id uuid NOT NULL,
  status text NOT NULL CHECK(status IN ('queued','applied','cancelled','failed')),
  receipt jsonb, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(workspace_id,case_id,proposal_id)
);
CREATE TABLE IF NOT EXISTS jobs (
  id uuid PRIMARY KEY, workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  case_id uuid NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK(kind IN ('execute_command','extract_document')), payload jsonb NOT NULL,
  status text NOT NULL DEFAULT 'queued' CHECK(status IN ('queued','running','completed','failed','cancelled')),
  attempts integer NOT NULL DEFAULT 0, max_attempts integer NOT NULL DEFAULT 2,
  available_at timestamptz NOT NULL DEFAULT now(), locked_until timestamptz, locked_by text,
  last_error text, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS jobs_claim_idx ON jobs(status,available_at,locked_until);
CREATE TABLE IF NOT EXISTS worker_heartbeats (
  id text PRIMARY KEY, last_seen timestamptz NOT NULL DEFAULT now(), model text NOT NULL,
  inference_enabled boolean NOT NULL DEFAULT false
);
CREATE TABLE IF NOT EXISTS inference_budget_lock (id integer PRIMARY KEY CHECK(id=1));
INSERT INTO inference_budget_lock(id) VALUES(1) ON CONFLICT DO NOTHING;
CREATE TABLE IF NOT EXISTS inference_reservations (
  id uuid PRIMARY KEY, workspace_id uuid NOT NULL, attempt_key text UNIQUE NOT NULL,
  amount_microusd bigint NOT NULL, actual_microusd bigint,
  status text NOT NULL CHECK(status IN ('reserved','settled','uncertain','released')),
  input_tokens integer, output_tokens integer,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS extraction_cache (
  workspace_id uuid NOT NULL, cache_key text NOT NULL, result jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(workspace_id,cache_key)
);
ALTER TABLE inference_reservations ADD COLUMN IF NOT EXISTS model text;
ALTER TABLE inference_reservations ADD COLUMN IF NOT EXISTS request_id text;
ALTER TABLE inference_reservations ADD COLUMN IF NOT EXISTS latency_ms integer;
