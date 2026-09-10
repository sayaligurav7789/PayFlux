import { NavLink, useNavigate } from 'react-router-dom';
import { useState } from 'react';
import { useAuth } from '../context/AuthContext';

export function Sidebar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [profileOpen, setProfileOpen] = useState(false);

  const name = user?.name || 'Admin';
  const email = user?.email || 'admin@payflux.dev';

  function handleLogout() {
    logout();
    navigate('/login');
  }

  return (
    <>
      <style>{`
        .sidebar {
          position: relative;
          display: flex;
          flex-direction: column;
          height: 100vh;
        }

        .sidebar-profile {
          margin-top: auto;
          padding: 12px;
          border-top: 1px solid var(--border);
          position: relative;
        }

        .profile-button {
          width: 100%;
          display: flex;
          align-items: center;
          gap: 9px;
          padding: 8px;
          border: none;
          border-radius: var(--radius);
          background: transparent;
          color: var(--text-primary);
          cursor: pointer;
          text-align: left;
        }

        .profile-button:hover {
          background: var(--surface-hover);
        }

        .profile-avatar {
          width: 30px;
          height: 30px;
          min-width: 30px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          background: var(--status-success-bg);
          color: var(--status-success);
          font-family: var(--font-mono);
          font-size: 12px;
        }

        .profile-info {
          min-width: 0;
          flex: 1;
        }

        .profile-name {
          font-size: 12px;
          color: var(--text-primary);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .profile-email {
          font-size: 10px;
          color: var(--text-muted);
          margin-top: 2px;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .profile-menu {
          position: absolute;
          left: 12px;
          right: 12px;
          bottom: 64px;
          background: var(--surface);
          border: 1px solid var(--border-strong);
          border-radius: var(--radius);
          padding: 5px;
          box-shadow: 0 8px 24px rgba(0, 0, 0, 0.35);
          z-index: 20;
        }

        .profile-menu-item {
          width: 100%;
          display: block;
          border: none;
          background: transparent;
          color: var(--text-secondary);
          text-align: left;
          padding: 9px 10px;
          border-radius: var(--radius);
          font-family: var(--font-sans);
          font-size: 12px;
          cursor: pointer;
        }

        .profile-menu-item:hover {
          background: var(--surface-hover);
          color: var(--text-primary);
        }

        .profile-menu-item.logout {
          color: var(--status-failed);
        }

        .profile-menu-item.logout:hover {
          background: var(--status-failed-bg);
        }
      `}</style>

      <div className="sidebar">

        {/* Brand */}
        <div className="sidebar-brand">
          PayFlux
          <span>Payment orchestration</span>
        </div>

        {/* Navigation */}
        <NavLink
          to="/app"
          end
          className={({ isActive }) =>
            `nav-link${isActive ? ' active' : ''}`
          }
        >
          Transactions
        </NavLink>

        <NavLink
          to="/app/analytics"
          className={({ isActive }) =>
            `nav-link${isActive ? ' active' : ''}`
          }
        >
          Analytics
        </NavLink>

        <NavLink
          to="/app/webhooks"
          className={({ isActive }) =>
            `nav-link${isActive ? ' active' : ''}`
          }
        >
          Webhooks
        </NavLink>

        <NavLink
          to="/app/routing"
          className={({ isActive }) =>
            `nav-link${isActive ? ' active' : ''}`
          }
        >
          Routing
        </NavLink>

        <NavLink
          to="/app/demo"
          className={({ isActive }) =>
            `nav-link${isActive ? ' active' : ''}`
          }
        >
          Idempotency demo
        </NavLink>

        <NavLink
          to="/app/system-health"
          className={({ isActive }) =>
            `nav-link${isActive ? ' active' : ''}`
          }
        >
          System health
        </NavLink>

        {/* Profile */}
        <div className="sidebar-profile">

          {profileOpen && (
            <div className="profile-menu">

              <button
                className="profile-menu-item"
                onClick={() => {
                  setProfileOpen(false);
                  navigate('/app/profile');
                }}
              >
                Profile settings
              </button>

              <button
                className="profile-menu-item logout"
                onClick={handleLogout}
              >
                Sign out
              </button>

            </div>
          )}

          <button
            className="profile-button"
            onClick={() => setProfileOpen(!profileOpen)}
          >
            <div className="profile-avatar">
              {name.charAt(0).toUpperCase()}
            </div>

            <div className="profile-info">
              <div className="profile-name">
                {name}
              </div>

              <div className="profile-email">
                {email}
              </div>
            </div>

            <span style={{ color: 'var(--text-muted)', fontSize: 15 }}>
              ⋮
            </span>
          </button>

        </div>

      </div>
    </>
  );
}