'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  Archive,
  CircleHelp,
  ExternalLink,
  Flame,
  Info,
  Mountain,
  MountainSnow,
  Plus,
  RadioTower,
  RefreshCw,
  ShieldAlert,
  Waves,
  Wind,
} from 'lucide-react';
import { PageHeader } from '@/components/ui/page-header';
import { StatCard } from '@/components/ui/stat-card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Input, Textarea } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { SeverityBadge, absoluteTime } from '@/components/ui/hazard-bits';
import { api, errorMessage } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { cn } from '@/components/ui/card';
import type {
  AdvisoriesPayload,
  Advisory,
  AdvisoryCategory,
  AdvisoryFreshness,
  FeedStatusPayload,
  Severity,
} from '@/lib/types';

const CATEGORY_ICON: Record<AdvisoryCategory, typeof Info> = {
  earthquake: Activity,
  typhoon: Wind,
  volcano: Mountain,
  flood: Waves,
  landslide: MountainSnow,
  fire: Flame,
  other: CircleHelp,
};

const FRESHNESS_META: Record<AdvisoryFreshness, { label: string; className: string }> = {
  current: { label: 'Current', className: 'border-success/30 bg-success/10 text-success' },
  stale: { label: 'Stale', className: 'border-warning/30 bg-warning/10 text-warning' },
  expired: { label: 'Expired', className: 'border-border bg-muted text-muted-foreground' },
  archived: { label: 'Archived', className: 'border-border bg-muted text-muted-foreground' },
};

const SEVERITIES: Severity[] = ['critical', 'high', 'medium', 'low', 'info'];

function localInput(value: Date) {
  const offset = value.getTimezoneOffset();
  return new Date(value.getTime() - offset * 60_000).toISOString().slice(0, 16);
}

function emptyForm() {
  return {
    category: 'earthquake' as AdvisoryCategory,
    title: '',
    summary: '',
    sourceName: '',
    sourceUrl: '',
    publishedAt: localInput(new Date()),
    validUntil: '',
    severity: 'info' as Severity,
  };
}

