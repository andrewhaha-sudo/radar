'use client';
import {SchoolLocation} from '@/components/map/SchoolLocation';

import { CampusSetup } from '@/components/forms/CampusSetup';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Building2,
  CalendarClock,
  DoorOpen,
  Layers,
  Loader2,
  MapPinned,
  RefreshCw,
  ScanEye,
  Search,
  ShieldAlert,
  ShieldCheck,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { shortDate } from '@/components/ui/hazard-bits';
import { api, errorMessage } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { cn } from '@/components/ui/card';
import type { Building, Floor, Room } from '@/lib/types';

interface BuildingsPayload {
  buildings: Building[];
  floors: Floor[];
  rooms: Room[];
}

export function BuildingsPage() {
  const { can, school } = useAuth();
  const [locationOpen,setLocationOpen]=useState(false);
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const qParam = params.get('q') ?? '';
  const canRead = can('buildings:read');

  const [data, setData] = useState<BuildingsPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState(qParam);
  const [buildingFilter, setBuildingFilter] = useState('');
  const [floorFilter, setFloorFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');

  useEffect(() => {
    setQuery(qParam);
  }, [qParam]);

  const load = useCallback(async () => {
    if (!canRead) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const payload = await api.get<BuildingsPayload>('/api/buildings');
      setData(payload);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [canRead]);

  useEffect(() => {
    void load();
  }, [load]);

  const floors = useMemo(
    () =>
      (data?.floors ?? []).filter(
        (floor) => !buildingFilter || String(floor.buildingId) === buildingFilter,
      ),
    [data, buildingFilter],
  );

  const roomTypes = useMemo(
    () => Array.from(new Set((data?.rooms ?? []).map((room) => room.type))).sort(),
    [data],
  );

  const filteredRooms = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return (data?.rooms ?? []).filter((room) => {
      if (buildingFilter && String(room.buildingId) !== buildingFilter) return false;
      if (floorFilter && String(room.floorId) !== floorFilter) return false;
      if (typeFilter && room.type !== typeFilter) return false;
      if (!needle) return true;
      return [room.name, room.code, room.buildingName, room.type].some((value) =>
        String(value ?? '').toLowerCase().includes(needle),
      );
    });
  }, [data, query, buildingFilter, floorFilter, typeFilter]);

  const groupedRooms = useMemo(() => {
    const groups = new Map<
      string,
      { buildingName: string; floorLevel: number; floorName: string; rooms: Room[] }
    >();
    for (const room of filteredRooms) {
      const floor = (data?.floors ?? []).find((item) => item.id === room.floorId);
      const key = `${room.buildingId}-${room.floorId}`;
      const group =
        groups.get(key) ??
        ({
          buildingName: room.buildingName ?? 'Unassigned building',
          floorLevel: floor?.level ?? room.floorLevel ?? 0,
          floorName: floor?.name ?? 'Floor',
          rooms: [] as Room[],
        } satisfies {
          buildingName: string;
          floorLevel: number;
          floorName: string;
          rooms: Room[];
        });
      group.rooms.push(room);
      groups.set(key, group);
    }
    return Array.from(groups.entries())
      .map(([key, value]) => ({ key, ...value }))
      .sort((a, b) => a.buildingName.localeCompare(b.buildingName) || a.floorLevel - b.floorLevel);
  }, [filteredRooms, data]);

  const hasFilters = Boolean(query || buildingFilter || floorFilter || typeFilter);

  const resetFilters = () => {
    setQuery('');
    setBuildingFilter('');
    setFloorFilter('');
    setTypeFilter('');
  };

  const startScan = (roomId: number) => navigate(`/scan?roomId=${roomId}`);

  if (!canRead) {
    return (
      <div className="stack-page space-y-5">
        <div>
          <div className="flex items-center gap-2">
            <span className="grid h-9 w-9 place-items-center rounded-lg bg-accent text-accent-foreground">
              <Building2 className="h-5 w-5" />
            </span>
            <h1 className="text-2xl font-semibold tracking-tight">Buildings &amp; rooms</h1>
          </div>
        </div>
        <div className="mx-auto max-w-md rounded-xl border border-border bg-card p-6 text-center">
          <ShieldCheck className="mx-auto mb-2 h-8 w-8 text-muted-foreground" />
          <h2 className="text-lg font-semibold">Directory not available to your role</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Your account cannot browse the room directory. Use the campus map to find a building, or
            search for a room by name.
          </p>
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            <Button size="sm" variant="outline" onClick={() => navigate('/map')}>
              <MapPinned className="h-4 w-4" /> Campus map
            </Button>
            <Button size="sm" variant="outline" onClick={() => navigate('/search')}>
              <Search className="h-4 w-4" /> Search
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
              <Building2 className="h-5 w-5" />
            </span>
            <h1 className="text-2xl font-semibold tracking-tight">Buildings &amp; rooms</h1>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            The campus directory. Open a building on the map or start a scan directly in a room.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
            <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} /> Refresh
          </Button>
          <Button variant="outline" size="sm" onClick={() => navigate('/map')}>
            <MapPinned className="h-4 w-4" /> Campus map
          </Button>
        </div>
      </div>

      {can('admin:users') && <details className="location-disclosure" onToggle={event=>setLocationOpen(event.currentTarget.open)}><summary><span>School map location</span><small>{school?.locationVerified?'Recorded · edit location':'Add or review location'}</small></summary>{locationOpen&&<SchoolLocation/>}</details>}
      {can('admin:users') && <CampusSetup buildings={data?.buildings ?? []} floors={data?.floors ?? []} onSaved={load} />}

      {error ? (
        <div className="rounded-xl border border-danger/30 bg-danger/10 p-6 text-center">
          <ShieldAlert className="mx-auto mb-2 h-7 w-7 text-danger" />
          <p className="text-sm font-medium text-danger">Could not load the campus directory</p>
          <p className="mt-1 text-xs text-muted-foreground">{error}</p>
          <Button size="sm" className="mt-3" onClick={() => void load()}>
            Try again
          </Button>
        </div>
      ) : loading && !data ? (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <Skeleton key={index} className="h-40 w-full rounded-xl" />
          ))}
        </div>
      ) : data ? (
        <>
          {/* Buildings */}
          <section>
            <div className="mb-2 flex items-center justify-between gap-2">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Buildings · {data.buildings.length}
              </h2>
              <span className="text-[11px] text-muted-foreground">
                {data.rooms.length} rooms across {data.floors.length} floors
              </span>
            </div>
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              {data.buildings.map((building) => (
                <article
                  key={building.id}
                  className="flex flex-col rounded-xl border border-border bg-card p-4 transition-colors hover:border-accent-border"
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="grid h-9 w-9 place-items-center rounded-lg bg-accent font-mono text-[11px] font-bold text-accent-foreground">
                      {building.code}
                    </span>
                    {building.yearBuilt&&<Badge variant="outline" className="text-[10px]">Built {building.yearBuilt}</Badge>}
                  </div>
                  <h3 className="mt-2 text-sm font-semibold leading-tight">{building.name}</h3>
                  {building.description&&<p className="mt-1 line-clamp-2 text-[11px] text-muted-foreground">{building.description}</p>}
                  <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                    <span className="inline-flex items-center gap-1">
                      <Layers className="h-3 w-3" /> {building.floorCount} floors
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <DoorOpen className="h-3 w-3" /> {building.roomCount} rooms
                    </span>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setBuildingFilter(String(building.id));
                        setFloorFilter('');
                        setQuery('');
                        document.getElementById('room-directory')?.scrollIntoView({ behavior: 'smooth' });
                      }}
                    >
                      View rooms
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => navigate('/map')}>
                      <MapPinned className="h-3.5 w-3.5" /> Map
                    </Button>
                  </div>
                </article>
              ))}
            </div>
          </section>

          {/* Room directory */}
          <section id="room-directory" className="scroll-mt-20">
            <div className="rounded-xl border border-border bg-card">
              <div className="flex flex-col gap-2 border-b border-border p-3 lg:flex-row lg:items-end">
                <div className="relative min-w-0 flex-1">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="Search room number, name or building…"
                    aria-label="Search rooms"
                    className="h-10 pl-9 pr-9"
                  />
                  {query && (
                    <button
                      type="button"
                      onClick={() => setQuery('')}
                      className="absolute right-2 top-1/2 grid h-6 w-6 -translate-y-1/2 place-items-center rounded text-muted-foreground hover:bg-accent"
                      aria-label="Clear room search"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  <select
                    value={buildingFilter}
                    onChange={(event) => {
                      setBuildingFilter(event.target.value);
                      setFloorFilter('');
                    }}
                    aria-label="Filter by building"
                    className="h-10 rounded-lg border border-input bg-background px-2 text-xs"
                  >
                    <option value="">All buildings</option>
                    {data.buildings.map((building) => (
                      <option key={building.id} value={building.id}>
                        {building.name}
                      </option>
                    ))}
                  </select>

                  <select
                    value={floorFilter}
                    onChange={(event) => setFloorFilter(event.target.value)}
                    aria-label="Filter by floor"
                    disabled={!buildingFilter}
                    className="h-10 rounded-lg border border-input bg-background px-2 text-xs disabled:opacity-50"
                  >
                    <option value="">All floors</option>
                    {floors.map((floor) => (
                      <option key={floor.id} value={floor.id}>
                        L{floor.level} · {floor.name}
                      </option>
                    ))}
                  </select>

                  <select
                    value={typeFilter}
                    onChange={(event) => setTypeFilter(event.target.value)}
                    aria-label="Filter by room type"
                    className="h-10 rounded-lg border border-input bg-background px-2 text-xs capitalize"
                  >
                    <option value="">All types</option>
                    {roomTypes.map((type) => (
                      <option key={type} value={type}>
                        {type.replace(/_/g, ' ')}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex items-center gap-2">
                  <span className="whitespace-nowrap text-[11px] text-muted-foreground">
                    {filteredRooms.length} rooms
                  </span>
                  {hasFilters && (
                    <Button variant="ghost" size="sm" onClick={resetFilters}>
                      Clear
                    </Button>
                  )}
                </div>
              </div>

              {filteredRooms.length === 0 ? (
                <div className="px-4 py-12 text-center">
                  <DoorOpen className="mx-auto mb-2 h-7 w-7 text-muted-foreground" />
                  <p className="text-sm font-medium">No rooms match these filters</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Try a different building, floor or room type.
                  </p>
                  <Button variant="outline" size="sm" className="mt-3" onClick={resetFilters}>
                    Clear filters
                  </Button>
                </div>
              ) : (
                <div className="divide-y divide-border">
                  {groupedRooms.map((group) => (
                    <div key={group.key}>
                      <div className="flex items-center gap-2 bg-muted/40 px-4 py-1.5">
                        <Building2 className="h-3 w-3 text-muted-foreground" />
                        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                          {group.buildingName} · L{group.floorLevel} · {group.floorName}
                        </p>
                        <span className="ml-auto font-mono text-[10px] text-muted-foreground">
                          {group.rooms.length}
                        </span>
                      </div>
                      <ul className="divide-y divide-border/60">
                        {group.rooms.map((room) => (
                          <li
                            key={room.id}
                            className="flex flex-wrap items-center gap-2 px-4 py-2.5 transition-colors hover:bg-accent/40"
                          >
                            <span className="w-16 shrink-0 font-mono text-[11px] text-muted-foreground">
                              {room.code}
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-sm font-medium">{room.name}</span>
                              <span className="block text-[11px] capitalize text-muted-foreground">
                                {room.type.replace(/_/g, ' ')} · {room.capacity} capacity · last inspected{' '}
                                {room.lastInspectedAt ? shortDate(room.lastInspectedAt) : 'never'}
                              </span>
                            </span>
                            <Badge
                              variant={room.status === 'operational' ? 'success' : 'warning'}
                              className="shrink-0 text-[10px] capitalize"
                            >
                              {room.status.replace(/_/g, ' ')}
                            </Badge>
                            {can('scan:write') && (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => startScan(room.id)}
                                title={`Start a scan in ${room.name}`}
                              >
                                <ScanEye className="h-3.5 w-3.5" /> Scan
                              </Button>
                            )}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              )}

              <div className="flex items-center justify-between gap-2 border-t border-border bg-muted/30 px-4 py-2 text-[11px] text-muted-foreground">
                <span className="inline-flex items-center gap-1">
                  <CalendarClock className="h-3 w-3" /> Directory reflects the current database.
                </span>
                <button onClick={() => navigate('/map')} className="font-medium text-accent-foreground hover:underline">
                  Open the campus map →
                </button>
              </div>
            </div>
          </section>
        </>
      ) : (
        <div className="grid place-items-center py-16 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      )}
    </div>
  );
}
