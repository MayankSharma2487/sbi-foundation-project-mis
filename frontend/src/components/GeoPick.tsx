import { useQuery } from "@tanstack/react-query";
import { Select } from "@/components/ui/form";
import { api } from "@/lib/api";

export type GeoKind = "states" | "districts" | "blocks" | "villages";

/** Select populated live from the API (already restricted to the caller's geography by the backend). */
export function GeoSelect({ kind, parentId, value, onChange, placeholder, disabled, id }: {
  kind: GeoKind; parentId?: string; value: string; onChange: (v: string) => void;
  placeholder?: string; disabled?: boolean; id?: string;
}) {
  const needsParent = kind === "blocks" || kind === "villages";
  const enabled = !needsParent || !!parentId;
  const q = useQuery({
    queryKey: ["geo-options", kind, parentId ?? null],
    queryFn: () => api.geo.list(kind, { parent_id: parentId, limit: 500 }),
    enabled,
  });
  return (
    <Select id={id} aria-label={kind.slice(0, -1)} value={value} disabled={disabled || !enabled} onChange={(e) => onChange(e.target.value)}>
      <option value="">{q.isLoading ? "Loading…" : (placeholder ?? `Select ${kind.slice(0, -1)}`)}</option>
      {q.data?.items.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
    </Select>
  );
}

export type Cascade = { district: string; block: string; village: string };
export const emptyCascade: Cascade = { district: "", block: "", village: "" };

/** District -> Block -> Village selectors; changing a level clears the levels below it. */
export function GeoCascade({ value, onChange, depth = 3, labels = true }: {
  value: Cascade; onChange: (c: Cascade) => void; depth?: 1 | 2 | 3; labels?: boolean;
}) {
  const L = (t: string) => labels ? <label className="mb-1.5 block text-sm font-medium">{t}</label> : null;
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      <div>{L("District")}<GeoSelect kind="districts" placeholder="All districts" value={value.district}
        onChange={(d) => onChange({ district: d, block: "", village: "" })} /></div>
      {depth >= 2 && <div>{L("Block")}<GeoSelect kind="blocks" placeholder="All blocks" parentId={value.district} value={value.block}
        onChange={(b) => onChange({ ...value, block: b, village: "" })} /></div>}
      {depth >= 3 && <div>{L("Village")}<GeoSelect kind="villages" placeholder="All villages" parentId={value.block} value={value.village}
        onChange={(v) => onChange({ ...value, village: v })} /></div>}
    </div>
  );
}
