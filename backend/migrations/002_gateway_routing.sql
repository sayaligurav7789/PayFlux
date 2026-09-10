-- Adds Gateway B + routing engine support.
-- Run with: npm run migrate

-- Single-row config table: which routing strategy is active, and the
-- weights used when strategy = 'weighted'. A single mutable row (rather
-- than an app-config env var) so the Routing page can change it live,
-- and so it's shared correctly across all three API instances (they all
-- read the same Postgres row instead of each holding their own copy).
CREATE TABLE IF NOT EXISTS routing_config (
  id SMALLINT PRIMARY KEY DEFAULT 1,
  strategy VARCHAR(20) NOT NULL DEFAULT 'round_robin',
  weight_gateway_a INT NOT NULL DEFAULT 50,
  weight_gateway_b INT NOT NULL DEFAULT 50,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT chk_routing_strategy CHECK (strategy IN ('round_robin', 'weighted', 'health_based')),
  CONSTRAINT chk_single_row CHECK (id = 1)
);

INSERT INTO routing_config (id, strategy, weight_gateway_a, weight_gateway_b)
VALUES (1, 'round_robin', 50, 50)
ON CONFLICT (id) DO NOTHING;

-- Every gateway call (not just the final outcome) gets a row here --
-- this is what "record every attempt/failover" and gateway health
-- (success rate, failures, latency, requests) are computed from.
-- Because it lives in Postgres rather than per-process memory, health
-- and routing decisions stay consistent no matter which of the three
-- API instances handles a given request.
CREATE TABLE IF NOT EXISTS gateway_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id UUID NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
  gateway_id VARCHAR(20) NOT NULL,
  outcome VARCHAR(24) NOT NULL,
  error_reason TEXT,
  latency_ms INT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT chk_gateway_id CHECK (gateway_id IN ('gateway_a', 'gateway_b')),
  CONSTRAINT chk_outcome CHECK (outcome IN ('success', 'retryable_failure', 'non_retryable_failure'))
);

CREATE INDEX IF NOT EXISTS idx_gateway_attempts_transaction ON gateway_attempts(transaction_id, created_at);
CREATE INDEX IF NOT EXISTS idx_gateway_attempts_gateway ON gateway_attempts(gateway_id, created_at DESC);

-- Which gateway ultimately handled (or last attempted) the charge --
-- feeds the transaction detail page and the orchestration timeline.
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS gateway_used VARCHAR(20);
