'use client';

import {
  LayoutDashboard,
  Map as MapIcon,
  ScanEye,
  AlertTriangle,
  Activity,
  ShieldAlert,
  Settings,
  LogOut,
  PhoneCall,
  Building2,
  Bell,
  Users,
  X,
  ChevronRight,
  BellRing,
  RadioTower,
  ShieldCheck,
  DoorOpen,
  Package,
  ClipboardList,
  BarChart3,
  CloudOff,
} from 'lucide-react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/context/AuthContext';
import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { cn } from '@/components/ui/card';
import type { Notification } from '@/lib/types';

export interface NavItem {
  title: string;
  href: string;
  icon: React.ElementType;
  permission?: string;
  badge?: 'hazards' | 'incidents' | 'alerts';
}

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
}

const NAV_SECTIONS: Array<{ label: string; items: NavItem[] }> = [
  {
    label: 'Operate',
    items: [
      { title: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
      { title: 'Campus map', href: '/map', icon: MapIcon },
      { title: 'Room scanning', href: '/scan', icon: ScanEye, permission: 'scan:read' },
      { title: 'Hazards', href: '/hazards', icon: AlertTriangle, permission: 'hazards:read', badge: 'hazards' },
      { title: 'Roll call', href: '/rollcall', icon: Activity, permission: 'rollcall:read' },
      { title: 'Incidents', href: '/incidents', icon: ShieldAlert, permission: 'incidents:read', badge: 'incidents' },
    ],
  },
  {
    label: 'Respond',
    items: [
      { title: 'Alerts', href: '/alerts', icon: BellRing, permission: 'alerts:read', badge: 'alerts' },
      { title: 'Disaster watch', href: '/disaster', icon: RadioTower, permission: 'advisories:read' },
      { title: 'Safety status', href: '/safety', icon: ShieldCheck, permission: 'safety:write' },
      { title: 'Evacuation', href: '/evacuation', icon: DoorOpen, permission: 'evacuation:read' },
      { title: 'Resources', href: '/resources', icon: Package, permission: 'resources:read' },
    ],
  },
  {
    label: 'Recover',
    items: [
      { title: 'Recovery', href: '/recovery', icon: ClipboardList, permission: 'recovery:read' },
      { title: 'Analytics', href: '/analytics', icon: BarChart3, permission: 'analytics:read' },
    ],
  },
  {
    label: 'Campus',
    items: [
      { title: 'Buildings & rooms', href: '/buildings', icon: Building2, permission: 'buildings:read' },
      { title: 'Notifications', href: '/notifications', icon: Bell, permission: 'notifications:read' },
      { title: 'Offline & sync', href: '/offline', icon: CloudOff },
    ],
  },
  {
    label: 'Administration',
    items: [
      { title: 'Users & audit', href: '/admin', icon: Users, permission: 'admin:users' },
      { title: 'Settings', href: '/settings', icon: Settings },
    ],
  },
];

function SidebarBody({ onNavigate }: { onNavigate?: () => void }) {
  const { user, school, can, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [unread, setUnread] = useState(0);
  const [counts, setCounts] = useState({ hazards: 0, incidents: 0, alerts: 0 });

  const load = useCallback(async () => {
    if (!user) return;
    try {
      const [n, h, i, a] = await Promise.all([
        api.get<{ unread: number; notifications: Notification[] }>('/api/notifications').catch(() => null),
        can('hazards:read')
          ? api.get<{ total: number }>('/api/hazards?pageSize=1&status=new,pending_review,verified,in_progress').catch(() => null)
          : Promise.resolve(null),
        can('incidents:read')
          ? api.get<{ incidents: Array<{ status: string }> }>('/api/incidents').catch(() => null)
          : Promise.resolve(null),
        can('alerts:read')
          ? api.get<{ counts: { active: number } }>('/api/alerts').catch(() => null)
          : Promise.resolve(null),
      ]);
      if (n) setUnread(n.unread);
      if (h) setCounts((c) => ({ ...c, hazards: h.total }));
      if (i) setCounts((c) => ({ ...c, incidents: i.incidents.filter((x) => x.status !== 'closed').length }));
      if (a) setCounts((c) => ({ ...c, alerts: a.counts.active }));
    } catch {
      // Sidebar counts are non-critical; ignore failures.
    }
  }, [user, can]);

  useEffect(() => {
    void load();
    const t = window.setInterval(load, 60_000);
    return () => window.clearInterval(t);
  }, [load]);

  const isActive = (href: string) =>
    location.pathname === href ||
    (href !== '/dashboard' && location.pathname.startsWith(`${href}/`));

  const go = (href: string) => {
    navigate(href);
    onNavigate?.();
  };

  const handleLogout = async () => {
    await logout();
    navigate('/login', { replace: true });
  };

  const roleLabel = user?.role ? user.role.charAt(0).toUpperCase() + user.role.slice(1) : '';

  return (
    <>
      <div className="flex h-16 shrink-0 items-center justify-between gap-2 border-b border-border px-4">
        <button onClick={() => go('/dashboard')} className="flex min-w-0 items-center gap-3 text-left">
          <span className="radar-mark" aria-hidden="true">
            <span className="radar-mark__sweep" />
            <span className="radar-mark__ring radar-mark__ring--1" />
            <span className="radar-mark__ring radar-mark__ring--2" />
            <span className="radar-mark__core">R</span>
          </span>
          <span className="min-w-0">
            <span className="block truncate text-sm font-semibold tracking-[0.14em] text-foreground">
              RADAR
            </span>
            <span className="block truncate text-[11px] text-muted-foreground">
              {school?.name ?? 'School safety'}
            </span>
          </span>
        </button>
        <button
          onClick={onNavigate}
          className="grid h-9 w-9 place-items-center rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground lg:hidden"
          aria-label="Close navigation"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-4" aria-label="Primary navigation">
        {NAV_SECTIONS.map((section) => {
          const items = section.items.filter((item) => !item.permission || can(item.permission));
          if (items.length === 0) return null;
          return (
            <div key={section.label} className="mb-5">
              <p className="px-3 pb-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                {section.label}
              </p>
              <div className="space-y-1">
                {items.map((item) => {
                  const active = isActive(item.href);
                  const Icon = item.icon;
                  const badgeValue =
                    item.badge === 'hazards'
                      ? counts.hazards
                      : item.badge === 'incidents'
                        ? counts.incidents
                        : item.badge === 'alerts'
                          ? counts.alerts
                          : item.href === '/notifications'
                            ? unread
                            : 0;
                  return (
                    <button
                      key={item.href}
                      onClick={() => go(item.href)}
                      className={cn(
                        'group flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
                        active
                          ? 'bg-primary text-primary-foreground shadow-sm'
                          : 'text-muted-foreground hover:bg-accent hover:text-foreground',
                      )}
                      aria-current={active ? 'page' : undefined}
                    >
                      <Icon className="h-[18px] w-[18px] shrink-0" aria-hidden="true" />
                      <span className="flex-1 truncate text-left">{item.title}</span>
                      {badgeValue > 0 && (
                        <Badge
                          variant={item.badge === 'incidents' ? 'danger' : 'outline'}
                          className={cn(
                            'min-w-5 justify-center px-1.5 text-[10px]',
                            active ? 'border-primary-foreground/40 text-primary-foreground' : '',
                          )}
                        >
                          {badgeValue}
                        </Badge>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </nav>

      <div className="shrink-0 space-y-1 border-t border-border p-3">
        {can('sos:create') && (
          <button
            onClick={() => go('/sos')}
            className="flex w-full items-center gap-3 rounded-lg border border-danger/30 bg-danger/10 px-3 py-2.5 text-sm font-semibold text-danger transition-colors hover:bg-danger/15"
          >
            <PhoneCall className="h-[18px] w-[18px]" aria-hidden="true" />
            Emergency SOS
            <ChevronRight className="ml-auto h-4 w-4" />
          </button>
        )}
        <button
          onClick={handleLogout}
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          <LogOut className="h-[18px] w-[18px]" aria-hidden="true" />
          Sign out
        </button>
        <div className="flex items-center gap-2 rounded-lg bg-muted/60 px-3 py-2">
          <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-primary text-[11px] font-bold text-primary-foreground">
            {user?.name?.charAt(0).toUpperCase() ?? '?'}
          </span>
          <div className="min-w-0">
            <p className="truncate text-xs font-medium text-foreground">{user?.name}</p>
            <p className="truncate text-[11px] text-muted-foreground">
              {user?.title ?? roleLabel}
            </p>
          </div>
        </div>
      </div>
    </>
  );
}

export function Sidebar({ isOpen, onClose }: SidebarProps) {
  return (
    <>
      <aside className="sticky top-0 hidden h-svh w-72 shrink-0 flex-col border-r border-border bg-sidebar lg:flex">
        <SidebarBody />
      </aside>

      <div
        className={cn('fixed inset-0 z-50 lg:hidden', isOpen ? '' : 'pointer-events-none')}
        aria-hidden={!isOpen}
      >
        <div
          className={cn(
            'absolute inset-0 bg-black/50 backdrop-blur-[2px] transition-opacity',
            isOpen ? 'opacity-100' : 'opacity-0',
          )}
          onClick={onClose}
        />
        <aside
          className={cn(
            'absolute left-0 top-0 flex h-svh w-[86vw] max-w-[340px] flex-col border-r border-border bg-sidebar shadow-2xl transition-transform duration-200',
            isOpen ? 'translate-x-0' : '-translate-x-full',
          )}
          role="dialog"
          aria-modal={isOpen}
          aria-label="Navigation"
        >
          <SidebarBody onNavigate={onClose} />
        </aside>
      </div>
    </>
  );
}
