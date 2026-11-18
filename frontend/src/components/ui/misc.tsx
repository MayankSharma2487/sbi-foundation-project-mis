import * as DialogPrimitive from "@radix-ui/react-dialog";
import { ChevronLeft, ChevronRight, Loader2, X } from "lucide-react";
import * as React from "react";
import { Button } from "./button";
import { cn } from "@/lib/utils";

export const Card = ({ className, ...p }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn("rounded-lg border bg-card text-card-foreground shadow-sm", className)} {...p} />
);

const tones: Record<string, string> = {
  green: "bg-emerald-100 text-emerald-800", orange: "bg-orange-100 text-orange-800",
  red: "bg-red-100 text-red-800", gray: "bg-muted text-muted-foreground",
};
export const Badge = ({ tone = "gray", children }: { tone?: keyof typeof tones; children: React.ReactNode }) => (
  <span className={cn("inline-flex rounded-full px-2 py-0.5 text-xs font-medium", tones[tone])}>{children}</span>
);

export const Spinner = () => <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />;
export const Loading = () => <div className="flex justify-center p-10"><Spinner /></div>;
export const Empty = ({ children }: { children: React.ReactNode }) => (
  <div className="p-10 text-center text-sm text-muted-foreground">{children}</div>
);
export const ErrorBox = ({ error }: { error: unknown }) => (
  <div className="rounded-md border border-destructive/30 bg-red-50 p-3 text-sm text-destructive">
    {error instanceof Error ? error.message : "Something went wrong"}
  </div>
);

export const Table = ({ className, ...p }: React.TableHTMLAttributes<HTMLTableElement>) => (
  <div className="w-full overflow-x-auto"><table className={cn("w-full text-sm", className)} {...p} /></div>
);
export const Th = ({ className, ...p }: React.ThHTMLAttributes<HTMLTableCellElement>) => (
  <th className={cn("h-10 border-b bg-muted/60 px-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground", className)} {...p} />
);
export const Td = ({ className, ...p }: React.TdHTMLAttributes<HTMLTableCellElement>) => (
  <td className={cn("border-b px-3 py-2.5 align-middle", className)} {...p} />
);

export function Pagination({ total, offset, limit, onChange }: { total: number; offset: number; limit: number; onChange: (o: number) => void }) {
  if (total <= limit) return <p className="px-3 py-2 text-xs text-muted-foreground">{total} record{total === 1 ? "" : "s"}</p>;
  const page = Math.floor(offset / limit) + 1, pages = Math.ceil(total / limit);
  return (
    <div className="flex items-center justify-between px-3 py-2 text-xs text-muted-foreground">
      <span>{offset + 1}–{Math.min(offset + limit, total)} of {total}</span>
      <div className="flex items-center gap-1">
        <Button variant="outline" size="icon" className="h-7 w-7" disabled={page <= 1} onClick={() => onChange(offset - limit)} aria-label="Previous page"><ChevronLeft className="h-4 w-4" /></Button>
        <span>Page {page} / {pages}</span>
        <Button variant="outline" size="icon" className="h-7 w-7" disabled={page >= pages} onClick={() => onChange(offset + limit)} aria-label="Next page"><ChevronRight className="h-4 w-4" /></Button>
      </div>
    </div>
  );
}

export function Dialog({ open, onOpenChange, title, description, children, wide }: {
  open: boolean; onOpenChange: (o: boolean) => void; title: string; description?: string; children: React.ReactNode; wide?: boolean;
}) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/40" />
        <DialogPrimitive.Content className={cn("fixed left-1/2 top-1/2 z-50 max-h-[90vh] w-[95vw] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-lg border bg-card p-6 shadow-lg", wide ? "max-w-3xl" : "max-w-lg")}>
          <DialogPrimitive.Title className="text-lg font-semibold">{title}</DialogPrimitive.Title>
          <DialogPrimitive.Description className="mb-4 mt-1 text-sm text-muted-foreground">{description ?? " "}</DialogPrimitive.Description>
          {children}
          <DialogPrimitive.Close className="absolute right-4 top-4 rounded-sm opacity-70 hover:opacity-100" aria-label="Close"><X className="h-4 w-4" /></DialogPrimitive.Close>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

export function Confirm({ open, onOpenChange, title, body, confirmLabel = "Confirm", onConfirm, busy }: {
  open: boolean; onOpenChange: (o: boolean) => void; title: string; body: string; confirmLabel?: string; onConfirm: () => void; busy?: boolean;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title={title} description={body}>
      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
        <Button variant="destructive" disabled={busy} onClick={onConfirm}>{confirmLabel}</Button>
      </div>
    </Dialog>
  );
}

export const PageHeader = ({ title, subtitle, action }: { title: string; subtitle?: string; action?: React.ReactNode }) => (
  <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
    <div>
      <h1 className="text-xl font-semibold text-primary">{title}</h1>
      {subtitle && <p className="text-sm text-muted-foreground">{subtitle}</p>}
    </div>
    {action}
  </div>
);
