'use client';

import { workspaceUrl } from '@/lib/workspace';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Accessibility,
  Archive,
  Building2,
  CalendarClock,
  CheckCircle2,
  Download,
  Filter,
  Flame,
  HeartPulse,
  MapPin,
  Package,
  Plus,
  RefreshCw,
  Search,
  ShieldAlert,
  ShieldCheck,
  TriangleAlert,
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
import { absoluteTime, relativeTime } from '@/components/ui/hazard-bits';
import { api, errorMessage } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { cn } from '@/components/ui/card';
import type { Building, ResourceItem, ResourcesPayload, Room } from '@/lib/types';

type ResourceStatus = 'ok' | 'due' | 'expired' | 'missing';

const STATUS_META: Record<
  ResourceStatus,
  { label: string; className: string; hex: string; description: string }
> = {
  ok: {
    label: 'Ready',
    className: 'border-success/30 bg-success/10 text-success',
    hex: '#22C55E',
    description: 'Present and within service life',
  },
  due: {
    label: 'Service due',
    className: 'border-warning/30 bg-warning/10 text-warning',
    hex: '#F59E0B',
    description: 'Usable but overdue for inspection',
  },
  expired: {
    label: 'Expired',
    className: 'border-danger/30 bg-danger/10 text-danger',
    hex: '#EF4444',
    description: 'Past its certification or expiry date',
  },
  missing: {
    label: 'Missing',
    className: 'border-danger/30 bg-danger/10 text-danger',
    hex: '#EF4444',
    description: 'Not in its recorded location',
  },
};

const STATUS_ORDER: ResourceStatus[] = ['ok', 'due', 'expired', 'missing'];

const TYPE_ICON: Record<string, typeof Package> = {
  aed: HeartPulse,
  extinguisher: Flame,
  first_aid: ShieldCheck,
  eyewash: Accessibility,
  spill_kit: TriangleAlert,
  emergency_light: ShieldAlert,
  radio: Package,
  water: Package,
};

