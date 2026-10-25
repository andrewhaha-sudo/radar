'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  Activity,
  AlertTriangle,
  BarChart3,
  Building2,
  CalendarRange,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  GraduationCap,
  Package,
  RefreshCw,
  ScanEye,
  ShieldAlert,
  Users,
} from 'lucide-react';
import { PageHeader } from '@/components/ui/page-header';
import { StatCard } from '@/components/ui/stat-card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { SEVERITY_META, relativeTime } from '@/components/ui/hazard-bits';
import { ALERT_LEVEL_META } from '@/components/ui/alert-bits';
import { api, errorMessage } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { cn } from '@/components/ui/card';
import type { AnalyticsPayload, HazardStatus, Severity } from '@/lib/types';

const SEVERITIES: Severity[] = ['critical', 'high', 'medium', 'low', 'info'];
const STATUS_LABEL: Record<HazardStatus, string> = {
  new: 'New',
  pending_review: 'Pending review',
  verified: 'Verified',
  in_progress: 'In progress',
  resolved: 'Resolved',
};

const RANGES = [
  { days: 30, label: '30 days' },
  { days: 90, label: '90 days' },
  { days: 180, label: '6 months' },
  { days: 365, label: '12 months' },
];

const EXPORTS = [
  { dataset: 'hazards', label: 'Hazards', permission: 'hazards:read' },
  { dataset: 'resources', label: 'Resources', permission: 'resources:read' },
  { dataset: 'alerts', label: 'Alerts', permission: 'alerts:read' },
  { dataset: 'rollcall', label: 'Roll call', permission: 'rollcall:read' },
];

function chartTheme() {
  return {
    grid: 'var(--border)',
    axis: 'var(--muted-foreground)',
    reported: 'var(--accent-solid)',
    resolved: 'var(--success)',
  };
}

