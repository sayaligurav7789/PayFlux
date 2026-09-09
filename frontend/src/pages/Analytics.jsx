import { useEffect, useState } from 'react';
import { api } from '../api';
import { BarChart } from '../components/BarChart';
import { LineChart } from '../components/LineChart';

const STATUS_COLOR_VARS = {
  initiated: 'var(--status-initiated)',
  pending: 'var(--status-pending)',
  success: 'var(--status-success)',
  failed: 'var(--status-failed)',
  refunded: 'var(--status-refunded)',
};

export function Analytics() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    api.getAnalytics().then(setData).catch((err) => setError(err.message));
  }, []);

  if (error) {
    return (
      <div className="main">
        <div className="error-banner">{error}</div>
      </div>
    );
  }
  if (!data) {
    return (
      <div className="main">
        <div className="loading-state">Loading analytics…</div>
      </div>
    );
  }

  const barData = Object.entries(data.statusCounts).map(([label, value]) => ({ label, value }));
  const lineData = data.dailyVolume.map((d) => ({
    label: new Date(d.day).toLocaleDateString(undefined, { day: 'numeric', month: 'short' }),
    value: d.count,
  }));

  return (
    <div className="main">
      <h1 className="page-title">Analytics</h1>
      <p className="page-subtitle">Transaction volume and status breakdown.</p>

      <div className="analytics-grid">
        <div className="chart-panel">
          <div className="chart-panel-title">Volume — last 14 days</div>
          <LineChart data={lineData} />
        </div>
        <div className="chart-panel">
          <div className="chart-panel-title">By status</div>
          <BarChart data={barData} colorFor={(label) => STATUS_COLOR_VARS[label]} />
        </div>
      </div>
    </div>
  );
}
