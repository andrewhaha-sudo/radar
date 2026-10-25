'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  CloudOff,
  DownloadCloud,
  HardDriveDownload,
  RefreshCw,
  Send,
  ShieldAlert,
  Trash2,
  Wifi,
  WifiOff,
} from 'lucide-react';
import { PageHeader } from '@/components/ui/page-header';
import { StatCard } from '@/components/ui/stat-card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { useOffline } from '@/context/OfflineContext';
import { relativeTime, absoluteTime } from '@/components/ui/hazard-bits';
import {
  clearDataPack,
  formatBytes,
  readDataPackMeta,
  readDataPackDocument,
  saveDataPack,
  type DataPackMeta,
} from '@/lib/offline';
import type { AlertsPayload, DashboardPayload, EvacuationPayload, ResourcesPayload } from '@/lib/types';
import { cn } from '@/components/ui/card';

interface Snapshot {
  generatedAt: string | null;
  dashboard: DashboardPayload | null;
  alerts: AlertsPayload | null;
  evacuation: EvacuationPayload | null;
  resources: ResourcesPayload | null;
}

export function OfflinePage() {
  const { online, pending, pendingCount, flushing, lastSyncAt, lastError, remove, flush } = useOffline();
  const [meta, setMeta] = useState<DataPackMeta | null>(() => readDataPackMeta());
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [clearing, setClearing] = useState(false);
  const [packConfirm, setPackConfirm] = useState(false);
  const [removeTarget, setRemoveTarget] = useState<string | null>(null);
  const [snapshot, setSnapshot] = useState<Snapshot>({
    generatedAt: null,
    dashboard: null,
    alerts: null,
    evacuation: null,
    resources: null,
  });
  const [loadingSnapshot, setLoadingSnapshot] = useState(true);

  const loadSnapshot = useCallback(async () => {
    setLoadingSnapshot(true);
    try {
      const [dashboard, alerts, evacuation, resources] = await Promise.all([
        readDataPackDocument<DashboardPayload>('/api/dashboard'),
        readDataPackDocument<AlertsPayload>('/api/alerts'),
        readDataPackDocument<EvacuationPayload>('/api/evacuation'),
        readDataPackDocument<ResourcesPayload>('/api/resources'),
      ]);
      setSnapshot({
        generatedAt: dashboard?.generatedAt ?? alerts?.generatedAt ?? evacuation?.generatedAt ?? null,
        dashboard,
        alerts,
        evacuation,
        resources,
      });
    } finally {
      setLoadingSnapshot(false);
    }
  }, []);

  useEffect(() => {
    void loadSnapshot();
  }, [loadSnapshot]);

  const buildPack = async () => {
    setPackConfirm(false);
    setSaving(true);
    setSaveError(null);
    try {
      const saved = await saveDataPack();
      setMeta(saved);
      await loadSnapshot();
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : 'Could not save the offline data pack.');
    } finally {
      setSaving(false);
    }
  };

  const dropPack = async () => {
    setClearing(true);
    try {
      await clearDataPack();
      setMeta(null);
      await loadSnapshot();
    } finally {
      setClearing(false);
    }
  };

  const sendQueued = async () => {
    await flush();
  };

  const savedParts = meta?.parts.filter((part) => part.ok) ?? [];
  const failedParts = meta?.parts.filter((part) => !part.ok) ?? [];

  return (
    <div className="stack-page space-y-5">
      <PageHeader
        eyebrow="Offline & connectivity"
        title="Prepared when the network is not"
        description="RADAR caches the application shell and lets you store a read-only data pack of the dashboard, map, alerts, evacuation board and resources. Queued reports are stored on this device until you explicitly send them."
        icon={online ? Wifi : WifiOff}
        actions={
          <>
            <Button variant="outline" size="sm" onClick={() => void loadSnapshot()} disabled={loadingSnapshot}>
              <RefreshCw className={cn('h-4 w-4', loadingSnapshot && 'animate-spin')} /> Refresh view
            </Button>
            <Button size="sm" onClick={() => setPackConfirm(true)} loading={saving} disabled={!online}>
              <HardDriveDownload className="h-4 w-4" /> Save data pack
            </Button>
          </>
        }
      />

      <div
        className={cn(
          'flex flex-col gap-2 rounded-xl border px-4 py-3 sm:flex-row sm:items-center',
          online
            ? 'border-success/30 bg-success/10 text-success'
            : 'border-warning/30 bg-warning/10 text-warning',
        )}
      >
        <span className="flex items-center gap-2 text-sm font-semibold">
          {online ? <Wifi className="h-4 w-4" /> : <WifiOff className="h-4 w-4" />}
          {online ? 'Connected' : 'Offline — showing cached data only'}
        </span>
        <span className="text-xs sm:ml-auto">
          {online
            ? 'Reads and writes go to the school server.'
            : 'Writes are not sent. Use the outbox below to review queued items.'}
        </span>
      </div>

      {lastError && (
        <div className="rounded-xl border border-warning/30 bg-warning/10 px-4 py-3 text-sm text-warning">
          {lastError}
        </div>
      )}
      {saveError && (
        <div className="rounded-xl border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger">
          {saveError}
        </div>
      )}

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Connection"
          value={online ? 'Online' : 'Offline'}
          hint={online ? 'Server reachable' : 'Do not rely on live data'}
          icon={online ? Wifi : WifiOff}
          tone={online ? 'success' : 'warning'}
        />
        <StatCard
          label="Data pack"
          value={meta ? `${savedParts.length}/${meta.parts.length}` : 'None'}
          hint={meta ? `Saved ${relativeTime(meta.savedAt)}` : 'Save one while connected'}
          icon={DownloadCloud}
          tone={meta ? 'accent' : 'neutral'}
        />
        <StatCard
          label="Queued items"
          value={pendingCount}
          hint={pendingCount ? 'Not yet on the server' : 'Nothing waiting'}
          icon={Send}
          tone={pendingCount ? 'warning' : 'success'}
        />
        <StatCard
          label="Last sync"
          value={lastSyncAt ? relativeTime(lastSyncAt) : '—'}
          hint={lastSyncAt ? absoluteTime(lastSyncAt) : 'No queue sent from this device'}
          icon={RefreshCw}
          tone="info"
        />
      </section>

      <div className="grid gap-4 xl:grid-cols-[1.1fr_1fr]">
        <Card hover={false} className="p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold">Offline data pack</h2>
              <p className="text-xs text-muted-foreground">
                Read-only JSON stored in this browser's Cache API. It is not encrypted at rest beyond your device
                security.
              </p>
            </div>
            <Badge variant={meta ? 'success' : 'muted'}>{meta ? 'Saved' : 'Not saved'}</Badge>
          </div>

          {meta ? (
            <div className="mt-3">
              <p className="text-[11px] text-muted-foreground">
                Saved {absoluteTime(meta.savedAt)} ·{' '}
                {formatBytes(meta.parts.reduce((sum, part) => sum + part.bytes, 0))}
              </p>
              <ul className="mt-2 divide-y divide-border rounded-lg border border-border">
                {meta.parts.map((part) => (
                  <li key={part.path} className="flex items-center justify-between gap-2 px-3 py-2 text-xs">
                    <span className="inline-flex items-center gap-2">
                      {part.ok ? (
                        <CheckCircle2 className="h-3.5 w-3.5 text-success" />
                      ) : (
                        <AlertTriangle className="h-3.5 w-3.5 text-warning" />
                      )}
                      {part.label}
                    </span>
                    <span className="text-[11px] text-muted-foreground">
                      {part.ok ? formatBytes(part.bytes) : part.error ?? 'Failed'}
                    </span>
                  </li>
                ))}
              </ul>
              {failedParts.length > 0 && (
                <p className="mt-2 text-[11px] leading-relaxed text-warning">
                  {failedParts.length} section(s) failed to save. The previous copy was removed so an old snapshot
                  is not mistaken for current data.
                </p>
              )}
              <div className="mt-3 flex flex-wrap gap-2">
                <Button variant="outline" size="sm" onClick={() => setPackConfirm(true)} loading={saving} disabled={!online}>
                  <RefreshCw className="h-3.5 w-3.5" /> Re-save pack
                </Button>
                <Button variant="ghost" size="sm" onClick={() => void dropPack()} loading={clearing}>
                  <Trash2 className="h-3.5 w-3.5" /> Delete pack
                </Button>
              </div>
            </div>
          ) : (
            <div className="mt-3 rounded-lg border border-dashed border-border px-4 py-8 text-center">
              <CloudOff className="mx-auto mb-2 h-7 w-7 text-muted-foreground" />
              <p className="text-sm font-medium">No offline data pack</p>
              <p className="mx-auto mt-1 max-w-sm text-xs leading-relaxed text-muted-foreground">
                Save a pack while connected so you can review the last known campus state if the network drops.
              </p>
              <Button size="sm" className="mt-3" onClick={() => setPackConfirm(true)} loading={saving} disabled={!online}>
                <HardDriveDownload className="h-3.5 w-3.5" /> Save data pack
              </Button>
            </div>
          )}

          <div className="mt-4 rounded-lg border border-warning/30 bg-warning/10 p-3 text-[11px] leading-relaxed text-warning">
            <p className="flex items-center gap-1.5 font-semibold">
              <ShieldAlert className="h-3.5 w-3.5" /> Cached data can be wrong
            </p>
            <p className="mt-1">
              A data pack is a snapshot, not a live feed. Alert levels, route closures and room clearance can change
              after it was saved. Confirm with a person on scene before acting on cached information.
            </p>
          </div>
        </Card>

        <Card hover={false} className="overflow-hidden">
          <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-3">
            <div>
              <h2 className="text-sm font-semibold">Outbox</h2>
              <p className="text-[11px] text-muted-foreground">
                Items written while offline or after a failed request.
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="ml-auto"
              onClick={() => void sendQueued()}
              disabled={!online || !pendingCount}
              loading={flushing}
            >
              <Send className="h-3.5 w-3.5" /> Send queued
            </Button>
          </div>
          {pending.length === 0 ? (
            <div className="px-4 py-12 text-center">
              <CheckCircle2 className="mx-auto mb-2 h-7 w-7 text-success" />
              <p className="text-sm font-medium">Outbox empty</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Nothing on this device is waiting to be sent.
              </p>
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {pending.map((item) => (
                <li key={item.id} className="px-4 py-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-medium">{item.label}</p>
                      <p className="mt-0.5 text-[11px] text-muted-foreground">
                        {item.kind.replace(/_/g, ' ')} · queued {relativeTime(item.createdAt)} · {item.attempts}{' '}
                        attempt(s)
                      </p>
                      {item.lastError && (
                        <p className="mt-1 text-[11px] leading-snug text-danger">{item.lastError}</p>
                      )}
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setRemoveTarget(item.id)}
                      aria-label={`Remove ${item.label} from the outbox`}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
          <p className="border-t border-border px-4 py-2 text-[11px] leading-relaxed text-muted-foreground">
            Queued items are stored in this browser's localStorage. Clearing site data removes them. RADAR does not
            send anything in the background without your action.
          </p>
        </Card>
      </div>

      <Card hover={false} className="p-4">
        <h2 className="text-sm font-semibold">Last cached snapshot</h2>
        {loadingSnapshot ? (
          <p className="mt-1 text-xs text-muted-foreground">Reading cached documents…</p>
        ) : snapshot.generatedAt ? (
          <>
            <p className="mt-1 text-[11px] text-muted-foreground">
              Snapshot generated {absoluteTime(snapshot.generatedAt)} ({relativeTime(snapshot.generatedAt)})
            </p>
            <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <SnapshotStat
                label="Active alerts"
                value={snapshot.alerts?.counts.active ?? 0}
                detail={snapshot.alerts?.active[0]?.title ?? 'No active alert in snapshot'}
                tone={snapshot.alerts?.active[0]?.level ?? 'green'}
              />
              <SnapshotStat
                label="Open routes"
                value={snapshot.evacuation?.summary.open ?? 0}
                detail={`${snapshot.evacuation?.summary.closed ?? 0} closed · ${snapshot.evacuation?.summary.restricted ?? 0} restricted`}
                tone="green"
              />
              <SnapshotStat
                label="Resources needing attention"
                value={
                  (snapshot.resources?.summary.due ?? 0) +
                  (snapshot.resources?.summary.expired ?? 0) +
                  (snapshot.resources?.summary.missing ?? 0)
                }
                detail={`${snapshot.resources?.summary.total ?? 0} records cached`}
                tone="yellow"
              />
              <SnapshotStat
                label="Unread notifications"
                value={snapshot.dashboard?.kpis.unreadNotifications ?? 0}
                detail="From the cached dashboard"
                tone="green"
              />
            </div>
            {snapshot.dashboard && (
              <p className="mt-3 rounded-lg border border-border bg-muted/40 px-3 py-2 text-[11px] leading-relaxed text-muted-foreground">
                Cached dashboard: {snapshot.dashboard.kpis.unresolved} unresolved hazard
                {snapshot.dashboard.kpis.unresolved === 1 ? '' : 's'} ·{' '}
                {snapshot.dashboard.kpis.activeIncidents} active incident
                {snapshot.dashboard.kpis.activeIncidents === 1 ? '' : 's'} ·{' '}
                {snapshot.dashboard.kpis.rollcallPresent} of{' '}
                {snapshot.dashboard.kpis.rollcallExpected} students present at snapshot time.
              </p>
            )}
          </>
        ) : (
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            No cached documents are available. Save a data pack while connected to review the last known state
            offline.
          </p>
        )}
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card hover={false} className="p-4">
          <h2 className="text-sm font-semibold">What works offline</h2>
          <ul className="mt-2 space-y-1.5 text-xs leading-relaxed text-muted-foreground">
            <li>Opening RADAR after it has been loaded once (service-worker shell cache).</li>
            <li>Reading the last saved data pack: dashboard, map, alerts, evacuation, resources.</li>
            <li>Writing notes into the outbox for later review and sending.</li>
          </ul>
        </Card>
        <Card hover={false} className="p-4">
          <h2 className="text-sm font-semibold">What never happens offline</h2>
          <ul className="mt-2 space-y-1.5 text-xs leading-relaxed text-muted-foreground">
            <li>No SOS is transmitted. A queued SOS has not contacted anyone.</li>
            <li>No alert is published and no roll call reaches the server.</li>
            <li>No AI analysis runs on a device.</li>
            <li>No emergency service is contacted by RADAR, online or offline.</li>
          </ul>
          <p className="mt-2 text-[11px] font-medium text-danger">
            If someone is in immediate danger, call your local emergency number.
          </p>
        </Card>
      </div>

      <ConfirmDialog
        open={packConfirm}
        onOpenChange={setPackConfirm}
        title="Save an offline data pack?"
        description="RADAR will fetch the dashboard, map, alerts, evacuation board and resources and store them in this browser. The data is unencrypted and includes campus safety information — only do this on a trusted device."
        confirmLabel="Save data pack"
        loading={saving}
        onConfirm={buildPack}
      />

      <ConfirmDialog
        open={Boolean(removeTarget)}
        onOpenChange={(open) => !open && setRemoveTarget(null)}
        title="Remove this queued item?"
        description="The item will be deleted from this browser and will never reach the server. This cannot be undone."
        confirmLabel="Remove item"
        destructive
        onConfirm={() => {
          if (removeTarget) remove(removeTarget);
          setRemoveTarget(null);
        }}
      />
    </div>
  );
}

function SnapshotStat({
  label,
  value,
  detail,
  tone,
}: {
  label: string;
  value: number;
  detail: string;
  tone: 'green' | 'yellow' | 'orange' | 'red';
}) {
  const color =
    tone === 'red' ? '#EF4444' : tone === 'orange' ? '#F97316' : tone === 'yellow' ? '#FACC15' : '#22C55E';
  return (
    <div className="rounded-lg border border-border bg-background/60 p-3">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-0.5 text-xl font-semibold tabular-nums" style={{ color }}>
        {value}
      </p>
      <p className="mt-0.5 line-clamp-2 text-[11px] leading-snug text-muted-foreground">{detail}</p>
    </div>
  );
}
