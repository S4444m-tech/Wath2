import { createContext, useContext, useEffect, useState, useCallback } from "react";
import { api } from "@/lib/api";

const Ctx = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);

  const load = useCallback(async () => {
    try {
      const { data } = await api.get("/auth/me");
      setUser(data);
    } catch {
      setUser(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const login = async (username, pin) => {
    const { data } = await api.post("/auth/login", { username, pin });
    setUser(data);
    return data;
  };

  const logout = async () => {
    await api.post("/auth/logout").catch(() => {});
    setUser(false);
  };

  return <Ctx.Provider value={{ user, login, logout, reload: load }}>{children}</Ctx.Provider>;
}

export const useAuth = () => useContext(Ctx);
