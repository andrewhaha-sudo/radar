'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertTriangle,
  Bell,
  CheckCheck,
  CheckCircle2,
  Info,
  RefreshCw,
  ShieldAlert,
  Trash2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { api, errorMessage } from '@/lib/api';
import { notifyChanged } from '@/components/notifications/NotificationsPanel';
import { absoluteTime, relativeTime } from '@/components/ui/hazard-bits';
import { cn } from '@/components/ui/card';
import type { Notification } from '@/lib/types';

const TYPE_META = {
  alert: { icon: ShieldAlert, className: 'text-danger bg-danger/10', label: 'Alert' },
  warning: { icon: AlertTriangle, className: 'text-warning bg-warning/10', label: 'Warning' },
  success: { icon: CheckCircle2, className: 'text-success bg-success/10', label: 'Success' },
  info: { icon: Info, className: 'text-info bg-info/10', label: 'Info' },
} as const;

type Filter = 'all' | 'unread' | 'read';

export function NotificationsPage() {
  const navigate = useNavigate();
  const [items, setItems] = useState<Notification[]>([]);
  const [filter, setFilter] = useState<Filter>('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const payload = await api.get<{ notifications: Notification[]; unread: number }>(
        '/api/notifications',
      );
      setItems(payload.notifications);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const onChange = () => void load();
    window.addEventListener('radar:notifications-changed', onChange);
    return () => window.removeEventListener('radar:notifications-changed', onChange);
  }, [load]);

  const unread = items.filter((item) => !item.read).length;
  const read = items.length - unread;

  const filtered = useMemo(() => {
    if (filter === 'unread') return items.filter((item) => !item.read);
    if (filter === 'read') return items.filter((item) => item.read);
    return items;
  }, [items, filter]);

  const markRead = async (item: Notification) => {
    if (item.read) {
      if (item.href) navigate(item.href);
      return;
    }
    setBusy(`read-${item.id}`);
    setItems((current) =>
      current.map((entry) => (entry.id === item.id ? { ...entry, read: true } : entry)),
    );
    try {
      await api.patch(`/api/notifications/${item.id}/read`);
      notifyChanged();
      if (item.href) navigate(item.href);
    } catch (err) {
      setItems((current) =>
        current.map((entry) => (entry.id === item.id ? { ...entry, read: false } : entry)),
      );
      setError(errorMessage(err));
    } finally {
      setBusy(null);
    }
  };

  const markAll = async () => {
    const previous = items;
    setBusy('all');
    setItems((current) => current.map((entry) => ({ ...entry, read: true })));
    try {
      await api.post('/api/notifications/read-all');
      notifyChanged();
    } catch (err) {
      setItems(previous);
      setError(errorMessage(err));
    } finally {
      setBusy(null);
    }
  };

  const clearRead = async () => {
    const previous = items;
    setBusy('clear');
    setItems((current) => current.filter((entry) => !entry.read));
    try {
      await api.del('/api/notifications/read');
      notifyChanged();
    } catch (err) {
      setItems(previous);
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
              <Bell className="h-5 w-5" />
            </span>
            <h1 className="text-2xl font-semibold tracking-tight">Notifications</h1>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Alerts addressed to your account. Marking items read updates the badge across the app.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
            <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} /> Refresh
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => void markAll()}
            disabled={unread === 0 || busy !== null}
            loading={busy === 'all'}
          >
            <CheckCheck className="h-4 w-4" /> Mark all read
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => void clearRead()}
            disabled={read === 0 || busy !== null}
            loading={busy === 'clear'}
          >
            <Trash2 className="h-4 w-4" /> Clear read
          </Button>
        </div>
      </div>

      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-card p-2">
        {(
          [
            { id: 'all', label: 'All', count: items.length },
            { id: 'unread', label: 'Unread', count: unread },
            { id: 'read', label: 'Read', count: read },
          ] as Array<{ id: Filter; label: string; count: number }>
        ).map((option) => (
          <button
            key={option.id}
            onClick={() => setFilter(option.id)}
            aria-pressed={filter === option.id}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors',
              filter === option.id
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:bg-accent',
            )}
          >
            {option.label}
            <span
              className={cn(
                'rounded-full px-1.5 py-0.5 text-[10px] font-bold tabular-nums',
                filter === option.id ? 'bg-primary-foreground/20' : 'bg-muted',
              )}
            >
              {option.count}
            </span>
          </button>
        ))}
        <span className="ml-auto pr-1 text-[11px] text-muted-foreground">
          {filtered.length} of {items.length} shown
        </span>
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

      {loading && items.length === 0 ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, index) => (
            <Skeleton key={index} className="h-20 w-full rounded-xl" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-card px-6 py-16 text-center">
          <Bell className="mx-auto mb-2 h-8 w-8 text-muted-foreground" />
          <p className="text-sm font-medium">
            {items.length === 0
              ? 'No notifications yet'
              : filter === 'unread'
                ? 'You are all caught up'
                : 'No read notifications to show'}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {items.length === 0
              ? 'Hazard, scan and incident events addressed to you will appear here.'
              : 'Switch the filter to see the rest of your notifications.'}
          </p>
        </div>
      ) : (
        <ul className="space-y-2">
          {filtered.map((item) => {
            const meta = TYPE_META[item.type] ?? TYPE_META.info;
            const Icon = meta.icon;
            return (
              <li key={item.id}>
                <div
                  className={cn(
                    'flex items-start gap-3 rounded-xl border bg-card p-3.5 transition-colors',
                    item.read ? 'border-border' : 'border-accent-border bg-accent/30',
                  )}
                >
                  <span className={cn('grid h-9 w-9 shrink-0 place-items-center rounded-lg', meta.className)}>
                    <Icon className="h-4 w-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <p className="text-sm font-medium leading-snug">{item.title}</p>
                      {!item.read && (
                        <span
                          className="h-1.5 w-1.5 rounded-full bg-accent-solid"
                          aria-label="Unread"
                        />
                      )}
                      <Badge variant="outline" className="text-[9px]">
                        {meta.label}
                      </Badge>
                    </div>
                    <p className="mt-0.5 text-xs text-muted-foreground">{item.body}</p>
                    <p className="mt-1 flex flex-wrap items-center gap-x-2 text-[10px] text-muted-foreground">
                      <span>{relativeTime(item.createdAt)}</span>
                      <span aria-hidden="true">·</span>
                      <span>{absoluteTime(item.createdAt)}</span>
                      {item.href && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span className="font-mono">{item.href}</span>
                        </>
                      )}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1.5">
                    {!item.read ? (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => void markRead(item)}
                        loading={busy === `read-${item.id}`}
                      >
                        Mark read
                      </Button>
                    ) : (
                      <Badge variant="success" className="text-[10px]">
                        Read
                      </Badge>
                    )}
                    {item.href && (
                      <button
                        onClick={() => void markRead(item)}
                        className="text-[11px] font-medium text-accent-foreground hover:underline"
                      >
                        Open
                      </button>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <p className="text-center text-[11px] text-muted-foreground">
        Notifications are generated by server-side events. Actions taken here are written to your
        account only.
      </p>
    </div>
  );
}
