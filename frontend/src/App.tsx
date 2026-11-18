import { Navigate, Route, Routes } from "react-router-dom";
import { AppShell } from "@/components/layout/AppShell";
import { Loading } from "@/components/ui/misc";
import { useAuth } from "@/lib/auth";
import AuditPage from "@/pages/Audit";
import DashboardPage from "@/pages/Dashboard";
import LocationsPage from "@/pages/Locations";
import LoginPage from "@/pages/Login";
import ProfilePage from "@/pages/Profile";
import ProjectsPage from "@/pages/Projects";
import RolesPage from "@/pages/Roles";
import UsersPage from "@/pages/Users";

function Guard({ perm, children }: { perm?: string; children: JSX.Element }) {
  const { can } = useAuth();
  if (perm && !can(perm)) return <div className="rounded-md border bg-card p-8 text-center text-sm text-muted-foreground">You do not have permission to view this page.</div>;
  return children;
}

export default function App() {
  const { me, loading, can } = useAuth();
  if (loading) return <Loading />;
  if (!me) return <Routes><Route path="*" element={<LoginPage />} /></Routes>;
  const home = can("dashboard:read") ? <DashboardPage /> : <Navigate to="/profile" replace />;
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={home} />
        <Route path="projects" element={<Guard perm="projects:read"><ProjectsPage /></Guard>} />
        <Route path="locations" element={<Guard perm="locations:read"><LocationsPage /></Guard>} />
        <Route path="users" element={<Guard perm="users:read"><UsersPage /></Guard>} />
        <Route path="roles" element={<Guard perm="roles:read"><RolesPage /></Guard>} />
        <Route path="audit" element={<Guard perm="audit_logs:read"><AuditPage /></Guard>} />
        <Route path="profile" element={<ProfilePage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