export function DisasterPage() {
  const { can } = useAuth();
  const canWrite = can('advisories:write');

  const [data, setData] = useState<AdvisoriesPayload | null>(null);
  const [feeds, setFeeds] = useState<FeedStatusPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [archiveTarget, setArchiveTarget] = useState<Advisory | null>(null);
  const [archiving, setArchiving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [advisories, feedStatus] = await Promise.all([
        api.get<AdvisoriesPayload>('/api/advisories'),
        api.get<FeedStatusPayload>('/api/feeds/status'),
      ]);
      setData(advisories);
      setFeeds(feedStatus);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const current = useMemo(() => data?.items.filter((item) => item.freshness === 'current') ?? [], [data]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setFormError(null);
    if (!form.title.trim() || !form.sourceName.trim()) {
      setFormError('A title and the official source name are required.');
      return;
    }
    setSubmitting(true);
    try {
      await api.post('/api/advisories', {
        category: form.category,
        title: form.title.trim(),
        summary: form.summary.trim(),
        sourceName: form.sourceName.trim(),
        sourceUrl: form.sourceUrl.trim(),
        publishedAt: new Date(form.publishedAt).toISOString(),
        validUntil: form.validUntil ? new Date(form.validUntil).toISOString() : null,
        severity: form.severity,
      });
      setOpen(false);
      setNotice('Official advisory recorded with its source and publication time.');
      await load();
    } catch (err) {
      setFormError(errorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  const archive = async () => {
    if (!archiveTarget) return;
    setArchiving(true);
    try {
      await api.patch(`/api/advisories/${archiveTarget.id}`, { status: 'archived' });
      setArchiveTarget(null);
      setNotice('Advisory moved to the archive.');
      await load();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setArchiving(false);
    }
  };

  return (
    <div className="stack-page space-y-5">
      <PageHeader
        eyebrow="Disaster monitoring"
        title="Official information, never invented"
        description="RADAR displays verified advisories recorded by authorized staff and reports the status of each live feed connector honestly. It does not fabricate earthquake, typhoon or flood data."
        icon={RadioTower}
        actions={
          <>
            <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
              <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} /> Refresh
            </Button>
            {canWrite && (
              <Button size="sm" onClick={() => { setForm(emptyForm()); setFormError(null); setOpen(true); }}>
                <Plus className="h-4 w-4" /> Record advisory
              </Button>
            )}
          </>
        }
      />

      {notice && (
        <div className="rounded-xl border border-success/30 bg-success/10 px-4 py-3 text-sm text-success">
          {notice}
        </div>
      )}

      {error ? (
        <Card hover={false} className="p-6 text-center">
          <ShieldAlert className="mx-auto mb-2 h-7 w-7 text-danger" />
          <p className="text-sm font-medium text-danger">Monitoring data unavailable</p>
          <p className="mt-1 text-xs text-muted-foreground">{error}</p>
          <Button size="sm" className="mt-3" onClick={() => void load()}>
            Try again
          </Button>
        </Card>
      ) : loading && !data ? (
        <div className="space-y-3">
          <Skeleton className="h-24 w-full" />
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <Skeleton key={i} className="h-40 w-full" />
            ))}
          </div>
        </div>
      ) : (
        <>
          <div className="rounded-xl border border-warning/30 bg-warning/10 p-4">
            <div className="flex items-start gap-2.5">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
              <div className="text-xs leading-relaxed text-warning">
                <p className="font-semibold">No live disaster feed is connected</p>
                <p className="mt-1 text-warning/90">
                  This build does not pull PHIVOLCS, PAGASA, USGS or local DRRMO feeds. Manual advisories below
                  are stored with their official source and publication time. Treat anything older than{' '}
                  {data?.staleAfterHours ?? 24} hours as stale and confirm with the issuing agency before acting.
                </p>
              </div>
            </div>
          </div>

          <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard
              label="Current advisories"
              value={data?.counts.current ?? 0}
              hint="Published within the last 24 hours"
              icon={RadioTower}
              tone="success"
            />
            <StatCard
              label="Stale"
              value={data?.counts.stale ?? 0}
              hint="Older than the freshness window"
              icon={AlertTriangle}
              tone="warning"
            />
            <StatCard
              label="Expired"
              value={data?.counts.expired ?? 0}
              hint="Past their validity time"
              icon={Archive}
              tone="neutral"
            />
            <StatCard
              label="Live connectors"
              value={feeds?.connectors.filter((c) => c.configured).length ?? 0}
              hint={`${feeds?.connectors.length ?? 0} connectors declared`}
              icon={Activity}
              tone="info"
            />
          </section>

          <section>
            <div className="mb-2 flex items-end justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold">Feed connectors</h2>
                <p className="text-xs text-muted-foreground">
                  Each connector must be implemented and tested server-side before it is shown as live.
                </p>
              </div>
              <Button variant="ghost" size="sm" onClick={() => void load()}>
                <RefreshCw className="h-3.5 w-3.5" /> Check status
              </Button>
            </div>
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {feeds?.connectors.map((connector) => {
                const Icon = CATEGORY_ICON[connector.category] ?? CircleHelp;
                return (
                  <Card key={connector.id} hover={false} className="p-4">
                    <div className="flex items-start justify-between gap-2">
                      <span className="grid h-9 w-9 place-items-center rounded-lg bg-muted text-muted-foreground">
                        <Icon className="h-4 w-4" />
                      </span>
                      <Badge variant={connector.configured ? 'success' : 'muted'}>
                        {connector.configured ? 'Connected' : 'Not configured'}
                      </Badge>
                    </div>
                    <p className="mt-2 text-sm font-semibold">{connector.label}</p>
                    <p className="text-[11px] text-muted-foreground">{connector.agency}</p>
                    <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">{connector.requires}</p>
                    <a
                      href={connector.docs}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="mt-2 inline-flex items-center gap-1 text-[11px] font-medium text-accent-foreground hover:underline"
                    >
                      Official source <ExternalLink className="h-3 w-3" />
                    </a>
                  </Card>
                );
              })}
            </div>
          </section>

          <section className="grid gap-4 lg:grid-cols-[1.6fr_1fr]">
            <Card hover={false} className="overflow-hidden">
              <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
                <div>
                  <h2 className="text-sm font-semibold">Official advisory log</h2>
                  <p className="text-[11px] text-muted-foreground">
                    {current.length} current · {data?.items.length ?? 0} total records
                  </p>
                </div>
                <Badge variant="outline">Human-verified</Badge>
              </div>
              {!data?.items.length ? (
                <div className="px-4 py-12 text-center">
                  <CircleHelp className="mx-auto mb-2 h-7 w-7 text-muted-foreground" />
                  <p className="text-sm font-medium">No advisories recorded</p>
                  <p className="mx-auto mt-1 max-w-md text-xs leading-relaxed text-muted-foreground">
                    When an official bulletin is relevant to the campus, an authorized administrator can record
                    it here with its source, publication time and validity window. No sample disaster data is
                    shown.
                  </p>
                </div>
              ) : (
                <ul className="divide-y divide-border">
                  {data.items.map((advisory) => {
                    const Icon = CATEGORY_ICON[advisory.category] ?? CircleHelp;
                    const freshness = FRESHNESS_META[advisory.freshness];
                    return (
                      <li key={advisory.id} className="px-4 py-4">
                        <div className="flex items-start gap-3">
                          <span className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground">
                            <Icon className="h-4 w-4" />
                          </span>
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <Badge variant="outline">{advisory.categoryLabel}</Badge>
                              <SeverityBadge severity={advisory.severity} />
                              <span
                                className={cn(
                                  'inline-flex rounded-full border px-2 py-0.5 text-[11px] font-semibold',
                                  freshness.className,
                                )}
                              >
                                {freshness.label}
                              </span>
                            </div>
                            <p className="mt-1.5 text-sm font-semibold leading-snug">{advisory.title}</p>
                            {advisory.summary && (
                              <p className="mt-1 whitespace-pre-line text-xs leading-relaxed text-muted-foreground">
                                {advisory.summary}
                              </p>
                            )}
                            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
                              <span>
                                Source: <span className="font-medium text-foreground">{advisory.sourceName}</span>
                              </span>
                              <span>Published {absoluteTime(advisory.publishedAt)}</span>
                              {advisory.validUntil && <span>Valid until {absoluteTime(advisory.validUntil)}</span>}
                              <span>Recorded by {advisory.createdByName ?? 'staff'}</span>
                              {advisory.sourceUrl && (
                                <a
                                  href={advisory.sourceUrl}
                                  target="_blank"
                                  rel="noreferrer noopener"
                                  className="inline-flex items-center gap-1 font-medium text-accent-foreground hover:underline"
                                >
                                  Open source <ExternalLink className="h-3 w-3" />
                                </a>
                              )}
                            </div>
                          </div>
                          {canWrite && advisory.status !== 'archived' && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setArchiveTarget(advisory)}
                              aria-label={`Archive ${advisory.title}`}
                            >
                              <Archive className="h-3.5 w-3.5" />
                            </Button>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </Card>

            <Card hover={false} className="p-4">
              <h2 className="text-sm font-semibold">What this page will not do</h2>
              <ul className="mt-2 space-y-2 text-xs leading-relaxed text-muted-foreground">
                <li className="flex gap-2">
                  <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-danger" />
                  Invent a magnitude, intensity, track or alert level.
                </li>
                <li className="flex gap-2">
                  <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-danger" />
                  Present an old bulletin as current without a stale label.
                </li>
                <li className="flex gap-2">
                  <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-danger" />
                  Predict the exact time or location of an earthquake.
                </li>
                <li className="flex gap-2">
                  <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-danger" />
                  Claim that emergency services were contacted.
                </li>
              </ul>
              <div className="mt-3 rounded-lg border border-border bg-muted/40 p-3 text-[11px] leading-relaxed text-muted-foreground">
                Emergency decisions must follow official agency bulletins, the school's approved emergency plan
                and instructions from on-scene responders.
              </div>
            </Card>
          </section>
        </>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Record an official advisory</DialogTitle>
            <DialogDescription>
              Copy the figures and wording from the issuing agency. Do not paraphrase beyond the source, and do
              not enter an advisory without a source.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={submit} className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="space-y-1.5 text-sm">
                <span className="font-medium">Category</span>
                <select
                  value={form.category}
                  onChange={(e) => setForm((f) => ({ ...f, category: e.target.value as AdvisoryCategory }))}
                  className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm"
                >
                  {data?.categories.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="space-y-1.5 text-sm">
                <span className="font-medium">Severity for campus use</span>
                <select
                  value={form.severity}
                  onChange={(e) => setForm((f) => ({ ...f, severity: e.target.value as Severity }))}
                  className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm capitalize"
                >
                  {SEVERITIES.map((severity) => (
                    <option key={severity} value={severity}>
                      {severity}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <Input
              label="Title"
              placeholder="As published by the agency"
              value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
            />
            <Textarea
              label="Summary"
              placeholder="Relevant figures, areas affected and instructions for the campus."
              value={form.summary}
              onChange={(e) => setForm((f) => ({ ...f, summary: e.target.value }))}
              rows={4}
            />
            <div className="grid gap-3 sm:grid-cols-2">
              <Input
                label="Official source"
                placeholder="e.g. PHIVOLCS"
                value={form.sourceName}
                onChange={(e) => setForm((f) => ({ ...f, sourceName: e.target.value }))}
              />
              <Input
                label="Source link"
                placeholder="https://…"
                value={form.sourceUrl}
                onChange={(e) => setForm((f) => ({ ...f, sourceUrl: e.target.value }))}
                helper="Optional, but strongly preferred."
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Input
                label="Published at"
                type="datetime-local"
                value={form.publishedAt}
                onChange={(e) => setForm((f) => ({ ...f, publishedAt: e.target.value }))}
              />
              <Input
                label="Valid until (optional)"
                type="datetime-local"
                value={form.validUntil}
                onChange={(e) => setForm((f) => ({ ...f, validUntil: e.target.value }))}
              />
            </div>
            {formError && (
              <p role="alert" className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-xs text-danger">
                {formError}
              </p>
            )}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={submitting}>
                Cancel
              </Button>
              <Button type="submit" loading={submitting}>
                Record advisory
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={Boolean(archiveTarget)}
        onOpenChange={(open) => !open && setArchiveTarget(null)}
        title="Archive this advisory?"
        description="It will be marked archived and removed from current monitoring. The source and publication history remain intact."
        confirmLabel="Archive"
        loading={archiving}
        onConfirm={archive}
      />
    </div>
  );
}
