import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Search, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { Cascade, emptyCascade, GeoCascade } from "@/components/GeoPick";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/form";
import { Badge, Card, Dialog, Empty, ErrorBox, Loading, PageHeader, Pagination, Table, Td, Th } from "@/components/ui/misc";
import { api, type Assignment } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/lib/toast";
import { fmtDate } from "@/lib/utils";

const LIMIT = 25;

function AssignmentFields({ value, onChange }: { value: { role: string; project: string; geo: Cascade }; onChange: (v: { role: string; project: string; geo: Cascade }) => void }) {
  const roles = useQuery({ queryKey: ["roles"], queryFn: api.roles.list });
  const projects = useQuery({ queryKey: ["projects", "all"], queryFn: () => api.projects.list({ limit: 200 }) });
  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Role"><Select value={value.role} onChange={(e) => onChange({ ...value, role: e.target.value })}>
          <option value="">Select role</option>{roles.data?.map((r) => <option key={r.id} value={r.code}>{r.name}</option>)}</Select></Field>
        <Field label="Project"><Select value={value.project} onChange={(e) => onChange({ ...value, project: e.target.value })}>
          <option value="">All projects</option>{projects.data?.items.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</Select></Field>
      </div>
      <GeoCascade value={value.geo} onChange={(geo) => onChange({ ...value, geo })} />
      <p className="text-xs text-muted-foreground">Leave geography blank for project-wide access; the most specific level chosen is what the user is limited to.</p>
    </div>
  );
}
const toAssignment = (v: { role: string; project: string; geo: Cascade }) => ({
  role_code: v.role, project_id: v.project || null, district_id: v.geo.district || null, block_id: v.geo.block || null, village_id: v.geo.village || null,
});
const blankA = { role: "", project: "", geo: emptyCascade };

function CreateUser({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient(), toast = useToast();
  const [f, setF] = useState({ email: "", full_name: "", phone: "", password: "" });
  const [a, setA] = useState(blankA);
  const m = useMutation({
    mutationFn: () => api.users.create({ ...f, phone: f.phone || null, assignments: a.role ? [toAssignment(a)] : [] }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["users"] }); toast("User created"); onClose(); },
  });
  const ok = f.email && f.full_name && f.password.length >= 10;
  return (
    <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); if (ok) m.mutate(); }}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Full name"><Input value={f.full_name} onChange={(e) => setF({ ...f, full_name: e.target.value })} /></Field>
        <Field label="Email"><Input type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></Field>
        <Field label="Phone (optional)"><Input value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} /></Field>
        <Field label="Initial password (min 10 characters)"><Input type="password" autoComplete="new-password" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} /></Field>
      </div>
      <div className="rounded-md border p-3"><div className="mb-2 text-sm font-medium">Initial access (optional)</div><AssignmentFields value={a} onChange={setA} /></div>
      {m.error && <ErrorBox error={m.error} />}
      <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={onClose}>Cancel</Button><Button type="submit" disabled={!ok || m.isPending}>Create user</Button></div>
    </form>
  );
}

