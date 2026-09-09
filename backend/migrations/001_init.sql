-- Payment Orchestration schema
-- Run with: npm run migrate

CREATE EXTENSION IF NOT EXISTS "pgcrypto"; -- for gen_random_uuid()

CREATE TYPE transaction_status AS ENUM (
  'initiated', 'pending', 'success', 'failed', 'refunded'
);

CREATE TYPE webhook_delivery_status AS ENUM (
  'pending', 'delivered', 'failed'
);

CREATE TABLE merchants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  api_key VARCHAR(255) UNIQUE NOT NULL,
  webhook_secret VARCHAR(255) NOT NULL,
  webhook_url VARCHAR(500),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  idempotency_key VARCHAR(255) NOT NULL,
  merchant_id UUID NOT NULL REFERENCES merchants(id),
  amount BIGINT NOT NULL CHECK (amount > 0), -- smallest currency unit, never float
  currency VARCHAR(3) NOT NULL DEFAULT 'INR',
  status transaction_status NOT NULL DEFAULT 'initiated',
  gateway_reference VARCHAR(255),
  retry_count INT NOT NULL DEFAULT 0,
  failure_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- The DB-level backstop: even if Redis somehow lets two identical
  -- requests through, this constraint makes a duplicate insert impossible.
  -- Scoped per-merchant since two different merchants could coincidentally
  -- pick the same idempotency key string.
  CONSTRAINT uq_merchant_idempotency UNIQUE (merchant_id, idempotency_key)
);

CREATE INDEX idx_transactions_merchant_status ON transactions(merchant_id, status);
CREATE INDEX idx_transactions_created_at ON transactions(created_at DESC);

CREATE TABLE transaction_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id UUID NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
  from_status transaction_status,
  to_status transaction_status NOT NULL,
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_events_transaction_id ON transaction_events(transaction_id, created_at);

CREATE TABLE webhooks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id UUID NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
  payload JSONB NOT NULL,
  signature VARCHAR(255) NOT NULL,
  delivery_status webhook_delivery_status NOT NULL DEFAULT 'pending',
  attempt_count INT NOT NULL DEFAULT 0,
  last_attempted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_webhooks_transaction_id ON webhooks(transaction_id);
CREATE INDEX idx_webhooks_delivery_status ON webhooks(delivery_status);

-- updated_at auto-touch
CREATE OR REPLACE FUNCTION touch_updated_at() RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_transactions_updated_at
  BEFORE UPDATE ON transactions
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

-- Seed one dev merchant so you can hit the API immediately.
-- api_key: dev_test_key_123 (change before doing anything real with this)
INSERT INTO merchants (name, api_key, webhook_secret, webhook_url)
VALUES (
  'Dev Merchant',
  'dev_test_key_123',
  'dev_webhook_secret_change_me',
  'http://localhost:4000/mock-merchant/webhook'
);
