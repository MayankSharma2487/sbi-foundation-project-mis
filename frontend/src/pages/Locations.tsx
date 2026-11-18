import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { Cascade, emptyCascade, GeoCascade, GeoKind, GeoSelect } from "@/components/GeoPick";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/form";
import { Card, Confirm, Dialog, Empty, ErrorBox, Loading, PageHeader, Pagination, Table, Td, Th } from "@/components/ui/misc";
import { api, type Geo } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/lib/toast";
import { cn } from "@/lib/utils";

const KINDS: { kind: GeoKind; label: string; parent?: string }[] = [
  { kind: "states", label: "States" }, { kind: "districts", label: "Districts", parent: "State" },
  { kind: "blocks", label: "Blocks", parent: "District" }, { kind: "villages", label: "Villages", parent: "Block" },
];
const LIMIT = 25;

function GeoForm({ kind, item, onClose }: { kind: GeoKind; item: Geo | null; onClose: () => void }) {
  const qc = useQueryClient(), toast = useToast();
  const [name, setName] = useState(item?.name ?? ""), [code, setCode] = useState(item?.code ?? "");
  const [stateId, setStateId] = useState(""), [cascade, setCascade] = useState<Cascade>(emptyCascade);
  const parentId = kind === "districts" ? stateId : kind === "blocks" ? cascade.district : kind === "villages" ? cascade.block : undefined;
  const m = useMutation({
    mutationFn: () => item ? api.geo.update(kind, item.id, { name: name.trim(), code: code.trim() || null })
      : api.geo.create(kind, { name: name.trim(), code: code.trim() || null, parent_id: parentId ?? null }),
    onSuccess: () => { qc.invalidateQueries(); toast(item ? "Saved" : "Created"); onClose(); },
  });
  const needParent = !item && kind !== "states";
  const ok = name.trim() && (!needParent || parentId);
  return (
    <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); if (ok) m.mutate(); }}>
      {needParent && kind === "districts" && <Field label="State"><GeoSelect kind="states" value={stateId} onChange={setStateId} /></Field>}
      {needParent && kind === "blocks" && <Field label="District"><GeoCascade depth={1} labels={false} value={cascade} onChange={setCascade} /></Field>}
      {needParent && kind === "villages" && <Field label="District and block"><GeoCascade depth={2} labels={false} value={cascade} onChange={setCascade} /></Field>}
      <Field label="Name"><Input value={name} onChange={(e) => setName(e.target.value)} maxLength={120} autoFocus /></Field>
      <Field label="Code (optional)"><Input value={code} onChange={(e) => setCode(e.target.value)} maxLength={20} /></Field>
      {m.error && <ErrorBox error={m.error} />}
      <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={onClose}>Cancel</Button><Button type="submit" disabled={!ok || m.isPending}>{item ? "Save" : "Create"}</Button></div>
    </form>
  );
}

export default function LocationsPage() {
  const { can } = useAuth(), qc = useQueryClient(), toast = useToast();
  const [kind, setKind] = useState<GeoKind>("districts");
  const [search, setSearch] = useState(""), [offset, setOffset] = useState(0);
  const [filter, setFilter] = useState<Cascade>(emptyCascade), [stateFilter, setStateFilter] = useState("");
  const [editing, setEditing] = useState<Geo | null | "new">(null), [removing, setRemoving] = useState<Geo | null>(null);
  const meta = KINDS.find((k) => k.kind === kind)!;
  const parentId = kind === "districts" ? stateFilter : kind === "blocks" ? filter.district : kind === "villages" ? filter.block : undefined;
  useEffect(() => { setOffset(0); }, [kind, search, parentId]);

  const q = useQuery({ queryKey: ["geo", kind, search, parentId, offset], queryFn: () => api.geo.list(kind, { q: search, parent_id: parentId, limit: LIMIT, offset }) });
  const del = useMutation({
    mutationFn: (g: Geo) => api.geo.archive(kind, g.id),
    onSuccess: () => { qc.invalidateQueries(); toast("Archived"); setRemoving(null); },
    onError: (e) => { toast((e as Error).message, "err"); setRemoving(null); },
  });

  return (
    <>
      <PageHeader title="Locations" subtitle="State → District → Block → Village master data."
        action={can("locations:create") && <Button onClick={() => setEditing("new")}><Plus className="h-4 w-4" />Add {meta.label.slice(0, -1).toLowerCase()}</Button>} />
      <div className="mb-4 flex gap-1 border-b">
        {KINDS.map((k) => (
          <button key={k.kind} onClick={() => setKind(k.kind)} className={cn("-mb-px border-b-2 px-4 py-2 text-sm", kind === k.kind ? "border-accent font-medium text-primary" : "border-transparent text-muted-foreground hover:text-foreground")}>{k.label}</button>
        ))}
      </div>
      <Card>
        <div className="grid gap-3 border-b p-3 sm:grid-cols-3">
          <Input placeholder={`Search ${meta.label.toLowerCase()}…`} value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search" />
          {kind === "districts" && <GeoSelect kind="states" placeholder="All states" value={stateFilter} onChange={setStateFilter} />}
          {kind === "blocks" && <GeoSelect kind="districts" placeholder="All districts" value={filter.district} onChange={(d) => setFilter({ district: d, block: "", village: "" })} />}
          {kind === "villages" && <div className="sm:col-span-2"><GeoCascade depth={2} labels={false} value={filter} onChange={setFilter} /></div>}
        </div>
        {q.isLoading ? <Loading /> : q.error ? <div className="p-3"><ErrorBox error={q.error} /></div> : !q.data?.items.length ? <Empty>No {meta.label.toLowerCase()} found.</Empty> : (
          <>
            <Table><thead><tr><Th>Name</Th><Th>Code</Th><Th className="w-28 text-right">Actions</Th></tr></thead>
              <tbody>{q.data.items.map((g) => (
                <tr key={g.id} className="hover:bg-muted/40"><Td className="font-medium">{g.name}</Td><Td>{g.code ?? "—"}</Td>
                  <Td className="text-right">
                    {can("locations:update") && <Button variant="ghost" size="icon" aria-label={`Edit ${g.name}`} onClick={() => setEditing(g)}><Pencil className="h-4 w-4" /></Button>}
                    {can("locations:delete") && <Button variant="ghost" size="icon" aria-label={`Archive ${g.name}`} onClick={() => setRemoving(g)}><Trash2 className="h-4 w-4 text-destructive" /></Button>}
                  </Td></tr>
              ))}</tbody></Table>
            <Pagination total={q.data.total} offset={offset} limit={LIMIT} onChange={setOffset} />
          </>
        )}
      </Card>
      <Dialog open={editing !== null} onOpenChange={(o) => !o && setEditing(null)} title={editing === "new" ? `Add ${meta.label.slice(0, -1).toLowerCase()}` : `Edit ${meta.label.slice(0, -1).toLowerCase()}`}>
        {editing !== null && <GeoForm kind={kind} item={editing === "new" ? null : editing} onClose={() => setEditing(null)} />}
      </Dialog>
      <Confirm open={!!removing} onOpenChange={(o) => !o && setRemoving(null)} title="Archive location?" busy={del.isPending}
        body={`"${removing?.name}" will be archived (hidden, not deleted). Locations that still have active child locations cannot be archived.`}
        confirmLabel="Archive" onConfirm={() => removing && del.mutate(removing)} />
    </>
  );
}
