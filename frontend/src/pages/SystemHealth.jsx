import { useState, useCallback, useEffect } from 'react';
import { api } from '../api';

const GATEWAY_LABELS = { gateway_a: 'Gateway A', gateway_b: 'Gateway B' };

const INSTANCES = [
  { id: 'api1', label: 'API-1', port: 4001 },
  { id: 'api2', label: 'API-2', port: 4002 },
  { id: 'api3', label: 'API-3', port: 4003 },
];

async function fetchJson(url) {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

function Dot({ ok }) {
  return (
    <span
      style={{
        display: 'inline-block',
        width: 7,
        height: 7,
        borderRadius: '50%',
        background: ok ? 'var(--status-success)' : 'var(--status-failed)',
        marginRight: 7,
      }}
    />
  );
}

function ServiceCard({ title, statusLine, ok }) {
  return (
    <div
      className="panel"
      style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
    >
      <div>
        <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 4 }}>{title}</div>
        <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{statusLine}</div>
      </div>
      <div style={{ fontSize: 12, color: ok ? 'var(--status-success)' : 'var(--status-failed)' }}>
        <Dot ok={ok} />
        {ok ? 'Operational' : 'Down'}
      </div>
    </div>
  );
}

export default function SystemHealth() {
  const [instances, setInstances] = useState({});
  const [checking, setChecking] = useState(false);
  const [lastChecked, setLastChecked] = useState(null);
  const [gatewayHealth, setGatewayHealth] = useState(null);

  const runCheck = useCallback(async () => {
    setChecking(true);
    const results = await Promise.all(
      INSTANCES.map(async (inst) => {
        const start = Date.now();
        const health = await fetchJson(`http://localhost:${inst.port}/health/deep`);
        const metrics = await fetchJson(`http://localhost:${inst.port}/metrics`);
        return {
          ...inst,
          reachable: !!health,
          latencyMs: health ? Date.now() - start : null,
          postgres: health?.postgres,
          redis: health?.redis,
          metrics,
        };
      })
    );
    setInstances(Object.fromEntries(results.map((r) => [r.id, r])));
    setLastChecked(new Date());
    setChecking(false);

    // Gateway health is served from Postgres (gateway_attempts), not
    // per-instance memory, so a single call gives the true picture
    // regardless of which of the three API instances answers it.
    try {
      const health = await api.getGatewayHealth();
      setGatewayHealth(health.gateways);
    } catch {
      setGatewayHealth(null);
    }
  }, []);

  useEffect(() => {
    runCheck();
    const id = setInterval(runCheck, 8000);
    return () => clearInterval(id);
  }, [runCheck]);

  const list = Object.values(instances);
  const healthyCount = list.filter((i) => i.reachable).length;
  const allHealthy = list.length > 0 && healthyCount === list.length;

  const totalReqPerSec = list.reduce((sum, i) => sum + (i.metrics?.requestsPerSecond || 0), 0);
  const maxP95 = Math.max(...list.map((i) => i.metrics?.p95LatencyMs || 0), 0);
  const avgErrorRate =
    list.length > 0
      ? (list.reduce((sum, i) => sum + (i.metrics?.errorRatePercent || 0), 0) / list.length).toFixed(1)
      : '0';

  const redisSample = list.find((i) => i.redis)?.redis;
  const postgresSample = list.find((i) => i.postgres)?.postgres;
  const gatewaySample = list.find((i) => i.metrics?.gateway)?.metrics?.gateway;

  return (
    <div className="main">
      <div className="toolbar-row">
        <div>
          <h1 className="page-title">System health</h1>
          <p className="page-subtitle" style={{ marginBottom: 0 }}>
            Monitor infrastructure, API instances, and system performance.
          </p>
        </div>
        <button className="btn btn-primary" onClick={runCheck} disabled={checking}>
          {checking ? 'Checking…' : 'Re-check now'}
        </button>
      </div>

      <div
        className="panel"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          marginTop: 20,
          marginBottom: 24,
          borderColor: allHealthy ? 'var(--status-success)' : 'var(--status-failed)',
        }}
      >
        <Dot ok={allHealthy} />
        <div>
          <div style={{ fontSize: 14, fontWeight: 500 }}>
            {allHealthy ? 'All Systems Operational' : 'Degraded — one or more instances down'}
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
            {lastChecked ? `Last checked ${lastChecked.toLocaleTimeString()}` : 'Checking…'}
          </div>
        </div>
      </div>

      <div className="summary-strip">
        <div className="summary-stat">
          <div className="summary-stat-value">{totalReqPerSec.toFixed(1)}</div>
          <div className="summary-stat-label">Requests / sec</div>
        </div>
        <div className="summary-stat">
          <div className="summary-stat-value">{maxP95}ms</div>
          <div className="summary-stat-label">P95 latency (max across instances)</div>
        </div>
        <div className="summary-stat">
          <div className="summary-stat-value" style={{ color: avgErrorRate > 0 ? 'var(--status-failed)' : undefined }}>
            {avgErrorRate}%
          </div>
          <div className="summary-stat-label">Error rate</div>
        </div>
        <div className="summary-stat">
          <div className="summary-stat-value">
            {healthyCount} / {INSTANCES.length}
          </div>
          <div className="summary-stat-label">API instances</div>
        </div>
      </div>

      <h2 className="section-heading">Core services</h2>
      <div className="feature-grid" style={{ marginBottom: 28 }}>
        <ServiceCard
          title="Nginx load balancer"
          statusLine={`${totalReqPerSec.toFixed(1)} req/s`}
          ok={allHealthy}
        />
        <ServiceCard
          title="Redis"
          statusLine={redisSample?.ok ? `${redisSample.latencyMs}ms` : 'unreachable'}
          ok={!!redisSample?.ok}
        />
        <ServiceCard
          title="PostgreSQL"
          statusLine={postgresSample?.ok ? `${postgresSample.latencyMs}ms` : 'unreachable'}
          ok={!!postgresSample?.ok}
        />
        <ServiceCard
          title="Payment gateway (mock)"
          statusLine={
            gatewaySample && gatewaySample.totalCalls > 0
              ? `${gatewaySample.successRatePercent}% success`
              : 'No calls yet'
          }
          ok={!gatewaySample || gatewaySample.successRatePercent >= 80}
        />
      </div>

      <h2 className="section-heading">Payment gateways</h2>
      <div className="feature-grid" style={{ marginBottom: 28 }}>
        {['gateway_a', 'gateway_b'].map((gatewayId) => {
          const g = gatewayHealth?.[gatewayId];
          const healthy = !g || g.totalRequests === 0 || g.successRatePercent >= 80;
          return (
            <ServiceCard
              key={gatewayId}
              title={GATEWAY_LABELS[gatewayId]}
              statusLine={
                g && g.totalRequests > 0
                  ? `${g.successRatePercent}% success · ${g.avgLatencyMs}ms avg · ${g.totalRequests} requests · ${g.failoversTriggered} failovers`
                  : 'No calls yet'
              }
              ok={healthy}
            />
          );
        })}
      </div>

      <h2 className="section-heading">API instances</h2>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Instance</th>
              <th>Status</th>
              <th style={{ textAlign: 'right' }}>Requests/sec</th>
              <th style={{ textAlign: 'right' }}>P95 latency</th>
              <th style={{ textAlign: 'right' }}>Success rate</th>
            </tr>
          </thead>
          <tbody>
            {INSTANCES.map((inst) => {
              const i = instances[inst.id];
              return (
                <tr key={inst.id} style={{ cursor: 'default' }}>
                  <td className="mono">{inst.label}</td>
                  <td>
                    <Dot ok={i?.reachable} />
                    {i?.reachable ? 'Healthy' : 'Down'}
                  </td>
                  <td className="amount">{i?.metrics?.requestsPerSecond ?? '—'}</td>
                  <td className="amount">{i?.metrics?.p95LatencyMs != null ? `${i.metrics.p95LatencyMs}ms` : '—'}</td>
                  <td className="amount">
                    {i?.metrics?.successRatePercent != null ? `${i.metrics.successRatePercent}%` : '—'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}