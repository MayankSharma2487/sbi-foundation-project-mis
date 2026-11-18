import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { GeoSelect } from "@/components/GeoPick";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { Badge, Card, Confirm, Dialog, Empty, ErrorBox, Loading, PageHeader, Pagination, Table, Td, Th } from "@/components/ui/misc";
import { api, type Project } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/lib/toast";

const STATUSES = ["planned", "active", "completed", "closed"];
const tone = (s: string) => (s === "active" ? "green" : s === "planned" ? "orange" : "gray") as "green" | "orange" | "gray";
const LIMIT = 25;

function ProjectForm({ project, onClose }: { project: Project | null; onClose: () => void }) {
  const qc = useQueryClient(), toast = useToast(), { can } = useAuth();
  const [f, setF] = useState({
    code: project?.code ?? "", name: project?.name ?? "", donor: project?.donor ?? "", state_id: project?.state_id ?? "",
    status: project?.status ?? "planned", start_date: project?.start_date ?? "", end_date: project?.end_date ?? "", description: project?.description ?? "",
  });
  const [districts, setDistricts] = useState<string[]>(project?.district_ids ?? []);
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  const dq = useQuery({ queryKey: ["geo-options", "districts", f.state_id], queryFn: () => api.geo.list("districts", { parent_id: f.state_id, limit: 500 }), enabled: !!f.state_id });
  const nm = Object.fromEntries((dq.data?.items ?? []).map((d) => [d.id, d.name]));

  const save = useMutation({
    mutationFn: async () => {
      const body = { name: f.name.trim(), donor: f.donor.trim() || null, status: f.status, start_date: f.start_date || null, end_date: f.end_date || null, description: f.description.trim() || null };
      if (project) {
        let p = await api.projects.update(project.id, body);
        for (const d of districts.filter((d) => !p.district_ids.includes(d))) p = await api.projects.addLocation(project.id, d);
        for (const d of p.district_ids.filter((d) => !districts.includes(d))) p = await api.projects.removeLocation(project.id, d);
        return p;
      }
      return api.projects.create({ ...body, code: f.code.trim(), state_id: f.state_id, district_ids: districts });
    },
    onSuccess: () => { qc.invalidateQueries(); toast(project ? "Project saved" : "Project created"); onClose(); },
  });
  const canSave = f.name.trim() && (project || (f.code.trim() && f.state_id));
  const toggle = (id: string) => setDistricts((d) => d.includes(id) ? d.filter((x) => x !== id) : [...d, id]);

  return (
    <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); if (canSave) save.mutate(); }}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Project code"><Input value={f.code} onChange={set("code")} disabled={!!project} maxLength={40} /></Field>
        <Field label="Status"><Select value={f.status} onChange={set("status")}>{STATUSES.map((s) => <option key={s}>{s}</option>)}</Select></Field>
      </div>
      <Field label="Project name"><Input value={f.name} onChange={set("name")} maxLength={200} /></Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Donor / funder"><Input value={f.donor} onChange={set("donor")} /></Field>
        <Field label="State"><GeoSelect kind="states" value={f.state_id} disabled={!!project} onChange={(v) => { setF({ ...f, state_id: v }); setDistricts([]); }} /></Field>
        <Field label="Start date"><Input type="date" value={f.start_date} onChange={set("start_date")} /></Field>
        <Field label="End date"><Input type="date" value={f.end_date} onChange={set("end_date")} /></Field>
      </div>
      <Field label="Description"><Textarea value={f.description} onChange={set("description")} /></Field>
      {can(project ? "projects:update" : "projects:create") && f.state_id && (
        <Field label={`Districts covered (${districts.length})`}>
          <div className="grid max-h-40 gap-1 overflow-y-auto rounded-md border p-2 sm:grid-cols-2">
            {dq.data?.items.length ? dq.data.items.map((d) => (
              <label key={d.id} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={districts.includes(d.id)} onChange={() => toggle(d.id)} />{d.name}</label>
            )) : <span className="text-sm text-muted-foreground">No districts in this state yet — add them under Locations.</span>}
            {districts.filter((d) => !nm[d]).length > 0 && <span className="text-xs text-muted-foreground">+ {districts.filter((d) => !nm[d]).length} outside your view</span>}
          </div>
        </Field>
      )}
      {save.error && <ErrorBox error={save.error} />}
      <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={onClose}>Cancel</Button><Button type="submit" disabled={!canSave || save.isPending}>{project ? "Save changes" : "Create project"}</Button></div>
    </form>
  );
}

export default function ProjectsPage() {
  const { can } = useAuth(), qc = useQueryClient(), toast = useToast();
  const [offset, setOffset] = useState(0), [editing, setEditing] = useState<Project | "new" | null>(null), [removing, setRemoving] = useState<Project | null>(null);
  const q = useQuery({ queryKey: ["projects", offset], queryFn: () => api.projects.list({ limit: LIMIT, offset }) });
  const del = useMutation({
    mutationFn: (p: Project) => api.projects.archive(p.id),
    onSuccess: () => { qc.invalidateQueries(); toast("Project archived"); setRemoving(null); },
    onError: (e) => { toast((e as Error).message, "err"); setRemoving(null); },
  });
  return (
    <>
      <PageHeader title="Projects" subtitle="Projects you have access to, with the districts each covers."
        action={can("projects:create") && <Button onClick={() => setEditing("new")}><Plus className="h-4 w-4" />New project</Button>} />
      <Card>
        {q.isLoading ? <Loading /> : q.error ? <div className="p-3"><ErrorBox error={q.error} /></div> : !q.data?.items.length ? <Empty>No projects yet.</Empty> : (
          <>
            <Table><thead><tr><Th>Code</Th><Th>Name</Th><Th>Donor</Th><Th>Status</Th><Th>Period</Th><Th>Districts</Th><Th className="w-24 text-right">Actions</Th></tr></thead>
              <tbody>{q.data.items.map((p) => (
                <tr key={p.id} className="hover:bg-muted/40">
                  <Td className="font-mono text-xs">{p.code}</Td><Td className="font-medium">{p.name}</Td><Td>{p.donor ?? "—"}</Td>
                  <Td><Badge tone={tone(p.status)}>{p.status}</Badge></Td>
                  <Td className="whitespace-nowrap text-xs">{p.start_date ?? "—"} → {p.end_date ?? "—"}</Td><Td>{p.district_ids.length}</Td>
                  <Td className="text-right">
                    {can("projects:update") && <Button variant="ghost" size="icon" aria-label={`Edit ${p.name}`} onClick={() => setEditing(p)}><Pencil className="h-4 w-4" /></Button>}
                    {can("projects:delete") && <Button variant="ghost" size="icon" aria-label={`Archive ${p.name}`} onClick={() => setRemoving(p)}><Trash2 className="h-4 w-4 text-destructive" /></Button>}
                  </Td></tr>
              ))}</tbody></Table>
            <Pagination total={q.data.total} offset={offset} limit={LIMIT} onChange={setOffset} />
          </>
        )}
      </Card>
      <Dialog wide open={editing !== null} onOpenChange={(o) => !o && setEditing(null)} title={editing === "new" ? "New project" : "Edit project"}>
        {editing !== null && <ProjectForm project={editing === "new" ? null : editing} onClose={() => setEditing(null)} />}
      </Dialog>
      <Confirm open={!!removing} onOpenChange={(o) => !o && setRemoving(null)} title="Archive project?" busy={del.isPending}
        body={`"${removing?.name}" will be archived. Its records are preserved.`} confirmLabel="Archive" onConfirm={() => removing && del.mutate(removing)} />
    </>
  );
}
