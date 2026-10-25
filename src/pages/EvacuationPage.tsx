'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline, Tooltip } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import {
  Accessibility,
  AlertTriangle,
  Building2,
  CheckCircle2,
  Clock,
  DoorOpen,
  Flag,
  Footprints,
  MapPinned,
  RefreshCw,
  Route as RouteIcon,
  ShieldAlert,
  X,
} from 'lucide-react';
import { PageHeader } from '@/components/ui/page-header';
import { StatCard } from '@/components/ui/stat-card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { relativeTime } from '@/components/ui/hazard-bits';
import { api, errorMessage } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { useTheme } from '@/context/ThemeContext';
import { cn } from '@/components/ui/card';
import type {
  AssemblyPoint,
  EvacuationPayload,
  EvacuationRoute,
  RouteStatus,
} from '@/lib/types';

const STATUS_META: Record<
  RouteStatus,
  { label: string; hex: string; className: string; description: string }
> = {
  open: {
    label: 'Open',
    hex: '#22C55E',
    className: 'border-success/30 bg-success/10 text-success',
    description: 'Usable as planned',
  },
  restricted: {
    label: 'Restricted',
    hex: '#F59E0B',
    className: 'border-warning/30 bg-warning/10 text-warning',
    description: 'Passable with caution or partial obstruction',
  },
  closed: {
    label: 'Closed',
    hex: '#EF4444',
    className: 'border-danger/30 bg-danger/10 text-danger',
    description: 'Do not use — take the alternate route',
  },
};

const STATUS_ORDER: RouteStatus[] = ['open', 'restricted', 'closed'];

function routeIcon(status: RouteStatus) {
  const meta = STATUS_META[status];
  const glyph = status === 'open' ? '✓' : status === 'restricted' ? '!' : '×';
  return L.divIcon({
    className: '',
    html: `<div class="radar-marker" style="--marker-color:${meta.hex};width:28px;height:28px;font-size:12px;border-radius:8px">${glyph}</div>`,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
  });
}

function assemblyIcon(point: AssemblyPoint) {
  const meta = STATUS_META[point.status] ?? STATUS_META.open;
  return L.divIcon({
    className: '',
    html: `<div class="radar-marker" style="--marker-color:${meta.hex};width:34px;height:34px;font-size:11px;border-radius:8px">AP</div>`,
    iconSize: [34, 34],
    iconAnchor: [17, 17],
    popupAnchor: [0, -16],
  });
}

