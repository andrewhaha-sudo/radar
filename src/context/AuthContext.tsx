'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api, ApiError } from '@/lib/api';
import { readOfflineSession } from '@/lib/offline';
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
      if (sessionStorage.getItem('radar:pending-server-logout') === '1') {
        if (!navigator.onLine) return;
        await api.post('/api/auth/logout');
        sessionStorage.removeItem('radar:pending-server-logout');
        return;
      }
      const data = await api.get<{ user: User; school: School; activeWorkspaceId: string | null }>(
        '/api/auth/me',
      );
      setWorkspaceScope(data.activeWorkspaceId, data.user.accountScope ?? data.user.id);
      setActiveWorkspaceId(data.activeWorkspaceId);
      setUser(data.user);
      setSchool(data.school);
      try {
        sessionStorage.setItem('radar:offline-session-authorized', '1');
      } catch {
        /* Optional offline continuity. */
      }
      setError(null);
    } catch (err) {
      if (err instanceof ApiError && (err.status === 401 || err.status === 403)) {
        try {
          sessionStorage.setItem('radar:offline-session-authorized', '0');
        } catch {
          /* Cache is not authorization. */
        }
        setUser(null);
        setSchool(null);
        setActiveWorkspaceId(null);
        setWorkspaceScope(null);
      } else {
        if (typeof navigator !== 'undefined' && !navigator.onLine) {
          const cached = await readOfflineSession<{
            user: User;
            school: School;
            activeWorkspaceId: string | null;
          }>();
          if (cached) {
            setUser(cached.user);
            setSchool(cached.school);
            setActiveWorkspaceId(cached.activeWorkspaceId);
            setError('Offline: read-only snapshot from a previously authorized session.');
            return;
          }
        }
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
    if (sessionStorage.getItem('radar:pending-server-logout') === '1') {
      await api.post('/api/auth/logout');
      sessionStorage.removeItem('radar:pending-server-logout');
    }
    const data = await api.post<{ user: User; school: School; activeWorkspaceId: string | null }>(
      '/api/auth/login',
      { email, password },
    );
    setWorkspaceScope(data.activeWorkspaceId, data.user.accountScope ?? data.user.id);
    setActiveWorkspaceId(data.activeWorkspaceId);
    setUser(data.user);
    setSchool(data.school);
    try {
      sessionStorage.setItem('radar:offline-session-authorized', '1');
    } catch {
      /* Optional offline continuity. */
    }
    return data.user;
  }, []);

  const logout = useCallback(async () => {
    try {
      const registration = await navigator.serviceWorker?.getRegistration();
      const subscription = await registration?.pushManager.getSubscription();
      await subscription?.unsubscribe();
    } catch {
      /* Logout still proceeds if the browser cannot manage push. */
    }
    try {
      await api.post('/api/auth/logout');
      sessionStorage.removeItem('radar:pending-server-logout');
    } catch {
      try {
        sessionStorage.setItem('radar:pending-server-logout', '1');
      } catch {
        /* The cached session flag is still revoked below. */
      }
    } finally {
      try {
        sessionStorage.setItem('radar:offline-session-authorized', '0');
      } catch {
        /* No cached session is restored after logout. */
      }
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
    () => ({
      user,
      school,
      activeWorkspaceId,
      loading,
      error,
      login,
      logout,
      refresh,
      updateProfile,
      can,
    }),
    [user, school, activeWorkspaceId, loading, error, login, logout, refresh, updateProfile, can],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}
