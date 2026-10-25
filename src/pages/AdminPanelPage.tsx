'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  Loader2,
  RefreshCw,
  Search,
  ShieldCheck,
  UserRound,
  Users,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { api, errorMessage } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { absoluteTime, relativeTime } from '@/components/ui/hazard-bits';
import { cn } from '@/components/ui/card';
import type { Role } from '@/lib/types';

const ROLES: Role[] = ['admin', 'inspector', 'teacher', 'responder', 'student', 'parent'];

const ROLE_HINT: Record<Role, string> = {
  admin: 'Full access, including users and audit',
  inspector: 'Scans, hazards and verification',
  teacher: 'Hazards and roll call',
  responder: 'Incidents, hazards and verification',
  student: 'Read-only campus information and SOS',
  parent: 'Read-only campus information and SOS',
};

interface AdminUser {
  id: number;
  email: string;
  name: string;
  role: Role;
  title: string | null;
  phone: string | null;
  createdAt: string;
}

interface AuditEntry {
  id: number;
  action: string;
  entity: string;
  entityId: string | null;
  meta: string;
  createdAt: string;
  actorName: string | null;
  actorRole: Role | null;
}

export function AdminPanelPage() {
  const { can, user } = useAuth();
  const [tab, setTab] = useState<'users' | 'audit'>('users');
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState<number | null>(null);
  const [pendingRole, setPendingRole] = useState<{ user: AdminUser; role: Role } | null>(null);

  const load = useCallback(async () => {
    if (!can('admin:users')) return;
    setLoading(true);
    setError(null);
    try {
      const [userPayload, auditPayload] = await Promise.all([
        api.get<{ users: AdminUser[] }>('/api/admin/users'),
        api.get<{ entries: AuditEntry[] }>('/api/admin/audit').catch(() => ({ entries: [] })),
      ]);
      setUsers(userPayload.users);
      setEntries(auditPayload.entries);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [can]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!can('admin:users')) {
    return (
      <div className="stack-page">
        <div className="mx-auto max-w-md rounded-xl border border-border bg-card p-6 text-center">
          <ShieldCheck className="mx-auto mb-2 h-8 w-8 text-muted-foreground" />
          <h1 className="text-lg font-semibold">Administrator access required</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            User management and the audit log are restricted to administrators. Permissions are
            enforced on the server.
          </p>
        </div>
      </div>
    );
  }

  const filteredUsers = users.filter((entry) => {
    const needle = query.trim().toLowerCase();
    if (!needle) return true;
    return [entry.name, entry.email, entry.role, entry.title].some((value) =>
      String(value ?? '').toLowerCase().includes(needle),
    );
  });

  const filteredEntries = entries.filter((entry) => {
    const needle = query.trim().toLowerCase();
    if (!needle) return true;
    return [entry.action, entry.entity, entry.entityId, entry.actorName].some((value) =>
      String(value ?? '').toLowerCase().includes(needle),
    );
  });

  const changeRole = async () => {
    if (!pendingRole) return;
    const { user: target, role } = pendingRole;
    setBusy(target.id);
    try {
      await api.patch(`/api/admin/users/${target.id}/role`, { role });
      setUsers((current) =>
        current.map((entry) => (entry.id === target.id ? { ...entry, role } : entry)),
      );
      setPendingRole(null);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="stack-page space-y-5">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
        <div>
          <div className="flex items-center gap-2">
            <span className="grid h-9 w-9 place-items-center rounded-lg bg-accent text-accent-foreground">
              <Users className="h-5 w-5" />
            </span>
            <h1 className="text-2xl font-semibold tracking-tight">Users &amp; audit</h1>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Manage account roles and review the immutable record of actions taken in the system.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
          <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} /> Refresh
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex rounded-lg border border-border bg-card p-0.5">
          {(
            [
              { id: 'users', label: `Users (${users.length})`, icon: Users },
              { id: 'audit', label: `Audit log (${entries.length})`, icon: Activity },
            ] as const
          ).map((option) => {
            const Icon = option.icon;
            return (
              <button
                key={option.id}
                onClick={() => setTab(option.id)}
                aria-pressed={tab === option.id}
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
                  tab === option.id
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:bg-accent',
                )}
              >
                <Icon className="h-3.5 w-3.5" /> {option.label}
              </button>
            );
          })}
        </div>

        <div className="relative ml-auto w-full max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={tab === 'users' ? 'Search people…' : 'Search audit actions…'}
            aria-label={tab === 'users' ? 'Search users' : 'Search audit log'}
            className="h-9 pl-9"
          />
        </div>
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span className="flex-1">{error}</span>
          <Button variant="link" size="sm" onClick={() => void load()}>
            Retry
          </Button>
        </div>
      )}

      {loading && users.length === 0 ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, index) => (
            <Skeleton key={index} className="h-16 w-full rounded-xl" />
          ))}
        </div>
      ) : tab === 'users' ? (
        <div className="overflow-hidden rounded-xl border border-border bg-card">
          <div className="hidden grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)_160px_140px] gap-3 border-b border-border bg-muted/40 px-4 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground md:grid">
            <span>Person</span>
            <span>Title</span>
            <span>Role</span>
            <span className="text-right">Joined</span>
          </div>
          <ul className="divide-y divide-border">
            {filteredUsers.length === 0 ? (
              <li className="px-4 py-10 text-center text-xs text-muted-foreground">
                No users match “{query}”.
              </li>
            ) : (
              filteredUsers.map((entry) => (
                <li
                  key={entry.id}
                  className="grid gap-2 px-4 py-3 md:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)_160px_140px] md:items-center md:gap-3"
                >
                  <div className="flex items-center gap-2.5">
                    <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-primary text-[11px] font-bold text-primary-foreground">
                      {entry.name.charAt(0).toUpperCase()}
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">
                        {entry.name}
                        {entry.id === user?.id && (
                          <span className="ml-1.5 text-[10px] font-normal text-muted-foreground">(you)</span>
                        )}
                      </p>
                      <p className="truncate text-[11px] text-muted-foreground">{entry.email}</p>
                    </div>
                  </div>

                  <p className="truncate text-xs text-muted-foreground md:pl-0 pl-10">
                    {entry.title ?? 'No title recorded'}
                  </p>

                  <div className="md:pl-0 pl-10">
                    <label className="sr-only" htmlFor={`role-${entry.id}`}>
                      Role for {entry.name}
                    </label>
                    <select
                      id={`role-${entry.id}`}
                      value={entry.role}
                      disabled={busy === entry.id || entry.id === user?.id}
                      onChange={(event) => {
                        const nextRole = event.target.value as Role;
                        if (nextRole === entry.role) return;
                        setPendingRole({ user: entry, role: nextRole });
                      }}
                      className="h-8 w-full rounded-lg border border-input bg-background px-2 text-xs capitalize disabled:opacity-60"
                      title={entry.id === user?.id ? 'You cannot change your own role' : ROLE_HINT[entry.role]}
                    >
                      {ROLES.map((role) => (
                        <option key={role} value={role}>
                          {role}
                        </option>
                      ))}
                    </select>
                  </div>

                  <p className="text-[11px] text-muted-foreground md:text-right md:pl-0 pl-10">
                    {relativeTime(entry.createdAt)}
                  </p>
                </li>
              ))
            )}
          </ul>
          <p className="border-t border-border bg-muted/30 px-4 py-2 text-[11px] text-muted-foreground">
            Role changes take effect on the user&apos;s next request. Signing in is unaffected.
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-border bg-card">
          <div className="hidden grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)_160px_160px] gap-3 border-b border-border bg-muted/40 px-4 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground md:grid">
            <span>Action</span>
            <span>Actor</span>
            <span>Entity</span>
            <span className="text-right">When</span>
          </div>
          <ul className="divide-y divide-border">
            {filteredEntries.length === 0 ? (
              <li className="px-4 py-10 text-center text-xs text-muted-foreground">
                {entries.length === 0 ? 'No audit entries recorded yet.' : `No entries match “${query}”.`}
              </li>
            ) : (
              filteredEntries.map((entry) => (
                <li
                  key={entry.id}
                  className="grid gap-1 px-4 py-2.5 md:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)_160px_160px] md:items-center md:gap-3"
                >
                  <div className="flex items-center gap-2">
                    <Activity className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    <code className="truncate rounded bg-muted px-1.5 py-0.5 font-mono text-[10px]">
                      {entry.action}
                    </code>
                  </div>
                  <div className="flex min-w-0 items-center gap-1.5 pl-6 md:pl-0">
                    <UserRound className="h-3 w-3 shrink-0 text-muted-foreground" />
                    <span className="truncate text-xs">{entry.actorName ?? 'System'}</span>
                    {entry.actorRole && (
                      <Badge variant="outline" className="shrink-0 text-[9px] capitalize">
                        {entry.actorRole}
                      </Badge>
                    )}
                  </div>
                  <p className="truncate pl-6 font-mono text-[10px] text-muted-foreground md:pl-0">
                    {entry.entity}
                    {entry.entityId ? ` #${entry.entityId}` : ''}
                  </p>
                  <p
                    className="pl-6 text-[10px] text-muted-foreground md:pl-0 md:text-right"
                    title={absoluteTime(entry.createdAt)}
                  >
                    {relativeTime(entry.createdAt)}
                  </p>
                </li>
              ))
            )}
          </ul>
          <p className="border-t border-border bg-muted/30 px-4 py-2 text-[11px] text-muted-foreground">
            The audit log is append-only. Entries cannot be edited or removed from the interface.
          </p>
        </div>
      )}

      {loading && users.length > 0 && (
        <p className="flex items-center justify-center gap-1.5 text-[11px] text-muted-foreground">
          <Loader2 className="h-3 w-3 animate-spin" /> Refreshing administration data…
        </p>
      )}

      <ConfirmDialog
        open={pendingRole !== null}
        onOpenChange={(open) => (!open ? setPendingRole(null) : null)}
        title="Change this user's role?"
        description={
          pendingRole
            ? `${pendingRole.user.name} will become ${pendingRole.role}. ${ROLE_HINT[pendingRole.role]}. The change is written to the audit log.`
            : ''
        }
        confirmLabel="Change role"
        loading={busy !== null}
        onConfirm={() => void changeRole()}
      />
    </div>
  );
}
