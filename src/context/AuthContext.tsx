'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { api, ApiError } from '@/lib/api';
import { setWorkspaceScope } from '@/lib/workspace';
import type { School, User } from '@/lib/types';

interface AuthContextValue {
  user: User | null;
  school: School | null;
  activeWorkspaceId: string | null;
  loading: boolean;
  error: string | null;
  login: (email: string, password: string) => Promise<User>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
  updateProfile: (input: { name: string; phone?: string }) => Promise<void>;
  can: (permission: string) => boolean;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [activeWorkspaceId, setActiveWorkspaceId] = useState<string | null>(null);
  const [school, setSchool] = useState<School | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const data = await api.get<{ user: User; school: School; activeWorkspaceId: string | null }>('/api/auth/me');
      setWorkspaceScope(data.activeWorkspaceId, data.user.id);
      setActiveWorkspaceId(data.activeWorkspaceId);
      setUser(data.user);
      setSchool(data.school);
      setError(null);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        setUser(null);
        setSchool(null);
        setActiveWorkspaceId(null);
        setWorkspaceScope(null);
      } else {
        setError(err instanceof Error ? err.message : 'Could not reach the server.');
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const login = useCallback(async (email: string, password: string) => {
    setError(null);
    const data = await api.post<{ user: User; school: School; activeWorkspaceId: string | null }>('/api/auth/login', { email, password });
    setWorkspaceScope(data.activeWorkspaceId, data.user.id);
    setActiveWorkspaceId(data.activeWorkspaceId);
    setUser(data.user);
    setSchool(data.school);
    return data.user;
  }, []);

  const logout = useCallback(async () => {
    try {
      await api.post('/api/auth/logout');
    } finally {
      setUser(null);
      setSchool(null);
      setActiveWorkspaceId(null);
      setWorkspaceScope(null);
    }
  }, []);

  const updateProfile = useCallback(async (input: { name: string; phone?: string }) => {
    const data = await api.patch<{ user: User }>('/api/me', input);
    setUser(data.user);
  }, []);

  const can = useCallback(
    (permission: string) => {
      if (!user) return false;
      return user.permissions.includes('*') || user.permissions.includes(permission);
    },
    [user],
  );

  const value = useMemo(
    () => ({ user, school, activeWorkspaceId, loading, error, login, logout, refresh, updateProfile, can }),
    [user, school, activeWorkspaceId, loading, error, login, logout, refresh, updateProfile, can],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}
