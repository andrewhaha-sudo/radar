'use client';

import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Building2,
  CalendarClock,
  DoorOpen,
  Layers,
  Loader2,
  MapPin,
  Ruler,
  ScanEye,
  ShieldAlert,
  Wrench,
} from 'lucide-react';
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerBody,
  DrawerTitle,
  DrawerDescription,
} from '@/components/ui/drawer';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { FloorPlan } from '@/components/map/FloorPlan';
import { SeverityBadge, StatusBadge, relativeTime, shortDate } from '@/components/ui/hazard-bits';
import { api, errorMessage } from '@/lib/api';
import { cn } from '@/components/ui/card';
import type {
  Building,
  Equipment,
  Floor,
  Hazard,
  Room,
  RoomContext,
} from '@/lib/types';

interface FloorPayload {
  floor: Floor;
  building: Building;
  rooms: Room[];
  equipment: Equipment[];
  hazards: Array<Hazard & { roomName: string }>;
}

interface RoomPayload {
  room: Room;
  context: RoomContext;
  equipment: Equipment[];
  hazards: Hazard[];
  scans: Array<{ id: number; status: string; startedAt: string; inspectorName: string | null }>;
}

export function BuildingDrawer({
  buildingId,
  onClose,
  canScan,
  initialRoomId,
}: {
  buildingId: number | null;
  onClose: () => void;
  canScan: boolean;
  initialRoomId?: number | null;
}) {
  const navigate = useNavigate();
  const [building, setBuilding] = useState<Building | null>(null);
  const [floors, setFloors] = useState<Floor[]>([]);
  const [selectedFloorId, setSelectedFloorId] = useState<number | null>(null);
  const [floorData, setFloorData] = useState<FloorPayload | null>(null);
  const [loadingBuilding, setLoadingBuilding] = useState(false);
  const [loadingFloor, setLoadingFloor] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [selectedRoomId, setSelectedRoomId] = useState<number | null>(null);
  const [roomData, setRoomData] = useState<RoomPayload | null>(null);
  const [loadingRoom, setLoadingRoom] = useState(false);

  useEffect(() => {
    if (!buildingId) {
      setBuilding(null);
      setFloors([]);
      setSelectedFloorId(null);
      setFloorData(null);
      setSelectedRoomId(null);
      setRoomData(null);
      return;
    }
    let cancelled = false;
    setLoadingBuilding(true);
    setError(null);
    setSelectedRoomId(null);
    setRoomData(null);

    api
      .get<{ building: Building; floors: Floor[] }>(`/api/buildings/${buildingId}`)
      .then(async (data) => {
        if (cancelled) return;
        setBuilding(data.building);
        setFloors(data.floors);
        let floorId=data.floors[0]?.id??null;
        setFloorData(null);
        if(initialRoomId){const target=await api.get<RoomPayload>(`/api/rooms/${initialRoomId}`);if(cancelled)return;if(target.context.buildingId!==buildingId)throw new Error('The selected room does not belong to this building.');floorId=target.room.floorId;setSelectedRoomId(target.room.id);setRoomData(target);}
        setSelectedFloorId(floorId);
      })
      .catch((err) => {
        if (!cancelled) setError(errorMessage(err));
      })
      .finally(() => {
        if (!cancelled) setLoadingBuilding(false);
      });

    return () => {
      cancelled = true;
    };
  }, [buildingId,initialRoomId]);

  useEffect(() => {
    if (!selectedFloorId) {
      setFloorData(null);
      return;
    }
    let cancelled = false;
    setLoadingFloor(true);
    api
      .get<FloorPayload>(`/api/floors/${selectedFloorId}`)
      .then((data) => {
        if (!cancelled) setFloorData(data);
      })
      .catch((err) => {
        if (!cancelled) setError(errorMessage(err));
      })
      .finally(() => {
        if (!cancelled) setLoadingFloor(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedFloorId]);

  const loadRoom = useCallback(async (roomId: number) => {
    setSelectedRoomId(roomId);
    setLoadingRoom(true);
    try {
      const data = await api.get<RoomPayload>(`/api/rooms/${roomId}`);
      setRoomData(data);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoadingRoom(false);
    }
  }, []);

  const openHazards = floorData?.hazards ?? [];
  const equipmentIssues = (floorData?.equipment ?? []).filter((e) => e.status !== 'ok');

  const title = building?.name ?? 'Building';
  const subtitle = building
    ? `${building.code} · ${building.address || 'Campus'}`
    : 'Loading building record…';

  return (
    <Drawer open={buildingId !== null} onOpenChange={(open) => (!open ? onClose() : null)}>
      <DrawerContent side="right" size="xl" aria-describedby={undefined}>
        <DrawerHeader>
          <div className="flex items-start gap-3">
            <span className="mt-0.5 grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-accent text-accent-foreground">
              <Building2 className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <DrawerTitle>{title}</DrawerTitle>
              <DrawerDescription>{subtitle}</DrawerDescription>
            </div>
          </div>
        </DrawerHeader>

        <DrawerBody className="space-y-5">
          {error && (
            <div className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
              {error}
              <Button variant="link" size="sm" onClick={onClose}>
                Close
              </Button>
            </div>
          )}

          {loadingBuilding ? (
            <div className="space-y-3">
              <Skeleton className="h-20 w-full" />
              <Skeleton className="h-10 w-2/3" />
              <Skeleton className="h-72 w-full" />
            </div>
          ) : building ? (
            <>
              {/* Summary */}
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {[
                  { label: 'Rooms', value: building.roomCount, icon: DoorOpen },
                  { label: 'Floors', value: building.floorCount, icon: Layers },
                  { label: 'Open hazards', value: openHazards.length, icon: ShieldAlert },
                  { label: 'Equipment issues', value: equipmentIssues.length, icon: Wrench },
                ].map((stat) => {
                  const Icon = stat.icon;
                  return (
                    <div key={stat.label} className="rounded-lg border border-border bg-muted/40 p-3">
                      <Icon className="mb-1 h-4 w-4 text-muted-foreground" />
                      <p className="text-xl font-semibold leading-none">{stat.value}</p>
                      <p className="mt-1 text-[11px] text-muted-foreground">{stat.label}</p>
                    </div>
                  );
                })}
              </div>

              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                <span className="inline-flex items-center gap-1">
                  <MapPin className="h-3.5 w-3.5" /> {building.address || 'Campus address not recorded'}
                </span>
                {building.yearBuilt && (
                  <span className="inline-flex items-center gap-1">
                    <CalendarClock className="h-3.5 w-3.5" /> Built {building.yearBuilt}
                  </span>
                )}
              </div>

              {building.description && (
                <p className="text-sm text-muted-foreground">{building.description}</p>
              )}

              {roomData && selectedRoomId ? (
                <RoomPanel
                  data={roomData}
                  loading={loadingRoom}
                  onBack={() => {
                    setSelectedRoomId(null);
                    setRoomData(null);
                  }}
                  canScan={canScan}
                  onScan={() => {
                    onClose();
                    navigate(`/scan?roomId=${selectedRoomId}`);
                  }}
                  onHazard={(id) => {
                    onClose();
                    navigate(`/hazards?open=${id}`);
                  }}
                />
              ) : (
                <>
                  {/* Floor selector */}
                  <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Floors">
                    {floors.map((f) => (
                      <button
                        key={f.id}
                        role="tab"
                        aria-selected={selectedFloorId === f.id}
                        onClick={() => setSelectedFloorId(f.id)}
                        className={cn(
                          'rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors',
                          selectedFloorId === f.id
                            ? 'border-accent-foreground bg-accent text-accent-foreground'
                            : 'border-border text-muted-foreground hover:bg-muted',
                        )}
                      >
                        L{f.level} · {f.name}
                      </button>
                    ))}
                  </div>

                  {loadingFloor || !floorData ? (
                    <Skeleton className="h-72 w-full" />
                  ) : (
                    <>
                      <FloorPlan
                        floor={floorData.floor}
                  hazards={floorData.hazards}
                  onSelectHazard={id=>navigate(`/hazards?open=${id}`)}
                        rooms={floorData.rooms}
                        selectedRoomId={selectedRoomId}
                        onSelectRoom={(room) => void loadRoom(room.id)}
                      />

                      <div className="grid gap-4 md:grid-cols-2">
                        <section className="space-y-2">
                          <div className="flex items-center justify-between">
                            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                              Open hazards on this floor
                            </h3>
                            <Badge variant="outline">{openHazards.length}</Badge>
                          </div>
                          {openHazards.length === 0 ? (
                            <p className="rounded-lg border border-dashed border-border px-3 py-4 text-xs text-muted-foreground">
                              No open hazards recorded on this floor.
                            </p>
                          ) : (
                            <ul className="space-y-1.5">
                              {openHazards.slice(0, 6).map((hazard) => (
                                <li key={hazard.id}>
                                  <button
                                    onClick={() => {
                                      onClose();
                                      navigate(`/hazards?open=${hazard.id}`);
                                    }}
                                    className="flex w-full items-start gap-2 rounded-lg border border-border bg-card px-2.5 py-2 text-left transition-colors hover:bg-accent"
                                  >
                                    <SeverityBadge severity={hazard.severity} showLabel={false} className="mt-0.5" />
                                    <span className="min-w-0">
                                      <span className="block truncate text-xs font-medium text-foreground">
                                        {hazard.title}
                                      </span>
                                      <span className="block text-[11px] text-muted-foreground">
                                        {hazard.roomName} · {hazard.ref}
                                      </span>
                                    </span>
                                    <StatusBadge status={hazard.status} className="ml-auto hidden shrink-0 sm:inline-flex" />
                                  </button>
                                </li>
                              ))}
                            </ul>
                          )}
                        </section>

                        <section className="space-y-2">
                          <div className="flex items-center justify-between">
                            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                              Safety equipment
                            </h3>
                            <Badge variant={equipmentIssues.length ? 'warning' : 'success'}>
                              {equipmentIssues.length ? `${equipmentIssues.length} need attention` : 'All serviceable'}
                            </Badge>
                          </div>
                          {(floorData.equipment ?? []).length === 0 ? (
                            <p className="rounded-lg border border-dashed border-border px-3 py-4 text-xs text-muted-foreground">
                              No equipment recorded on this floor.
                            </p>
                          ) : (
                            <ul className="space-y-1.5">
                              {floorData.equipment.slice(0, 6).map((item) => (
                                <li
                                  key={item.id}
                                  className="flex items-center gap-2 rounded-lg border border-border bg-card px-2.5 py-2"
                                >
                                  <Wrench className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                                  <span className="min-w-0 flex-1">
                                    <span className="block truncate text-xs font-medium">{item.label}</span>
                                    <span className="block text-[11px] text-muted-foreground">
                                      {item.roomName} · checked {relativeTime(item.lastCheckedAt)}
                                    </span>
                                  </span>
                                  <Badge
                                    variant={
                                      item.status === 'ok'
                                        ? 'success'
                                        : item.status === 'missing'
                                          ? 'danger'
                                          : 'warning'
                                    }
                                    className="shrink-0 text-[10px] capitalize"
                                  >
                                    {item.status}
                                  </Badge>
                                </li>
                              ))}
                            </ul>
                          )}
                        </section>
                      </div>

                      <p className="text-[11px] text-muted-foreground">
                        Rooms marked with a red count contain open hazards. Select a room for equipment,
                        inspection history and hazard records.
                      </p>
                    </>
                  )}
                </>
              )}
            </>
          ) : null}
        </DrawerBody>
      </DrawerContent>
    </Drawer>
  );
}

function RoomPanel({
  data,
  loading,
  onBack,
  canScan,
  onScan,
  onHazard,
}: {
  data: RoomPayload;
  loading: boolean;
  onBack: () => void;
  canScan: boolean;
  initialRoomId?: number | null;
  onScan: () => void;
  onHazard: (id: number) => void;
}) {
  const openHazards = data.hazards.filter((h) => h.status !== 'resolved');
  return (
    <div className="space-y-4">
      <button
        onClick={onBack}
        className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-3.5 w-3.5" /> Back to floor plan
      </button>

      <div className="rounded-xl border border-border bg-muted/30 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="font-mono text-xs text-muted-foreground">
              {data.context.buildingCode} · L{data.context.floorLevel} · {data.context.code}
            </p>
            <h2 className="mt-0.5 text-xl font-semibold">{data.room.name}</h2>
            <p className="text-xs text-muted-foreground">
              {data.context.type.replace(/_/g, ' ')} · capacity {data.room.capacity} ·{' '}
              {data.context.floorName}
            </p>
          </div>
          <div className="flex flex-col items-end gap-1.5">
            <Badge variant={data.room.status === 'operational' ? 'success' : 'warning'} className="capitalize">
              {data.room.status.replace(/_/g, ' ')}
            </Badge>
            <span className="text-[11px] text-muted-foreground">
              Last inspected {shortDate(data.room.lastInspectedAt)}
            </span>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          {canScan && (
            <Button size="sm" onClick={onScan} loading={loading}>
              <ScanEye className="h-4 w-4" /> Start a room scan
            </Button>
          )}
          <Button size="sm" variant="outline" onClick={onBack}>
            <Ruler className="h-4 w-4" /> Floor plan
          </Button>
        </div>
      </div>

      <section className="space-y-2">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Hazards in this room ({openHazards.length} open)
        </h3>
        {data.hazards.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border px-3 py-4 text-xs text-muted-foreground">
            No hazards have been recorded for this room.
          </p>
        ) : (
          <ul className="space-y-1.5">
            {data.hazards.map((hazard) => (
              <li key={hazard.id}>
                <button
                  onClick={() => onHazard(hazard.id)}
                  className="flex w-full items-start gap-2 rounded-lg border border-border bg-card px-3 py-2 text-left transition-colors hover:bg-accent"
                >
                  <SeverityBadge severity={hazard.severity} showLabel={false} className="mt-0.5" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{hazard.title}</span>
                    <span className="block text-[11px] text-muted-foreground">
                      {hazard.ref} · reported {relativeTime(hazard.createdAt)}
                    </span>
                  </span>
                  <StatusBadge status={hazard.status} className="shrink-0" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-2">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Safety equipment
        </h3>
        {data.equipment.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border px-3 py-4 text-xs text-muted-foreground">
            No equipment recorded in this room.
          </p>
        ) : (
          <ul className="grid gap-2 sm:grid-cols-2">
            {data.equipment.map((item) => (
              <li key={item.id} className="rounded-lg border border-border bg-card px-3 py-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-xs font-medium">{item.label}</span>
                  <Badge
                    variant={item.status === 'ok' ? 'success' : item.status === 'missing' ? 'danger' : 'warning'}
                    className="shrink-0 text-[10px] capitalize"
                  >
                    {item.status}
                  </Badge>
                </div>
                <p className="mt-0.5 text-[11px] text-muted-foreground">
                  {item.notes || 'No notes'} · checked {relativeTime(item.lastCheckedAt)}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-2">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Recent inspections
        </h3>
        {data.scans.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border px-3 py-4 text-xs text-muted-foreground">
            This room has not been scanned yet.
          </p>
        ) : (
          <ul className="space-y-1.5">
            {data.scans.map((scan) => (
              <li
                key={scan.id}
                className="flex items-center justify-between gap-2 rounded-lg border border-border bg-card px-3 py-2"
              >
                <span className="text-xs">
                  <span className="font-medium">{scan.inspectorName ?? 'Unknown inspector'}</span>
                  <span className="block text-[11px] text-muted-foreground">
                    Started {relativeTime(scan.startedAt)}
                  </span>
                </span>
                <Badge variant={scan.status === 'submitted' ? 'success' : 'warning'} className="capitalize">
                  {scan.status}
                </Badge>
              </li>
            ))}
          </ul>
        )}
      </section>

      {loading && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Refreshing room record…
        </div>
      )}
    </div>
  );
}