export function EvacuationPage() {
  const { can } = useAuth();
  const canWrite = can('evacuation:write');
  const { resolvedMode } = useTheme();

  const [data, setData] = useState<EvacuationPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [buildingFilter, setBuildingFilter] = useState<number | 'all'>('all');
  const [accessibleOnly, setAccessibleOnly] = useState(false);
  const [routeTarget, setRouteTarget] = useState<{ route: EvacuationRoute; status: RouteStatus } | null>(null);
  const [savingRoute, setSavingRoute] = useState(false);
  const [pointTarget, setPointTarget] = useState<AssemblyPoint | null>(null);
  const [pointForm, setPointForm] = useState({ status: 'open' as RouteStatus, capacity: '0' });
  const [savingPoint, setSavingPoint] = useState(false);
  const [dirOpen, setDirOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const payload = await api.get<EvacuationPayload>('/api/evacuation');
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

  const routes = useMemo(() => {
    if (!data) return [];
    return data.routes.filter((route) => {
      if (buildingFilter !== 'all' && route.buildingId !== buildingFilter) return false;
      if (accessibleOnly && !route.accessible) return false;
      return true;
    });
  }, [data, buildingFilter, accessibleOnly]);

  const buildingName = useCallback(
    (id: number | null) =>
      data?.buildings.find((building) => building.id === id)?.name ?? 'Campus-wide',
    [data],
  );

  const pointName = useCallback(
    (id: number | null) => data?.assemblyPoints.find((point) => point.id === id)?.name ?? 'Not assigned',
    [data],
  );

  const requestStatus = (route: EvacuationRoute, status: RouteStatus) => {
    if (status === route.status) return;
    setRouteTarget({ route, status });
  };

  const applyRouteStatus = async () => {
    if (!routeTarget) return;
    setSavingRoute(true);
    try {
      await api.patch(`/api/evacuation/routes/${routeTarget.route.id}`, {
        status: routeTarget.status,
      });
      setNotice(
        `${routeTarget.route.name} is now ${STATUS_META[routeTarget.status].label.toLowerCase()}. Staff were notified if it is no longer open.`,
      );
      setRouteTarget(null);
      await load();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSavingRoute(false);
    }
  };

  const openPoint = (point: AssemblyPoint) => {
    setPointTarget(point);
    setPointForm({ status: point.status, capacity: String(point.capacity) });
  };

  const savePoint = async () => {
    if (!pointTarget) return;
    setSavingPoint(true);
    try {
      await api.patch(`/api/evacuation/assembly/${pointTarget.id}`, {
        status: pointForm.status,
        capacity: Number(pointForm.capacity) || 0,
      });
      setNotice(`${pointTarget.name} updated.`);
      setPointTarget(null);
      await load();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSavingPoint(false);
    }
  };

  const center: [number, number] = data ? [data.school.lat, data.school.lng] : [41.8787, -87.6295];

  return (
    <div className="stack-page space-y-5">
      <PageHeader
        eyebrow="Evacuation & assembly"
        title="Every route, every assembly area"
        description="Live status for mapped evacuation routes and assembly points, with accessible alternatives and the current roll-call snapshot. Approved school plans and on-scene responders always take precedence."
        icon={DoorOpen}
        actions={
          <>
            <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
              <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} /> Refresh
            </Button>
            <Button variant="outline" size="sm" onClick={() => setDirOpen(true)}>
              <MapPinned className="h-4 w-4" /> Directory
            </Button>
          </>
        }
      />

      {notice && (
        <div className="rounded-xl border border-success/30 bg-success/10 px-4 py-3 text-sm text-success">
          {notice}
        </div>
      )}
      {error && (
        <div className="rounded-xl border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger">
          {error}
        </div>
      )}

      {loading && !data ? (
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-28 w-full" />
            ))}
          </div>
          <Skeleton className="h-80 w-full" />
        </div>
      ) : data ? (
        <>
          <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard
              label="Open routes"
              value={data.summary.open}
              hint={`${data.summary.routes} mapped routes`}
              icon={RouteIcon}
              tone="success"
            />
            <StatCard
              label="Restricted"
              value={data.summary.restricted}
              hint="Passable with caution"
              icon={AlertTriangle}
              tone="warning"
            />
            <StatCard
              label="Closed"
              value={data.summary.closed}
              hint="Alternate route required"
              icon={X}
              tone="danger"
            />
            <StatCard
              label="Assembly capacity"
              value={data.summary.assemblyCapacity.toLocaleString()}
              hint={`${data.assemblyPoints.length} assembly points · ${data.summary.accessible} accessible routes`}
              icon={Flag}
              tone="accent"
            />
          </section>

          <div className="grid gap-4 xl:grid-cols-[1.35fr_1fr]">
            <Card hover={false} className="overflow-hidden">
              <div className="flex flex-wrap items-center gap-2 border-b border-border px-3 py-2.5">
                <RouteIcon className="h-4 w-4 text-muted-foreground" />
                <h2 className="text-sm font-semibold">Evacuation map</h2>
                <div className="ml-auto flex flex-wrap items-center gap-1.5">
                  <select
                    value={buildingFilter}
                    onChange={(event) =>
                      setBuildingFilter(event.target.value === 'all' ? 'all' : Number(event.target.value))
                    }
                    aria-label="Filter routes by building"
                    className="h-8 rounded-lg border border-input bg-background px-2 text-xs"
                  >
                    <option value="all">All buildings</option>
                    {data.buildings.map((building) => (
                      <option key={building.id} value={building.id}>
                        {building.name}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={() => setAccessibleOnly((value) => !value)}
                    aria-pressed={accessibleOnly}
                    className={cn(
                      'inline-flex h-8 items-center gap-1 rounded-lg border px-2 text-xs font-medium transition-colors',
                      accessibleOnly
                        ? 'border-primary bg-primary text-primary-foreground'
                        : 'border-input text-muted-foreground hover:bg-accent',
                    )}
                  >
                    <Accessibility className="h-3.5 w-3.5" /> Accessible
                  </button>
                </div>
              </div>
              <div className="h-[420px] w-full">
                <MapContainer
                  center={center}
                  zoom={17}
                  scrollWheelZoom
                  className="h-full w-full"
                  attributionControl={false}
                >
                  <TileLayer
                    url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
                    attribution="© OpenStreetMap contributors"
                    className={resolvedMode === 'dark' ? 'map-tiles-dark' : undefined}
                  />
                  {routes.map((route) => {
                    const meta = STATUS_META[route.status];
                    return (
                      <Polyline
                        key={route.id}
                        positions={route.path}
                        pathOptions={{
                          color: meta.hex,
                          weight: route.status === 'closed' ? 3 : 5,
                          opacity: route.status === 'closed' ? 0.5 : 0.9,
                          dashArray: route.status === 'closed' ? '8 8' : undefined,
                        }}
                      >
                        <Tooltip sticky>
                          <span className="text-xs font-semibold">{route.name}</span>
                          <br />
                          {meta.label} · {route.distanceM} m · {route.walkMinutes} min
                        </Tooltip>
                      </Polyline>
                    );
                  })}
                  {routes.map((route) => {
                    const point = route.path[route.path.length - 1];
                    if (!point) return null;
                    return (
                      <Marker key={`route-${route.id}`} position={point} icon={routeIcon(route.status)}>
                        <Popup>
                          <span className="text-xs font-semibold">{route.name}</span>
                          <br />
                          {STATUS_META[route.status].label} · via {buildingName(route.buildingId)}
                        </Popup>
                      </Marker>
                    );
                  })}
                  {data.assemblyPoints.map((point) => (
                    <Marker key={`ap-${point.id}`} position={[point.lat, point.lng]} icon={assemblyIcon(point)}>
                      <Popup>
                        <span className="text-xs font-semibold">{point.name}</span>
                        <br />
                        Capacity {point.capacity} · {STATUS_META[point.status].label}
                        {point.accessible ? ' · accessible' : ''}
                      </Popup>
                    </Marker>
                  ))}
                </MapContainer>
              </div>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-border px-3 py-2 text-[11px] text-muted-foreground">
                {STATUS_ORDER.map((status) => (
                  <span key={status} className="inline-flex items-center gap-1.5">
                    <span
                      className="inline-block h-2.5 w-2.5 rounded-sm"
                      style={{ background: STATUS_META[status].hex }}
                    />
                    {STATUS_META[status].label}
                  </span>
                ))}
                <span className="inline-flex items-center gap-1.5">
                  <span className="inline-block h-2.5 w-2.5 rounded-sm bg-[#22C55E]" /> AP = assembly point
                </span>
                <span className="ml-auto">Map is a planning aid, not a live GPS route.</span>
              </div>
            </Card>

            <div className="space-y-4">
              <Card hover={false} className="p-4">
                <div className="flex items-center justify-between gap-2">
                  <h2 className="text-sm font-semibold">Roll-call snapshot</h2>
                  <Badge variant={data.rollcall ? 'outline' : 'muted'}>
                    {data.rollcall ? 'Live counts' : 'Restricted'}
                  </Badge>
                </div>
                {data.rollcall ? (
                  <>
                    <p className="mt-2 text-2xl font-semibold tabular-nums">
                      {data.rollcall.present}
                      <span className="text-base font-normal text-muted-foreground">
                        {' '}/ {data.rollcall.expected}
                      </span>
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Students accounted for across {data.rollcall.classes} classes.
                    </p>
                    <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full bg-success transition-all duration-500"
                        style={{
                          width: `${data.rollcall.expected ? Math.min(100, Math.round((data.rollcall.present / data.rollcall.expected) * 100)) : 0}%`,
                        }}
                      />
                    </div>
                    <p className="mt-1.5 text-[11px] text-muted-foreground">
                      {data.rollcall.expected
                        ? `${Math.round((data.rollcall.present / data.rollcall.expected) * 100)}% accounted for`
                        : 'No expected count recorded'}
                      {' · '}
                      Teachers update this during a drill or incident.
                    </p>
                  </>
                ) : (
                  <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                    Your role can view routes but not class roll-call totals. Teachers and safety staff can update
                    the roll call from the roll-call board.
                  </p>
                )}
              </Card>

              <Card hover={false} className="p-4">
                <h2 className="text-sm font-semibold">Assembly points</h2>
                <p className="text-xs text-muted-foreground">
                  Capacity is a planning estimate, not a live occupancy count.
                </p>
                <ul className="mt-3 space-y-2">
                  {data.assemblyPoints.map((point) => {
                    const meta = STATUS_META[point.status] ?? STATUS_META.open;
                    return (
                      <li
                        key={point.id}
                        className="rounded-lg border border-border bg-background/60 px-3 py-2.5"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <span className="text-sm font-medium">{point.name}</span>
                              <span
                                className={cn(
                                  'inline-flex rounded-full border px-1.5 py-0.5 text-[10px] font-semibold',
                                  meta.className,
                                )}
                              >
                                {meta.label}
                              </span>
                              {point.accessible && (
                                <Accessibility className="h-3 w-3 text-muted-foreground" aria-label="Accessible" />
                              )}
                            </div>
                            <p className="mt-0.5 text-[11px] text-muted-foreground">
                              Capacity {point.capacity} · updated {relativeTime(point.updatedAt)}
                            </p>
                          </div>
                          {canWrite && (
                            <Button variant="ghost" size="sm" onClick={() => openPoint(point)}>
                              Edit
                            </Button>
                          )}
                        </div>
                        {point.notes && (
                          <p className="mt-1 text-[11px] leading-snug text-muted-foreground">{point.notes}</p>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </Card>
            </div>
          </div>

          <Card hover={false} className="overflow-hidden">
            <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-3">
              <div>
                <h2 className="text-sm font-semibold">Routes</h2>
                <p className="text-[11px] text-muted-foreground">
                  {routes.length} of {data.routes.length} routes in view
                </p>
              </div>
              {canWrite && (
                <p className="ml-auto text-[11px] text-muted-foreground">
                  Changing a route notifies staff and is recorded in the audit log.
                </p>
              )}
            </div>
            {routes.length === 0 ? (
              <div className="px-4 py-10 text-center">
                <RouteIcon className="mx-auto mb-2 h-7 w-7 text-muted-foreground" />
                <p className="text-sm font-medium">No routes match this filter</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Clear the building or accessibility filter to see every mapped route.
                </p>
              </div>
            ) : (
              <ul className="divide-y divide-border">
                {routes.map((route) => {
                  const meta = STATUS_META[route.status];
                  return (
                    <li key={route.id} className="px-4 py-4">
                      <div className="flex flex-col gap-3 lg:flex-row lg:items-start">
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-sm font-semibold">{route.name}</span>
                            <span
                              className={cn(
                                'inline-flex rounded-full border px-2 py-0.5 text-[11px] font-semibold',
                                meta.className,
                              )}
                            >
                              {meta.label}
                            </span>
                            {route.accessible ? (
                              <Badge variant="success">
                                <Accessibility className="mr-1 h-3 w-3" /> Accessible
                              </Badge>
                            ) : (
                              <Badge variant="warning">Not step-free</Badge>
                            )}
                            {route.scenario !== 'general' && (
                              <Badge variant="outline" className="capitalize">
                                {route.scenario.replace(/-/g, ' ')}
                              </Badge>
                            )}
                          </div>
                          <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
                            <span className="inline-flex items-center gap-1">
                              <Building2 className="h-3 w-3" /> {buildingName(route.buildingId)}
                            </span>
                            <span className="inline-flex items-center gap-1">
                              <Footprints className="h-3 w-3" /> {route.distanceM} m · {route.walkMinutes} min
                            </span>
                            <span className="inline-flex items-center gap-1">
                              <Flag className="h-3 w-3" /> {pointName(route.assemblyPointId)}
                            </span>
                            <span className="inline-flex items-center gap-1">
                              <Clock className="h-3 w-3" /> {relativeTime(route.updatedAt)}
                            </span>
                          </div>
                          {route.notes && (
                            <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
                              {route.notes}
                            </p>
                          )}
                        </div>
                        {canWrite ? (
                          <div
                            className="flex shrink-0 flex-wrap gap-1"
                            role="group"
                            aria-label={`Set status for ${route.name}`}
                          >
                            {STATUS_ORDER.map((status) => {
                              const active = route.status === status;
                              const metaOption = STATUS_META[status];
                              return (
                                <button
                                  key={status}
                                  type="button"
                                  onClick={() => requestStatus(route, status)}
                                  aria-pressed={active}
                                  className={cn(
                                    'rounded-md border px-2.5 py-1.5 text-[11px] font-semibold transition-colors',
                                    active
                                      ? metaOption.className
                                      : 'border-input text-muted-foreground hover:bg-accent hover:text-foreground',
                                  )}
                                >
                                  {metaOption.label}
                                </button>
                              );
                            })}
                          </div>
                        ) : (
                          <span className="shrink-0 self-start rounded-md border border-border bg-muted/40 px-2 py-1 text-[11px] text-muted-foreground">
                            Read-only route status
                          </span>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>

          <p className="rounded-lg border border-border bg-muted/40 px-3 py-2 text-[11px] leading-relaxed text-muted-foreground">
            {data.disclaimer} Assembly capacity is a planning estimate. A route marked open is not a guarantee that
            the path is safe at this moment — responders and marshals make the final call.
          </p>
        </>
      ) : null}

      <Dialog open={dirOpen} onOpenChange={setDirOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Evacuation directory</DialogTitle>
            <DialogDescription>
              Quick reference for the campus. Print or share through your approved school channel.
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-[60vh] space-y-4 overflow-y-auto pr-1">
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Assembly points
              </h3>
              <ul className="mt-1.5 space-y-1.5 text-sm">
                {data?.assemblyPoints.map((point) => (
                  <li key={point.id} className="flex items-start justify-between gap-2">
                    <span>
                      {point.name}
                      {point.accessible && (
                        <Accessibility className="ml-1 inline h-3 w-3 text-muted-foreground" />
                      )}
                    </span>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {point.capacity} people · {STATUS_META[point.status]?.label ?? point.status}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Routes
              </h3>
              <ul className="mt-1.5 space-y-1.5 text-sm">
                {data?.routes.map((route) => (
                  <li key={route.id} className="flex items-start justify-between gap-2">
                    <span>{route.name}</span>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {route.walkMinutes} min · {STATUS_META[route.status].label}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
            <p className="flex items-start gap-2 rounded-lg border border-warning/30 bg-warning/10 px-3 py-2 text-[11px] leading-relaxed text-warning">
              <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              If you are in immediate danger, call your local emergency number. RADAR does not contact emergency
              services on your behalf.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDirOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(pointTarget)} onOpenChange={(open) => !open && setPointTarget(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Update {pointTarget?.name}</DialogTitle>
            <DialogDescription>
              Status and capacity changes are visible to everyone with evacuation access and recorded in the audit
              log.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <p className="mb-1.5 text-sm font-medium">Status</p>
              <div className="grid grid-cols-3 gap-1.5">
                {STATUS_ORDER.map((status) => (
                  <button
                    key={status}
                    type="button"
                    onClick={() => setPointForm((form) => ({ ...form, status }))}
                    aria-pressed={pointForm.status === status}
                    className={cn(
                      'rounded-lg border px-2 py-2 text-xs font-semibold transition-colors',
                      pointForm.status === status
                        ? STATUS_META[status].className
                        : 'border-input text-muted-foreground hover:bg-accent',
                    )}
                  >
                    {STATUS_META[status].label}
                  </button>
                ))}
              </div>
            </div>
            <Input
              label="Planning capacity"
              type="number"
              min={0}
              value={pointForm.capacity}
              onChange={(event) => setPointForm((form) => ({ ...form, capacity: event.target.value }))}
              helper="Estimated number of people the area can hold safely."
            />
            {pointForm.status !== 'open' && (
              <p className="rounded-lg border border-warning/30 bg-warning/10 px-3 py-2 text-[11px] leading-relaxed text-warning">
                A {STATUS_META[pointForm.status].label.toLowerCase()} assembly point should have a documented
                alternate location in your school emergency plan.
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPointTarget(null)} disabled={savingPoint}>
              Cancel
            </Button>
            <Button onClick={() => void savePoint()} loading={savingPoint}>
              <CheckCircle2 className="h-4 w-4" /> Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={Boolean(routeTarget)}
        onOpenChange={(open) => !open && setRouteTarget(null)}
        title={`Mark ${routeTarget?.route.name ?? 'route'} as ${routeTarget ? STATUS_META[routeTarget.status].label.toLowerCase() : ''}?`}
        description={
          routeTarget
            ? routeTarget.status === 'closed'
              ? 'Staff will be notified that this route is closed. Confirm that an alternate route is usable before closing it.'
              : routeTarget.status === 'restricted'
                ? 'Staff will be notified that the route is restricted. Describe the obstruction in the route notes if possible.'
                : 'Reopening a route tells staff it is usable again. Only do this when the path has been checked.'
            : ''
        }
        confirmLabel={routeTarget ? `Mark ${STATUS_META[routeTarget.status].label}` : 'Confirm'}
        destructive={routeTarget?.status === 'closed'}
        loading={savingRoute}
        onConfirm={applyRouteStatus}
      />
    </div>
  );
}
