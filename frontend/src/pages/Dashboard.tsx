import { useQuery } from "@tanstack/react-query";
import { Building2, FolderKanban, Home, MapPin, Users } from "lucide-react";
import { useState } from "react";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Cascade, emptyCascade, GeoCascade } from "@/components/GeoPick";
import { Card, Empty, ErrorBox, Loading, PageHeader } from "@/components/ui/misc";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";

function Kpi({ label, value, icon: Icon, tone }: { label: string; value: number | string; icon: typeof Users; tone: string }) {
  return (
    <Card className="flex items-center gap-4 p-4">
      <div className={`flex h-11 w-11 items-center justify-center rounded-lg ${tone}`}><Icon className="h-5 w-5" /></div>
      <div><div className="text-2xl font-semibold leading-none">{value}</div><div className="mt-1 text-xs text-muted-foreground">{label}</div></div>
    </Card>
  );
}

export default function DashboardPage() {
  const [geo, setGeo] = useState<Cascade>(emptyCascade);
  const q = useQuery({
    queryKey: ["summary", geo],
    queryFn: () => api.summary({ district_id: geo.district, block_id: geo.block, village_id: geo.village }),
  });
  const s = q.data;
  const status = s ? Object.entries(s.projects_by_status).map(([name, count]) => ({ name, count })) : [];

  return (
    <>
      <PageHeader title="Dashboard" subtitle="Live figures from the project database, limited to the areas you can access."
        action={<Button variant="outline" size="sm" onClick={() => setGeo(emptyCascade)}>Clear filters</Button>} />
      <Card className="mb-5 p-4"><GeoCascade value={geo} onChange={setGeo} /></Card>
      {q.isLoading ? <Loading /> : q.error ? <ErrorBox error={q.error} /> : s && (
        <>
          <div className="mb-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
            <Kpi label="Districts" value={s.totals.districts} icon={Building2} tone="bg-emerald-100 text-emerald-800" />
            <Kpi label="Blocks" value={s.totals.blocks} icon={MapPin} tone="bg-orange-100 text-orange-800" />
            <Kpi label="Villages" value={s.totals.villages} icon={Home} tone="bg-emerald-100 text-emerald-800" />
            <Kpi label="Projects" value={s.totals.projects} icon={FolderKanban} tone="bg-orange-100 text-orange-800" />
            {s.users_active !== null && <Kpi label="Active users" value={s.users_active} icon={Users} tone="bg-emerald-100 text-emerald-800" />}
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <Card className="p-4">
              <h2 className="mb-3 text-sm font-semibold">Blocks and villages by district</h2>
              {s.by_district.length === 0 ? <Empty>No districts in scope.</Empty> : (
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={s.by_district}><CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="district" tick={{ fontSize: 11 }} /><YAxis allowDecimals={false} /><Tooltip /><Legend />
                    <Bar dataKey="blocks" fill="#14532d" name="Blocks" radius={[3, 3, 0, 0]} />
                    <Bar dataKey="villages" fill="#f97316" name="Villages" radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </Card>
            <Card className="p-4">
              <h2 className="mb-3 text-sm font-semibold">Projects by status</h2>
              {s.totals.projects === 0 ? <Empty>No projects in scope.</Empty> : (
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={status}><CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="name" /><YAxis allowDecimals={false} /><Tooltip />
                    <Bar dataKey="count" fill="#14532d" name="Projects" radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </Card>
          </div>
          <p className="mt-4 text-xs text-muted-foreground">Programme indicators (mobilisation, membership, training, revenue, budget…) will appear here as those modules are added.</p>
        </>
      )}
    </>
  );
}
