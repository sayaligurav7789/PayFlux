import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';

export function DashboardLayout() {
  return (
    <div className="app-shell">
      <Sidebar />
      <Outlet />
    </div>
  );
}
