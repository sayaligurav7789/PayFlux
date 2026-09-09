import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';
import { formatTime, truncateId } from '../utils/format';

export function WebhookLog() {
  const [webhooks, setWebhooks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    api
      .listAllWebhooks()
      .then((data) => setWebhooks(data.webhooks))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="main">
      <h1 className="page-title">Webhooks</h1>
      <p className="page-subtitle">
        Every HMAC-signed delivery attempt, across all transactions.
      </p>

      {error && <div className="error-banner">{error}</div>}

      {loading ? (
        <div className="loading-state">Loading webhooks…</div>
      ) : webhooks.length === 0 ? (
        <div className="empty-state">No webhook deliveries yet.</div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Transaction</th>
                <th>Delivery status</th>
                <th style={{ textAlign: 'right' }}>Attempts</th>
                <th>Last attempted</th>
              </tr>
            </thead>
            <tbody>
              {webhooks.map((w) => (
                <tr key={w.id} onClick={() => navigate(`/app/transactions/${w.transaction_id}`)}>
                  <td className="txn-id">{truncateId(w.transaction_id)}</td>
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
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
