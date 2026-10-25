'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Minus,
  Plus,
  RefreshCw,
  ShieldCheck,
  Users,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { api, errorMessage } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { relativeTime } from '@/components/ui/hazard-bits';
import { cn } from '@/components/ui/card';
import type { RollCallClass } from '@/lib/types';

export function RollCallPage() {
  const { can } = useAuth();
  const canRead = can('rollcall:read');
  const [classes, setClasses] = useState<RollCallClass[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<number | null>(null);

  const load = useCallback(async () => {
    if (!canRead) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const payload = await api.get<{ classes: RollCallClass[] }>('/api/rollcall');
      setClasses(payload.classes);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [canRead]);

  useEffect(() => {
    void load();
  }, [load]);

  const totals = useMemo(() => {
    const expected = classes.reduce((sum, item) => sum + item.expected, 0);
    const present = classes.reduce((sum, item) => sum + item.present, 0);
    const pending = classes.filter((item) => item.status !== 'complete').length;
    const missing = expected - present;
    return {
      expected,
      present,
      pending,
      missing,
      pct: expected ? Math.round((present / expected) * 100) : 0,
    };
  }, [classes]);

  const update = async (item: RollCallClass, present: number, status: RollCallClass['status']) => {
    setBusy(item.id);
    const previous = classes;
    setClasses((current) =>
      current.map((entry) =>
        entry.id === item.id
          ? { ...entry, present, status, updatedAt: new Date().toISOString() }
          : entry,
      ),
    );
    try {
      const payload = await api.patch<{ present: number; status: RollCallClass['status'] }>(
        `/api/rollcall/${item.id}`,
        { present, status },
      );
      setClasses((current) =>
        current.map((entry) =>
          entry.id === item.id
            ? { ...entry, present: payload.present, status: payload.status }
            : entry,
        ),
      );
    } catch (err) {
      setClasses(previous);
      setError(errorMessage(err));
    } finally {
      setBusy(null);
    }
  };

  const canWrite = can('rollcall:write');

  if (!canRead) {
    return (
      <div className="stack-page">
        <div className="mx-auto max-w-md rounded-xl border border-border bg-card p-6 text-center">
          <ShieldCheck className="mx-auto mb-2 h-8 w-8 text-muted-foreground" />
          <h1 className="text-lg font-semibold">Roll call is not available to your role</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Your account cannot view student accounting during drills. Ask a teacher, responder or
            administrator for a status update.
          </p>
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
              <Activity className="h-5 w-5" />
            </span>
            <h1 className="text-2xl font-semibold tracking-tight">Digital roll call</h1>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Account for students during drills and evacuations. Updates are saved immediately.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
          <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} /> Refresh
        </Button>
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

      {/* Summary */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs text-muted-foreground">Accounted for</p>
            <Users className="h-4 w-4 text-muted-foreground" />
          </div>
          <p className="mt-1 text-2xl font-semibold tabular-nums">{totals.pct}%</p>
          <p className="text-[11px] text-muted-foreground">
            {totals.present} of {totals.expected} students
          </p>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
            <div
              className={cn(
                'h-full rounded-full',
                totals.pct >= 100 ? 'bg-success' : totals.pct >= 90 ? 'bg-warning' : 'bg-danger',
              )}
              style={{ width: `${Math.min(100, totals.pct)}%` }}
            />
          </div>
        </div>

        <div className="rounded-xl border border-border bg-card p-4">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs text-muted-foreground">Not yet accounted</p>
            <AlertTriangle className="h-4 w-4 text-muted-foreground" />
          </div>
          <p className={cn('mt-1 text-2xl font-semibold tabular-nums', totals.missing > 0 && 'text-danger')}>
            {totals.missing}
          </p>
          <p className="text-[11px] text-muted-foreground">
            Students marked absent across all classes
          </p>
        </div>

        <div className="rounded-xl border border-border bg-card p-4">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs text-muted-foreground">Classes pending</p>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </div>
          <p className="mt-1 text-2xl font-semibold tabular-nums">{totals.pending}</p>
          <p className="text-[11px] text-muted-foreground">
            {totals.pending === 0 ? 'Every class is confirmed complete' : 'Awaiting completion confirmation'}
          </p>
        </div>

        <div className="rounded-xl border border-border bg-card p-4">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs text-muted-foreground">Last update</p>
            <RefreshCw className="h-4 w-4 text-muted-foreground" />
          </div>
          <p className="mt-1 text-lg font-semibold leading-tight">
            {classes.find((item) => item.updatedAt)
              ? relativeTime(
                  classes
                    .map((item) => item.updatedAt)
                    .filter(Boolean)
                    .sort()
                    .reverse()[0] ?? null,
                )
              : 'No updates yet'}
          </p>
          <p className="text-[11px] text-muted-foreground">Most recent class update</p>
        </div>
      </div>

      {loading && classes.length === 0 ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, index) => (
            <Skeleton key={index} className="h-20 w-full rounded-xl" />
          ))}
        </div>
      ) : classes.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-card px-6 py-16 text-center">
          <Activity className="mx-auto mb-2 h-8 w-8 text-muted-foreground" />
          <p className="text-sm font-medium">No classes are configured</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Classes and expected headcounts come from the school register.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {classes.map((item) => {
            const absent = Math.max(0, item.expected - item.present);
            const complete = item.status === 'complete';
            return (
              <div
                key={item.id}
                className={cn(
                  'rounded-xl border bg-card p-3.5 transition-colors',
                  complete ? 'border-success/30' : 'border-border',
                )}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <p className="text-sm font-medium">{item.name}</p>
                      <Badge variant="outline" className="text-[9px]">
                        Grade {item.grade}
                      </Badge>
                      <Badge
                        variant={complete ? 'success' : 'warning'}
                        className="text-[9px] capitalize"
                      >
                        {complete ? 'Complete' : 'Incomplete'}
                      </Badge>
                    </div>
                    <p className="mt-0.5 text-[11px] text-muted-foreground">
                      {item.teacherName ?? 'No teacher assigned'}
                      {item.roomName ? ` · ${item.roomName}` : ''}
                      {item.buildingName ? ` · ${item.buildingName}` : ''}
                      {item.updatedAt ? ` · updated ${relativeTime(item.updatedAt)}` : ''}
                    </p>
                  </div>

                  <div className="flex items-center gap-4">
                    <div className="text-right">
                      <p className="font-mono text-sm font-semibold tabular-nums">
                        {item.present}
                        <span className="text-muted-foreground">/{item.expected}</span>
                      </p>
                      <p
                        className={cn(
                          'text-[10px]',
                          absent > 0 ? 'text-danger' : 'text-success',
                        )}
                      >
                        {absent > 0 ? `${absent} not accounted` : 'All accounted for'}
                      </p>
                    </div>

                    {canWrite && (
                      <div className="flex items-center gap-1">
                        <Button
                          variant="outline"
                          size="icon"
                          className="h-8 w-8"
                          aria-label={`Decrease present count for ${item.name}`}
                          disabled={item.present <= 0 || busy === item.id}
                          onClick={() =>
                            void update(item, item.present - 1, item.status)
                          }
                        >
                          <Minus className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="outline"
                          size="icon"
                          className="h-8 w-8"
                          aria-label={`Increase present count for ${item.name}`}
                          disabled={item.present >= item.expected || busy === item.id}
                          onClick={() =>
                            void update(item, item.present + 1, item.status)
                          }
                        >
                          <Plus className="h-3.5 w-3.5" />
                        </Button>
                        {!complete ? (
                          <Button
                            size="sm"
                            className="ml-1"
                            loading={busy === item.id}
                            onClick={() => void update(item, item.present, 'complete')}
                          >
                            <CheckCircle2 className="h-3.5 w-3.5" /> Confirm
                          </Button>
                        ) : (
                          <Button
                            variant="outline"
                            size="sm"
                            className="ml-1"
                            loading={busy === item.id}
                            onClick={() => void update(item, item.present, 'incomplete')}
                          >
                            Reopen
                          </Button>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                <div className="mt-2 h-1 overflow-hidden rounded-full bg-muted">
                  <div
                    className={cn(
                      'h-full rounded-full',
                      absent === 0 ? 'bg-success' : 'bg-warning',
                    )}
                    style={{ width: `${item.expected ? (item.present / item.expected) * 100 : 0}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}

      <p className="flex items-center justify-center gap-1.5 text-[11px] text-muted-foreground">
        <ShieldCheck className="h-3.5 w-3.5" />
        {canWrite
          ? 'Each change is written to the audit log with your name and timestamp.'
          : 'Your role can view roll call but not modify it.'}
      </p>
    </div>
  );
}
