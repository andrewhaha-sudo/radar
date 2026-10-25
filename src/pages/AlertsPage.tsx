'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Archive,
  BellRing,
  Building2,
  CalendarClock,
  CheckCircle2,
  Clock,
  Megaphone,
  Plus,
  RefreshCw,
  Send,
  ShieldAlert,
  Users,
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
import { ALERT_LEVEL_META, AlertLevelBadge, AlertStateBadge } from '@/components/ui/alert-bits';
import { absoluteTime, relativeTime } from '@/components/ui/hazard-bits';
import { api, errorMessage } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { cn } from '@/components/ui/card';
import type {
  Alert,
  AlertAudience,
  AlertKind,
  AlertLevel,
  AlertState,
  AlertsPayload,
  Building,
} from '@/lib/types';

const LEVELS: AlertLevel[] = ['green', 'yellow', 'orange', 'red'];
const KINDS: Array<{ id: AlertKind; label: string }> = [
  { id: 'alert', label: 'Alert' },
  { id: 'announcement', label: 'Announcement' },
  { id: 'suspension', label: 'Class suspension' },
];
const AUDIENCES: Array<{ id: AlertAudience; label: string }> = [
  { id: 'school', label: 'Whole school' },
  { id: 'staff', label: 'Staff only' },
  { id: 'students', label: 'Students' },
  { id: 'parents', label: 'Parents & guardians' },
  { id: 'grade', label: 'Selected grade' },
  { id: 'section', label: 'Assigned class / section' },
  { id: 'building', label: 'Assigned building' },
];
const TABS: Array<{ id: AlertState | 'all'; label: string }> = [
  { id: 'active', label: 'Active' },
  { id: 'scheduled', label: 'Scheduled' },
  { id: 'expired', label: 'Expired' },
  { id: 'archived', label: 'Archived' },
  { id: 'all', label: 'All' },
];

function localInput(value: Date) {
  const offset = value.getTimezoneOffset();
  return new Date(value.getTime() - offset * 60_000).toISOString().slice(0, 16);
}

function emptyForm() {
  return {
    level: 'yellow' as AlertLevel,
    kind: 'alert' as AlertKind,
    title: '',
    body: '',
    audience: 'school' as AlertAudience,
    audienceValue: '',
    buildingId: '',
    effectiveAt: localInput(new Date()),
    expiresAt: '',
    sendPush: false,
    sendSms: false,
    suspensionReason: '',
    resumeAt: '',
  };
}