function typeLabel(type: string) {
  return type
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function emptyForm() {
  return {
    type: 'extinguisher',
    label: '',
    status: 'ok' as ResourceStatus,
    quantity: '1',
    buildingId: '',
    roomId: '',
    expiresAt: '',
    department: '',
    locationNote: '',
    notes: '',
  };
}

export function ResourcesPage() {
  const { can } = useAuth();
  const canWrite = can('resources:write');
  const canBuildings = can('buildings:read');

  const [data, setData] = useState<ResourcesPayload | null>(null);
  const [buildings, setBuildings] = useState<Building[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<ResourceStatus | 'all'>('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [buildingFilter, setBuildingFilter] = useState('all');

  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [editTarget, setEditTarget] = useState<ResourceItem | null>(null);
  const [editForm, setEditForm] = useState({
    status: 'ok' as ResourceStatus,
    quantity: '0',
    expiresAt: '',
    locationNote: '',
    notes: '',
  });
  const [savingEdit, setSavingEdit] = useState(false);

  const [checkTarget, setCheckTarget] = useState<ResourceItem | null>(null);
  const [checking, setChecking] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const payload = await api.get<ResourcesPayload>('/api/resources');
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
      .get<{ buildings: Building[]; rooms: Room[] }>('/api/buildings')
      .then((payload) => {
        setBuildings(payload.buildings);
        setRooms(payload.rooms);
      })
      .catch(() => {
        setBuildings([]);
        setRooms([]);
      });
  }, [canBuildings]);

  const visible = useMemo(() => {
    if (!data) return [];
    const needle = query.trim().toLowerCase();
    return data.items.filter((item) => {
      if (statusFilter !== 'all' && item.status !== statusFilter) return false;
      if (typeFilter !== 'all' && item.type !== typeFilter) return false;
      if (buildingFilter !== 'all' && String(item.buildingId) !== buildingFilter) return false;
      if (!needle) return true;
      return [item.label, item.type, item.roomName, item.buildingName, item.locationNote, item.department]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(needle));
    });
  }, [data, query, statusFilter, typeFilter, buildingFilter]);

  const openCreate = () => {
    setForm(emptyForm());
    setFormError(null);
    setCreateOpen(true);
  };

  const create = async (event: React.FormEvent) => {
    event.preventDefault();
    setFormError(null);
    if (!form.label.trim()) {
      setFormError('Give the resource a specific label.');
      return;
    }
    if (!form.buildingId && !form.roomId) {
      setFormError('Choose a room or a building location.');
      return;
    }
    setSubmitting(true);
    try {
      await api.post('/api/resources', {
        type: form.type.trim(),
        label: form.label.trim(),
        status: form.status,
        quantity: Number(form.quantity) || 0,
        buildingId: form.buildingId ? Number(form.buildingId) : null,
        roomId: form.roomId ? Number(form.roomId) : null,
        expiresAt: form.expiresAt ? new Date(form.expiresAt).toISOString() : null,
        department: form.department.trim(),
        locationNote: form.locationNote.trim(),
        notes: form.notes.trim(),
      });
      setCreateOpen(false);
      setNotice('Emergency resource recorded.');
      await load();
    } catch (err) {
      setFormError(errorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  const openEdit = (item: ResourceItem) => {
    setEditTarget(item);
    setEditForm({
      status: item.status,
      quantity: String(item.quantity ?? 0),
      expiresAt: item.expiresAt ? item.expiresAt.slice(0, 10) : '',
      locationNote: item.locationNote ?? '',
      notes: item.notes ?? '',
    });
  };

  const saveEdit = async () => {
    if (!editTarget) return;
    setSavingEdit(true);
    try {
      await api.patch(`/api/resources/${editTarget.id}`, {
        status: editForm.status,
        quantity: Number(editForm.quantity) || 0,
        expiresAt: editForm.expiresAt ? new Date(editForm.expiresAt).toISOString() : null,
        locationNote: editForm.locationNote.trim(),
        notes: editForm.notes.trim(),
      });
      setNotice(`${editTarget.label} updated.`);
      setEditTarget(null);
      await load();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSavingEdit(false);
    }
  };

  const confirmCheck = async () => {
    if (!checkTarget) return;
    setChecking(true);
    try {
      await api.patch(`/api/resources/${checkTarget.id}`, { checked: true, status: 'ok' });
      setNotice(`${checkTarget.label} marked as checked and ready.`);
      setCheckTarget(null);
      await load();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setChecking(false);
    }
  };

  const roomsForBuilding = useMemo(() => {
    if (!form.buildingId) return rooms;
    return rooms.filter((room) => room.buildingId === Number(form.buildingId));
  }, [rooms, form.buildingId]);

  const exportHref = workspaceUrl('/api/analytics/export?dataset=resources');

  return (
    <div className="stack-page space-y-5">
      <PageHeader
        eyebrow="Emergency resources"
        title="Ready when it matters."
        description="Keep track of emergency equipment, supplies and expiry dates. Know what needs checking before it is needed."
        icon={Package}
        actions={
          <>
            <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
              <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} /> Refresh
            </Button>
            <Button variant="outline" size="sm" asChild>
              <a href={exportHref}>
                <Download className="h-4 w-4" /> CSV
              </a>
            </Button>
            {canWrite && (
              <Button size="sm" onClick={openCreate}>
                <Plus className="h-4 w-4" /> Add resource
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
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-96 w-full" />
        </div>
      ) : data ? (
        <>
          <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard
              label="Ready"
              value={data.summary.ok}
              hint={`${data.summary.totalUnits} units across ${data.summary.total} records`}
              icon={CheckCircle2}
              tone="success"
              progress={data.summary.total ? Math.round((data.summary.ok / data.summary.total) * 100) : 0}
            />
            <StatCard
              label="Service due"
              value={data.summary.due}
              hint="Usable, but overdue for inspection"
              icon={CalendarClock}
              tone="warning"
            />
            <StatCard
              label="Expired"
              value={data.summary.expired}
              hint={`${data.summary.expiring} expiring within 30 days`}
              icon={Archive}
              tone="danger"
            />
            <StatCard
              label="Missing"
              value={data.summary.missing}
              hint="Not in its recorded location"
              icon={ShieldAlert}
              tone="danger"
            />
          </section>

          <Card hover={false} className="overflow-hidden">
            <div className="flex flex-wrap items-center gap-2 border-b border-border px-3 py-2.5">
              <label className="relative min-w-[200px] flex-1">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search label, room, department or location note"
                  className="h-9 pl-8 text-sm"
                  aria-label="Search resources"
                />
              </label>
              <select
                value={typeFilter}
                onChange={(event) => setTypeFilter(event.target.value)}
                aria-label="Filter by resource type"
                className="h-9 rounded-lg border border-input bg-background px-2 text-xs"
              >
                <option value="all">All types</option>
                {data.types.map((type) => (
                  <option key={type} value={type}>
                    {typeLabel(type)}
                  </option>
                ))}
              </select>
              <select
                value={buildingFilter}
                onChange={(event) => setBuildingFilter(event.target.value)}
                aria-label="Filter by building"
                className="h-9 rounded-lg border border-input bg-background px-2 text-xs"
                disabled={!canBuildings}
              >
                <option value="all">All buildings</option>
                {buildings.map((building) => (
                  <option key={building.id} value={building.id}>
                    {building.name}
                  </option>
                ))}
              </select>
              <div className="flex gap-1" role="tablist" aria-label="Filter by status">
                <button
                  onClick={() => setStatusFilter('all')}
                  role="tab"
                  aria-selected={statusFilter === 'all'}
                  className={cn(
                    'rounded-md px-2 py-1.5 text-xs font-medium transition-colors',
                    statusFilter === 'all'
                      ? 'bg-primary text-primary-foreground'
                      : 'text-muted-foreground hover:bg-accent',
                  )}
                >
                  All
                </button>
                {STATUS_ORDER.map((status) => (
                  <button
                    key={status}
                    onClick={() => setStatusFilter(status)}
                    role="tab"
                    aria-selected={statusFilter === status}
                    className={cn(
                      'rounded-md px-2 py-1.5 text-xs font-medium transition-colors',
                      statusFilter === status
                        ? 'bg-primary text-primary-foreground'
                        : 'text-muted-foreground hover:bg-accent',
                    )}
                  >
                    {STATUS_META[status].label}
                  </button>
                ))}
              </div>
              {(query || typeFilter !== 'all' || buildingFilter !== 'all' || statusFilter !== 'all') && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setQuery('');
                    setTypeFilter('all');
                    setBuildingFilter('all');
                    setStatusFilter('all');
                  }}
                >
                  <Filter className="h-3.5 w-3.5" /> Clear
                </Button>
              )}
            </div>

            <div className="px-3 py-2 text-[11px] text-muted-foreground">
              Showing {visible.length} of {data.items.length} resources ·{' '}
              {visible.reduce((sum, item) => sum + (item.quantity ?? 0), 0)} units in view
            </div>

            {visible.length === 0 ? (
              <div className="px-4 py-12 text-center">
                <Package className="mx-auto mb-2 h-7 w-7 text-muted-foreground" />
                <p className="text-sm font-medium">{data.items.length?'No equipment matches these filters':'Give your equipment a place on the map.'}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Clear the filters, or record a new resource if this location has none on file.
                </p>
              </div>
            ) : (
              <ul className="divide-y divide-border">
                {visible.map((item) => {
                  const meta = STATUS_META[item.status] ?? STATUS_META.ok;
                  const Icon = TYPE_ICON[item.type] ?? Package;
                  const expiringSoon = item.expiryState === 'expiring';
                  const expired = item.expiryState === 'expired';
                  return (
                    <li key={item.id} className="flex flex-col gap-3 px-4 py-4 lg:flex-row lg:items-start">
                      <span
                        className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-lg"
                        style={{ background: `${meta.hex}18`, color: meta.hex }}
                      >
                        <Icon className="h-4 w-4" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-semibold">{item.label}</span>
                          <span
                            className={cn(
                              'inline-flex rounded-full border px-2 py-0.5 text-[11px] font-semibold',
                              meta.className,
                            )}
                            title={meta.description}
                          >
                            {meta.label}
                          </span>
                          <Badge variant="outline">{typeLabel(item.type)}</Badge>
                          {(expired || expiringSoon) && (
                            <Badge variant={expired ? 'destructive' : 'warning'}>
                              {expired ? 'Expiry passed' : 'Expires soon'}
                            </Badge>
                          )}
                        </div>
                        <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
                          <span className="inline-flex items-center gap-1">
                            <MapPin className="h-3 w-3" />
                            {item.buildingName ?? 'Building not set'}
                            {item.roomName ? ` · ${item.roomName}` : ''}
                            {item.locationNote ? ` · ${item.locationNote}` : ''}
                          </span>
                          <span className="inline-flex items-center gap-1">
                            <Package className="h-3 w-3" /> Qty {item.quantity ?? 0}
                          </span>
                          {item.expiresAt && (
                            <span className="inline-flex items-center gap-1">
                              <CalendarClock className="h-3 w-3" /> Expires {absoluteTime(item.expiresAt)}
                            </span>
                          )}
                          <span className="inline-flex items-center gap-1">
                            <RefreshCw className="h-3 w-3" />
                            {item.lastCheckedAt
                              ? `Checked ${relativeTime(item.lastCheckedAt)}`
                              : 'Never checked'}
                          </span>
                          {item.department && (
                            <span className="inline-flex items-center gap-1">
                              <Building2 className="h-3 w-3" /> {item.department}
                            </span>
                          )}
                        </div>
                        {item.notes && (
                          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{item.notes}</p>
                        )}
                      </div>
                      {canWrite && (
                        <div className="flex shrink-0 gap-1.5">
                          <Button variant="outline" size="sm" onClick={() => setCheckTarget(item)}>
                            <CheckCircle2 className="h-3.5 w-3.5" /> Check
                          </Button>
                          <Button variant="ghost" size="sm" onClick={() => openEdit(item)}>
                            Edit
                          </Button>
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>

          <p className="rounded-lg border border-border bg-muted/40 px-3 py-2 text-[11px] leading-relaxed text-muted-foreground">
            Marking a resource “checked” records the time and sets its status to ready. It does not certify the
            equipment — certification is issued by the responsible technician or department. Quantities are
            on-hand counts, not live telemetry.
          </p>
        </>
      ) : null}

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Add emergency resource</DialogTitle>
            <DialogDescription>
              Record equipment at a specific room or at building level. Quantity and expiry are shown on the
              resource board.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={create} className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="space-y-1.5 text-sm">
                <span className="font-medium">Type</span>
                <input
                  list="resource-types"
                  value={form.type}
                  onChange={(event) => setForm((f) => ({ ...f, type: event.target.value }))}
                  className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm"
                  placeholder="extinguisher"
                />
                <datalist id="resource-types">
                  {['aed', 'extinguisher', 'first_aid', 'eyewash', 'spill_kit', 'emergency_light', 'radio', 'water', ...(data?.types ?? [])]
                    .filter((value, index, list) => list.indexOf(value) === index)
                    .map((type) => (
                      <option key={type} value={type}>
                        {typeLabel(type)}
                      </option>
                    ))}
                </datalist>
              </label>
              <Input
                label="Label"
                value={form.label}
                onChange={(event) => setForm((f) => ({ ...f, label: event.target.value }))}
                placeholder="e.g. AED — Main Lobby"
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <label className="space-y-1.5 text-sm">
                <span className="font-medium">Status</span>
                <select
                  value={form.status}
                  onChange={(event) =>
                    setForm((f) => ({ ...f, status: event.target.value as ResourceStatus }))
                  }
                  className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm"
                >
                  {STATUS_ORDER.map((status) => (
                    <option key={status} value={status}>
                      {STATUS_META[status].label}
                    </option>
                  ))}
                </select>
              </label>
              <Input
                label="Quantity"
                type="number"
                min={0}
                value={form.quantity}
                onChange={(event) => setForm((f) => ({ ...f, quantity: event.target.value }))}
              />
              <Input
                label="Expires"
                type="date"
                value={form.expiresAt}
                onChange={(event) => setForm((f) => ({ ...f, expiresAt: event.target.value }))}
                helper="Optional"
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="space-y-1.5 text-sm">
                <span className="font-medium">Building</span>
                <select
                  value={form.buildingId}
                  onChange={(event) => setForm((f) => ({ ...f, buildingId: event.target.value, roomId: '' }))}
                  className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm"
                  disabled={!canBuildings}
                >
                  <option value="">Not specified</option>
                  {buildings.map((building) => (
                    <option key={building.id} value={building.id}>
                      {building.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="space-y-1.5 text-sm">
                <span className="font-medium">Room</span>
                <select
                  value={form.roomId}
                  onChange={(event) => setForm((f) => ({ ...f, roomId: event.target.value }))}
                  className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm"
                  disabled={!canBuildings}
                >
                  <option value="">Building-level only</option>
                  {roomsForBuilding.map((room) => (
                    <option key={room.id} value={room.id}>
                      {room.code} — {room.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Input
                label="Department"
                value={form.department}
                onChange={(event) => setForm((f) => ({ ...f, department: event.target.value }))}
                placeholder="Facilities, Health services…"
              />
              <Input
                label="Location note"
                value={form.locationNote}
                onChange={(event) => setForm((f) => ({ ...f, locationNote: event.target.value }))}
                placeholder="e.g. Wall cabinet beside reception"
              />
            </div>
            <Textarea
              label="Notes"
              value={form.notes}
              onChange={(event) => setForm((f) => ({ ...f, notes: event.target.value }))}
              rows={2}
            />
            {formError && (
              <p role="alert" className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-xs text-danger">
                {formError}
              </p>
            )}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setCreateOpen(false)} disabled={submitting}>
                Cancel
              </Button>
              <Button type="submit" loading={submitting}>
                <Plus className="h-4 w-4" /> Add resource
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(editTarget)} onOpenChange={(open) => !open && setEditTarget(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Update {editTarget?.label}</DialogTitle>
            <DialogDescription>
              Status, quantity and expiry changes apply immediately to the resource board and are audited.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <p className="mb-1.5 text-sm font-medium">Status</p>
              <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
                {STATUS_ORDER.map((status) => (
                  <button
                    key={status}
                    type="button"
                    onClick={() => setEditForm((form) => ({ ...form, status }))}
                    aria-pressed={editForm.status === status}
                    className={cn(
                      'rounded-lg border px-2 py-2 text-xs font-semibold transition-colors',
                      editForm.status === status
                        ? STATUS_META[status].className
                        : 'border-input text-muted-foreground hover:bg-accent',
                    )}
                  >
                    {STATUS_META[status].label}
                  </button>
                ))}
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Input
                label="Quantity on hand"
                type="number"
                min={0}
                value={editForm.quantity}
                onChange={(event) => setEditForm((form) => ({ ...form, quantity: event.target.value }))}
              />
              <Input
                label="Expires"
                type="date"
                value={editForm.expiresAt}
                onChange={(event) => setEditForm((form) => ({ ...form, expiresAt: event.target.value }))}
                helper="Leave empty for no expiry"
              />
            </div>
            <Input
              label="Location note"
              value={editForm.locationNote}
              onChange={(event) => setEditForm((form) => ({ ...form, locationNote: event.target.value }))}
            />
            <Textarea
              label="Notes"
              value={editForm.notes}
              onChange={(event) => setEditForm((form) => ({ ...form, notes: event.target.value }))}
              rows={3}
            />
            {editForm.status === 'missing' && (
              <p className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-[11px] leading-relaxed text-danger">
                Marking equipment missing should trigger a replacement request through your facilities process.
                RADAR records the state; it does not order replacements.
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditTarget(null)} disabled={savingEdit}>
              Cancel
            </Button>
            <Button onClick={() => void saveEdit()} loading={savingEdit}>
              Save changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={Boolean(checkTarget)}
        onOpenChange={(open) => !open && setCheckTarget(null)}
        title="Mark this resource as checked?"
        description={
          checkTarget
            ? `${checkTarget.label} will record the current time as its last check and its status will be set to ready. Only do this if you physically verified it.`
            : ''
        }
        confirmLabel="Mark checked"
        loading={checking}
        onConfirm={confirmCheck}
      />
    </div>
  );
}
