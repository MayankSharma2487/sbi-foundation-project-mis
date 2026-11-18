import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Lock } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge, Card, ErrorBox, Loading, PageHeader } from "@/components/ui/misc";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/lib/toast";
import { cn } from "@/lib/utils";

const ACTIONS = ["create", "read", "update", "delete", "approve", "export"];

export default function RolesPage() {
  const { can } = useAuth(), qc = useQueryClient(), toast = useToast();
  const roles = useQuery({ queryKey: ["roles"], queryFn: api.roles.list });
  const perms = useQuery({ queryKey: ["permissions"], queryFn: api.roles.permissions });
  const [roleId, setRoleId] = useState<string>("");
  useEffect(() => { if (!roleId && roles.data?.length) setRoleId(roles.data[0].id); }, [roles.data, roleId]);
  const role = roles.data?.find((r) => r.id === roleId);
  const rp = useQuery({ queryKey: ["role-perms", roleId], queryFn: () => api.roles.rolePerms(roleId), enabled: !!roleId });
  const [sel, setSel] = useState<Set<string>>(new Set());
  useEffect(() => { if (rp.data) setSel(new Set(rp.data.codes)); }, [rp.data]);

  const resources = useMemo(() => [...new Set((perms.data ?? []).filter((c) => c.includes(":")).map((c) => c.split(":")[0]))], [perms.data]);
  const special = (perms.data ?? []).filter((c) => !ACTIONS.includes(c.split(":")[1]));
  const exists = (c: string) => perms.data?.includes(c);
  const dirty = rp.data ? (sel.size !== rp.data.codes.length || rp.data.codes.some((c) => !sel.has(c))) : false;
  const editable = can("roles:update") && role?.code !== "super_admin";
  const toggle = (c: string) => setSel((s) => { const n = new Set(s); n.has(c) ? n.delete(c) : n.add(c); return n; });
  const save = useMutation({
    mutationFn: () => api.roles.setRolePerms(roleId, [...sel]),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["role-perms", roleId] }); toast("Permissions saved"); },
  });

  if (roles.isLoading || perms.isLoading) return <Loading />;
  if (roles.error || perms.error) return <ErrorBox error={roles.error ?? perms.error} />;
  return (
    <>
      <PageHeader title="Roles & Permissions" subtitle="Choose a role to review or change what it may do. Changes apply to all users holding the role."
        action={editable && <Button variant="accent" disabled={!dirty || save.isPending} onClick={() => save.mutate()}>Save changes</Button>} />
      <div className="grid gap-4 lg:grid-cols-[240px_1fr]">
        <Card className="h-fit p-2">
          {roles.data?.map((r) => (
            <button key={r.id} onClick={() => setRoleId(r.id)} className={cn("flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm", r.id === roleId ? "bg-primary text-primary-foreground" : "hover:bg-muted")}>
              {r.name}{r.code === "super_admin" && <Lock className="h-3.5 w-3.5" />}
            </button>
          ))}
        </Card>
        <Card className="p-4">
          {role?.code === "super_admin" && <p className="mb-3 text-sm text-muted-foreground">The Super Admin role always holds every permission and cannot be edited.</p>}
          {!can("roles:update") && <p className="mb-3 text-sm text-muted-foreground">You can view but not change permissions.</p>}
          {rp.isLoading ? <Loading /> : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm"><thead><tr><th className="py-2 text-left text-xs uppercase tracking-wide text-muted-foreground">Module</th>
                {ACTIONS.map((a) => <th key={a} className="px-2 py-2 text-center text-xs capitalize text-muted-foreground">{a}</th>)}</tr></thead>
                <tbody>{resources.map((r) => (
                  <tr key={r} className="border-t"><td className="py-1.5 capitalize">{r.replace(/_/g, " ")}</td>
                    {ACTIONS.map((a) => { const c = `${r}:${a}`; return <td key={a} className="px-2 text-center">
                      {exists(c) ? <input type="checkbox" aria-label={c} checked={sel.has(c)} disabled={!editable} onChange={() => toggle(c)} /> : null}</td>; })}</tr>
                ))}</tbody></table>
            </div>
          )}
          {special.length > 0 && (
            <div className="mt-4 border-t pt-3"><div className="mb-2 text-sm font-semibold">Special permissions</div>
              {special.map((c) => (
                <label key={c} className="mr-5 inline-flex items-center gap-2 text-sm"><input type="checkbox" checked={sel.has(c)} disabled={!editable} onChange={() => toggle(c)} />
                  <code>{c}</code>{c === "pii:read" && <Badge tone="orange">unmasks Aadhaar / PAN / bank</Badge>}</label>
              ))}</div>
          )}
          {save.error && <div className="mt-3"><ErrorBox error={save.error} /></div>}
        </Card>
      </div>
    </>
  );
}
