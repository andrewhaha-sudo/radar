'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
  Filter,
  LayoutList,
  Loader2,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input, Textarea } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  SEVERITY_META,
  StatusBadge,
  relativeTime,
  shortDate,
} from '@/components/ui/hazard-bits';
import { HazardDetailDrawer } from '@/components/hazards/HazardDetailDrawer';
import { api, errorMessage } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { cn } from '@/components/ui/card';
import type {
  Building,
  Floor,
  Hazard,
  HazardStatus,
  Room,
  Severity,
} from '@/lib/types';

const SEVERITIES: Severity[] = ['critical', 'high', 'medium', 'low', 'info'];
const STATUSES: HazardStatus[] = ['new', 'pending_review', 'verified', 'in_progress', 'resolved'];

const SORT_OPTIONS = [
  { value: 'updated_at', label: 'Last updated' },
  { value: 'created_at', label: 'Date reported' },
  { value: 'severity', label: 'Severity' },
  { value: 'status', label: 'Status' },
  { value: 'ref', label: 'Reference' },
] as const;

interface HazardListResponse {
  items: Hazard[];
  total: number;
  page: number;
  pageSize: number;
  faceted: {
    status: Record<string, number>;
    severity: Record<string, number>;
  };
}

interface BuildingsResponse {
  buildings: Building[];
  floors: Floor[];
  rooms: Room[];
}