function UserDetail({ userId, onClose }: { userId: string; onClose: () => void }) {
  const qc = useQueryClient(), toast = useToast(), { me } = useAuth();
  const uq = useQuery({ queryKey: ["users", "one", userId], queryFn: () => api.users.get(userId) });
  const u = uq.data;
  const [name, setName] = useState(""), [phone, setPhone] = useState(""), [pw, setPw] = useState(""), [a, setA] = useState(blankA);
  useEffect(() => { if (u) { setName(u.full_name); setPhone(u.phone ?? ""); } }, [u?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const refresh = () => { qc.invalidateQueries({ queryKey: ["users"] }); };
  const upd = useMutation({ mutationFn: (b: Parameters<typeof api.users.update>[1]) => api.users.update(userId, b), onSuccess: () => { refresh(); toast("Saved"); setPw(""); } });
  const add = useMutation({ mutationFn: () => api.users.addAssignment(userId, toAssignment(a)), onSuccess: () => { refresh(); setA(blankA); toast("Access added"); } });
  const rm = useMutation({ mutationFn: (id: string) => api.users.removeAssignment(userId, id), onSuccess: () => { refresh(); toast("Access removed"); } });
  const projects = useQuery({ queryKey: ["projects", "all"], queryFn: () => api.projects.list({ limit: 200 }) });
  const pname = (id: string | null) => id ? projects.data?.items.find((p) => p.id === id)?.name ?? "Other project" : "All projects";
  if (uq.isLoading || !u) return <Loading />;
  const self = me?.id === u.id;
  const where = (x: Assignment) => x.village_id ? "Village-level" : x.block_id ? "Block-level" : x.district_id ? "District-level" : "Project-wide";
  return (
    <div className="space-y-6">
      <section className="space-y-3">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Full name"><Input value={name} onChange={(e) => setName(e.target.value)} /></Field>
          <Field label="Phone"><Input value={phone} onChange={(e) => setPhone(e.target.value)} /></Field>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" disabled={upd.isPending || !name.trim()} onClick={() => upd.mutate({ full_name: name.trim(), phone: phone || null })}>Save details</Button>
          <Button size="sm" variant={u.is_active ? "outline" : "accent"} disabled={self || upd.isPending} onClick={() => upd.mutate({ is_active: !u.is_active })}>{u.is_active ? "Deactivate" : "Reactivate"}</Button>
          {self && <span className="text-xs text-muted-foreground">You cannot deactivate yourself here.</span>}
        </div>
        <div className="flex items-end gap-2"><div className="flex-1"><Field label="Reset password (signs the user out everywhere)"><Input type="password" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} placeholder="min 10 characters" /></Field></div>
          <Button size="sm" variant="outline" disabled={pw.length < 10 || upd.isPending} onClick={() => upd.mutate({ password: pw })}>Reset</Button></div>
        {upd.error && <ErrorBox error={upd.error} />}
      </section>
      <section>
        <h3 className="mb-2 text-sm font-semibold">Access assignments</h3>
        {u.assignments.length === 0 ? <p className="text-sm text-muted-foreground">No access assigned — this user cannot see anything.</p> : (
          <ul className="divide-y rounded-md border">{u.assignments.map((x) => (
            <li key={x.id} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
              <div><span className="font-medium capitalize">{x.role_code.replace(/_/g, " ")}</span> · {pname(x.project_id)} · <span className="text-muted-foreground">{where(x)}</span></div>
              <Button variant="ghost" size="icon" aria-label="Remove access" disabled={rm.isPending} onClick={() => rm.mutate(x.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
            </li>))}</ul>
        )}
        <div className="mt-3 rounded-md border p-3"><div className="mb-2 text-sm font-medium">Add access</div><AssignmentFields value={a} onChange={setA} />
          {add.error && <div className="mt-2"><ErrorBox error={add.error} /></div>}
          <div className="mt-3 flex justify-end"><Button size="sm" disabled={!a.role || add.isPending} onClick={() => add.mutate()}>Add access</Button></div></div>
      </section>
      <div className="flex justify-end"><Button variant="outline" onClick={onClose}>Close</Button></div>
    </div>
  );
}

export default function UsersPage() {
  const { can } = useAuth();
  const [search, setSearch] = useState(""), [offset, setOffset] = useState(0), [creating, setCreating] = useState(false), [open, setOpen] = useState<string | null>(null);
  useEffect(() => setOffset(0), [search]);
  const q = useQuery({ queryKey: ["users", search, offset], queryFn: () => api.users.list({ q: search, limit: LIMIT, offset }) });
  return (
    <>
      <PageHeader title="Users" subtitle="Accounts and what each person can access."
        action={can("users:manage_users") && <Button onClick={() => setCreating(true)}><Plus className="h-4 w-4" />Add user</Button>} />
      <Card>
        <div className="relative border-b p-3"><Search className="absolute left-5 top-5 h-4 w-4 text-muted-foreground" /><Input className="pl-8" placeholder="Search by name or email…" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search users" /></div>
        {q.isLoading ? <Loading /> : q.error ? <div className="p-3"><ErrorBox error={q.error} /></div> : !q.data?.items.length ? <Empty>No users found.</Empty> : (
          <>
            <Table><thead><tr><Th>Name</Th><Th>Email</Th><Th>Access</Th><Th>Status</Th><Th>Last login</Th></tr></thead>
              <tbody>{q.data.items.map((u) => (
                <tr key={u.id} className={can("users:manage_users") ? "cursor-pointer hover:bg-muted/40" : ""} onClick={() => can("users:manage_users") && setOpen(u.id)}>
                  <Td className="font-medium">{u.full_name}</Td><Td>{u.email}</Td>
                  <Td className="capitalize">{u.assignments.map((a) => a.role_code.replace(/_/g, " ")).join(", ") || "—"}</Td>
                  <Td><Badge tone={u.is_active ? "green" : "red"}>{u.is_active ? "active" : "inactive"}</Badge></Td><Td className="text-xs">{fmtDate(u.last_login_at)}</Td></tr>
              ))}</tbody></Table>
            <Pagination total={q.data.total} offset={offset} limit={LIMIT} onChange={setOffset} />
          </>
        )}
      </Card>
      <Dialog wide open={creating} onOpenChange={setCreating} title="Add user">{creating && <CreateUser onClose={() => setCreating(false)} />}</Dialog>
      <Dialog wide open={!!open} onOpenChange={(o) => !o && setOpen(null)} title="Manage user" description="Details, password and access assignments.">{open && <UserDetail userId={open} onClose={() => setOpen(null)} />}</Dialog>
    </>
  );
}
