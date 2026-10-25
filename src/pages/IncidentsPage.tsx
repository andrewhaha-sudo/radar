'use client';

import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowRight,
  Clock,
  MessageSquarePlus,
  Radio,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  UserRound,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/input';
import {
  Drawer,
  DrawerBody,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/drawer';
import { SeverityBadge, absoluteTime, relativeTime } from '@/components/ui/hazard-bits';
import { api, errorMessage } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { cn } from '@/components/ui/card';
import type { Incident, Severity } from '@/lib/types';

const STATUS_META: Record<
  Incident['status'],
  { label: string; variant: 'danger' | 'warning' | 'success'; hint: string }
> = {
  active: { label: 'Active', variant: 'danger', hint: 'Response in progress' },
  monitoring: { label: 'Monitoring', variant: 'warning', hint: 'Stabilised, being watched' },
  closed: { label: 'Closed', variant: 'success', hint: 'Resolved and closed' },
};

const KIND_LABEL: Record<string, string> = {
  medical: 'Medical',
  fire: 'Fire',
  security: 'Security',
  weather: 'Weather',
  utility: 'Utility',
  drill: 'Drill',
  other: 'Other',
};

interface IncidentDetailPayload {
  incident: Incident;
  updates: Array<{
    id: number;
    incidentId: number;
    note: string;
    actorName: string | null;
    createdAt: string;
  }>;
}

export function IncidentsPage() {
  const { can } = useAuth();
  const canRead = can('incidents:read');
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const selectedId = Number(params.get('open')) || null;

  const setSelectedId = useCallback(
    (id: number | null) => {
      const next = new URLSearchParams(params);
      if (id == null) next.delete('open');
      else next.set('open', String(id));
      setParams(next, { replace: true });
    },
    [params, setParams],
  );

  const load = useCallback(async () => {
    if (!canRead) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const payload = await api.get<{ incidents: Incident[] }>('/api/incidents');
      setIncidents(payload.incidents);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [canRead]);

  useEffect(() => {
    void load();
  }, [load]);

  const active = incidents.filter((item) => item.status === 'active');
  const monitoring = incidents.filter((item) => item.status === 'monitoring');
  const closed = incidents.filter((item) => item.status === 'closed');

  if (!canRead) {
    return (
      <div className="stack-page space-y-5">
        <div className="flex items-center gap-2">
          <span className="grid h-9 w-9 place-items-center rounded-lg bg-accent text-accent-foreground">
            <ShieldAlert className="h-5 w-5" />
          </span>
          <h1 className="text-2xl font-semibold tracking-tight">Incident queue</h1>
        </div>
        <div className="mx-auto max-w-md rounded-xl border border-border bg-card p-6 text-center">
          <ShieldCheck className="mx-auto mb-2 h-8 w-8 text-muted-foreground" />
          <h2 className="text-lg font-semibold">Incident queue not available to your role</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Your account cannot view live incident records. For immediate danger, call your local
            emergency number or raise an SOS.
          </p>
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            <Button size="sm" variant="outline" onClick={() => navigate('/map')}>
              Campus map
            </Button>
            <Button size="sm" variant="outline" onClick={() => navigate('/sos')}>
              Emergency SOS
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="stack-page space-y-5">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
        <div>
          <div className="flex items-center gap-2">
            <span className="grid h-9 w-9 place-items-center rounded-lg bg-accent text-accent-foreground">
              <ShieldAlert className="h-5 w-5" />
            </span>
            <h1 className="text-2xl font-semibold tracking-tight">Incident queue</h1>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Live incidents raised in RADAR, including SOS activations and utility failures.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
          <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} /> Refresh
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        {[
          { label: 'Active', value: active.length, tone: 'danger' as const, hint: 'Require a response now' },
          { label: 'Monitoring', value: monitoring.length, tone: 'warning' as const, hint: 'Contained, under observation' },
          { label: 'Closed', value: closed.length, tone: 'success' as const, hint: 'Recorded and closed out' },
        ].map((stat) => (
          <div key={stat.label} className="rounded-xl border border-border bg-card p-4">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs text-muted-foreground">{stat.label}</p>
              <span
                className={cn(
                  'h-2 w-2 rounded-full',
                  stat.tone === 'danger'
                    ? 'bg-danger'
                    : stat.tone === 'warning'
                      ? 'bg-warning'
                      : 'bg-success',
                )}
                aria-hidden="true"
              />
            </div>
            <p className="mt-1 text-2xl font-semibold tabular-nums">{stat.value}</p>
            <p className="text-[11px] text-muted-foreground">{stat.hint}</p>
          </div>
        ))}
      </div>

      {error ? (
        <div className="rounded-xl border border-danger/30 bg-danger/10 p-6 text-center">
          <AlertTriangle className="mx-auto mb-2 h-7 w-7 text-danger" />
          <p className="text-sm font-medium text-danger">Could not load incidents</p>
          <p className="mt-1 text-xs text-muted-foreground">{error}</p>
          <Button size="sm" className="mt-3" onClick={() => void load()}>
            Try again
          </Button>
        </div>
      ) : loading && incidents.length === 0 ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, index) => (
            <Skeleton key={index} className="h-24 w-full rounded-xl" />
          ))}
        </div>
      ) : incidents.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-card px-6 py-16 text-center">
          <ShieldCheck className="mx-auto mb-2 h-8 w-8 text-success" />
          <p className="text-sm font-medium">No incidents recorded</p>
          <p className="mt-1 text-xs text-muted-foreground">
            When an SOS is raised or an incident is logged it will appear here.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {incidents.map((incident) => {
            const meta = STATUS_META[incident.status];
            return (
              <article
                key={incident.id}
                className={cn(
                  'rounded-xl border bg-card p-3.5 transition-colors',
                  incident.status === 'active'
                    ? 'border-danger/40'
                    : incident.status === 'monitoring'
                      ? 'border-warning/30'
                      : 'border-border',
                )}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <SeverityBadge severity={(incident.severity as Severity) ?? 'info'} />
                      <Badge variant={meta.variant} className="text-[9px]">
                        {meta.label}
                      </Badge>
                      <Badge variant="outline" className="text-[9px]">
                        {KIND_LABEL[incident.kind] ?? incident.kind}
                      </Badge>
                      <span className="font-mono text-[10px] text-muted-foreground">
                        {incident.ref}
                      </span>
                    </div>
                    <h2 className="mt-1 text-sm font-semibold">{incident.title}</h2>
                    <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                      {incident.description}
                    </p>
                    <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground">
                      <span className="inline-flex items-center gap-1">
                        <Radio className="h-3 w-3" /> {incident.location}
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <UserRound className="h-3 w-3" /> {incident.commanderName ?? 'No commander'}
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <Clock className="h-3 w-3" /> started {relativeTime(incident.startedAt)}
                      </span>
                      {typeof incident.updateCount === 'number' && (
                        <span>{incident.updateCount} updates</span>
                      )}
                    </div>
                  </div>

                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setSelectedId(incident.id)}
                    className="shrink-0"
                  >
                    Open <ArrowRight className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </article>
            );
          })}
        </div>
      )}

      <p className="rounded-lg border border-border bg-muted/40 px-3 py-2 text-center text-[11px] text-muted-foreground">
        RADAR records incidents and notifies campus leads inside this application. It does not
        contact emergency services automatically. Call your local emergency number for immediate
        danger.
      </p>

      <IncidentDrawer
        incidentId={selectedId}
        onClose={() => setSelectedId(null)}
        canWrite={can('incidents:write')}
        onChanged={() => void load()}
      />
    </div>
  );
}

