'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Bell,
  CheckCheck,
  AlertTriangle,
  CheckCircle2,
  Info,
  Trash2,
  Loader2,
  RefreshCw,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { api, errorMessage } from '@/lib/api';
import { relativeTime } from '@/components/ui/hazard-bits';
import { cn } from '@/components/ui/card';
import type { Notification } from '@/lib/types';

const TYPE_META = {
  alert: { icon: AlertTriangle, className: 'text-danger', label: 'Alert' },
  warning: { icon: AlertTriangle, className: 'text-warning', label: 'Warning' },
  success: { icon: CheckCircle2, className: 'text-success', label: 'Success' },
  info: { icon: Info, className: 'text-info', label: 'Info' },
} as const;

export function notifyChanged() {
  window.dispatchEvent(new CustomEvent('radar:notifications-changed'));
}

export function NotificationsPanel() {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  const unread = items.filter((n) => !n.read).length;

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.get<{ notifications: Notification[] }>('/api/notifications');
      setItems(data.notifications);
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

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const markRead = async (id: number) => {
    setItems((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)));
    try {
      await api.patch(`/api/notifications/${id}/read`);
      notifyChanged();
    } catch {
      void load();
    }
  };

  const markAll = async () => {
    setItems((prev) => prev.map((n) => ({ ...n, read: true })));
    try {
      await api.post('/api/notifications/read-all');
      notifyChanged();
    } catch {
      void load();
    }
  };

  const clearRead = async () => {
    setItems((prev) => prev.filter((n) => !n.read));
    try {
      await api.del('/api/notifications/read');
      notifyChanged();
    } catch {
      void load();
    }
  };

  return (
    <div className="relative" ref={containerRef}>
      <Button
        variant="outline"
        size="icon"
        onClick={() => {
          setOpen((p) => !p);
          if (!open) void load();
        }}
        className="relative"
        aria-label={unread > 0 ? `Notifications, ${unread} unread` : 'Notifications'}
        aria-expanded={open}
        aria-haspopup="dialog"
      >
        <Bell className="h-[18px] w-[18px]" />
        {unread > 0 && (
          <span className="absolute -right-1 -top-1 grid h-4 min-w-4 place-items-center rounded-full bg-danger px-1 text-[10px] font-bold leading-none text-white">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </Button>

      {open && (
        <div
          className="absolute right-0 top-12 z-50 w-[min(92vw,380px)] overflow-hidden rounded-xl border border-border bg-card shadow-2xl animate-in"
          role="dialog"
          aria-label="Notifications"
        >
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <div className="flex items-center gap-2">
              <Bell className="h-4 w-4 text-accent-foreground" />
              <h2 className="text-sm font-semibold">Notifications</h2>
              {unread > 0 && <Badge variant="danger">{unread} new</Badge>}
            </div>
            <button
              onClick={() => void load()}
              className="grid h-8 w-8 place-items-center rounded-md text-muted-foreground hover:bg-accent"
              aria-label="Refresh notifications"
            >
              <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} />
            </button>
          </div>

          <div className="max-h-[380px] overflow-y-auto">
            {loading && items.length === 0 ? (
              <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading…
              </div>
            ) : error ? (
              <div className="space-y-3 px-4 py-8 text-center">
                <p className="text-sm text-muted-foreground">{error}</p>
                <Button size="sm" variant="outline" onClick={() => void load()}>
                  Retry
                </Button>
              </div>
            ) : items.length === 0 ? (
              <div className="px-4 py-10 text-center text-sm text-muted-foreground">
                You have no notifications.
              </div>
            ) : (
              <ul className="divide-y divide-border/70">
                {items.slice(0, 12).map((n) => {
                  const meta = TYPE_META[n.type] ?? TYPE_META.info;
                  const Icon = meta.icon;
                  return (
                    <li key={n.id}>
                      <button
                        onClick={() => {
                          void markRead(n.id);
                          setOpen(false);
                          if (n.href) navigate(n.href);
                        }}
                        className={cn(
                          'flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-accent',
                          !n.read && 'bg-accent/40',
                        )}
                      >
                        <Icon className={cn('mt-0.5 h-4 w-4 shrink-0', meta.className)} aria-hidden="true" />
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center gap-2">
                            <span className="truncate text-sm font-medium text-foreground">{n.title}</span>
                            {!n.read && <span className="h-2 w-2 shrink-0 rounded-full bg-accent-solid" />}
                          </span>
                          <span className="mt-0.5 block line-clamp-2 text-xs text-muted-foreground">{n.body}</span>
                          <span className="mt-1 block text-[11px] text-muted-foreground">
                            {meta.label} · {relativeTime(n.createdAt)}
                          </span>
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <div className="flex items-center justify-between gap-2 border-t border-border bg-muted/40 px-3 py-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => void clearRead()}
              disabled={!items.some((n) => n.read)}
              className="text-muted-foreground"
            >
              <Trash2 className="h-3.5 w-3.5" /> Clear read
            </Button>
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="sm" onClick={() => void markAll()} disabled={unread === 0}>
                <CheckCheck className="h-3.5 w-3.5" /> Mark all read
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setOpen(false);
                  navigate('/notifications');
                }}
              >
                View all
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
