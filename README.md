# Payment Orchestration & Transaction Processing API

A backend project demonstrating production-grade skills relevant to payments/fintech roles:
idempotency, guarded state machines, retry logic, webhook security, and reliability under failure.

## Architecture

```
Client / Dashboard
     |
     v
[Express API] -- Auth (API key) -- Rate limit (Redis)
     |
     v
[Transaction Service] -- Idempotency check (Redis) -- Guarded state machine
     |
     +--> [PostgreSQL] (transactions, transaction_events, webhooks)
     |
     +--> [Mock payment gateway] (retried with exponential backoff)
     |
     +--> [Webhook dispatcher] --> HMAC-signed --> merchant callback
```

See `backend/migrations/001_init.sql` for the full data model, and
`backend/src/services/stateMachine.js` for the transaction lifecycle.

## Why these design choices

- **Postgres over MongoDB**: transactions, their audit events, and webhook logs are
  relationally linked (foreign keys), and money math benefits from a
  DB-enforced `UNIQUE(merchant_id, idempotency_key)` constraint as a
  hard backstop against duplicate charges -- not just an application-level check.
- **Dual-layer idempotency**: Redis gives you speed (sub-millisecond lock
  check), Postgres gives you correctness (the constraint holds even if
  Redis has a brief blip). Neither layer alone is sufficient.
- **Separate `transaction_events` table, not a JSON history column**:
  every state transition is written in the same DB transaction as the
  status update, so the two can never disagree. This is what makes it a
  real audit log rather than just a mutable status field.
- **Amounts stored as `BIGINT`** in the smallest currency unit (paise/cents),
  never as float -- avoids floating-point rounding error compounding across
  many transactions.

## Local setup

### Option A: Docker Compose (recommended)

```bash
docker-compose up --build
```

This starts Postgres, Redis, and the API together. Then run migrations
once the containers are healthy:

```bash
docker-compose exec api npm run migrate
```

The API is now live at `http://localhost:4000`. A dev merchant is
seeded automatically with API key `dev_test_key_123`.

### Option B: Run locally without Docker

You'll need Postgres and Redis running locally (or via `docker-compose up postgres redis`).

```bash
cd backend
cp .env.example .env      # edit DATABASE_URL / REDIS_URL if needed
npm install
npm run migrate
npm run dev
```

## Try it

```bash
curl -X POST http://localhost:4000/transactions \
  -H "X-API-Key: dev_test_key_123" \
  -H "Idempotency-Key: my-first-request" \
  -H "Content-Type: application/json" \
  -d '{"amount": 5000, "currency": "INR"}'
```

`amount` is in the smallest currency unit -- `5000` = ₹50.00.

### The idempotency demo

```bash
cd backend
chmod +x demo-idempotency.sh
./demo-idempotency.sh
```

Fires 10 concurrent identical requests and shows that only one
transaction ID comes back across all of them. This is the single most
convincing thing to demo in an interview.

## Running tests

```bash
cd backend
npm test
```

`src/__tests__/idempotency.test.js` is the one that matters most: it
fires 10 concurrent requests against a real Postgres+Redis and asserts
exactly one transaction row exists afterward.

## API reference

| Method | Endpoint | Purpose |
|---|---|---|
| POST | `/transactions` | Create transaction (idempotent, requires `Idempotency-Key` header) |
| GET | `/transactions` | List/filter by `?status=` |
| GET | `/transactions/:id` | Fetch current state |
| GET | `/transactions/:id/events` | Full audit trail |
| GET | `/transactions/:id/webhooks` | Webhook delivery log |
| POST | `/transactions/:id/refund` | Trigger refund |
| POST | `/mock-merchant/webhook` | Simulated receiving merchant (signature-verified) |

All `/transactions` routes require an `X-API-Key` header.

## What's built vs. what's stretch

**Built (core):**
- Guarded finite-state-machine with full unit test coverage
- Dual-layer idempotency (Redis + Postgres) with a concurrency test
- Exponential-backoff retry, distinguishing retryable vs non-retryable gateway errors
- HMAC-signed webhook dispatch + a verifying receiver
- Rate limiting, graceful shutdown, structured logging

**Not yet built (see project spec for scope):**
- BullMQ-backed async queue (currently a synchronous retry wrapper --
  swap in when you want to decouple gateway latency from the API response)
- Circuit breaker around the mock gateway
- Admin/observability dashboard frontend (Next.js)

## Project structure

```
backend/
  migrations/001_init.sql       -- schema
  src/
    config/db.js                -- Postgres pool + withTransaction helper
    config/redis.js
    services/
      stateMachine.js           -- guarded transitions
      idempotencyService.js     -- Redis lock/cache layer
      transactionService.js     -- DB writes, audit logging
      mockGateway.js            -- simulated external gateway
      webhookService.js         -- HMAC signing, verification, dispatch
    middleware/
      auth.js                   -- API key lookup
      rateLimiter.js             -- Redis-backed rate limit
    routes/
      transactions.js           -- main API surface
      mockMerchant.js           -- receiving-side webhook demo
    utils/retry.js              -- exponential backoff helper
    __tests__/
      stateMachine.test.js
      idempotency.test.js       -- the concurrency test
  demo-idempotency.sh
docker-compose.yml
```
