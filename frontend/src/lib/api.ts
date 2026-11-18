// Thin typed client for the FastAPI backend. Tokens live in sessionStorage (cleared when the tab closes).
export const BASE = (import.meta.env?.VITE_API_URL as string | undefined) ?? "/api/v1";

export type Page<T> = { items: T[]; total: number };
export type Geo = { id: string; name: string; code: string | null; parent_id: string | null };
export type Assignment = {
  id: string; role_code: string; project_id: string | null;
  district_id: string | null; block_id: string | null; village_id: string | null;
};
export type User = {
  id: string; email: string; full_name: string; phone: string | null; is_active: boolean;
  last_login_at: string | null; assignments: Assignment[];
};
export type Me = User & { permissions: string[] };
export type Project = {
  id: string; code: string; name: string; donor: string | null; state_id: string;
  start_date: string | null; end_date: string | null; status: string; description: string | null;
  district_ids: string[];
};
export type Role = { id: string; code: string; name: string; is_system: boolean };
export type Audit = {
  id: string; created_at: string; user_id: string | null; action: string; entity: string;
  entity_id: string | null; detail: Record<string, unknown> | null; ip: string | null;
};
export type Summary = {
  totals: { districts: number; blocks: number; villages: number; projects: number };
  projects_by_status: Record<string, number>;
  by_district: { district_id: string; district: string; blocks: number; villages: number }[];
  users_active: number | null;
};

export class ApiError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

const mem: Record<string, string> = {};
const ss = (typeof sessionStorage !== "undefined" ? sessionStorage : undefined);
const store = {
  get access() { return ss ? ss.getItem("mis_access") : mem.a ?? null; },
  get refresh() { return ss ? ss.getItem("mis_refresh") : mem.r ?? null; },
  set(a: string, r: string) { if (ss) { ss.setItem("mis_access", a); ss.setItem("mis_refresh", r); } else { mem.a = a; mem.r = r; } },
  clear() { if (ss) { ss.removeItem("mis_access"); ss.removeItem("mis_refresh"); } else { delete mem.a; delete mem.r; } },
};
export const tokens = store;

let onUnauthorized: () => void = () => {};
export const setUnauthorizedHandler = (fn: () => void) => { onUnauthorized = fn; };

function errorText(body: unknown, fallback: string): string {
  const d = (body as { detail?: unknown })?.detail;
  if (typeof d === "string") return d;
  if (Array.isArray(d)) return d.map((e) => `${(e.loc ?? []).slice(1).join(".")}: ${e.msg}`).join("; ");
  return fallback;
}

let refreshing: Promise<boolean> | null = null;
async function tryRefresh(): Promise<boolean> {
  if (!store.refresh) return false;
  refreshing ??= (async () => {
    const r = await fetch(`${BASE}/auth/refresh`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: store.refresh }),
    });
    if (!r.ok) return false;
    const t = await r.json();
    store.set(t.access_token, t.refresh_token);
    return true;
  })().finally(() => { refreshing = null; });
  return refreshing;
}

export async function request<T>(path: string, init: RequestInit = {}, retry = true): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  if (store.access) headers.set("Authorization", `Bearer ${store.access}`);
  const res = await fetch(`${BASE}${path}`, { ...init, headers });
  if (res.status === 401 && retry && !path.startsWith("/auth/login")) {
    if (await tryRefresh()) return request<T>(path, init, false);
    store.clear(); onUnauthorized();
  }
  if (res.status === 204) return undefined as T;
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new ApiError(res.status, errorText(body, res.statusText));
  return body as T;
}

const qs = (p: Record<string, string | number | undefined | null>) => {
  const u = new URLSearchParams();
  Object.entries(p).forEach(([k, v]) => { if (v !== undefined && v !== null && v !== "") u.set(k, String(v)); });
  const s = u.toString();
  return s ? `?${s}` : "";
};
const json = (b: unknown) => JSON.stringify(b);

export const api = {
  login: async (email: string, password: string) => {
    const t = await request<{ access_token: string; refresh_token: string }>("/auth/login", {
      method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ username: email, password }).toString(),
    });
    store.set(t.access_token, t.refresh_token);
  },
  me: () => request<Me>("/auth/me"),
  changePassword: (current_password: string, new_password: string) =>
    request<void>("/auth/change-password", { method: "POST", body: json({ current_password, new_password }) }),

  summary: (f: { district_id?: string; block_id?: string; village_id?: string }) =>
    request<Summary>(`/dashboard/summary${qs(f)}`),

  geo: {
    list: (kind: string, p: { parent_id?: string; q?: string; limit?: number; offset?: number } = {}) =>
      request<Page<Geo>>(`/${kind}${qs({ limit: 50, ...p })}`),
    create: (kind: string, b: { name: string; code?: string | null; parent_id?: string | null }) =>
      request<Geo>(`/${kind}`, { method: "POST", body: json(b) }),
    update: (kind: string, id: string, b: { name?: string; code?: string | null }) =>
      request<Geo>(`/${kind}/${id}`, { method: "PATCH", body: json(b) }),
    archive: (kind: string, id: string) => request<void>(`/${kind}/${id}`, { method: "DELETE" }),
  },

  projects: {
    list: (p: { limit?: number; offset?: number } = {}) => request<Page<Project>>(`/projects${qs({ limit: 50, ...p })}`),
    create: (b: Partial<Project> & { code: string; name: string; state_id: string }) =>
      request<Project>("/projects", { method: "POST", body: json(b) }),
    update: (id: string, b: Partial<Project>) => request<Project>(`/projects/${id}`, { method: "PATCH", body: json(b) }),
    archive: (id: string) => request<void>(`/projects/${id}`, { method: "DELETE" }),
    addLocation: (id: string, d: string) => request<Project>(`/projects/${id}/locations/${d}`, { method: "POST" }),
    removeLocation: (id: string, d: string) => request<Project>(`/projects/${id}/locations/${d}`, { method: "DELETE" }),
  },

  users: {
    get: (id: string) => request<User>(`/users/${id}`),
    list: (p: { q?: string; limit?: number; offset?: number } = {}) => request<Page<User>>(`/users${qs({ limit: 50, ...p })}`),
    create: (b: { email: string; full_name: string; phone?: string | null; password: string; assignments: Omit<Assignment, "id">[] }) =>
      request<User>("/users", { method: "POST", body: json(b) }),
    update: (id: string, b: { full_name?: string; phone?: string | null; is_active?: boolean; password?: string }) =>
      request<User>(`/users/${id}`, { method: "PATCH", body: json(b) }),
    addAssignment: (id: string, b: Partial<Omit<Assignment, "id">> & { role_code: string }) =>
      request<User>(`/users/${id}/assignments`, { method: "POST", body: json(b) }),
    removeAssignment: (id: string, aid: string) => request<User>(`/users/${id}/assignments/${aid}`, { method: "DELETE" }),
  },

  roles: {
    list: () => request<Role[]>("/roles"),
    permissions: () => request<string[]>("/permissions"),
    rolePerms: (id: string) => request<{ codes: string[] }>(`/roles/${id}/permissions`),
    setRolePerms: (id: string, codes: string[]) =>
      request<{ codes: string[] }>(`/roles/${id}/permissions`, { method: "PUT", body: json({ codes }) }),
  },

  audit: (p: { entity?: string; action?: string; limit?: number; offset?: number }) =>
    request<Page<Audit>>(`/audit-logs${qs({ limit: 25, ...p })}`),
};
