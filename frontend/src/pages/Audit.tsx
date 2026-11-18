import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Input } from "@/components/ui/form";
import { Badge, Card, Empty, ErrorBox, Loading, PageHeader, Pagination, Table, Td, Th } from "@/components/ui/misc";
import { api } from "@/lib/api";
import { fmtDate } from "@/lib/utils";

const LIMIT = 25;

export default function AuditPage() {
  const [entity, setEntity] = useState(""), [action, setAction] = useState(""), [offset, setOffset] = useState(0);
  useEffect(() => setOffset(0), [entity, action]);
  const q = useQuery({ queryKey: ["audit", entity, action, offset], queryFn: () => api.audit({ entity: entity.trim(), action: action.trim(), limit: LIMIT, offset }) });
  return (
    <>
      <PageHeader title="Audit Logs" subtitle="Who did what, newest first. Entries cannot be edited or deleted from the application." />
      <Card>
        <div className="grid gap-3 border-b p-3 sm:grid-cols-2">
          <Input placeholder="Filter by entity (e.g. users, districts, projects)" value={entity} onChange={(e) => setEntity(e.target.value)} aria-label="Entity" />
          <Input placeholder="Filter by action (e.g. login, create, update)" value={action} onChange={(e) => setAction(e.target.value)} aria-label="Action" />
        </div>
        {q.isLoading ? <Loading /> : q.error ? <div className="p-3"><ErrorBox error={q.error} /></div> : !q.data?.items.length ? <Empty>No audit entries match.</Empty> : (
          <>
            <Table><thead><tr><Th>When</Th><Th>Action</Th><Th>Entity</Th><Th>Detail</Th><Th>User</Th><Th>IP</Th></tr></thead>
              <tbody>{q.data.items.map((a) => (
                <tr key={a.id}><Td className="whitespace-nowrap text-xs">{fmtDate(a.created_at)}</Td><Td><Badge tone="green">{a.action}</Badge></Td>
                  <Td>{a.entity}</Td><Td className="max-w-xs truncate font-mono text-xs" title={JSON.stringify(a.detail)}>{a.detail ? JSON.stringify(a.detail) : "—"}</Td>
                  <Td className="font-mono text-xs">{a.user_id?.slice(0, 8) ?? "—"}</Td><Td className="text-xs">{a.ip ?? "—"}</Td></tr>
              ))}</tbody></Table>
            <Pagination total={q.data.total} offset={offset} limit={LIMIT} onChange={setOffset} />
          </>
        )}
      </Card>
    </>
  );
}
