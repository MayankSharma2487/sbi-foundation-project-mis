import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

type T = { id: number; msg: string; kind: "ok" | "err" };
const Ctx = createContext<(msg: string, kind?: "ok" | "err") => void>(() => {});
export const useToast = () => useContext(Ctx);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<T[]>([]);
  const push = useCallback((msg: string, kind: "ok" | "err" = "ok") => {
    const id = Date.now() + Math.random();
    setItems((x) => [...x, { id, msg, kind }]);
    setTimeout(() => setItems((x) => x.filter((i) => i.id !== id)), 4500);
  }, []);
  return (
    <Ctx.Provider value={push}>
      {children}
      <div className="fixed bottom-4 right-4 z-[60] space-y-2" role="status" aria-live="polite">
        {items.map((t) => (
          <div key={t.id} className={cn("max-w-sm rounded-md px-4 py-2.5 text-sm text-white shadow-lg", t.kind === "ok" ? "bg-primary" : "bg-destructive")}>{t.msg}</div>
        ))}
      </div>
    </Ctx.Provider>
  );
}
