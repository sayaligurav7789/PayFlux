import { HashRouter, Routes, Route } from 'react-router-dom';

import { AuthProvider } from './context/AuthContext';
import { ProtectedRoute } from './components/ProtectedRoute';

import { DashboardLayout } from './components/DashboardLayout';

import { Landing } from './pages/Landing';
import { Login } from './pages/Login';
import { ProfileSettings } from './pages/ProfileSettings';

import { TransactionList } from './pages/TransactionList';
import { TransactionDetail } from './pages/TransactionDetail';
import { WebhookLog } from './pages/WebhookLog';
import { IdempotencyDemo } from './pages/IdempotencyDemo';
import { Analytics } from './pages/Analytics';
import SystemHealth from './pages/SystemHealth';
import { Routing } from './pages/Routing';

export default function App() {
  return (
    <AuthProvider>
      <HashRouter>
        <Routes>

          {/* Public pages */}
          <Route path="/" element={<Landing />} />
          <Route path="/login" element={<Login />} />

          {/* Protected application */}
          <Route
            path="/app"
            element={
              <ProtectedRoute>
                <DashboardLayout />
              </ProtectedRoute>
            }
          >
            <Route index element={<TransactionList />} />

            <Route
              path="transactions/:id"
              element={<TransactionDetail />}
            />

            <Route
              path="analytics"
              element={<Analytics />}
            />

            <Route
              path="webhooks"
              element={<WebhookLog />}
            />

            <Route
              path="routing"
              element={<Routing />}
            />

            <Route
              path="demo"
              element={<IdempotencyDemo />}
            />

            <Route
              path="system-health"
              element={<SystemHealth />}
            />

            <Route
              path="profile"
              element={<ProfileSettings />}
            />
          </Route>

        </Routes>
      </HashRouter>
    </AuthProvider>
  );
}