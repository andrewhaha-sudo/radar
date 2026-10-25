'use client';

import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  Bell,
  BellRing,
  Building2,
  CheckCircle2,
  ClipboardCheck,
  ClipboardList,
  DoorOpen,
  FileCheck,
  HandHeart,
  MapPinned,
  Package,
  PhoneCall,
  RefreshCw,
  ScanEye,
  Search,
  ShieldAlert,
  ShieldCheck,
  Users,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  SEVERITY_META,
  STATUS_META,
  relativeTime,
} from '@/components/ui/hazard-bits';
import { ALERT_LEVEL_META } from '@/components/ui/alert-bits';
import { api, errorMessage } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { cn } from '@/components/ui/card';
import type { DashboardPayload, HazardStatus, Severity } from '@/lib/types';

const SEVERITIES: Severity[] = ['critical', 'high', 'medium', 'low', 'info'];
const STATUSES: HazardStatus[] = ['new', 'pending_review', 'verified', 'in_progress', 'resolved'];

const ACTION_LABELS: Record<string, string> = {
  'auth.login': 'signed in',
  'auth.logout': 'signed out',
  'hazard.create': 'reported a hazard',
  'hazard.update': 'updated a hazard',
  'hazard.verify': 'verified a hazard',
  'hazard.assign': 'assigned a hazard',
  'hazard.evidence.add': 'attached evidence',
  'hazard.evidence.remove': 'removed evidence',
  'hazard.action.create': 'added a corrective action',
  'hazard.action.update': 'updated a corrective action',
  'scan.start': 'started a room scan',
  'scan.submit': 'submitted a room scan',
  'incident.open': 'opened an incident',
  'incident.update': 'updated an incident',
  'rollcall.update': 'updated roll call',
  'sos.create': 'raised an SOS',
  'upload.create': 'uploaded a file',
  'user.update': 'updated a profile',
  'user.role.update': 'changed a user role',
};

