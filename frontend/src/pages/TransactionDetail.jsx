import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '../api';
import { StatusBadge } from '../components/StatusBadge';
import { formatAmount, formatTime } from '../utils/format';

const GATEWAY_LABELS = { gateway_a: 'Gateway A', gateway_b: 'Gateway B' };

/**
 * Orchestration events (retries, routing decisions, failovers) are
 * logged as self-transitions (from_status === to_status) so they show
 * up on the same timeline as real state changes without a schema
 * change. This classifies each event so the timeline can visually tell
 * "the payment moved to a new state" apart from "here's what happened
 * while it was getting there".
 */
function classifyEvent(e) {
  const reason = e.reason || '';
  if (e.from_status !== e.to_status) return { kind: 'transition' };
  if (reason.startsWith('Routing decision')) return { kind: 'routing' };
  if (reason.startsWith('Failover triggered')) return { kind: 'failover_triggered' };
  if (reason.startsWith('Failover succeeded')) return { kind: 'failover_succeeded' };
  if (reason.includes('attempt failed')) return { kind: 'attempt_failed' };
  if (reason.includes('attempt succeeded')) return { kind: 'attempt_succeeded' };
  return { kind: 'note' };
}

const DOT_COLOR_BY_KIND = {
  transition: 'var(--status-success)',
  routing: 'var(--text-muted)',
  attempt_failed: 'var(--status-failed)',
  attempt_succeeded: 'var(--status-success)',
  failover_triggered: 'var(--status-partially_refunded)',
  failover_succeeded: 'var(--status-partially_refunded)',
  note: 'var(--text-muted)',
};

const KIND_LABEL = {
  routing: 'routing decision',
  attempt_failed: 'gateway attempt failed',
  attempt_succeeded: 'gateway attempt succeeded',
  failover_triggered: 'failover triggered',
  failover_succeeded: 'failover succeeded',
  note: 'note',
};

export function TransactionDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [txn, setTxn] = useState(null);
  const [events, setEvents] = useState([]);
  const [webhooks, setWebhooks] = useState([]);
  const [error, setError] = useState(null);
  const [refunding, setRefunding] = useState(false);
  const [refundModalOpen, setRefundModalOpen] = useState(false);
  const [refundAmount, setRefundAmount] = useState('');
  const [refundError, setRefundError] = useState(null);

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

  const remainingRefundable = txn ? Number(txn.amount) - Number(txn.refunded_amount || 0) : 0;
  const canRefund = txn && ['success', 'partially_refunded'].includes(txn.status) && remainingRefundable > 0;

  function openRefundModal() {
    setRefundAmount(String(remainingRefundable));
    setRefundError(null);
    setRefundModalOpen(true);
  }

  async function submitRefund() {
    const amountNum = Number(refundAmount);
    if (!Number.isInteger(amountNum) || amountNum <= 0) {
      setRefundError('Enter a positive whole number.');
      return;
    }
    if (amountNum > remainingRefundable) {
      setRefundError(`Only ${remainingRefundable} is left to refund.`);
      return;
    }
    setRefunding(true);
    setRefundError(null);
    try {
      await api.refund(id, { amount: amountNum, reason: 'requested_from_dashboard' });
      setRefundModalOpen(false);
      load();
    } catch (err) {
      setRefundError(err.message);
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
              <span className="meta-label">Gateway used</span>
              <span className="meta-value">{txn.gateway_used ? GATEWAY_LABELS[txn.gateway_used] || txn.gateway_used : '—'}</span>
            </div>
            {Number(txn.refunded_amount) > 0 && (
              <>
                <div className="meta-item">
                  <span className="meta-label">Refunded</span>
                  <span className="meta-value">{formatAmount(txn.refunded_amount, txn.currency)}</span>
                </div>
                <div className="meta-item">
                  <span className="meta-label">Remaining refundable</span>
                  <span className="meta-value">{formatAmount(remainingRefundable, txn.currency)}</span>
                </div>
              </>
            )}
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
        {canRefund && (
          <button className="btn" onClick={openRefundModal} disabled={refunding}>
            Refund
          </button>
        )}
      </div>

      {refundModalOpen && (
        <div className="modal-backdrop" onClick={() => !refunding && setRefundModalOpen(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-title">Refund transaction</div>
            <div className="field">
              <label>Amount to refund (of {formatAmount(remainingRefundable, txn.currency)} remaining)</label>
              <input
                type="number"
                min="1"
                max={remainingRefundable}
                value={refundAmount}
                onChange={(e) => setRefundAmount(e.target.value)}
              />
            </div>
            {refundError && <div className="error-banner">{refundError}</div>}
            <div className="modal-actions">
              <button className="btn" onClick={() => setRefundModalOpen(false)} disabled={refunding}>
                Cancel
              </button>
              <button className="btn btn-primary" onClick={submitRefund} disabled={refunding}>
                {refunding
                  ? 'Refunding…'
                  : Number(refundAmount) === remainingRefundable
                  ? 'Refund in full'
                  : 'Refund partial amount'}
              </button>
            </div>
          </div>
        </div>
      )}

      <h2 className="section-heading">Orchestration &amp; state timeline</h2>
      <div className="timeline">
        {events.map((e) => {
          const { kind } = classifyEvent(e);
          return (
            <div className="timeline-item" key={e.id}>
              <div className="timeline-dot" style={{ borderColor: DOT_COLOR_BY_KIND[kind] }} />
              <div className="timeline-row">
                <span className="mono" style={{ fontSize: 13 }}>
                  {kind === 'transition'
                    ? e.from_status
                      ? `${e.from_status} → ${e.to_status}`
                      : `created as ${e.to_status}`
                    : KIND_LABEL[kind] || e.to_status}
                </span>
                <span className="timeline-time">{formatTime(e.created_at)}</span>
              </div>
              {e.reason && <div className="timeline-reason">{e.reason}</div>}
            </div>
          );
        })}
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
