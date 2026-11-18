import { useQueryClient } from "@tanstack/react-query";
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { api, setUnauthorizedHandler, tokens, type Me } from "@/lib/api";

type AuthState = {
  me: Me | null; loading: boolean; can: (perm: string) => boolean;
  login: (email: string, pw: string) => Promise<void>; logout: () => void; reload: () => Promise<void>;
};
const Ctx = createContext<AuthState>(null!);
export const useAuth = () => useContext(Ctx);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(!!tokens.access);
  const qc = useQueryClient();

  const logout = useCallback(() => { tokens.clear(); setMe(null); qc.clear(); }, [qc]);
  const reload = useCallback(async () => { setMe(await api.me()); }, []);

  useEffect(() => { setUnauthorizedHandler(logout); }, [logout]);
  useEffect(() => {
    if (!tokens.access) return;
    reload().catch(() => tokens.clear()).finally(() => setLoading(false));
  }, [reload]);

  const login = async (email: string, pw: string) => { await api.login(email, pw); await reload(); };
  const can = (perm: string) => !!me?.permissions.includes(perm);
  return <Ctx.Provider value={{ me, loading, can, login, logout, reload }}>{children}</Ctx.Provider>;
}
