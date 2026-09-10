import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export function Login() {
  const [email, setEmail] = useState('admin@payflux.dev');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  const { login } = useAuth();
  const navigate = useNavigate();

  async function handleSubmit(e) {
    e.preventDefault();

    setError(null);
    setLoading(true);

    try {
      await login(email, password);
      navigate('/app');
    } catch (err) {
      setError(err.message || 'Invalid email or password');
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <style>{`
        .login-page {
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          background: var(--bg);
          padding: 20px;
        }

        .login-panel {
          width: 360px;
          padding: 28px;
        }

        .login-brand {
          font-family: var(--font-mono);
          font-size: 16px;
          font-weight: 500;
          color: var(--text-primary);
          margin-bottom: 3px;
        }

        .login-subtitle {
          color: var(--text-muted);
          font-size: 11px;
          margin-bottom: 28px;
        }

        .login-heading {
          font-size: 20px;
          font-weight: 500;
          color: var(--text-primary);
          margin-bottom: 4px;
        }

        .login-description {
          color: var(--text-secondary);
          font-size: 12px;
          margin-bottom: 24px;
        }

        .login-button {
          width: 100%;
          margin-top: 2px;
        }

        .demo-credentials {
          font-size: 10px;
          color: var(--text-muted);
          margin-top: 16px;
          text-align: center;
          line-height: 1.6;
        }

        .demo-credentials span {
          font-family: var(--font-mono);
          color: var(--text-secondary);
        }

        .login-footer {
          text-align: center;
          margin-top: 22px;
          color: var(--text-muted);
          font-size: 10px;
        }
      `}</style>

      <div className="login-page">

        <form
          onSubmit={handleSubmit}
          className="panel login-panel"
        >

          {/* Brand */}
          <div className="login-brand">
            PayFlux
          </div>

          <div className="login-subtitle">
            Payment orchestration
          </div>

          {/* Heading */}
          <div className="login-heading">
            Sign in
          </div>

          <div className="login-description">
            Sign in to access your payment dashboard
          </div>

          {/* Email */}
          <div className="field">
            <label htmlFor="login-email">
              Email
            </label>

            <input
              id="login-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoFocus
              autoComplete="email"
              required
            />
          </div>

          {/* Password */}
          <div className="field">
            <label htmlFor="login-password">
              Password
            </label>

            <input
              id="login-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
            />
          </div>

          {/* Error */}
          {error && (
            <div className="error-banner">
              {error}
            </div>
          )}

          {/* Submit */}
          <button
            className="btn btn-primary login-button"
            type="submit"
            disabled={loading}
          >
            {loading ? 'Signing in…' : 'Sign in'}
          </button>

          {/* Demo credentials */}
          <div className="demo-credentials">
            Demo credentials:
            <br />
            <span>admin@payflux.dev</span>
            {' / '}
            <span>password123</span>
          </div>

          <div className="login-footer">
            Secure payment operations dashboard
          </div>

        </form>
      </div>
    </>
  );
}