function greeting() {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

export function DashboardPage() {
  const { user, school, can } = useAuth();
  const navigate = useNavigate();
  const [data, setData] = useState<DashboardPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const payload = await api.get<DashboardPayload>('/api/dashboard');
      setData(payload);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const kpis = data?.kpis;
  const canHazards = can('hazards:read');
  const isStaff =
    canHazards || can('incidents:read') || can('rollcall:read') || can('scan:read');
  const canAudit = can('admin:users');

  return (
    <div className="stack-page space-y-5">
      {/* Header */}
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            {school?.name ?? 'Campus'} · operations
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">
            {greeting()}, {user?.name?.split(' ')[0] ?? 'there'}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Live safety posture for your campus. Everything here is read from the campus database.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
            <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} /> Refresh
          </Button>
          {can('hazards:write') && (
            <Button size="sm" onClick={() => navigate('/hazards')}>
              <AlertTriangle className="h-4 w-4" /> Hazard workspace
            </Button>
          )}
        </div>
      </div>

      {!loading && kpis?.activeAlertCount && kpis.alertLevel && kpis.alertTitle ? (
        (() => {
          const meta = ALERT_LEVEL_META[kpis.alertLevel];
          const Icon = meta.icon;
          return (
            <button
              type="button"
              onClick={() => navigate(can('alerts:read') ? '/alerts' : '/notifications')}
              className="group flex w-full items-center gap-3 rounded-xl border px-4 py-3 text-left transition-colors hover:bg-accent/40"
              style={{
                borderColor: `${meta.hex}66`,
                backgroundColor: `${meta.hex}12`,
              }}
            >
              <span
                className="grid h-10 w-10 shrink-0 place-items-center rounded-lg"
                style={{ backgroundColor: `${meta.hex}22`, color: meta.hex }}
              >
                <Icon className="h-5 w-5" aria-hidden="true" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-center gap-2">
                  <span className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: meta.hex }}>
                    {meta.symbol} Active alert · {meta.short}
                  </span>
                  <span className="text-[10px] text-muted-foreground">
                    {kpis.activeAlertCount} active
                  </span>
                </span>
                <span className="mt-0.5 block truncate text-sm font-semibold">{kpis.alertTitle}</span>
              </span>
              <span className="hidden shrink-0 items-center gap-1 text-xs font-medium text-muted-foreground group-hover:text-foreground sm:flex">
                {can('alerts:read') ? 'Open alerts' : 'View notice'}
                <ArrowRight className="h-3.5 w-3.5" />
              </span>
            </button>
          );
        })()
      ) : null}

      {error ? (
        <div className="rounded-xl border border-danger/30 bg-danger/10 p-6 text-center">
          <ShieldAlert className="mx-auto mb-2 h-7 w-7 text-danger" />
          <p className="text-sm font-medium text-danger">Could not load the dashboard</p>
          <p className="mt-1 text-xs text-muted-foreground">{error}</p>
          <Button size="sm" className="mt-3" onClick={() => void load()}>
            Try again
          </Button>
        </div>
      ) : loading && !data ? (
        <DashboardSkeleton />
      ) : data && kpis ? (
        <>
          {/* Primary KPIs */}
          {isStaff && (
          <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Kpi
              icon={ScanEye}
              title="Room inspection coverage"
              value={`${kpis.roomCoverage}%`}
              caption={`${kpis.roomsScanned} of ${kpis.totalRooms} rooms scanned`}
              accent="info"
              onClick={() => navigate('/scan')}
              show={can('scan:read')}
              progress={kpis.roomCoverage}
            />
            <Kpi
              icon={AlertTriangle}
              title="Unresolved hazards"
              value={kpis.unresolved}
              caption={`${kpis.pendingReview} awaiting review · ${kpis.verifiedHazards} verified all-time`}
              accent="danger"
              onClick={() => navigate('/hazards')}
              show={can('hazards:read')}
            />
            <Kpi
              icon={ShieldAlert}
              title="Active incidents"
              value={kpis.activeIncidents}
              caption={
                kpis.activeAlerts > 0
                  ? `${kpis.activeAlerts} critical or high severity`
                  : 'No critical incidents active'
              }
              accent={kpis.activeAlerts > 0 ? 'danger' : 'success'}
              onClick={() => navigate('/incidents')}
              show={can('incidents:read')}
            />
            <Kpi
              icon={Users}
              title="Roll call accounted for"
              value={`${kpis.rollcallCompletion}%`}
              caption={`${kpis.rollcallPresent} of ${kpis.rollcallExpected} students`}
              accent="success"
              onClick={() => navigate('/rollcall')}
              show={can('rollcall:read')}
            />
            {/* Roles without scanning permission keep a full four-card row
                instead of leaving a gap where the coverage card would sit. */}
            <Kpi
              icon={BellRing}
              title="Active alerts"
              value={kpis.activeAlertCount}
              caption={
                kpis.activeAlertCount && kpis.alertTitle
                  ? kpis.alertTitle
                  : 'No alerts are currently active'
              }
              accent={kpis.activeAlertCount ? 'warning' : 'success'}
              onClick={() => navigate('/alerts')}
              show={!can('scan:read') && can('alerts:read')}
            />
          </section>
          )}

          {(can('safety:read') || can('resources:read') || can('recovery:read')) && (
          <section className="flex flex-wrap gap-3">
            {can('safety:read') && (
              <div className="min-w-[240px] flex-1">
                <MiniStat
                  icon={HandHeart}
                  label="Safety check-ins needing help"
                  value={kpis.safetyNeedHelp}
                  hint={
                    kpis.safetyNeedHelp
                      ? 'People have asked for assistance on the safety board'
                      : 'No one has asked for help right now'
                  }
                  tone={kpis.safetyNeedHelp ? 'danger' : 'success'}
                />
              </div>
            )}
            {can('resources:read') && (
              <div className="min-w-[240px] flex-1">
                <MiniStat
                  icon={Package}
                  label="Resources needing attention"
                  value={kpis.resourcesAttention}
                  hint="Expired, missing or overdue for inspection"
                  tone={kpis.resourcesAttention ? 'warning' : 'success'}
                />
              </div>
            )}
            {can('recovery:read') && (
              <div className="min-w-[240px] flex-1">
                <MiniStat
                  icon={ClipboardList}
                  label="Open recovery actions"
                  value={kpis.recoveryOpen}
                  hint="Repairs, inspections and clearance tasks not yet complete"
                  tone={kpis.recoveryOpen ? 'warning' : 'success'}
                />
              </div>
            )}
          </section>
          )}

          {/* Secondary strip */}
          {canHazards && (
          <section className={cn('grid gap-3', can('scan:read') ? 'sm:grid-cols-3' : 'sm:grid-cols-2')}>
            <MiniStat
              icon={FileCheck}
              label="Reported in the last 30 days"
              value={kpis.reportedLast30}
              hint={
                kpis.reportedDelta === null
                  ? 'No prior period to compare'
                  : `${kpis.reportedDelta >= 0 ? '+' : ''}${kpis.reportedDelta}% versus the previous 30 days`
              }
              tone={kpis.reportedDelta !== null && kpis.reportedDelta > 0 ? 'warning' : 'neutral'}
            />
            <MiniStat
              icon={CheckCircle2}
              label="Resolved in the last 30 days"
              value={kpis.resolvedLast30}
              hint={
                kpis.resolvedDelta === null
                  ? 'No prior period to compare'
                  : `${kpis.resolvedDelta >= 0 ? '+' : ''}${kpis.resolvedDelta}% versus the previous 30 days`
              }
              tone="success"
            />
            {can('scan:read') && (
              <MiniStat
                icon={ClipboardCheck}
                label="Most recent submitted scan"
                value={kpis.lastScanAt ? relativeTime(kpis.lastScanAt) : 'No scans yet'}
                hint={`${kpis.pendingReview} finding${kpis.pendingReview === 1 ? '' : 's'} pending independent review`}
                tone="neutral"
              />
            )}
          </section>
          )}

          {/* Trend + severity */}
          {canHazards && (
          <section className="grid gap-3 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
            <div className="rounded-xl border border-border bg-card p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <h2 className="text-sm font-semibold">Hazard flow, last six months</h2>
                  <p className="text-[11px] text-muted-foreground">
                    Reported and resolved counts grouped by month from hazard timestamps.
                  </p>
                </div>
                <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
                  <span className="inline-flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full bg-primary" /> Reported
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full bg-success" /> Resolved
                  </span>
                </div>
              </div>

              <div className="mt-3 h-56 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={data.trend} margin={{ top: 6, right: 8, bottom: 0, left: -18 }}>
                    <defs>
                      <linearGradient id="reported-fill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="var(--primary)" stopOpacity={0.35} />
                        <stop offset="100%" stopColor="var(--primary)" stopOpacity={0.02} />
                      </linearGradient>
                      <linearGradient id="resolved-fill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="var(--success)" stopOpacity={0.3} />
                        <stop offset="100%" stopColor="var(--success)" stopOpacity={0.02} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid stroke="var(--border)" strokeDasharray="3 4" vertical={false} />
                    <XAxis
                      dataKey="month"
                      tick={{ fontSize: 11, fill: 'var(--text-muted)' }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis
                      allowDecimals={false}
                      tick={{ fontSize: 11, fill: 'var(--text-muted)' }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <Tooltip
                      contentStyle={{
                        background: 'var(--card)',
                        border: '1px solid var(--border)',
                        borderRadius: 8,
                        fontSize: 12,
                        color: 'var(--foreground)',
                      }}
                      labelStyle={{ color: 'var(--foreground)', fontWeight: 600 }}
                    />
                    <Area
                      type="monotone"
                      dataKey="reported"
                      name="Reported"
                      stroke="var(--primary)"
                      strokeWidth={2}
                      fill="url(#reported-fill)"
                    />
                    <Area
                      type="monotone"
                      dataKey="resolved"
                      name="Resolved"
                      stroke="var(--success)"
                      strokeWidth={2}
                      fill="url(#resolved-fill)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="rounded-xl border border-border bg-card p-4">
              <h2 className="text-sm font-semibold">Open hazards by severity</h2>
              <p className="text-[11px] text-muted-foreground">
                All recorded hazards. Severity is always paired with a symbol and label.
              </p>
              <ul className="mt-3 space-y-2.5">
                {SEVERITIES.map((severity) => {
                  const meta = SEVERITY_META[severity];
                  const count = data.severity[severity] ?? 0;
                  const total = Object.values(data.severity).reduce((sum, value) => sum + value, 0);
                  const pct = total ? Math.round((count / total) * 100) : 0;
                  return (
                    <li key={severity}>
                      <div className="flex items-center justify-between gap-2 text-[11px]">
                        <span className="inline-flex items-center gap-1.5 font-medium">
                          <span
                            className="grid h-4 w-4 place-items-center rounded-full text-[8px] font-bold text-white"
                            style={{ background: meta.hex }}
                            aria-hidden="true"
                          >
                            {meta.symbol}
                          </span>
                          {meta.label}
                        </span>
                        <span className="font-mono tabular-nums text-muted-foreground">
                          {count} · {pct}%
                        </span>
                      </div>
                      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
                        <div
                          className="h-full rounded-full transition-[width]"
                          style={{ width: `${pct}%`, background: meta.hex }}
                        />
                      </div>
                    </li>
                  );
                })}
              </ul>

              <div className="mt-4 border-t border-border pt-3">
                <h3 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Pipeline
                </h3>
                <ul className="mt-2 grid grid-cols-2 gap-1.5">
                  {STATUSES.map((status) => (
                    <li
                      key={status}
                      className="flex items-center justify-between gap-1 rounded-lg border border-border px-2 py-1.5"
                    >
                      <span className="truncate text-[10px] capitalize text-muted-foreground">
                        {STATUS_META[status].label}
                      </span>
                      <span className="font-mono text-xs font-semibold tabular-nums">
                        {data.status[status] ?? 0}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </section>
          )}

          {!isStaff && (
            <section className="grid gap-3 md:grid-cols-2">
              <div className="rounded-xl border border-border bg-card p-4">
                <div className="flex items-center gap-2">
                  <MapPinned className="h-4 w-4 text-muted-foreground" />
                  <h2 className="text-sm font-semibold">Your campus</h2>
                </div>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  {school?.name ?? 'Your school'} · {school?.address ?? 'Campus address not recorded'}
                </p>
                <dl className="mt-3 grid grid-cols-2 gap-2 text-xs">
                  <div className="rounded-lg border border-border px-2.5 py-2">
                    <dt className="text-[10px] text-muted-foreground">Rooms on record</dt>
                    <dd className="font-mono text-lg font-semibold tabular-nums">
                      {kpis.totalRooms}
                    </dd>
                  </div>
                  <div className="rounded-lg border border-border px-2.5 py-2">
                    <dt className="text-[10px] text-muted-foreground">Unread notifications</dt>
                    <dd className="font-mono text-lg font-semibold tabular-nums">
                      {kpis.unreadNotifications}
                    </dd>
                  </div>
                </dl>
                <div className="mt-3 grid gap-1.5">
                  {[
                    { label: 'Campus map', icon: MapPinned, href: '/map' },
                    { label: 'Search the campus', icon: Search, href: '/search' },
                    { label: 'Notifications', icon: Bell, href: '/notifications' },
                  ].map((action) => {
                    const Icon = action.icon;
                    return (
                      <button
                        key={action.href}
                        onClick={() => navigate(action.href)}
                        className="flex items-center gap-2.5 rounded-lg border border-border px-2.5 py-2 text-left transition-colors hover:bg-accent/60"
                      >
                        <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground">
                          <Icon className="h-3.5 w-3.5" />
                        </span>
                        <span className="flex-1 text-xs font-medium">{action.label}</span>
                        <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="rounded-xl border border-danger/30 bg-danger/5 p-4">
                <div className="flex items-center gap-2">
                  <PhoneCall className="h-4 w-4 text-danger" />
                  <h2 className="text-sm font-semibold">In an emergency</h2>
                </div>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  Call your local emergency number first for immediate danger. RADAR can alert
                  campus safety leads inside the school, but it does not contact police, fire or
                  ambulance services automatically.
                </p>
                <Button
                  variant="destructive"
                  size="sm"
                  className="mt-3"
                  onClick={() => navigate('/sos')}
                >
                  <PhoneCall className="h-4 w-4" /> Open emergency SOS
                </Button>
                <p className="mt-2 text-[10px] text-muted-foreground">
                  An SOS creates a critical incident and notifies administrators and campus
                  responders. Use only for a real emergency.
                </p>
              </div>
            </section>
          )}

          {/* Activity + actions */}
          <section
            className={cn(
              'grid gap-3',
              canAudit && 'lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]',
            )}
          >
            {canAudit && (
            <div className="rounded-xl border border-border bg-card">
              <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
                <div>
                  <h2 className="text-sm font-semibold">Recent activity</h2>
                  <p className="text-[11px] text-muted-foreground">
                    Immutable audit trail of changes recorded by users and the system.
                  </p>
                </div>
                {can('admin:users') && (
                  <Button variant="ghost" size="sm" onClick={() => navigate('/admin')}>
                    Audit log <ArrowRight className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>

              {data.activity.length === 0 ? (
                <p className="px-4 py-10 text-center text-xs text-muted-foreground">
                  No activity has been recorded yet.
                </p>
              ) : (
                <ul className="divide-y divide-border/70">
                  {data.activity.map((entry, index) => (
                    <li key={`${entry.action}-${entry.createdAt}-${index}`} className="flex gap-3 px-4 py-2.5">
                      <span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full bg-accent text-accent-foreground">
                        <Activity className="h-3.5 w-3.5" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-xs leading-snug">
                          <span className="font-medium text-foreground">
                            {entry.actorName ?? 'System'}
                          </span>{' '}
                          <span className="text-muted-foreground">
                            {ACTION_LABELS[entry.action] ?? entry.action.replace(/[._]/g, ' ')}
                          </span>
                        </p>
                        <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[10px] text-muted-foreground">
                          <span className="capitalize">{entry.entity.replace(/_/g, ' ')}</span>
                          {entry.entityId && <span className="font-mono">#{entry.entityId}</span>}
                          <span aria-hidden="true">·</span>
                          <span>{relativeTime(entry.createdAt)}</span>
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            )}

            <div className="space-y-3">
              {isStaff && (
              <div className="rounded-xl border border-border bg-card p-4">
                <h2 className="text-sm font-semibold">Jump back in</h2>
                <p className="mt-0.5 text-[11px] text-muted-foreground">
                  Actions available to your role.
                </p>
                <div className="mt-3 grid gap-1.5">
                  {[
                    can('scan:write') && {
                      label: 'Start a room scan',
                      icon: ScanEye,
                      href: '/scan',
                      description: 'Guided inspection with evidence capture',
                    },
                    can('hazards:read') && {
                      label: 'Open the hazard workspace',
                      icon: AlertTriangle,
                      href: '/hazards',
                      description: 'Filter, verify and assign findings',
                    },
                    {
                      label: 'Campus map',
                      icon: MapPinned,
                      href: '/map',
                      description: 'Buildings, floors, equipment and routes',
                    },
                    can('buildings:read') && {
                      label: 'Buildings & rooms',
                      icon: Building2,
                      href: '/buildings',
                      description: 'Room directory and inspection history',
                    },
                    can('rollcall:read') && {
                      label: 'Digital roll call',
                      icon: Users,
                      href: '/rollcall',
                      description: 'Account for students during a drill',
                    },
                  ]
                    .filter(Boolean)
                    .map((item) => {
                      const action = item as {
                        label: string;
                        icon: React.ElementType;
                        href: string;
                        description: string;
                      };
                      const Icon = action.icon;
                      return (
                        <button
                          key={action.href}
                          onClick={() => navigate(action.href)}
                          className="flex items-center gap-2.5 rounded-lg border border-border px-2.5 py-2 text-left transition-colors hover:bg-accent/60"
                        >
                          <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground">
                            <Icon className="h-3.5 w-3.5" />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-xs font-medium">{action.label}</span>
                            <span className="block truncate text-[10px] text-muted-foreground">
                              {action.description}
                            </span>
                          </span>
                          <ArrowRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                        </button>
                      );
                    })}
                </div>
              </div>
              )}

              <div className="rounded-xl border border-border bg-card p-4">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="h-4 w-4 text-success" />
                  <h2 className="text-sm font-semibold">Data integrity</h2>
                </div>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  Counts on this page are computed server-side from the SQLite campus database at{' '}
                  {data.generatedAt ? relativeTime(data.generatedAt) : 'request time'}. No demo data or
                  random values are injected.
                </p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  <Badge variant="outline" className="text-[10px]">
                    <DoorOpen className="mr-1 h-3 w-3" /> {kpis.totalRooms} rooms
                  </Badge>
                  <Badge variant="outline" className="text-[10px]">
                    {kpis.unreadNotifications} unread notifications
                  </Badge>
                </div>
              </div>
            </div>
          </section>
        </>
      ) : null}
    </div>
  );
}

function Kpi({
  icon: Icon,
  title,
  value,
  caption,
  accent,
  onClick,
  show = true,
  progress,
}: {
  icon: React.ElementType;
  title: string;
  value: number | string;
  caption: string;
  accent: 'info' | 'danger' | 'success' | 'warning';
  onClick?: () => void;
  show?: boolean;
  progress?: number;
}) {
  if (!show) return null;
  const accentClass = {
    info: 'bg-info/10 text-info',
    danger: 'bg-danger/10 text-danger',
    success: 'bg-success/10 text-success',
    warning: 'bg-warning/10 text-warning',
  }[accent];
  const barClass = {
    info: 'bg-info',
    danger: 'bg-danger',
    success: 'bg-success',
    warning: 'bg-warning',
  }[accent];

  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-xl border border-border bg-card p-4 text-left transition-colors hover:border-accent-border hover:bg-accent/30 focus-visible:border-accent-border"
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs font-medium text-muted-foreground">{title}</p>
        <span className={cn('grid h-8 w-8 shrink-0 place-items-center rounded-lg', accentClass)}>
          <Icon className="h-4 w-4" />
        </span>
      </div>
      <p className="mt-1 text-2xl font-semibold tabular-nums tracking-tight">{value}</p>
      <p className="mt-0.5 line-clamp-2 text-[11px] text-muted-foreground">{caption}</p>
      {typeof progress === 'number' && (
        <div className="mt-2 h-1 overflow-hidden rounded-full bg-muted">
          <div className={cn('h-full rounded-full', barClass)} style={{ width: `${progress}%` }} />
        </div>
      )}
    </button>
  );
}

function MiniStat({
  icon: Icon,
  label,
  value,
  hint,
  tone,
}: {
  icon: React.ElementType;
  label: string;
  value: number | string;
  hint: string;
  tone: 'success' | 'warning' | 'danger' | 'neutral';
}) {
  const toneClass =
    tone === 'success'
      ? 'text-success bg-success/10'
      : tone === 'warning'
        ? 'text-warning bg-warning/10'
        : tone === 'danger'
          ? 'text-danger bg-danger/10'
          : 'text-muted-foreground bg-muted';
  return (
    <div className="flex items-start gap-2.5 rounded-xl border border-border bg-card p-3">
      <span className={cn('grid h-8 w-8 shrink-0 place-items-center rounded-lg', toneClass)}>
        <Icon className="h-4 w-4" />
      </span>
      <div className="min-w-0">
        <p className="text-[11px] text-muted-foreground">{label}</p>
        <p className="text-lg font-semibold leading-tight">{value}</p>
        <p className="mt-0.5 text-[10px] text-muted-foreground">{hint}</p>
      </div>
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <Skeleton key={index} className="h-28 w-full rounded-xl" />
        ))}
      </div>
      <div className="grid gap-3 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <Skeleton className="h-72 w-full rounded-xl" />
        <Skeleton className="h-72 w-full rounded-xl" />
      </div>
    </div>
  );
}
