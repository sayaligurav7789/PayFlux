-- Partial refund bookkeeping: how much of a transaction has been
-- refunded so far, so the remaining refundable balance can be computed
-- as (amount - refunded_amount) and over-refunding can be rejected.
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS refunded_amount BIGINT NOT NULL DEFAULT 0;

ALTER TABLE transactions DROP CONSTRAINT IF EXISTS chk_refunded_amount_bounds;
ALTER TABLE transactions ADD CONSTRAINT chk_refunded_amount_bounds
  CHECK (refunded_amount >= 0 AND refunded_amount <= amount);
