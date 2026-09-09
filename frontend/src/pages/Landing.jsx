import { useNavigate } from 'react-router-dom';

const FEATURES = [
  {
    title: 'Guarded state machine',
    body: 'Transaction lifecycle transitions are validated in code, not just documented — an invalid move like failed → success throws, and every path is unit tested.',
  },
  {
    title: 'Dual-layer idempotency',
    body: 'A Redis lock handles speed; a Postgres unique constraint is the backstop. Fire ten identical concurrent requests and exactly one transaction gets created.',
  },
  {
    title: 'Classified retries',
    body: 'Exponential backoff distinguishes retryable gateway timeouts from terminal failures like insufficient funds — only the former gets retried.',
  },
  {
    title: 'Signed webhooks, both sides',
    body: 'Outbound deliveries are HMAC-signed and retried on failure. A receiving endpoint verifies the signature — proving both ends of the security story.',
  },
];

const TECH = ['Node.js', 'Express', 'PostgreSQL', 'Redis', 'React', 'Vite', 'Docker'];

export function Landing() {
  const navigate = useNavigate();

  return (
    <div className="landing">
      <div className="landing-nav">
        <span className="landing-nav-brand">Ledger</span>
        <button className="btn btn-sm" onClick={() => navigate('/app')}>
          Open dashboard →
        </button>
      </div>

      <div className="landing-hero">
        <div className="landing-eyebrow">PAYMENT ORCHESTRATION</div>
        <h1 className="landing-title">
          A transaction engine that never double-charges,
          <br />
          even under real concurrency.
        </h1>
        <p className="landing-subtitle">
          A backend built around the correctness problems real payment gateways have to solve —
          idempotent writes, guarded state transitions, classified retries, and signed webhook
          delivery — with a dashboard that makes every guarantee visible and demoable.
        </p>
        <div className="landing-cta-row">
          <button className="btn btn-primary btn-lg" onClick={() => navigate('/app/demo')}>
            Run the idempotency demo
          </button>
          <button className="btn btn-lg" onClick={() => navigate('/app')}>
            View transactions
          </button>
        </div>
      </div>

      <div className="landing-section">
        <div className="landing-section-title">What this proves</div>
        <div className="feature-grid">
          {FEATURES.map((f) => (
            <div className="feature-card" key={f.title}>
              <div className="feature-card-icon" style={{ background: 'var(--status-success)' }} />
              <div className="feature-card-title">{f.title}</div>
              <div className="feature-card-body">{f.body}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="landing-section">
        <div className="landing-section-title">Built with</div>
        <div className="tech-badges">
          {TECH.map((t) => (
            <span className="tech-badge" key={t}>
              {t}
            </span>
          ))}
        </div>
      </div>

      <div className="landing-footer">Payment orchestration & transaction processing platform</div>
    </div>
  );
}
