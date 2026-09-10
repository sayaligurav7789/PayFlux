# Payment Orchestration & Transaction Processing Platform

A backend + dashboard project demonstrating production-grade skills relevant to
payments/fintech roles: idempotency, guarded state machines, multi-gateway
routing with automatic failover, retry logic, webhook security, partial
refunds, and reliability under failure.

## Architecture

```
Client / Dashboard (React)
     |
     v
[Nginx load balancer :8080] -- round-robins across 3 API instances
     |            |            |
     v            v            v
[Express API-1] [Express API-2] [Express API-3]  -- Auth (API key) -- Rate limit (Redis)
     |
     v
[Transaction Service] -- Idempotency check (Redis) -- Guarded state machine
     |
     +--> [PostgreSQL] (transactions, transaction_events, webhooks,
     |                   gateway_attempts, routing_config)
     |
     +--> [Routing Engine] -- round robin / weighted / health-based
     |         |
     |         v
     |   [Gateway A] <--- automatic failover ---> [Gateway B]
     |     (both mock gateways behind the same charge() interface,
     |      retried with exponential backoff before failing over)
     |
     +--> [Webhook dispatcher] --> HMAC-signed --> merchant callback
```

See `backend/migrations/*.sql` for the full data model, and
`backend/src/services/stateMachine.js` for the transaction lifecycle.

Because there are three API instances behind Nginx, anything that needs to
stay consistent no matter which instance handles a request -- routing
config, gateway health, the round-robin counter -- lives in Postgres or
Redis, never in per-process memory.

## Feature overview

- **Idempotency** -- dual-layer (Redis lock + Postgres unique constraint) so
  concurrent identical requests create exactly one transaction.
- **Guarded state machine** -- `initiated → pending → success/failed`, plus
  `success/partially_refunded → refunded`. Illegal transitions throw instead
  of silently mutating state.
- **Two mock payment gateways** ("Gateway A" and "Gateway B") behind one
  shared interface -- `charge({amount, currency}) → {gatewayReference}`,
  throwing a retryable or non-retryable error on failure.
- **Routing engine** -- decides which gateway handles a charge, via one of
  three backend-driven strategies: round robin, weighted, or health-based.
  Configurable live from the dashboard's Routing page.
- **Automatic failover** -- if the routed gateway keeps failing after
  retrying with backoff, the request automatically switches to the other
  gateway. Business declines (e.g. insufficient funds) don't trigger a
  failover -- only retryable/technical failures do. Idempotency and the
  transaction's single DB row are preserved throughout; every attempt and
  the failover itself are recorded in `transaction_events`.
- **Gateway health** -- success rate, failures, latency, request volume, and
  failover count per gateway, computed from Postgres so it's consistent
  across all three API instances. Feeds both the dashboards and
  health-based routing.
- **Partial refunds** -- refund any amount up to what's left; the
  transaction moves to `partially_refunded` until the full balance is
  refunded, at which point it settles to `refunded`. Over-refunding is
  rejected.
- **Webhooks** -- HMAC-signed dispatch with retries, plus a verifying mock
  receiver.
- **Dashboard** -- transactions, per-transaction orchestration timeline,
  analytics, webhook delivery log, routing configuration + live gateway
  health, and system health (Nginx/Redis/Postgres/both gateways/each API
  instance).

## Why these design choices

- **Postgres over MongoDB**: transactions, their audit events, webhook logs,
  and gateway attempts are relationally linked (foreign keys), and money
  math benefits from a DB-enforced `UNIQUE(merchant_id, idempotency_key)`
  constraint as a hard backstop against duplicate charges -- not just an
  application-level check.
- **Dual-layer idempotency**: Redis gives you speed (sub-millisecond lock
  check), Postgres gives you correctness (the constraint holds even if
  Redis has a brief blip). Neither layer alone is sufficient.
- **Separate `transaction_events` table, not a JSON history column**: every
  state transition -- and every gateway attempt/failover, logged as a
  same-status "note" event -- is written to the same audit table, so the
  per-transaction timeline is always complete and truthful.
- **Routing/health state in Postgres+Redis, not process memory**: with
  three API instances behind Nginx, an in-memory routing counter or health
  score would only be true for whichever instance happened to answer a
  given dashboard request. Shared storage keeps routing decisions and the
  dashboard consistent regardless of load balancing.
- **Amounts stored as `BIGINT`** in the smallest currency unit
  (paise/cents), never as float -- avoids floating-point rounding error
  compounding across many transactions, including across partial refunds.

## Local setup

### Option A: Docker Compose (recommended)

```bash
docker-compose up --build
```

This starts Postgres, Redis, three API instances, Nginx, and the frontend
together. Then run migrations once the containers are healthy:

```bash
docker-compose exec api1 npm run migrate
```

The API is now live at `http://localhost:8080` (via Nginx), and the
dashboard at whatever port the frontend service exposes (see
`docker-compose.yml`). A dev merchant is seeded automatically with API key
`dev_test_key_123`.

### Option B: Run locally without Docker

You'll need Postgres and Redis running locally (or via
`docker-compose up postgres redis`).

```bash
cd backend
cp .env.example .env      # edit DATABASE_URL / REDIS_URL if needed
npm install
npm run migrate
npm run dev
```

```bash
cd frontend
npm install
npm run dev                # proxies /api/* to the backend
```

## Try it

```bash
curl -X POST http://localhost:4000/transactions \
  -H "X-API-Key: dev_test_key_123" \
  -H "Idempotency-Key: my-first-request" \
  -H "Content-Type: application/json" \
  -d '{"amount": 5000, "currency": "INR"}'
```

`amount` is in the smallest currency unit -- `5000` = ₹50.00. The response
includes `gateway_used` (`gateway_a` or `gateway_b`) and `refunded_amount`.