function IncidentDrawer({
  incidentId,
  onClose,
  canWrite,
  onChanged,
}: {
  incidentId: number | null;
  onClose: () => void;
  canWrite: boolean;
  onChanged: () => void;
}) {
  const [detail, setDetail] = useState<IncidentDetailPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [status, setStatus] = useState<'active' | 'monitoring' | 'closed' | ''>('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!incidentId) return;
    setLoading(true);
    setError(null);
    try {
      const payload = await api.get<IncidentDetailPayload>(`/api/incidents/${incidentId}`);
      setDetail(payload);
      setStatus('');
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [incidentId]);

  useEffect(() => {
    if (!incidentId) {
      setDetail(null);
      setNote('');
      return;
    }
    void load();
  }, [incidentId, load]);

  const submit = async () => {
    if (!incidentId || !note.trim()) return;
    setSaving(true);
    setError(null);
    try {
      await api.post(`/api/incidents/${incidentId}/updates`, {
        note: note.trim(),
        status: status || undefined,
      });
      setNote('');
      setStatus('');
      await load();
      onChanged();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const incident = detail?.incident;

  return (
    <Drawer open={incidentId !== null} onOpenChange={(open) => (!open ? onClose() : null)}>
      <DrawerContent side="right" size="lg" aria-describedby={undefined}>
        <DrawerHeader>
          <div className="flex flex-wrap items-center gap-1.5">
            {incident && <SeverityBadge severity={incident.severity as Severity} />}
            {incident && (
              <Badge variant={STATUS_META[incident.status].variant} className="text-[10px]">
                {STATUS_META[incident.status].label}
              </Badge>
            )}
            <span className="font-mono text-[10px] text-muted-foreground">{incident?.ref ?? ''}</span>
          </div>
          <DrawerTitle className="mt-1.5">{incident?.title ?? 'Incident'}</DrawerTitle>
          <DrawerDescription>
            {incident ? `${incident.location} · started ${absoluteTime(incident.startedAt)}` : 'Loading…'}
          </DrawerDescription>
        </DrawerHeader>

        <DrawerBody className="space-y-4">
          {error && (
            <div className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
              {error}
              <Button variant="link" size="sm" onClick={() => void load()}>
                Retry
              </Button>
            </div>
          )}

          {loading && !detail ? (
            <div className="space-y-2">
              <Skeleton className="h-24 w-full" />
              <Skeleton className="h-16 w-full" />
            </div>
          ) : detail && incident ? (
            <>
              <section className="rounded-xl border border-border bg-muted/30 p-3">
                <p className="text-sm leading-relaxed">{incident.description}</p>
                <dl className="mt-3 grid grid-cols-2 gap-2 text-[11px]">
                  <div>
                    <dt className="text-muted-foreground">Commander</dt>
                    <dd className="font-medium">{incident.commanderName ?? 'Unassigned'}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Kind</dt>
                    <dd className="font-medium">{KIND_LABEL[incident.kind] ?? incident.kind}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Started</dt>
                    <dd className="font-medium">{absoluteTime(incident.startedAt)}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Closed</dt>
                    <dd className="font-medium">
                      {incident.closedAt ? absoluteTime(incident.closedAt) : 'Still open'}
                    </dd>
                  </div>
                </dl>
              </section>

              {canWrite && (
                <section className="space-y-2 rounded-xl border border-border p-3">
                  <h3 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    <MessageSquarePlus className="h-3.5 w-3.5" /> Add an update
                  </h3>
                  <Textarea
                    value={note}
                    onChange={(event) => setNote(event.target.value)}
                    maxLength={2000}
                    placeholder="What changed? Record actions taken and current status."
                    aria-label="Incident update note"
                  />
                  <div className="flex flex-wrap items-end gap-2">
                    <label className="flex-1 space-y-1 text-[11px] font-medium text-muted-foreground">
                      Change status (optional)
                      <select
                        value={status}
                        onChange={(event) =>
                          setStatus(event.target.value as 'active' | 'monitoring' | 'closed' | '')
                        }
                        className="h-9 w-full rounded-lg border border-input bg-background px-2 text-xs text-foreground"
                      >
                        <option value="">Keep current status</option>
                        <option value="active">Active</option>
                        <option value="monitoring">Monitoring</option>
                        <option value="closed">Closed</option>
                      </select>
                    </label>
                    <Button size="sm" onClick={() => void submit()} loading={saving} disabled={!note.trim()}>
                      Post update
                    </Button>
                  </div>
                </section>
              )}

              <section className="space-y-2">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Timeline ({detail.updates.length})
                </h3>
                {detail.updates.length === 0 ? (
                  <p className="rounded-lg border border-dashed border-border px-3 py-6 text-center text-xs text-muted-foreground">
                    No updates have been recorded for this incident.
                  </p>
                ) : (
                  <ol className="relative space-y-3 border-l border-border pl-4">
                    {detail.updates.map((entry) => (
                      <li key={entry.id} className="relative">
                        <span className="absolute -left-[21px] top-1 h-2.5 w-2.5 rounded-full border-2 border-card bg-accent-solid" />
                        <p className="text-xs leading-snug">{entry.note}</p>
                        <p className="mt-0.5 text-[10px] text-muted-foreground">
                          {entry.actorName ?? 'System'} · {absoluteTime(entry.createdAt)}
                        </p>
                      </li>
                    ))}
                  </ol>
                )}
              </section>
            </>
          ) : null}
        </DrawerBody>
      </DrawerContent>
    </Drawer>
  );
}
