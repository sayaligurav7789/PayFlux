import { useAuth } from '../context/AuthContext';

export function ProfileSettings() {
  const { user } = useAuth();

  const name = user?.name || 'Admin';
  const email = user?.email || 'admin@payflux.dev';
  const role = user?.role || 'Administrator';

  return (
    <>
      <style>{`
        .profile-settings {
          min-height: 100%;
          padding: 32px 44px;
          background: var(--bg);
          color: var(--text-primary);
        }

        .profile-header {
          margin-bottom: 28px;
        }

        .profile-header h1 {
          margin: 0 0 6px;
          font-size: 24px;
          font-weight: 500;
          color: var(--text-primary);
        }

        .profile-header p {
          margin: 0;
          font-size: 12px;
          color: var(--text-muted);
        }

        .profile-card {
          width: 100%;
          max-width: 680px;
          background: var(--surface);
          border: 1px solid var(--border);
          border-radius: var(--radius);
        }

        .profile-card-header {
          display: flex;
          align-items: center;
          gap: 16px;
          padding: 24px;
          border-bottom: 1px solid var(--border);
        }

        .profile-avatar-large {
          width: 56px;
          height: 56px;
          flex-shrink: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 50%;
          background: var(--surface-hover);
          border: 1px solid var(--border-strong);
          color: var(--text-primary);
          font-family: var(--font-mono);
          font-size: 20px;
        }

        .profile-user-name {
          margin-bottom: 5px;
          font-size: 15px;
          font-weight: 500;
          color: var(--text-primary);
        }

        .profile-user-email {
          font-size: 11px;
          color: var(--text-muted);
          font-family: var(--font-mono);
        }

        .profile-details {
          padding: 4px 24px;
        }

        .profile-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          min-height: 58px;
          border-bottom: 1px solid var(--border);
        }

        .profile-row:last-child {
          border-bottom: none;
        }

        .profile-label {
          font-size: 11px;
          color: var(--text-muted);
        }

        .profile-value {
          font-size: 12px;
          color: var(--text-secondary);
          font-family: var(--font-mono);
        }

        .profile-badge {
          padding: 4px 8px;
          border: 1px solid var(--border-strong);
          border-radius: var(--radius);
          background: var(--surface-hover);
          color: var(--text-secondary);
          font-size: 10px;
          font-family: var(--font-mono);
        }

        .profile-info-box {
          max-width: 680px;
          margin-top: 16px;
          padding: 14px 16px;
          border: 1px solid var(--border);
          border-radius: var(--radius);
          background: var(--surface);
        }

        .profile-info-title {
          margin-bottom: 5px;
          font-size: 11px;
          color: var(--text-secondary);
        }

        .profile-info-text {
          font-size: 10px;
          line-height: 1.5;
          color: var(--text-muted);
        }
      `}</style>

      <main className="profile-settings">

        <div className="profile-header">
          <h1>Profile Settings</h1>
          <p>Manage your PayFlux account information</p>
        </div>

        <div className="profile-card">

          {/* User header */}
          <div className="profile-card-header">

            <div className="profile-avatar-large">
              {name.charAt(0).toUpperCase()}
            </div>

            <div>
              <div className="profile-user-name">
                {name}
              </div>

              <div className="profile-user-email">
                {email}
              </div>
            </div>

          </div>

          {/* User details */}
          <div className="profile-details">

            <div className="profile-row">
              <span className="profile-label">
                Name
              </span>

              <span className="profile-value">
                {name}
              </span>
            </div>

            <div className="profile-row">
              <span className="profile-label">
                Email
              </span>

              <span className="profile-value">
                {email}
              </span>
            </div>

            <div className="profile-row">
              <span className="profile-label">
                Role
              </span>

              <span className="profile-value">
                {role}
              </span>
            </div>

            <div className="profile-row">
              <span className="profile-label">
                Environment
              </span>

              <span className="profile-badge">
                Sandbox
              </span>
            </div>

            <div className="profile-row">
              <span className="profile-label">
                Account status
              </span>

              <span className="profile-badge">
                Active
              </span>
            </div>

          </div>
        </div>

        <div className="profile-info-box">

          <div className="profile-info-title">
            Account information
          </div>

          <div className="profile-info-text">
            Your account is used to access PayFlux payment operations,
            transaction monitoring, gateway routing, webhooks and system
            health information.
          </div>

        </div>

      </main>
    </>
  );
}