export function AnalyticsPage() {
  const { can } = useAuth();
  const [days, setDays] = useState(90);
  const [data, setData] = useState<AnalyticsPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (range: number) => {
    setLoading(true);
    setError(null);
    try {
      const payload = await api.get<AnalyticsPayload>(`/api/analytics?days=${range}`);
      setData(payload);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(days);
  }, [days, load]);

  const theme = chartTheme();
  const severityTotal = data
    ? SEVERITIES.reduce((sum, severity) => sum + data.hazards.severity[severity], 0)
    : 0;

  return (
    <div className="stack-page space-y-5">
      <PageHeader
        eyebrow="Analytics & exports"
        title="Evidence for the next safety decision"
        description="Aggregates are computed from records in this installation's database. Every figure links back to hazards, inspections, roll call, alerts, resources, recovery and incidents — nothing is simulated."
        icon={BarChart3}
        actions={
          <>
            <Button variant="outline" size="sm" onClick={() => void load(days)} disabled={loading}>
              <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} /> Refresh
            </Button>
            {EXPORTS.filter((item) => can(item.permission)).map((item) => (
              <Button key={item.dataset} variant="outline" size="sm" asChild>
                <a href={`/api/analytics/export?dataset=${item.dataset}`}>
                  <Download className="h-4 w-4" /> {item.label}
                </a>
              </Button>
            ))}
          </>
        }
      />

      {error && (
        <div className="rounded-xl border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger">
          {error}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <CalendarRange className="h-4 w-4 text-muted-foreground" />
        <span className="text-xs text-muted-foreground">Reporting window</span>
        <div className="flex gap-1" role="tablist" aria-label="Reporting window">
          {RANGES.map((range) => (
            <button
              key={range.days}
              onClick={() => setDays(range.days)}
              role="tab"
              aria-selected={days === range.days}
              className={cn(
                'rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors',
                days === range.days
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:bg-accent hover:text-foreground',
              )}
            >
              {range.label}
            </button>
          ))}
        </div>
        {data && (
          <span className="ml-auto text-[11px] text-muted-foreground">
            Generated {relativeTime(data.generatedAt)} · since{' '}
            {new Date(data.since).toLocaleDateString()}
          </span>
        )}
      </div>

      {loading && !data ? (
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-28 w-full" />
            ))}
          </div>
          <Skeleton className="h-72 w-full" />
          <Skeleton className="h-72 w-full" />
        </div>
      ) : data ? (
        <>
          <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard
              label="Open hazards"
              value={data.hazards.unresolved}
              hint={`${data.hazards.pendingReview} awaiting verification · ${data.hazards.overdueActions} overdue actions`}
              icon={AlertTriangle}
              tone={data.hazards.unresolved ? 'warning' : 'success'}
            />
            <StatCard
              label="Inspection coverage"
              value={`${data.inspections.coverage}%`}
              hint={`${data.inspections.scannedRooms} of ${data.inspections.totalRooms} rooms scanned · ${data.inspections.overdueRooms} overdue`}
              icon={ScanEye}
              tone="accent"
              progress={data.inspections.coverage}
            />
            <StatCard
              label="Roll-call completion"
              value={`${data.rollcall.completion}%`}
              hint={`${data.rollcall.present} of ${data.rollcall.expected} students across ${data.rollcall.classes} classes`}
              icon={Users}
              tone={data.rollcall.completion >= 95 ? 'success' : 'warning'}
              progress={data.rollcall.completion}
            />
            <StatCard
              label="Recovery open"
              value={data.recovery.tasks.open + data.recovery.tasks.in_progress}
              hint={`${data.recovery.clearance.restricted} restricted · ${data.recovery.clearance.cleared} cleared`}
              icon={ShieldAlert}
              tone={data.recovery.clearance.restricted ? 'danger' : 'info'}
            />
          </section>

          <section className="grid gap-4 xl:grid-cols-[1.5fr_1fr]">
            <Card hover={false} className="p-4">
              <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
                <div>
                  <h2 className="text-sm font-semibold">Reported vs resolved</h2>
                  <p className="text-[11px] text-muted-foreground">
                    Monthly counts from hazard creation and resolution timestamps.
                  </p>
                </div>
                <div className="flex gap-3 text-[11px]">
                  <span className="inline-flex items-center gap-1">
                    <span className="h-2 w-2 rounded-full" style={{ background: theme.reported }} /> Reported
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <span className="h-2 w-2 rounded-full" style={{ background: theme.resolved }} /> Resolved
                  </span>
                </div>
              </div>
              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={data.trend} margin={{ top: 4, right: 8, left: -18, bottom: 0 }}>
                    <defs>
                      <linearGradient id="reportedFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor={theme.reported} stopOpacity={0.35} />
                        <stop offset="95%" stopColor={theme.reported} stopOpacity={0.02} />
                      </linearGradient>
                      <linearGradient id="resolvedFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor={theme.resolved} stopOpacity={0.35} />
                        <stop offset="95%" stopColor={theme.resolved} stopOpacity={0.02} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke={theme.grid} vertical={false} />
                    <XAxis dataKey="month" stroke={theme.axis} fontSize={11} tickLine={false} axisLine={false} />
                    <YAxis stroke={theme.axis} fontSize={11} tickLine={false} axisLine={false} allowDecimals={false} />
                    <Tooltip
                      contentStyle={{
                        background: 'var(--popover)',
                        border: '1px solid var(--border)',
                        borderRadius: 8,
                        fontSize: 12,
                        color: 'var(--popover-foreground)',
                      }}
                    />
                    <Area
                      type="monotone"
                      dataKey="reported"
                      name="Reported"
                      stroke={theme.reported}
                      strokeWidth={2}
                      fill="url(#reportedFill)"
                    />
                    <Area
                      type="monotone"
                      dataKey="resolved"
                      name="Resolved"
                      stroke={theme.resolved}
                      strokeWidth={2}
                      fill="url(#resolvedFill)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </Card>

            <Card hover={false} className="p-4">
              <h2 className="text-sm font-semibold">Severity mix</h2>
              <p className="text-[11px] text-muted-foreground">
                {data.hazards.total} hazards · {severityTotal} in current severity buckets
              </p>
              <div className="mt-3 space-y-2.5">
                {SEVERITIES.map((severity) => {
                  const meta = SEVERITY_META[severity];
                  const count = data.hazards.severity[severity];
                  const pct = severityTotal ? Math.round((count / severityTotal) * 100) : 0;
                  return (
                    <div key={severity}>
                      <div className="flex items-center justify-between text-xs">
                        <span className="inline-flex items-center gap-1.5">
                          <span aria-hidden="true" style={{ color: meta.hex }}>
                            {meta.symbol}
                          </span>
                          {meta.label}
                        </span>
                        <span className="tabular-nums text-muted-foreground">
                          {count} · {pct}%
                        </span>
                      </div>
                      <div className="mt-1 h-2 overflow-hidden rounded-full bg-muted">
                        <div
                          className="h-full rounded-full transition-all duration-500"
                          style={{ width: `${pct}%`, background: meta.hex }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
                <div className="rounded-lg border border-border bg-background/60 p-2.5">
                  <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Avg resolution</p>
                  <p className="mt-0.5 text-base font-semibold tabular-nums">
                    {data.hazards.avgResolutionDays == null
                      ? '—'
                      : `${data.hazards.avgResolutionDays} d`}
                  </p>
                </div>
                <div className="rounded-lg border border-border bg-background/60 p-2.5">
                  <p className="text-[10px] uppercase tracking-wide text-muted-foreground">In this window</p>
                  <p className="mt-0.5 text-base font-semibold tabular-nums">
                    {data.hazards.reportedInRange} / {data.hazards.resolvedInRange}
                  </p>
                </div>
              </div>
            </Card>
          </section>

          <section className="grid gap-4 xl:grid-cols-[1.5fr_1fr]">
            <Card hover={false} className="overflow-hidden">
              <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
                <div>
                  <h2 className="text-sm font-semibold">Building coverage</h2>
                  <p className="text-[11px] text-muted-foreground">
                    Rooms scanned, open hazards and recorded equipment per building.
                  </p>
                </div>
                <Badge variant="outline">
                  {data.byBuilding.length} buildings
                </Badge>
              </div>
              <ul className="divide-y divide-border">
                {data.byBuilding.map((building) => (
                  <li key={building.id} className="px-4 py-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="grid h-7 w-7 place-items-center rounded-md bg-muted text-[10px] font-bold">
                          {building.code}
                        </span>
                        <span className="text-sm font-medium">{building.name}</span>
                        <Badge variant={building.status === 'operational' ? 'success' : 'warning'}>
                          {building.status}
                        </Badge>
                      </div>
                      <span className="text-[11px] text-muted-foreground">
                        {building.scannedRooms}/{building.roomCount} rooms · {building.openHazards} open ·{' '}
                        {building.equipment} equipment
                      </span>
                    </div>
                    <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted">
                      <div
                        className={cn(
                          'h-full rounded-full',
                          building.coverage >= 80
                            ? 'bg-success'
                            : building.coverage >= 50
                              ? 'bg-warning'
                              : 'bg-danger',
                        )}
                        style={{ width: `${building.coverage}%` }}
                      />
                    </div>
                  </li>
                ))}
              </ul>
            </Card>

            <Card hover={false} className="p-4">
              <h2 className="text-sm font-semibold">Notification & alert reach</h2>
              <p className="text-[11px] text-muted-foreground">In-app deliveries recorded in this window.</p>
              <div className="mt-3 space-y-2">
                {(['red', 'orange', 'yellow', 'green'] as const).map((level) => {
                  const meta = ALERT_LEVEL_META[level];
                  return (
                    <div
                      key={level}
                      className="flex items-center justify-between rounded-lg border border-border bg-background/60 px-2.5 py-1.5 text-xs"
                    >
                      <span className="inline-flex items-center gap-1.5">
                        <span aria-hidden="true" style={{ color: meta.hex }}>
                          {meta.symbol}
                        </span>
                        {meta.short}
                      </span>
                      <span className="tabular-nums text-muted-foreground">{data.alerts.byLevel[level]}</span>
                    </div>
                  );
                })}
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                <div className="rounded-lg border border-border bg-background/60 p-2.5">
                  <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Delivered</p>
                  <p className="mt-0.5 text-base font-semibold tabular-nums">{data.alerts.delivered}</p>
                </div>
                <div className="rounded-lg border border-border bg-background/60 p-2.5">
                  <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Read</p>
                  <p className="mt-0.5 text-base font-semibold tabular-nums">{data.alerts.read}</p>
                </div>
              </div>
              <p className="mt-3 text-[10px] leading-relaxed text-muted-foreground">
                Delivery means an in-app notification row was created. Read means the recipient opened it. No email
                or SMS provider is configured.
              </p>
            </Card>
          </section>

          <section className="grid gap-4 lg:grid-cols-3">
            <Card hover={false} className="p-4">
              <h2 className="flex items-center gap-1.5 text-sm font-semibold">
                <Building2 className="h-4 w-4 text-muted-foreground" /> Incidents
              </h2>
              <dl className="mt-2 space-y-1.5 text-xs">
                {[
                  ['Active', data.incidents.active],
                  ['Monitoring', data.incidents.monitoring],
                  ['Closed', data.incidents.closed],
                  ['Closed in window', data.incidents.closedInRange],
                ].map(([label, value]) => (
                  <div key={String(label)} className="flex justify-between">
                    <dt className="text-muted-foreground">{label}</dt>
                    <dd className="font-semibold tabular-nums">{value}</dd>
                  </div>
                ))}
              </dl>
            </Card>

            <Card hover={false} className="p-4">
              <h2 className="flex items-center gap-1.5 text-sm font-semibold">
                <Package className="h-4 w-4 text-muted-foreground" /> Resources
              </h2>
              <dl className="mt-2 space-y-1.5 text-xs">
                {[
                  ['Total records', data.resources.total],
                  ['Ready', data.resources.ok],
                  ['Service due', data.resources.due],
                  ['Expired', data.resources.expired],
                  ['Missing', data.resources.missing],
                ].map(([label, value]) => (
                  <div key={String(label)} className="flex justify-between">
                    <dt className="text-muted-foreground">{label}</dt>
                    <dd className="font-semibold tabular-nums">{value}</dd>
                  </div>
                ))}
              </dl>
            </Card>

            <Card hover={false} className="p-4">
              <h2 className="flex items-center gap-1.5 text-sm font-semibold">
                <GraduationCap className="h-4 w-4 text-muted-foreground" /> Inspections
              </h2>
              <dl className="mt-2 space-y-1.5 text-xs">
                {[
                  ['Rooms', data.inspections.totalRooms],
                  ['Scanned', data.inspections.scannedRooms],
                  ['Scans in window', data.inspections.scansInRange],
                  ['Overdue (90 days)', data.inspections.overdueRooms],
                ].map(([label, value]) => (
                  <div key={String(label)} className="flex justify-between">
                    <dt className="text-muted-foreground">{label}</dt>
                    <dd className="font-semibold tabular-nums">{value}</dd>
                  </div>
                ))}
              </dl>
            </Card>
          </section>

          <section className="grid gap-4 lg:grid-cols-2">
            <Card hover={false} className="p-4">
              <h2 className="text-sm font-semibold">Hazard pipeline</h2>
              <div className="mt-3 h-48 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={(Object.keys(data.hazards.status) as HazardStatus[]).map((status) => ({
                      name: STATUS_LABEL[status],
                      count: data.hazards.status[status],
                    }))}
                    margin={{ top: 4, right: 8, left: -22, bottom: 0 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke={theme.grid} vertical={false} />
                    <XAxis
                      dataKey="name"
                      stroke={theme.axis}
                      fontSize={10}
                      tickLine={false}
                      axisLine={false}
                      interval={0}
                      angle={-12}
                      textAnchor="end"
                      height={44}
                    />
                    <YAxis stroke={theme.axis} fontSize={11} tickLine={false} axisLine={false} allowDecimals={false} />
                    <Tooltip
                      contentStyle={{
                        background: 'var(--popover)',
                        border: '1px solid var(--border)',
                        borderRadius: 8,
                        fontSize: 12,
                        color: 'var(--popover-foreground)',
                      }}
                    />
                    <Bar dataKey="count" name="Hazards" radius={[4, 4, 0, 0]}>
                      {(Object.keys(data.hazards.status) as HazardStatus[]).map((status) => (
                        <Cell
                          key={status}
                          fill={
                            status === 'resolved'
                              ? 'var(--success)'
                              : status === 'verified'
                                ? 'var(--danger)'
                                : status === 'in_progress'
                                  ? 'var(--accent-solid)'
                                  : 'var(--warning)'
                          }
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Card>

            <Card hover={false} className="p-4">
              <h2 className="text-sm font-semibold">Exports</h2>
              <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                CSV exports contain the records your role is permitted to read. Every export request is authenticated
                and recorded by the server.
              </p>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                {EXPORTS.map((item) => {
                  const allowed = can(item.permission);
                  return allowed ? (
                    <a
                      key={item.dataset}
                      href={`/api/analytics/export?dataset=${item.dataset}`}
                      className="flex items-center justify-between rounded-lg border border-border bg-background/60 px-3 py-2 text-xs font-medium transition-colors hover:border-accent-border hover:bg-accent"
                    >
                      <span className="inline-flex items-center gap-1.5">
                        <FileSpreadsheet className="h-3.5 w-3.5" /> {item.label}
                      </span>
                      <Download className="h-3.5 w-3.5 text-muted-foreground" />
                    </a>
                  ) : (
                    <span
                      key={item.dataset}
                      className="flex items-center justify-between rounded-lg border border-dashed border-border px-3 py-2 text-xs text-muted-foreground"
                    >
                      {item.label}
                      <span className="text-[10px] uppercase">No access</span>
                    </span>
                  );
                })}
              </div>
              <div className="mt-4 flex items-start gap-2 rounded-lg border border-border bg-muted/40 p-3 text-[11px] leading-relaxed text-muted-foreground">
                <Activity className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                Figures reflect the current database. If records are corrected or deleted by an administrator, past
                trend points can change accordingly.
              </div>
            </Card>
          </section>

          <p className="flex items-start gap-2 rounded-lg border border-border bg-muted/40 px-3 py-2 text-[11px] leading-relaxed text-muted-foreground">
            <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-success" />
            No simulated, demo or generated data is included. Analytics count rows in the School Safety database,
            scoped to your permissions.
          </p>
        </>
      ) : null}
    </div>
  );
}
