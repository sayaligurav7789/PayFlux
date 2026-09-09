import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '../api';
import { StatusBadge } from '../components/StatusBadge';
import { formatAmount, formatTime } from '../utils/format';

export function TransactionDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [txn, setTxn] = useState(null);
  const [events, setEvents] = useState([]);
  const [webhooks, setWebhooks] = useState([]);
  const [error, setError] = useState(null);
  const [refunding, setRefunding] = useState(false);

  function load() {
    Promise.all([api.getTransaction(id), api.getEvents(id), api.getWebhooks(id)])
      .then(([t, e, w]) => {
        setTxn(t.transaction);
        setEvents(e.events);
        setWebhooks(w.webhooks);
      })
      .catch((err) => setError(err.message));
  }

  useEffect(load, [id]);

  async function handleRefund() {
    setRefunding(true);
    try {
      await api.refund(id, 'requested_from_dashboard');
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setRefunding(false);
    }
  }

  if (error) {
    return (
      <div className="main">
        <div className="error-banner">{error}</div>
      </div>
    );
  }

  if (!txn) {
    return (
      <div className="main">
        <div className="loading-state">Loading…</div>
      </div>
    );
  }

  return (
    <div className="main">
      <span
        onClick={() => navigate('/app')}
        style={{ color: 'var(--text-muted)', fontSize: 12, cursor: 'pointer' }}
      >
        ← Back to transactions
      </span>

      <div className="detail-header" style={{ marginTop: 16 }}>
        <div>
          <h1 className="page-title mono" style={{ fontSize: 15 }}>
            {txn.id}
          </h1>
          <div style={{ marginTop: 8 }}>
            <StatusBadge status={txn.status} />
          </div>
          <div className="detail-meta">
            <div className="meta-item">
              <span className="meta-label">Amount</span>
              <span className="meta-value">{formatAmount(txn.amount, txn.currency)}</span>
            </div>
            <div className="meta-item">
              <span className="meta-label">Retry count</span>
              <span className="meta-value">{txn.retry_count}</span>
            </div>
            <div className="meta-item">
              <span className="meta-label">Gateway reference</span>
              <span className="meta-value">{txn.gateway_reference || '—'}</span>
            </div>
            <div className="meta-item">
              <span className="meta-label">Idempotency key</span>
              <span className="meta-value">{txn.idempotency_key}</span>
            </div>
            <div className="meta-item">
              <span className="meta-label">Created</span>
              <span className="meta-value">{formatTime(txn.created_at)}</span>
            </div>
            <div className="meta-item">
              <span className="meta-label">Last updated</span>
              <span className="meta-value">{formatTime(txn.updated_at)}</span>
            </div>
          </div>
        </div>
        {txn.status === 'success' && (
          <button className="btn" onClick={handleRefund} disabled={refunding}>
            {refunding ? 'Refunding…' : 'Refund'}
          </button>
        )}
      </div>

      <h2 className="section-heading">State timeline</h2>
      <div className="timeline">
        {events.map((e) => (
          <div className="timeline-item" key={e.id}>
            <div className="timeline-dot" />
            <div className="timeline-row">
              <span className="mono" style={{ fontSize: 13 }}>
                {e.from_status ? `${e.from_status} → ${e.to_status}` : `created as ${e.to_status}`}
              </span>
              <span className="timeline-time">{formatTime(e.created_at)}</span>
            </div>
            {e.reason && <div className="timeline-reason">{e.reason}</div>}
          </div>
        ))}
      </div>

      <h2 className="section-heading">Webhook deliveries</h2>
      {webhooks.length === 0 ? (
        <div className="empty-state" style={{ padding: '24px 0' }}>
          No webhooks dispatched for this transaction yet.
        </div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Delivery status</th>
                <th style={{ textAlign: 'right' }}>Attempts</th>
                <th>Last attempted</th>
                <th>Signature</th>
              </tr>
            </thead>
            <tbody>
              {webhooks.map((w) => (
                <tr key={w.id} style={{ cursor: 'default' }}>
                  <td>
                    <span
                      className={`badge badge-${w.delivery_status === 'delivered' ? 'success' : w.delivery_status === 'failed' ? 'failed' : 'pending'}`}
                    >
                      {w.delivery_status}
                    </span>
                  </td>
                  <td className="amount">{w.attempt_count}</td>
                  <td className="mono" style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                    {formatTime(w.last_attempted_at)}
                  </td>
                  <td className="txn-id" style={{ maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {w.signature.slice(0, 16)}…
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