export function AlertsPage() {
  const { can } = useAuth();
  const canPublish = can('alerts:publish');
  const canBuildings = can('buildings:read');

  const [data, setData] = useState<AlertsPayload | null>(null);
  const [targetClasses, setTargetClasses] = useState<
    Array<{ id: number; name: string; grade: string }>
  >([]);
  useEffect(() => {
    if (canPublish)
      api
        .get<{ classes: Array<{ id: number; name: string; grade: string }> }>('/api/rollcall')
        .then((d) => setTargetClasses(d.classes))
        .catch(() => {});
  }, [canPublish]);
  const [buildings, setBuildings] = useState<Building[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<AlertState | 'all'>('active');
  const [composeOpen, setComposeOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [archiveTarget, setArchiveTarget] = useState<Alert | null>(null);
  const [archiving, setArchiving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const payload = await api.get<AlertsPayload>('/api/alerts');
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

  useEffect(() => {
    if (!canBuildings) return;
    api
      .get<{ buildings: Building[] }>('/api/buildings')
      .then((payload) => setBuildings(payload.buildings))
      .catch(() => setBuildings([]));
  }, [canBuildings]);

  const visible = useMemo(() => {
    if (!data) return [];
    return tab === 'all' ? data.items : data.items.filter((item) => item.state === tab);
  }, [data, tab]);

  const featured = useMemo(() => {
    if (!data) return null;
    return (
      data.active.find((item) => item.level === 'red') ??
      data.active.find((item) => item.level === 'orange') ??
      data.active.find((item) => item.level === 'yellow') ??
      data.active[0] ??
      null
    );
  }, [data]);

  const openCompose = () => {
    setForm(emptyForm());
    setFormError(null);
    setComposeOpen(true);
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setFormError(null);
    if (!form.title.trim()) {
      setFormError('Give the announcement a clear title.');
      return;
    }
    if (form.audience === 'grade' && !form.audienceValue.trim()) {
      setFormError('Enter the grade level this announcement targets.');
      return;
    }
    setSubmitting(true);
    try {
      const payload = await api.post<{ alert: Alert; message: string }>('/api/alerts', {
        level: form.level,
        sendPush: form.sendPush,
        sendSms: form.sendSms,
        suspensionReason: form.suspensionReason,
        resumeAt: form.resumeAt ? new Date(form.resumeAt).toISOString() : null,
        kind: form.kind,
        title: form.title.trim(),
        body: form.body.trim(),
        audience: form.audience,
        audienceValue: form.audienceValue.trim(),
        buildingId: form.buildingId ? Number(form.buildingId) : null,
        effectiveAt: new Date(form.effectiveAt).toISOString(),
        expiresAt: form.expiresAt ? new Date(form.expiresAt).toISOString() : null,
      });
      setComposeOpen(false);
      setNotice(payload.message);
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
      await api.patch(`/api/alerts/${archiveTarget.id}`, { archived: true });
      setArchiveTarget(null);
      setNotice(`${archiveTarget.ref} was archived.`);
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
        eyebrow="Alerts & announcements"
        title="One voice for the whole campus"
        description="Publish colour-coded alerts, class-suspension notices and scheduled announcements. Delivery is recorded per recipient, and every change is audited."
        icon={BellRing}
        actions={
          <>
            <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
              <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} /> Refresh
            </Button>
            {canPublish && (
              <Button size="sm" onClick={openCompose}>
                <Plus className="h-4 w-4" /> New announcement
              </Button>
            )}
          </>
        }
      />

      {notice && (
        <div className="flex items-start gap-2 rounded-xl border border-success/30 bg-success/10 px-4 py-3 text-sm text-success">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
          <p className="flex-1">{notice}</p>
          <button
            onClick={() => setNotice(null)}
            className="text-xs font-semibold uppercase tracking-wide text-success/80 hover:text-success"
          >
            Dismiss
          </button>
        </div>
      )}

      {error ? (
        <Card hover={false} className="p-6 text-center">
          <ShieldAlert className="mx-auto mb-2 h-7 w-7 text-danger" />
          <p className="text-sm font-medium text-danger">Alert board unavailable</p>
          <p className="mt-1 text-xs text-muted-foreground">{error}</p>
          <Button size="sm" className="mt-3" onClick={() => void load()}>
            Try again
          </Button>
        </Card>
      ) : loading && !data ? (
        <div className="space-y-3">
          <Skeleton className="h-36 w-full" />
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-28 w-full" />
            ))}
          </div>
        </div>
      ) : data ? (
        <>
          {featured ? (
            <section
              className="relative overflow-hidden rounded-2xl border p-5 shadow-lg sm:p-6"
              style={{
                borderColor: `${ALERT_LEVEL_META[featured.level].hex}55`,
                background: `linear-gradient(120deg, ${ALERT_LEVEL_META[featured.level].hex}1f, transparent 60%), color-mix(in srgb, var(--card) 88%, transparent)`,
              }}
              aria-live="polite"
            >
              <div
                className="pointer-events-none absolute -right-16 -top-20 h-56 w-56 rounded-full blur-3xl"
                style={{ background: `${ALERT_LEVEL_META[featured.level].hex}33` }}
              />
              <div className="relative flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <AlertLevelBadge level={featured.level} />
                    <Badge variant="outline" className="capitalize">
                      {featured.kind}
                    </Badge>
                    <span className="text-[11px] text-muted-foreground">
                      {featured.ref} · delivered to {featured.deliveryCount}
                    </span>
                  </div>
                  <h2 className="mt-3 text-balance text-xl font-semibold tracking-tight sm:text-2xl">
                    {featured.title}
                  </h2>
                  {featured.body && (
                    <p className="mt-2 max-w-3xl whitespace-pre-line text-sm leading-relaxed text-muted-foreground">
                      {featured.body}
                    </p>
                  )}
                  <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
                    <span className="inline-flex items-center gap-1">
                      <Users className="h-3 w-3" /> {featured.audienceLabel}
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <Clock className="h-3 w-3" /> Effective {relativeTime(featured.effectiveAt)}
                    </span>
                    {featured.expiresAt && (
                      <span className="inline-flex items-center gap-1">
                        <CalendarClock className="h-3 w-3" /> Expires{' '}
                        {absoluteTime(featured.expiresAt)}
                      </span>
                    )}
                    {featured.buildingName && (
                      <span className="inline-flex items-center gap-1">
                        <Building2 className="h-3 w-3" /> {featured.buildingName}
                      </span>
                    )}
                    <span>Published by {featured.publisherName ?? 'school administration'}</span>
                  </div>
                </div>
                {featured.kind === 'suspension' && (
                  <div className="shrink-0 rounded-xl border border-warning/30 bg-warning/10 px-3 py-2 text-xs text-warning lg:max-w-[240px]">
                    <p className="font-semibold">Suspension notice</p>
                    <p className="mt-0.5 leading-snug">
                      {featured.suspensionReason || featured.body}
                      <br />
                      Resumption:{' '}
                      {featured.resumeAt
                        ? absoluteTime(featured.resumeAt)
                        : 'Not announced; await an official update.'}
                    </p>
                  </div>
                )}
              </div>
            </section>
          ) : (
            <section className="flex flex-col gap-3 rounded-2xl border border-success/25 bg-success/5 p-5 sm:flex-row sm:items-center">
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-success/10 text-success">
                <CheckCircle2 className="h-5 w-5" />
              </span>
              <div>
                <p className="text-sm font-semibold text-foreground">No active school alert</p>
                <p className="text-xs text-muted-foreground">
                  Normal operations. Scheduled and archived announcements remain available below.
                </p>
              </div>
            </section>
          )}

          <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {LEVELS.map((level) => {
              const meta = ALERT_LEVEL_META[level];
              const Icon = meta.icon;
              return (
                <div
                  key={level}
                  className="rounded-xl border border-border bg-card/80 p-4 shadow-sm backdrop-blur-sm"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span
                      className="grid h-8 w-8 place-items-center rounded-lg"
                      style={{ background: `${meta.hex}18`, color: meta.hex }}
                    >
                      <Icon className="h-4 w-4" aria-hidden="true" />
                    </span>
                    <span className="text-lg font-semibold tabular-nums">
                      {data.byLevel[level]}
                    </span>
                  </div>
                  <p className="mt-2 text-xs font-semibold text-foreground">{meta.label}</p>
                  <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">
                    {meta.description}
                  </p>
                </div>
              );
            })}
          </section>

          <div className="grid gap-3 sm:grid-cols-3">
            <StatCard
              label="Active now"
              value={data.counts.active ?? 0}
              hint="Visible on the alert board"
              icon={Megaphone}
              tone="accent"
            />
            <StatCard
              label="Scheduled"
              value={data.counts.scheduled ?? 0}
              hint="Notifications send at the effective time"
              icon={CalendarClock}
              tone="info"
            />
            <StatCard
              label="Archive"
              value={(data.counts.expired ?? 0) + (data.counts.archived ?? 0)}
              hint="Expired or archived notices"
              icon={Archive}
              tone="neutral"
            />
          </div>

          <Card hover={false} className="overflow-hidden">
            <div className="flex flex-wrap items-center gap-2 border-b border-border px-3 py-2.5">
              <div
                className="flex flex-wrap gap-1"
                role="tablist"
                aria-label="Filter announcements"
              >
                {TABS.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => setTab(item.id)}
                    role="tab"
                    aria-selected={tab === item.id}
                    className={cn(
                      'rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors',
                      tab === item.id
                        ? 'bg-primary text-primary-foreground'
                        : 'text-muted-foreground hover:bg-accent hover:text-foreground',
                    )}
                  >
                    {item.label}
                    {item.id !== 'all' && (
                      <span className="ml-1.5 opacity-70">{data.counts[item.id] ?? 0}</span>
                    )}
                  </button>
                ))}
              </div>
              <p className="ml-auto text-[11px] text-muted-foreground">
                Updated {relativeTime(data.generatedAt)}
              </p>
            </div>

            {visible.length === 0 ? (
              <div className="px-4 py-10 text-center">
                <BellRing className="mx-auto mb-2 h-7 w-7 text-muted-foreground" />
                <p className="text-sm font-medium">Nothing in this view</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {tab === 'active'
                    ? 'There are no active announcements right now.'
                    : 'No announcements match the selected state.'}
                </p>
              </div>
            ) : (
              <ul className="divide-y divide-border">
                {visible.map((item) => (
                  <li
                    key={item.id}
                    className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-start"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <AlertLevelBadge level={item.level} showLabel={false} />
                        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                          {ALERT_LEVEL_META[item.level].short}
                        </span>
                        <AlertStateBadge state={item.state} />
                        <Badge variant="outline" className="capitalize">
                          {item.kind}
                        </Badge>
                        <span className="font-mono text-[10px] text-muted-foreground">
                          {item.ref}
                        </span>
                      </div>
                      <p className="mt-1.5 text-sm font-semibold leading-snug">{item.title}</p>
                      {item.body && (
                        <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-muted-foreground">
                          {item.body}
                        </p>
                      )}
                      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
                        <span className="inline-flex items-center gap-1">
                          <Users className="h-3 w-3" /> {item.audienceLabel}
                        </span>
                        <span className="inline-flex items-center gap-1">
                          <Clock className="h-3 w-3" /> {relativeTime(item.effectiveAt)}
                        </span>
                        {item.expiresAt && <span>Expires {relativeTime(item.expiresAt)}</span>}
                        <span>{item.deliveryCount} delivered</span>
                        <span>by {item.publisherName ?? 'system'}</span>
                      </div>
                    </div>
                    {canPublish && item.state !== 'archived' && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setArchiveTarget(item)}
                        className="shrink-0"
                      >
                        <Archive className="h-3.5 w-3.5" /> Archive
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Card>

          {!canPublish && (
            <p className="rounded-lg border border-border bg-muted/40 px-3 py-2 text-[11px] text-muted-foreground">
              Only school and system administrators can publish or archive announcements. Your role
              can read the alert board and receives targeted notifications.
            </p>
          )}
        </>
      ) : null}

      <Dialog open={composeOpen} onOpenChange={setComposeOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>New announcement</DialogTitle>
            <DialogDescription>
              Alerts are delivered in-app to the selected audience. Email and SMS require a
              separately configured provider and are not sent by this installation.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={submit} className="space-y-4">
            <div>
              <p className="mb-1.5 text-sm font-medium">Alert level</p>
              <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
                {LEVELS.map((level) => {
                  const meta = ALERT_LEVEL_META[level];
                  const Icon = meta.icon;
                  const active = form.level === level;
                  return (
                    <button
                      key={level}
                      type="button"
                      onClick={() => setForm((f) => ({ ...f, level }))}
                      aria-pressed={active}
                      className={cn(
                        'flex items-center gap-1.5 rounded-lg border px-2 py-2 text-left text-[11px] font-medium transition-colors',
                        active ? 'ring-1 ring-inset' : 'opacity-75 hover:opacity-100',
                      )}
                      style={{
                        borderColor: `${meta.hex}${active ? 'AA' : '44'}`,
                        background: active ? `${meta.hex}1A` : 'transparent',
                        color: active ? meta.hex : undefined,
                      }}
                    >
                      <Icon className="h-3.5 w-3.5 shrink-0" />
                      {meta.short}
                    </button>
                  );
                })}
              </div>
              <p className="mt-1.5 text-[11px] text-muted-foreground">
                {ALERT_LEVEL_META[form.level].description} Colour is always paired with an icon and
                label.
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="space-y-1.5 text-sm">
                <span className="font-medium">Type</span>
                <select
                  value={form.kind}
                  onChange={(e) => setForm((f) => ({ ...f, kind: e.target.value as AlertKind }))}
                  className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm"
                >
                  {KINDS.map((kind) => (
                    <option key={kind.id} value={kind.id}>
                      {kind.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="space-y-1.5 text-sm">
                <span className="font-medium">Audience</span>
                <select
                  value={form.audience}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, audience: e.target.value as AlertAudience }))
                  }
                  className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm"
                >
                  {AUDIENCES.map((audience) => (
                    <option key={audience.id} value={audience.id}>
                      {audience.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            {['section', 'building'].includes(form.audience) && (
              <label className="block text-sm">
                Target school group
                <select
                  className="mt-2 w-full rounded border border-border bg-background p-2"
                  value={form.audienceValue}
                  onChange={(e) => setForm({ ...form, audienceValue: e.target.value })}
                >
                  <option value="">Choose…</option>
                  {(form.audience === 'section' ? targetClasses : buildings).map((target) => (
                    <option key={target.id} value={target.id}>
                      {target.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <label className="flex items-center gap-2 text-xs">
              <input
                type="checkbox"
                checked={form.sendPush}
                onChange={(e) => setForm({ ...form, sendPush: e.target.checked })}
              />{' '}
              Also request browser push for consented subscribers
            </label>
            <label className="flex items-center gap-2 text-xs">
              <input
                type="checkbox"
                checked={form.sendSms}
                onChange={(e) => setForm({ ...form, sendSms: e.target.checked })}
              />{' '}
              Also request configured SMS for consented recipients (provider fees may apply)
            </label>
            {form.kind === 'suspension' && (
              <>
                <Input
                  label="Official suspension reason"
                  value={form.suspensionReason}
                  onChange={(e) => setForm({ ...form, suspensionReason: e.target.value })}
                />
                <Input
                  label="Expected resumption (leave blank if not announced)"
                  type="datetime-local"
                  value={form.resumeAt}
                  onChange={(e) => setForm({ ...form, resumeAt: e.target.value })}
                />
              </>
            )}
            {form.audience === 'grade' && (
              <Input
                label="Grade level"
                placeholder="e.g. 11"
                value={form.audienceValue}
                onChange={(e) => setForm((f) => ({ ...f, audienceValue: e.target.value }))}
                helper="Currently targets student accounts with this grade recorded."
              />
            )}

            {canBuildings && (
              <label className="space-y-1.5 text-sm">
                <span className="font-medium">Affected building (optional)</span>
                <select
                  value={form.buildingId}
                  onChange={(e) => setForm((f) => ({ ...f, buildingId: e.target.value }))}
                  className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm"
                >
                  <option value="">No specific building</option>
                  {buildings.map((building) => (
                    <option key={building.id} value={building.id}>
                      {building.name} ({building.code})
                    </option>
                  ))}
                </select>
              </label>
            )}

            <Input
              label="Title"
              placeholder="Short, specific headline"
              value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              maxLength={180}
            />
            <Textarea
              label="Message"
              placeholder="What changed, what people should do, and when to expect an update."
              value={form.body}
              onChange={(e) => setForm((f) => ({ ...f, body: e.target.value }))}
              rows={5}
              maxLength={4000}
            />

            <div className="grid gap-3 sm:grid-cols-2">
              <Input
                label="Effective at"
                type="datetime-local"
                value={form.effectiveAt}
                onChange={(e) => setForm((f) => ({ ...f, effectiveAt: e.target.value }))}
                helper="Future times create a scheduled announcement."
              />
              <Input
                label="Expires at (optional)"
                type="datetime-local"
                value={form.expiresAt}
                onChange={(e) => setForm((f) => ({ ...f, expiresAt: e.target.value }))}
                helper="Expired alerts leave the active board automatically."
              />
            </div>

            {form.kind === 'suspension' && (
              <p className="rounded-lg border border-warning/30 bg-warning/10 px-3 py-2 text-xs text-warning">
                Class suspensions are official school decisions. Include the reason, effective date
                and resumption details in the message. Only publish when you are authorized to do
                so.
              </p>
            )}

            {formError && (
              <p
                role="alert"
                className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-xs text-danger"
              >
                {formError}
              </p>
            )}

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setComposeOpen(false)}
                disabled={submitting}
              >
                Cancel
              </Button>
              <Button type="submit" loading={submitting}>
                <Send className="h-4 w-4" /> Publish announcement
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={Boolean(archiveTarget)}
        onOpenChange={(open) => !open && setArchiveTarget(null)}
        title="Archive this announcement?"
        description={
          archiveTarget
            ? `${archiveTarget.ref} will leave the active alert board. Existing notifications are not recalled, and the record remains in the archive.`
            : ''
        }
        confirmLabel="Archive"
        destructive
        loading={archiving}
        onConfirm={archive}
      />
    </div>
  );
}
