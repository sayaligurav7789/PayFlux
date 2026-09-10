import { useState, useEffect, useCallback } from 'react';
import { api } from '../api';

const STRATEGIES = [
  { id: 'round_robin', label: 'Round robin', description: 'Alternates evenly between Gateway A and Gateway B.' },
  { id: 'weighted', label: 'Weighted', description: 'Sends a configurable percentage of traffic to each gateway.' },
  { id: 'health_based', label: 'Health-based', description: 'Prefers whichever gateway has the better recent success rate.' },
];

const GATEWAY_LABELS = { gateway_a: 'Gateway A', gateway_b: 'Gateway B' };

export function Routing() {
  const [strategy, setStrategy] = useState('round_robin');
  const [weightGatewayA, setWeightGatewayA] = useState(50);
  const [weightGatewayB, setWeightGatewayB] = useState(50);
  const [savedStrategy, setSavedStrategy] = useState(null);
  const [health, setHealth] = useState(null);
  const [forceFailure, setForceFailure] = useState({ gateway_a: false, gateway_b: false });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [savedNote, setSavedNote] = useState(false);

  const loadConfig = useCallback(async () => {
    try {
      const config = await api.getRoutingConfig();
      setStrategy(config.strategy);
      setWeightGatewayA(config.weights.gateway_a);
      setWeightGatewayB(config.weights.gateway_b);
      setSavedStrategy(config.strategy);
    } catch (err) {
      setError(err.message);
    }
  }, []);

  const loadHealth = useCallback(async () => {
    try {
      const data = await api.getGatewayHealth();
      setHealth(data.gateways);
    } catch {
      // System health page shows connectivity issues; keep this page quiet on transient failures.
    }
  }, []);

  useEffect(() => {
    loadConfig();
    loadHealth();
    const id = setInterval(loadHealth, 5000);
    return () => clearInterval(id);
  }, [loadConfig, loadHealth]);

  async function saveConfig() {
    setSaving(true);
    setError(null);
    setSavedNote(false);
    try {
      const config = await api.updateRoutingConfig({
        strategy,
        weightGatewayA: Number(weightGatewayA),
        weightGatewayB: Number(weightGatewayB),
      });
      setSavedStrategy(config.strategy);
      setSavedNote(true);
      setTimeout(() => setSavedNote(false), 2500);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function toggleForceFailure(gatewayId) {
    const nextValue = !forceFailure[gatewayId];
    setForceFailure((prev) => ({ ...prev, [gatewayId]: nextValue }));
    try {
      await api.forceGatewayFailure(gatewayId, nextValue);
    } catch (err) {
      setError(err.message);
      setForceFailure((prev) => ({ ...prev, [gatewayId]: !nextValue }));
    }
  }

  const hasUnsavedChanges =
    strategy !== savedStrategy;

  return (
    <div className="main">
      <h1 className="page-title">Routing</h1>
      <p className="page-subtitle">
        Choose how payments are routed across Gateway A and Gateway B, and watch each gateway's
        live health. If the active gateway keeps failing, the backend automatically retries and
        then fails over to the other one — every attempt and failover is logged on the
        transaction's timeline.
      </p>

      {error && <div className="error-banner">{error}</div>}

      <h2 className="section-heading">Strategy</h2>
      <div className="panel" style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
          {STRATEGIES.map((s) => (
            <button
              key={s.id}
              className={`filter-pill${strategy === s.id ? ' active' : ''}`}
              onClick={() => setStrategy(s.id)}
              type="button"
            >
              {s.label}
            </button>
          ))}
        </div>
        <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 20 }}>
          {STRATEGIES.find((s) => s.id === strategy)?.description}
        </p>

        {strategy === 'weighted' && (
          <div className="quick-create-row" style={{ marginBottom: 16, maxWidth: 420 }}>
            <div className="field">
              <label>Gateway A weight</label>
              <input
                type="number"
                min="0"
                value={weightGatewayA}
                onChange={(e) => setWeightGatewayA(e.target.value)}
              />
            </div>
            <div className="field">
              <label>Gateway B weight</label>
              <input
                type="number"
                min="0"
                value={weightGatewayB}
                onChange={(e) => setWeightGatewayB(e.target.value)}
              />
            </div>
          </div>
        )}

        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button className="btn btn-primary" onClick={saveConfig} disabled={saving}>
            {saving ? 'Saving…' : 'Save routing config'}
          </button>
          {hasUnsavedChanges && !saving && (
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Unsaved changes</span>
          )}
          {savedNote && <span className="success-note" style={{ marginTop: 0 }}>Saved — takes effect immediately, for every API instance.</span>}
        </div>
      </div>

      <h2 className="section-heading">Gateway health</h2>
      <div className="feature-grid" style={{ marginBottom: 24 }}>
        {['gateway_a', 'gateway_b'].map((gatewayId) => {
          const g = health?.[gatewayId];
          return (
            <div className="panel" key={gatewayId}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                <div style={{ fontSize: 14, fontWeight: 500 }}>{GATEWAY_LABELS[gatewayId]}</div>
                <span
                  style={{
                    fontSize: 11,
                    color: !g || g.totalRequests === 0 || g.recentSuccessRatePercent >= 80
                      ? 'var(--status-success)'
                      : 'var(--status-failed)',
                  }}
                >
                  {!g || g.totalRequests === 0 ? 'No calls yet' : `${g.recentSuccessRatePercent}% recent success`}
                </span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, fontSize: 12 }}>
                <div>
                  <div style={{ color: 'var(--text-muted)' }}>Requests</div>
                  <div className="mono">{g?.totalRequests ?? 0}</div>
                </div>
                <div>
                  <div style={{ color: 'var(--text-muted)' }}>Success rate</div>
                  <div className="mono">{g?.successRatePercent ?? 100}%</div>
                </div>
                <div>
                  <div style={{ color: 'var(--text-muted)' }}>Failures</div>
                  <div className="mono">{g?.failures ?? 0}</div>
                </div>
                <div>
                  <div style={{ color: 'var(--text-muted)' }}>Avg latency</div>
                  <div className="mono">{g?.avgLatencyMs ?? 0}ms</div>
                </div>
                <div>
                  <div style={{ color: 'var(--text-muted)' }}>Failovers triggered</div>
                  <div className="mono">{g?.failoversTriggered ?? 0}</div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <h2 className="section-heading">Demo controls</h2>
      <div className="panel">
        <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 16 }}>
          Force a gateway to always fail, so you can watch retries and automatic failover happen
          live instead of waiting for a random failure. Turn it back off when you're done —
          this affects real traffic on all API instances.
        </p>
        {['gateway_a', 'gateway_b'].map((gatewayId) => (
          <div key={gatewayId} className="toggle-row" style={{ marginBottom: 10, justifyContent: 'space-between' }}>
            <span>Force {GATEWAY_LABELS[gatewayId]} to fail</span>
            <div
              className={`toggle${forceFailure[gatewayId] ? ' on' : ''}`}
              onClick={() => toggleForceFailure(gatewayId)}
              role="switch"
              aria-checked={forceFailure[gatewayId]}
              tabIndex={0}
            >
              <div className="toggle-knob" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