### The idempotency demo

```bash
cd backend
chmod +x demo-idempotency.sh
./demo-idempotency.sh
```

Fires 10 concurrent identical requests and shows that only one transaction
ID comes back across all of them.

### The failover demo (the most important one)

```bash
cd backend
chmod +x demo-failover.sh
./demo-failover.sh
```

Forces Gateway A to fail, pins routing to it, creates a transaction, and
prints the resulting orchestration timeline -- retry, retry, failover,
success on Gateway B -- straight from `transaction_events`. You can also
drive this manually from the dashboard's Routing page ("Demo controls"
section), which exposes the same force-failure toggle.

## Running tests

```bash
cd backend
npm test
```

Requires Postgres + Redis reachable via `DATABASE_URL`/`REDIS_URL`
(migrations applied). Suites:

- `stateMachine.test.js` -- guarded transitions, unchanged from before this
  round of features.
- `partialRefundStateMachine.test.js` -- the transitions added for partial
  refunds, kept in a separate file so the original suite above stays
  untouched.
- `idempotency.test.js` -- fires 10 concurrent requests against a real
  Postgres+Redis and asserts exactly one transaction row exists afterward.
- `routing.test.js` -- round robin alternation, weighted bias, config
  validation.
- `failover.test.js` -- the critical scenario (Gateway A fails → retries →
  fails over to Gateway B → success), both-gateways-fail, and idempotency
  preserved across a failover.
- `partialRefund.test.js` -- partial → partial → full settlement,
  over-refund rejection, refunding with no amount specified.

## API reference

| Method | Endpoint | Purpose |
|---|---|---|
| POST | `/transactions` | Create transaction (idempotent, requires `Idempotency-Key` header). Routes to a gateway, retries, and fails over automatically. |
| GET | `/transactions` | List/filter by `?status=` |
| GET | `/transactions/:id` | Fetch current state |
| GET | `/transactions/:id/events` | Full audit trail, including gateway attempts and failovers |
| GET | `/transactions/:id/webhooks` | Webhook delivery log |
| POST | `/transactions/:id/refund` | Refund (full or partial -- pass `{ "amount": <int> }`; omit to refund what remains) |
| GET | `/routing/config` | Current routing strategy + weights |
| PUT | `/routing/config` | Update strategy (`round_robin` / `weighted` / `health_based`) and weights |
| GET | `/routing/health` | Per-gateway success rate, failures, latency, requests, failovers |
| POST | `/routing/simulate/:gatewayId/force-failure` | Demo/testing helper: force a gateway to always fail |
| POST | `/mock-merchant/webhook` | Simulated receiving merchant (signature-verified) |

All routes above (except the mock merchant webhook receiver) require an
`X-API-Key` header.

## What's built vs. what's out of scope

**Built:**
- Guarded finite-state-machine with full unit test coverage, including
  partial refunds
- Dual-layer idempotency (Redis + Postgres) with a concurrency test,
  preserved across gateway failover
- Two mock gateways behind a shared interface, a backend-driven routing
  engine (round robin / weighted / health-based), and automatic failover
  with full audit logging
- Per-gateway health tracking (success rate, failures, latency, requests,
  failovers), shared correctly across all API instances
- Partial refunds with over-refund protection
- Exponential-backoff retry, distinguishing retryable vs non-retryable
  gateway errors
- HMAC-signed webhook dispatch + a verifying receiver
- Rate limiting, graceful shutdown, structured logging
- Dashboard: transactions, orchestration timeline, analytics, webhooks,
  routing configuration, system health

**Deliberately out of scope** (see project spec):
- Real Razorpay/Stripe/etc. integrations
- AI/ML or fraud detection
- FX / multi-currency conversion
- Reconciliation tooling
- BullMQ-backed async queue (currently a synchronous retry wrapper --
  swap in when you want to decouple gateway latency from the API response)
- Circuit breaker around the mock gateways

## Project structure

```
backend/
  migrations/
    001_init.sql                  -- core schema
    002_gateway_routing.sql       -- routing_config, gateway_attempts
    003_partially_refunded_status.sql
    004_partial_refunds.sql       -- refunded_amount tracking
  src/
    config/db.js                  -- Postgres pool + withTransaction helper
    config/redis.js
    services/
      stateMachine.js             -- guarded transitions (incl. partial refunds)
      idempotencyService.js       -- Redis lock/cache layer
      transactionService.js       -- DB writes, audit logging, refunds
      mockGateway.js              -- Gateway A
      mockGatewayB.js             -- Gateway B (same interface)
      gatewayRegistry.js          -- id -> gateway module lookup
      routingService.js           -- round robin / weighted / health-based
      gatewayHealthService.js     -- per-gateway health aggregation
      paymentOrchestrationService.js -- retry + automatic failover
      webhookService.js           -- HMAC signing, verification, dispatch
    middleware/
      auth.js                     -- API key lookup
      rateLimiter.js               -- Redis-backed rate limit
    routes/
      transactions.js             -- main API surface
      routing.js                  -- routing config + gateway health + demo controls
      mockMerchant.js             -- receiving-side webhook demo
    utils/retry.js                -- exponential backoff helper
    __tests__/
      stateMachine.test.js
      partialRefundStateMachine.test.js
      idempotency.test.js
      routing.test.js
      failover.test.js
      partialRefund.test.js
  demo-idempotency.sh
  demo-failover.sh
frontend/
  src/
    pages/
      TransactionList.jsx, TransactionDetail.jsx, Analytics.jsx,
      WebhookLog.jsx, IdempotencyDemo.jsx, SystemHealth.jsx, Routing.jsx
    components/, context/, api.js
docker-compose.yml
```
