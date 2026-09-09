import { useState } from 'react';
import { api } from '../api';

function randomKey() {
  return `demo-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function IdempotencyDemo() {
  const [amount, setAmount] = useState('5000');
  const [idempotencyKey, setIdempotencyKey] = useState(randomKey());
  const [requestCount, setRequestCount] = useState('10');
  const [running, setRunning] = useState(false);
  const [results, setResults] = useState(null);
  const [fieldError, setFieldError] = useState(null);

  async function runDemo() {
    setFieldError(null);

    const amountNum = Number(amount);
    const countNum = Number(requestCount);

    if (!Number.isInteger(amountNum) || amountNum <= 0) {
      setFieldError('Amount must be a positive whole number (smallest currency unit).');
      return;
    }
    if (!idempotencyKey.trim()) {
      setFieldError('Idempotency key is required.');
      return;
    }
    if (!Number.isInteger(countNum) || countNum < 2 || countNum > 30) {
      setFieldError('Request count must be a whole number between 2 and 30.');
      return;
    }

    setRunning(true);
    setResults(null);

    const attempts = Array.from({ length: countNum }, () =>
      api
        .createTransaction({ amount: amountNum, currency: 'INR', idempotencyKey })
        .then((data) => ({ ok: true, status: 201, transactionId: data.transaction.id }))
        .catch((err) => ({ ok: false, message: err.message }))
    );

    const outcomes = await Promise.all(attempts);
    const uniqueIds = new Set(
      outcomes.filter((o) => o.ok && o.transactionId).map((o) => o.transactionId)
    );

    setResults({ outcomes, uniqueIds: Array.from(uniqueIds) });
    setRunning(false);
  }

  return (
    <div className="main">
      <h1 className="page-title">Idempotency demo</h1>
      <p className="page-subtitle">
        Fire multiple concurrent requests with the same idempotency key. Exactly one transaction
        should be created, no matter how many requests race for it.
      </p>

      <div className="panel" style={{ maxWidth: 480 }}>
        <div className="field">
          <label>Amount (smallest currency unit)</label>
          <input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </div>
        <div className="field">
          <label>Idempotency key</label>
          <input
            type="text"
            value={idempotencyKey}
            onChange={(e) => setIdempotencyKey(e.target.value)}
          />
        </div>
        <div className="field">
          <label>Concurrent requests to fire</label>
          <input
            type="number"
            value={requestCount}
            onChange={(e) => setRequestCount(e.target.value)}
          />
        </div>

        {fieldError && <div className="error-banner">{fieldError}</div>}

        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-primary" onClick={runDemo} disabled={running}>
            {running ? 'Firing requests…' : `Fire ${requestCount} concurrent requests`}
          </button>
          <button
            className="btn"
            onClick={() => setIdempotencyKey(randomKey())}
            disabled={running}
          >
            New key
          </button>
        </div>
      </div>

      {results && (
        <>
          <h2 className="section-heading">Result</h2>
          <div className="panel" style={{ maxWidth: 480, marginBottom: 20 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
              <span style={{ color: 'var(--text-secondary)' }}>Requests fired</span>
              <span className="mono">{results.outcomes.length}</span>
            </div>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                fontSize: 13,
                marginTop: 8,
              }}
            >
              <span style={{ color: 'var(--text-secondary)' }}>Distinct transactions created</span>
              <span
                className="mono"
                style={{
                  color:
                    results.uniqueIds.length === 1
                      ? 'var(--status-success)'
                      : 'var(--status-failed)',
                  fontWeight: 500,
                }}
              >
                {results.uniqueIds.length}
              </span>
            </div>
            {results.uniqueIds.length === 1 && (
              <div
                style={{
                  marginTop: 12,
                  fontSize: 12,
                  color: 'var(--status-success)',
                }}
              >
                ✓ Idempotency held — every request resolved to the same transaction.
              </div>
            )}
          </div>

          <div className="result-grid">
            {results.outcomes.map((o, i) => (
              <div className="result-cell" key={i}>
                <span style={{ color: 'var(--text-muted)' }}>#{i + 1}</span>
                <span
                  style={{
                    color: o.ok ? 'var(--status-success)' : 'var(--status-pending)',
                  }}
                >
                  {o.ok ? `created (${o.transactionId.slice(0, 8)}…)` : o.message}
                </span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
