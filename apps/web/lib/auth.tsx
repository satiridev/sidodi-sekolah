'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { api, type AuthUser, type Membership } from './api';

interface AuthContextValue {
  /** true setelah status auth awal selesai dibaca (cegah flicker/redirect dini). */
  ready: boolean;
  user: AuthUser | null;
  memberships: Membership[];
  roleInSchool: (schoolId: string) => string | null;
  refresh: () => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, name: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [memberships, setMemberships] = useState<Membership[]>([]);

  const refresh = useCallback(async () => {
    const me = await api.me();
    setUser(me.user);
    setMemberships(me.memberships);
  }, []);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const me = await api.me();
        if (!active) return;
        setUser(me.user);
        setMemberships(me.memberships);
      } catch {
        if (!active) return;
        setUser(null);
        setMemberships([]);
      } finally {
        if (active) setReady(true);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const login = useCallback(
    async (email: string, password: string) => {
      const session = await api.login({ email, password });
      setUser(session.user);
      await refresh();
    },
    [refresh],
  );

  const register = useCallback(
    async (email: string, password: string, name: string) => {
      const session = await api.register({ email, password, name });
      setUser(session.user);
      await refresh();
    },
    [refresh],
  );

  const logout = useCallback(async () => {
    try {
      await api.logout();
    } catch {
      // Tetap bersihkan state lokal walau permintaan logout gagal.
    }
    setUser(null);
    setMemberships([]);
  }, []);

  const roleInSchool = useCallback(
    (schoolId: string) =>
      memberships.find((m) => m.schoolId === schoolId)?.role ?? null,
    [memberships],
  );

  const value = useMemo<AuthContextValue>(
    () => ({
      ready,
      user,
      memberships,
      roleInSchool,
      refresh,
      login,
      register,
      logout,
    }),
    [ready, user, memberships, roleInSchool, refresh, login, register, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth harus dipakai di dalam AuthProvider');
  return ctx;
}
