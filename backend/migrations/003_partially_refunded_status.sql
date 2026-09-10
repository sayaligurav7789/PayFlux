-- Adds the 'partially_refunded' status for partial refund support.
--
-- This is deliberately its own migration file containing nothing else:
-- Postgres does not allow a newly-added enum value to be used (e.g. in
-- a CHECK constraint, or as data) within the same transaction that adds
-- it. Since runMigrations.js runs each file as one round trip, keeping
-- this ALTER TYPE alone guarantees it's committed before 004 uses it.
ALTER TYPE transaction_status ADD VALUE IF NOT EXISTS 'partially_refunded';
