import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';
import { StatusBadge } from '../components/StatusBadge';
import { formatAmount, formatTime, truncateId } from '../utils/format';

const STATUSES = ['initiated', 'pending', 'success', 'failed', 'refunded'];
const PAGE_SIZE = 10;

function randomKey() {
  return `manual-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function TransactionList() {
  const [transactions, setTransactions] = useState([]);
  const [total, setTotal] = useState(0);
  const [filter, setFilter] = useState(null);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const navigate = useNavigate();

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    api
      .listTransactions({ status: filter, search: search || undefined, limit: PAGE_SIZE, offset: page * PAGE_SIZE })
      .then((data) => {
        setTransactions(data.transactions);
        setTotal(data.total ?? data.transactions.length);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [filter, search, page]);

  useEffect(load, [load]);

  // Auto-refresh: re-poll every 5s while enabled. Cleared on unmount or toggle-off.
  useEffect(() => {
    if (!autoRefresh) return;
    const id = setInterval(load, 5000);
    return () => clearInterval(id);
  }, [autoRefresh, load]);

  const stats = {
    total,
    success: transactions.filter((t) => t.status === 'success').length,
    failed: transactions.filter((t) => t.status === 'failed').length,
    avgRetries: transactions.length
      ? (transactions.reduce((sum, t) => sum + t.retry_count, 0) / transactions.length).toFixed(1)
      : '0',
  };

  const totalPages = Math.max(Math.ceil(total / PAGE_SIZE), 1);

  return (
    <div className="main">
      <div className="toolbar-row" style={{ marginBottom: 4 }}>
        <div>
          <h1 className="page-title">Transactions</h1>
          <p className="page-subtitle" style={{ marginBottom: 0 }}>
            All payment transactions for this merchant.
          </p>
        </div>
        <button className="btn btn-primary" onClick={() => setShowCreate(true)}>
          + New transaction
        </button>
      </div>

      <div className="summary-strip" style={{ marginTop: 20 }}>
        <div className="summary-stat">
          <div className="summary-stat-value">{stats.total}</div>
          <div className="summary-stat-label">Total</div>
        </div>
        <div className="summary-stat">
          <div className="summary-stat-value" style={{ color: 'var(--status-success)' }}>
            {stats.success}
          </div>
          <div className="summary-stat-label">Succeeded (this page)</div>
        </div>
        <div className="summary-stat">
          <div className="summary-stat-value" style={{ color: 'var(--status-failed)' }}>
            {stats.failed}
          </div>
          <div className="summary-stat-label">Failed (this page)</div>
        </div>
        <div className="summary-stat">
          <div className="summary-stat-value">{stats.avgRetries}</div>
          <div className="summary-stat-label">Avg retries (this page)</div>
        </div>
      </div>

      <div className="toolbar-row">
        <div className="filter-row" style={{ marginBottom: 0 }}>
          <span
            className={`filter-pill${filter === null ? ' active' : ''}`}
            onClick={() => {
              setFilter(null);
              setPage(0);
            }}
          >
            All
          </span>
          {STATUSES.map((s) => (
            <span
              key={s}
              className={`filter-pill${filter === s ? ' active' : ''}`}
              onClick={() => {
                setFilter(s);
                setPage(0);
              }}
            >
              {s}
            </span>
          ))}
        </div>
        <div className="toggle-row">
          Auto-refresh
          <div
            className={`toggle${autoRefresh ? ' on' : ''}`}
            onClick={() => setAutoRefresh((v) => !v)}
          >
            <div className="toggle-knob" />
          </div>
        </div>
      </div>

      <div className="search-input-wrap" style={{ marginBottom: 16 }}>
        <input
          type="text"
          placeholder="Search by transaction ID or idempotency key…"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(0);
          }}
        />
      </div>

      {error && <div className="error-banner">{error}</div>}

      {loading ? (
        <div className="loading-state">Loading transactions…</div>
      ) : transactions.length === 0 ? (
        <div className="empty-state">
          No transactions match. Try clearing filters, or create one above.
        </div>
      ) : (
        <>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Status</th>
                  <th style={{ textAlign: 'right' }}>Amount</th>
                  <th style={{ textAlign: 'right' }}>Retries</th>
                  <th>Created</th>
                </tr>
              </thead>
              <tbody>
                {transactions.map((t) => (
                  <tr key={t.id} onClick={() => navigate(`/app/transactions/${t.id}`)}>
                    <td className="txn-id">{truncateId(t.id)}</td>
                    <td>
                      <StatusBadge status={t.status} />
                    </td>
                    <td className="amount">{formatAmount(t.amount, t.currency)}</td>
                    <td className="amount">{t.retry_count}</td>
                    <td className="mono" style={{ color: 'var(--text-secondary)', fontSize: 12 }}>
                      {formatTime(t.created_at)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="pagination-row">
            <span>
              Page {page + 1} of {totalPages} · {total} total
            </span>
            <div className="pagination-controls">
              <button
                className="btn btn-sm"
                onClick={() => setPage((p) => Math.max(p - 1, 0))}
                disabled={page === 0}
              >
                ← Prev
              </button>
              <button
                className="btn btn-sm"
                onClick={() => setPage((p) => Math.min(p + 1, totalPages - 1))}
                disabled={page >= totalPages - 1}
              >
                Next →
              </button>
            </div>
          </div>
        </>
      )}

      {showCreate && (
        <CreateModal
          onClose={() => setShowCreate(false)}
          onCreated={(id) => {
            setShowCreate(false);
            load();
            navigate(`/app/transactions/${id}`);
          }}
        />
      )}
    </div>
  );
}

function CreateModal({ onClose, onCreated }) {
  const [amount, setAmount] = useState('2500');
  const [creating, setCreating] = useState(false);
  const [fieldError, setFieldError] = useState(null);

  async function handleCreate() {
    const amountNum = Number(amount);
    if (!Number.isInteger(amountNum) || amountNum <= 0) {
      setFieldError('Amount must be a positive whole number (smallest currency unit).');
      return;
    }
    setFieldError(null);
    setCreating(true);
    try {
      const data = await api.createTransaction({
        amount: amountNum,
        currency: 'INR',
        idempotencyKey: randomKey(),
      });
      onCreated(data.transaction.id);
    } catch (err) {
      setFieldError(err.message);
      setCreating(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-title">Create transaction</div>
        <div className="field">
          <label>Amount (smallest currency unit, e.g. paise)</label>
          <input
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            autoFocus
          />
        </div>
        {fieldError && <div className="error-banner">{fieldError}</div>}
        <div className="modal-actions">
          <button className="btn" onClick={onClose} disabled={creating}>
            Cancel
          </button>
          <button className="btn btn-primary" onClick={handleCreate} disabled={creating}>
            {creating ? 'Creating…' : 'Create'}
          </button>
        </div>
      </div>
    </div>
  );
}
