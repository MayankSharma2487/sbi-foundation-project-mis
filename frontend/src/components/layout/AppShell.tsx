import { BarChart3, FolderKanban, History, LogOut, MapPin, Menu, ShieldCheck, UserCircle, Users, X } from "lucide-react";
import { useState } from "react";
import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";

const NAV = [
  { group: "Overview", items: [{ to: "/", label: "Dashboard", icon: BarChart3, perm: "dashboard:read" }] },
  { group: "Project Management", items: [
    { to: "/projects", label: "Projects", icon: FolderKanban, perm: "projects:read" },
    { to: "/locations", label: "Locations", icon: MapPin, perm: "locations:read" },
  ] },
  { group: "Administration", items: [
    { to: "/users", label: "Users", icon: Users, perm: "users:read" },
    { to: "/roles", label: "Roles & Permissions", icon: ShieldCheck, perm: "roles:read" },
    { to: "/audit", label: "Audit Logs", icon: History, perm: "audit_logs:read" },
  ] },
  { group: "Account", items: [{ to: "/profile", label: "Profile & Settings", icon: UserCircle, perm: "" }] },
];

export function AppShell() {
  const { me, can, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const loc = useLocation();
  const crumb = NAV.flatMap((g) => g.items).find((i) => (i.to === "/" ? loc.pathname === "/" : loc.pathname.startsWith(i.to)));

  const sidebar = (
    <nav className="flex h-full flex-col bg-primary text-primary-foreground">
      <div className="flex h-14 items-center gap-2 border-b border-white/10 px-4">
        <div className="flex h-8 w-8 items-center justify-center rounded-md bg-accent text-sm font-bold">M</div>
        <div className="leading-tight">
          <div className="text-sm font-semibold">Project MIS</div>
          <div className="text-[10px] uppercase tracking-wider text-white/60">SBI Foundation · FDRVC</div>
        </div>
      </div>
      <div className="flex-1 space-y-5 overflow-y-auto px-3 py-4">
        {NAV.map((g) => {
          const items = g.items.filter((i) => !i.perm || can(i.perm));
          if (!items.length) return null;
          return (
            <div key={g.group}>
              <div className="mb-1 px-2 text-[10px] font-semibold uppercase tracking-wider text-white/50">{g.group}</div>
              {items.map((i) => (
                <NavLink key={i.to} to={i.to} end={i.to === "/"} onClick={() => setOpen(false)}
                  className={({ isActive }) => cn("flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm hover:bg-white/10", isActive && "bg-white/15 font-medium")}>
                  <i.icon className="h-4 w-4" />{i.label}
                </NavLink>
              ))}
            </div>
          );
        })}
      </div>
    </nav>
  );

  return (
    <div className="flex h-screen">
      <aside className="hidden w-60 shrink-0 md:block">{sidebar}</aside>
      {open && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={() => setOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-64">{sidebar}</aside>
        </div>
      )}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 items-center justify-between border-b bg-card px-4">
          <div className="flex items-center gap-3">
            <button className="md:hidden" onClick={() => setOpen((o) => !o)} aria-label="Toggle menu">{open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}</button>
            <nav aria-label="Breadcrumb" className="text-sm text-muted-foreground">
              <Link to="/" className="hover:underline">Home</Link>{crumb && crumb.to !== "/" && <> <span>/</span> <span className="text-foreground">{crumb.label}</span></>}
            </nav>
          </div>
          <div className="flex items-center gap-3">
            <Link to="/profile" className="hidden text-right leading-tight sm:block">
              <div className="text-sm font-medium">{me?.full_name}</div>
              <div className="text-xs text-muted-foreground">{me?.assignments.map((a) => a.role_code.replace(/_/g, " ")).join(", ")}</div>
            </Link>
            <button onClick={logout} className="flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-sm hover:bg-muted" aria-label="Sign out"><LogOut className="h-4 w-4" /> <span className="hidden sm:inline">Sign out</span></button>
          </div>
        </header>
        <main className="flex-1 overflow-y-auto p-4 md:p-6"><Outlet /></main>
      </div>
    </div>
  );
}