export function HazardsPage() {
  const { can, user } = useAuth();
  const canRead = can('hazards:read');
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();

  const q = params.get('q') ?? '';
  const statusFilter = (params.get('status') ?? '').split(',').filter(Boolean) as HazardStatus[];
  const severityFilter = (params.get('severity') ?? '').split(',').filter(Boolean) as Severity[];
  const buildingId = params.get('buildingId') ?? '';
  const assigned = params.get('assigned') ?? '';
  const sort = params.get('sort') ?? 'updated_at';
  const dir = params.get('dir') ?? 'desc';
  const page = Math.max(1, Number(params.get('page') ?? 1));
  const pageSize = Number(params.get('pageSize') ?? 10);
  const openId = params.get('open');

  const [searchInput, setSearchInput] = useState(q);
  const [data, setData] = useState<HazardListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [buildings, setBuildings] = useState<Building[]>([]);
  const [reportOpen, setReportOpen] = useState(false);

  const updateParams = useCallback(
    (patch: Record<string, string | null>, resetPage = true) => {
      const next = new URLSearchParams(params);
      for (const [key, value] of Object.entries(patch)) {
        if (value === null || value === '') next.delete(key);
        else next.set(key, value);
      }
      if (resetPage && !('page' in patch)) next.delete('page');
      setParams(next, { replace: true });
    },
    [params, setParams],
  );

  // Debounce the free-text search into the URL.
  useEffect(() => {
    if (searchInput === q) return;
    const timer = window.setTimeout(() => updateParams({ q: searchInput || null }), 320);
    return () => window.clearTimeout(timer);
  }, [searchInput, q, updateParams]);

  useEffect(() => {
    if (q !== searchInput) setSearchInput(q);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  const queryString = useMemo(() => {
    const search = new URLSearchParams();
    if (q) search.set('q', q);
    if (statusFilter.length) search.set('status', statusFilter.join(','));
    if (severityFilter.length) search.set('severity', severityFilter.join(','));
    if (buildingId) search.set('buildingId', buildingId);
    if (assigned) search.set('assigned', assigned);
    search.set('sort', sort);
    search.set('dir', dir);
    search.set('page', String(page));
    search.set('pageSize', String(pageSize));
    return search.toString();
  }, [q, statusFilter, severityFilter, buildingId, assigned, sort, dir, page, pageSize]);

  const load = useCallback(async () => {
    if (!canRead) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const payload = await api.get<HazardListResponse>(`/api/hazards?${queryString}`);
      setData(payload);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [queryString, canRead]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!can('hazards:write') || !canRead) return;
    api
      .get<BuildingsResponse>('/api/buildings')
      .then((payload) => setBuildings(payload.buildings))
      .catch(() => setBuildings([]));
  }, [can, canRead]);

  const toggleArrayParam = (key: 'status' | 'severity', value: string, current: string[]) => {
    const next = current.includes(value)
      ? current.filter((item) => item !== value)
      : [...current, value];
    updateParams({ [key]: next.length ? next.join(',') : null });
  };

  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;
  const activeFilterCount =
    statusFilter.length + severityFilter.length + (buildingId ? 1 : 0) + (assigned ? 1 : 0);
  const hasFilters = activeFilterCount > 0 || Boolean(q);

  const resetFilters = () => {
    setSearchInput('');
    const next = new URLSearchParams(params);
    for (const key of ['q', 'status', 'severity', 'buildingId', 'assigned', 'page']) next.delete(key);
    setParams(next, { replace: true });
  };

  if (!canRead) {
    return (
      <div className="stack-page space-y-5">
        <div className="flex items-center gap-2">
          <span className="grid h-9 w-9 place-items-center rounded-lg bg-accent text-accent-foreground">
            <AlertTriangle className="h-5 w-5" />
          </span>
          <h1 className="text-2xl font-semibold tracking-tight">Hazards</h1>
        </div>
        <div className="mx-auto max-w-md rounded-xl border border-border bg-card p-6 text-center">
          <ShieldCheck className="mx-auto mb-2 h-8 w-8 text-muted-foreground" />
          <h2 className="text-lg font-semibold">Hazard workspace not available to your role</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Your account cannot view the hazard register. Use the campus map for safety information
            or contact a staff member if you need to report something.
          </p>
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            <Button size="sm" variant="outline" onClick={() => navigate('/map')}>
              Campus map
            </Button>
            <Button size="sm" variant="outline" onClick={() => navigate('/search')}>
              Search
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="stack-page space-y-5">
      {/* Heading */}
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
        <div>
          <div className="flex items-center gap-2">
            <span className="grid h-9 w-9 place-items-center rounded-lg bg-accent text-accent-foreground">
              <AlertTriangle className="h-5 w-5" />
            </span>
            <h1 className="text-2xl font-semibold tracking-tight">Hazards</h1>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Every recorded hazard, its evidence and the corrective work that closes it out.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
            <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} />
            Refresh
          </Button>
          {can('hazards:write') && (
            <Button size="sm" onClick={() => setReportOpen(true)}>
              <Plus className="h-4 w-4" />
              Report hazard
            </Button>
          )}
        </div>
      </div>

      {/* Summary strip */}
      <div className="grid grid-cols-2 gap-2 md:grid-cols-5">
        {SEVERITIES.map((severity) => {
          const meta = SEVERITY_META[severity];
          const count = data?.faceted.severity[severity] ?? 0;
          const active = severityFilter.includes(severity);
          return (
            <button
              key={severity}
              type="button"
              aria-pressed={active}
              onClick={() => toggleArrayParam('severity', severity, severityFilter)}
              className={cn(
                'flex items-center justify-between gap-2 rounded-xl border px-3 py-2 text-left transition-colors',
                active ? 'border-current' : 'border-border bg-card hover:bg-accent/60',
              )}
              style={active ? { borderColor: `${meta.hex}80`, background: `${meta.hex}14` } : undefined}
            >
              <span className="flex items-center gap-2">
                <span
                  className="grid h-6 w-6 place-items-center rounded-full text-[11px] font-bold text-white"
                  style={{ background: meta.hex }}
                  aria-hidden="true"
                >
                  {meta.symbol}
                </span>
                <span className="text-xs font-medium" style={{ color: active ? meta.hex : undefined }}>
                  {meta.label}
                </span>
              </span>
              <span className="font-mono text-sm font-semibold tabular-nums">{count}</span>
            </button>
          );
        })}
      </div>

      {/* Toolbar */}
      <div className="rounded-xl border border-border bg-card p-3">
        <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
              placeholder="Search reference, title, room or building…"
              aria-label="Search hazards"
              className="h-10 pl-9 pr-9"
            />
            {searchInput && (
              <button
                type="button"
                onClick={() => setSearchInput('')}
                className="absolute right-2 top-1/2 grid h-6 w-6 -translate-y-1/2 place-items-center rounded text-muted-foreground hover:bg-accent"
                aria-label="Clear search"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant={filtersOpen ? 'primary' : 'outline'}
              size="sm"
              onClick={() => setFiltersOpen((value) => !value)}
              aria-expanded={filtersOpen}
            >
              <Filter className="h-4 w-4" />
              Filters
              {activeFilterCount > 0 && (
                <span className="ml-1 rounded-full bg-primary-foreground/20 px-1.5 text-[10px] font-bold">
                  {activeFilterCount}
                </span>
              )}
            </Button>

            <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <ArrowUpDown className="h-3.5 w-3.5" />
              <span className="sr-only">Sort hazards</span>
              <select
                value={`${sort}:${dir}`}
                onChange={(event) => {
                  const [nextSort, nextDir] = event.target.value.split(':');
                  updateParams({ sort: nextSort, dir: nextDir });
                }}
                className="h-9 rounded-lg border border-input bg-background px-2 text-xs text-foreground"
              >
                {SORT_OPTIONS.flatMap((option) => [
                  <option key={`${option.value}:desc`} value={`${option.value}:desc`}>
                    {option.label} ↓
                  </option>,
                  <option key={`${option.value}:asc`} value={`${option.value}:asc`}>
                    {option.label} ↑
                  </option>,
                ])}
              </select>
            </label>

            <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <LayoutList className="h-3.5 w-3.5" />
              <span className="sr-only">Rows per page</span>
              <select
                value={pageSize}
                onChange={(event) => updateParams({ pageSize: event.target.value, page: '1' })}
                className="h-9 rounded-lg border border-input bg-background px-2 text-xs text-foreground"
              >
                {[10, 20, 50].map((size) => (
                  <option key={size} value={size}>
                    {size} per page
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>

        {filtersOpen && (
          <div className="mt-3 space-y-3 border-t border-border pt-3 animate-in">
            <div className="space-y-1.5">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Status
              </p>
              <div className="flex flex-wrap gap-1.5">
                {STATUSES.map((status) => {
                  const active = statusFilter.includes(status);
                  const count = data?.faceted.status[status] ?? 0;
                  return (
                    <button
                      key={status}
                      type="button"
                      aria-pressed={active}
                      onClick={() => toggleArrayParam('status', status, statusFilter)}
                      className={cn(
                        'rounded-full border px-2.5 py-1 text-[11px] font-medium capitalize transition-colors',
                        active
                          ? 'border-accent-foreground bg-accent text-accent-foreground'
                          : 'border-border text-muted-foreground hover:bg-muted',
                      )}
                    >
                      {status.replace(/_/g, ' ')} ({count})
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="space-y-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                <span className="flex items-center gap-1">
                  <SlidersHorizontal className="h-3 w-3" /> Building
                </span>
                <select
                  value={buildingId}
                  onChange={(event) => updateParams({ buildingId: event.target.value || null })}
                  className="h-9 w-full rounded-lg border border-input bg-background px-2 text-xs font-normal text-foreground"
                >
                  <option value="">All buildings</option>
                  {buildings.map((building) => (
                    <option key={building.id} value={building.id}>
                      {building.name}
                    </option>
                  ))}
                </select>
              </label>

              <label className="space-y-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                <span className="flex items-center gap-1">
                  <ShieldCheck className="h-3 w-3" /> Assignment
                </span>
                <select
                  value={assigned}
                  onChange={(event) => updateParams({ assigned: event.target.value || null })}
                  className="h-9 w-full rounded-lg border border-input bg-background px-2 text-xs font-normal text-foreground"
                >
                  <option value="">Anyone</option>
                  <option value="me">Assigned to me</option>
                  <option value="unassigned">Unassigned</option>
                </select>
              </label>
            </div>

            <div className="flex items-center justify-between gap-2">
              <p className="text-[11px] text-muted-foreground">
                Filters combine on the server. Counts reflect the current search and filters.
              </p>
              <Button variant="ghost" size="sm" onClick={resetFilters} disabled={!hasFilters}>
                Clear all
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Results */}
      {error ? (
        <div className="rounded-xl border border-danger/30 bg-danger/10 p-6 text-center">
          <AlertTriangle className="mx-auto mb-2 h-7 w-7 text-danger" />
          <p className="text-sm font-medium text-danger">Could not load hazards</p>
          <p className="mt-1 text-xs text-muted-foreground">{error}</p>
          <Button size="sm" className="mt-3" onClick={() => void load()}>
            Try again
          </Button>
        </div>
      ) : loading && !data ? (
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, index) => (
            <Skeleton key={index} className="h-16 w-full rounded-xl" />
          ))}
        </div>
      ) : !data || data.items.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-card px-6 py-14 text-center">
          <AlertTriangle className="mx-auto mb-2 h-8 w-8 text-muted-foreground" />
          <p className="text-sm font-medium">No hazards match these filters</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Adjust the search or clear the filters. Reported hazards appear here immediately.
          </p>
          {hasFilters && (
            <Button variant="outline" size="sm" className="mt-3" onClick={resetFilters}>
              Clear filters
            </Button>
          )}
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-border bg-card">
          {/* Table header (desktop) */}
          <div className="hidden grid-cols-[minmax(0,2.4fr)_minmax(0,1.4fr)_120px_140px_150px] gap-3 border-b border-border bg-muted/40 px-4 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground lg:grid">
            <span>Hazard</span>
            <span>Location</span>
            <span>Status</span>
            <span>Assigned to</span>
            <span className="text-right">Updated</span>
          </div>

          <ul className="divide-y divide-border">
            {data.items.map((hazard) => (
              <li key={hazard.id}>
                <button
                  type="button"
                  onClick={() => updateParams({ open: String(hazard.id) }, false)}
                  className="grid w-full gap-2 px-4 py-3 text-left transition-colors hover:bg-accent/50 focus-visible:bg-accent/50 lg:grid-cols-[minmax(0,2.4fr)_minmax(0,1.4fr)_120px_140px_150px] lg:items-center lg:gap-3"
                >
                  <span className="flex min-w-0 items-start gap-2.5">
                    <span
                      className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-lg text-[12px] font-bold text-white"
                      style={{ background: SEVERITY_META[hazard.severity].hex }}
                      aria-hidden="true"
                    >
                      {SEVERITY_META[hazard.severity].symbol}
                    </span>
                    <span className="min-w-0">
                      <span className="flex flex-wrap items-center gap-1.5">
                        <span className="truncate text-sm font-medium text-foreground">{hazard.title}</span>
                        {hazard.source === 'ai_assisted' && (
                          <Badge variant="outline" className="text-[9px]">
                            AI-assisted
                          </Badge>
                        )}
                      </span>
                      <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-muted-foreground">
                        <span className="font-mono">{hazard.ref}</span>
                        <span aria-hidden="true">·</span>
                        <span className="capitalize">{SEVERITY_META[hazard.severity].label}</span>
                        <span aria-hidden="true">·</span>
                        <span>reported {relativeTime(hazard.createdAt)}</span>
                      </span>
                    </span>
                  </span>

                  <span className="min-w-0 pl-9 lg:pl-0">
                    <span className="block truncate text-xs text-foreground">{hazard.location}</span>
                    <span className="block text-[11px] text-muted-foreground">
                      {hazard.buildingName ?? 'Building not linked'}
                    </span>
                  </span>

                  <span className="flex items-center gap-1.5 pl-9 lg:pl-0">
                    <StatusBadge status={hazard.status} />
                  </span>

                  <span className="truncate pl-9 text-xs text-muted-foreground lg:pl-0">
                    {hazard.assignee ?? 'Unassigned'}
                  </span>

                  <span className="flex items-center justify-between gap-2 pl-9 text-[11px] text-muted-foreground lg:justify-end lg:pl-0">
                    <span className="inline-flex items-center gap-1 lg:hidden">
                      <span>{hazard.evidenceCount} evidence</span>
                      <span aria-hidden="true">·</span>
                      <span>{hazard.actionCount} actions</span>
                    </span>
                    <span className="text-right">
                      <span className="block">{relativeTime(hazard.updatedAt)}</span>
                      <span className="block text-[10px]">{shortDate(hazard.updatedAt)}</span>
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>

          {/* Pagination */}
          <div className="flex flex-col items-center justify-between gap-2 border-t border-border bg-muted/30 px-4 py-2.5 sm:flex-row">
            <p className="text-[11px] text-muted-foreground">
              Showing <span className="font-medium text-foreground">{(data.page - 1) * data.pageSize + 1}</span>–
              <span className="font-medium text-foreground">
                {Math.min(data.page * data.pageSize, data.total)}
              </span>{' '}
              of <span className="font-medium text-foreground">{data.total}</span>
              {loading && <Loader2 className="ml-2 inline h-3 w-3 animate-spin" />}
            </p>
            <div className="flex items-center gap-1">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1 || loading}
                onClick={() => updateParams({ page: String(page - 1) }, false)}
              >
                <ChevronLeft className="h-3.5 w-3.5" /> Previous
              </Button>
              <span className="px-2 font-mono text-[11px] text-muted-foreground">
                {data.page} / {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= totalPages || loading}
                onClick={() => updateParams({ page: String(page + 1) }, false)}
              >
                Next <ChevronRight className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        </div>
      )}

      <HazardDetailDrawer
        hazardId={openId ? Number(openId) : null}
        onClose={() => updateParams({ open: null }, false)}
        onChanged={() => void load()}
      />

      <ReportHazardDialog
        open={reportOpen}
        onOpenChange={setReportOpen}
        buildings={buildings}
        currentUserId={user?.id ?? null}
        onCreated={(hazard) => {
          setReportOpen(false);
          void load();
          updateParams({ open: String(hazard.id) }, false);
        }}
      />
    </div>
  );
}

function ReportHazardDialog({
  open,
  onOpenChange,
  buildings,
  currentUserId,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  buildings: Building[];
  currentUserId: number | null;
  onCreated: (hazard: Hazard) => void;
}) {
  const [directory, setDirectory] = useState<Array<{ id: number; name: string; role: string }>>([]);
  const [structure, setStructure] = useState<BuildingsResponse | null>(null);
  const [buildingId, setBuildingId] = useState('');
  const [floorId, setFloorId] = useState('');
  const [roomId, setRoomId] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [locationNote, setLocationNote] = useState('');
  const [severity, setSeverity] = useState<Severity>('medium');
  const [assignedTo, setAssignedTo] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    api
      .get<Array<{ id: number; name: string; role: string }> | { users: Array<{ id: number; name: string; role: string }> }>(
        '/api/directory',
      )
      .then((payload) => setDirectory(Array.isArray(payload) ? payload : payload.users))
      .catch(() => setDirectory([]));
    if (!structure) {
      api
        .get<BuildingsResponse>('/api/buildings')
        .then((payload) => setStructure(payload))
        .catch(() => setStructure(null));
    }
  }, [open, structure]);

  const floors = useMemo(
    () => (structure?.floors ?? []).filter((floor) => String(floor.buildingId) === buildingId),
    [structure, buildingId],
  );
  const rooms = useMemo(
    () => (structure?.rooms ?? []).filter((room) => String(room.floorId) === floorId),
    [structure, floorId],
  );

  const reset = () => {
    setBuildingId('');
    setFloorId('');
    setRoomId('');
    setTitle('');
    setDescription('');
    setLocationNote('');
    setSeverity('medium');
    setAssignedTo('');
    setError(null);
  };

  const submit = async () => {
    if (!title.trim()) {
      setError('Give the hazard a short title.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const payload = await api.post<{ hazard: Hazard }>('/api/hazards', {
        title: title.trim(),
        description: description.trim(),
        severity,
        roomId: roomId ? Number(roomId) : null,
        locationNote: locationNote.trim(),
        assignedTo: assignedTo ? Number(assignedTo) : null,
      });
      reset();
      onCreated(payload.hazard);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) reset();
        onOpenChange(next);
      }}
    >
      <DialogContent className="max-w-2xl" aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-danger" /> Report a hazard
          </DialogTitle>
          <DialogDescription>
            Reports are saved as <span className="font-medium text-foreground">new</span> and require
            verification before they are treated as confirmed. Be specific about what you observed.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <Input
            label="Title"
            required
            maxLength={140}
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="e.g. Loose handrail on the east stairwell"
          />

          <div className="space-y-1.5">
            <p className="text-sm font-medium">Severity</p>
            <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-5">
              {SEVERITIES.map((option) => {
                const meta = SEVERITY_META[option];
                const active = severity === option;
                return (
                  <button
                    key={option}
                    type="button"
                    aria-pressed={active}
                    onClick={() => setSeverity(option)}
                    className={cn(
                      'flex items-center justify-center gap-1.5 rounded-lg border px-2 py-1.5 text-xs font-medium transition-colors',
                      active ? 'text-white' : 'border-border text-muted-foreground hover:bg-muted',
                    )}
                    style={
                      active
                        ? { background: meta.hex, borderColor: meta.hex, color: '#fff' }
                        : undefined
                    }
                  >
                    <span aria-hidden="true">{meta.symbol}</span>
                    {meta.label}
                  </button>
                );
              })}
            </div>
            <p className="text-[11px] text-muted-foreground">
              {SEVERITY_META[severity].description}
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <label className="space-y-1.5 text-sm font-medium">
              Building
              <select
                value={buildingId}
                onChange={(event) => {
                  setBuildingId(event.target.value);
                  setFloorId('');
                  setRoomId('');
                }}
                className="h-10 w-full rounded-lg border border-input bg-background px-2 text-sm font-normal"
              >
                <option value="">Not specified</option>
                {buildings.map((building) => (
                  <option key={building.id} value={building.id}>
                    {building.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="space-y-1.5 text-sm font-medium">
              Floor
              <select
                value={floorId}
                onChange={(event) => {
                  setFloorId(event.target.value);
                  setRoomId('');
                }}
                disabled={!buildingId}
                className="h-10 w-full rounded-lg border border-input bg-background px-2 text-sm font-normal disabled:opacity-50"
              >
                <option value="">Not specified</option>
                {floors.map((floor) => (
                  <option key={floor.id} value={floor.id}>
                    L{floor.level} · {floor.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="space-y-1.5 text-sm font-medium">
              Room
              <select
                value={roomId}
                onChange={(event) => setRoomId(event.target.value)}
                disabled={!floorId}
                className="h-10 w-full rounded-lg border border-input bg-background px-2 text-sm font-normal disabled:opacity-50"
              >
                <option value="">Not specified</option>
                {rooms.map((room) => (
                  <option key={room.id} value={room.id}>
                    {room.code} — {room.name}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <Input
            label="Precise location note"
            value={locationNote}
            maxLength={200}
            onChange={(event) => setLocationNote(event.target.value)}
            placeholder="e.g. Bench 4, under the fume hood"
            helper="Optional. Adds detail beyond the room selection."
          />

          <Textarea
            label="What did you observe?"
            value={description}
            maxLength={4000}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="Describe the condition, how long it has been present, and any immediate control you applied."
            helper={`${description.length}/4000 characters`}
          />

          <label className="block space-y-1.5 text-sm font-medium">
            Assign to
            <select
              value={assignedTo}
              onChange={(event) => setAssignedTo(event.target.value)}
              className="h-10 w-full rounded-lg border border-input bg-background px-2 text-sm font-normal"
            >
              <option value="">Leave unassigned</option>
              {directory.map((member) => (
                <option key={member.id} value={member.id}>
                  {member.name} · {member.role}
                  {member.id === currentUserId ? ' (you)' : ''}
                </option>
              ))}
            </select>
          </label>

          {error && (
            <p role="alert" className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-xs text-danger">
              {error}
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={() => void submit()} loading={submitting} disabled={!title.trim()}>
            Submit report
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
