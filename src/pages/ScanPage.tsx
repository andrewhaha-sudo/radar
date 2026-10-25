'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Building2,
  Camera,
  Check,
  CheckCircle2,
  Circle,
  ClipboardCheck,
  DoorOpen,
  Info,
  Layers,
  MapPin,
  Plus,
  RefreshCw,
  ScanEye,
  ShieldCheck,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
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
import { ImageUpload } from '@/components/forms/ImageUpload';
import {
  SEVERITY_META,
  SeverityBadge,
  relativeTime,
} from '@/components/ui/hazard-bits';
import { api, errorMessage } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { cn } from '@/components/ui/card';
import type {
  Building,
  Floor,
  Room,
  RoomContext,
  Scan,
  ScanObservation,
  ScanPhoto,
  Severity,
} from '@/lib/types';

const SEVERITIES: Severity[] = ['critical', 'high', 'medium', 'low', 'info'];

const STEPS = [
  { id: 0, title: 'Select room', icon: MapPin },
  { id: 1, title: 'Capture photos', icon: Camera },
  { id: 2, title: 'Record observations', icon: ClipboardCheck },
  { id: 3, title: 'Review & submit', icon: ShieldCheck },
] as const;

interface StructureResponse {
  buildings: Building[];
  floors: Floor[];
  rooms: Room[];
}

interface ScanResponse {
  scan: Scan;
  context: RoomContext;
  photos: ScanPhoto[];
  observations: ScanObservation[];
}

interface AiStatus {
  configured: boolean;
  provider: string | null;
  model: string | null;
  checkedAt: string;
  message: string;
}

export function ScanPage() {
  const { can } = useAuth();
  const canWrite = can('scan:write');
  const [params, setParams] = useSearchParams();
  const roomParam = params.get('roomId');

  const [step, setStep] = useState(0);
  const [structure, setStructure] = useState<StructureResponse | null>(null);
  const [structureError, setStructureError] = useState<string | null>(null);
  const [structureLoading, setStructureLoading] = useState(true);

  const [buildingId, setBuildingId] = useState('');
  const [floorId, setFloorId] = useState('');
  const [roomId, setRoomId] = useState('');
  const [roomQuery, setRoomQuery] = useState('');

  const [scan, setScan] = useState<ScanResponse | null>(null);
  const [scanLoading, setScanLoading] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);

  const [aiStatus, setAiStatus] = useState<AiStatus | null>(null);
  const [observations, setObservations] = useState<ScanObservation[]>([]);
  const [photos, setPhotos] = useState<ScanPhoto[]>([]);
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [submitResult, setSubmitResult] = useState<{
    created: Array<{ id: number; ref: string }>;
    message: string;
  } | null>(null);
  const [submitConfirm, setSubmitConfirm] = useState(false);
  const [observationDialog, setObservationDialog] = useState(false);
  const [photoToDelete, setPhotoToDelete] = useState<ScanPhoto | null>(null);
  const [recentScans, setRecentScans] = useState<Scan[]>([]);

  /* ---------------- Data loading ---------------- */

  useEffect(() => {
    if (!canWrite) {
      setStructureLoading(false);
      return;
    }
    setStructureLoading(true);
    api
      .get<StructureResponse>('/api/buildings')
      .then((payload) => {
        setStructure(payload);
        setStructureError(null);
      })
      .catch((err) => setStructureError(errorMessage(err)))
      .finally(() => setStructureLoading(false));

    api
      .get<AiStatus>('/api/ai/status')
      .then(setAiStatus)
      .catch(() => setAiStatus(null));

    if (can('scan:read')) {
      api
        .get<{ scans: Scan[] }>('/api/scans')
        .then((payload) => setRecentScans(payload.scans))
        .catch(() => setRecentScans([]));
    }
  }, [can, canWrite]);

  const loadScan = useCallback(async (scanId: number) => {
    setScanLoading(true);
    setScanError(null);
    try {
      const payload = await api.get<ScanResponse>(`/api/scans/${scanId}`);
      setScan(payload);
      setObservations(payload.observations);
      setPhotos(payload.photos);
      setNotes(payload.scan.notes ?? '');
    } catch (err) {
      setScanError(errorMessage(err));
    } finally {
      setScanLoading(false);
    }
  }, []);

  const startScan = useCallback(
    async (targetRoomId: number) => {
      setStarting(true);
      setScanError(null);
      try {
        const payload = await api.post<{ scanId: number; resumed: boolean }>('/api/scans', {
          roomId: targetRoomId,
        });
        await loadScan(payload.scanId);
        setStep(payload.resumed ? 2 : 1);
      } catch (err) {
        setScanError(errorMessage(err));
      } finally {
        setStarting(false);
      }
    },
    [loadScan],
  );

  // Deep link: /scan?roomId=12
  useEffect(() => {
    if (!roomParam || !structure || scan || starting) return;
    const target = structure.rooms.find((room) => String(room.id) === roomParam);
    if (!target) return;
    const building = structure.buildings.find((item) => item.id === target.buildingId);
    setBuildingId(String(target.buildingId));
    setFloorId(String(target.floorId));
    setRoomId(String(target.id));
    if (building) {
      void startScan(target.id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomParam, structure]);

  /* ---------------- Derived selections ---------------- */

  const floors = useMemo(
    () => (structure?.floors ?? []).filter((floor) => String(floor.buildingId) === buildingId),
    [structure, buildingId],
  );

  const rooms = useMemo(() => {
    const query = roomQuery.trim().toLowerCase();
    return (structure?.rooms ?? []).filter((room) => {
      if (String(room.floorId) !== floorId) return false;
      if (!query) return true;
      return (
        room.name.toLowerCase().includes(query) ||
        room.code.toLowerCase().includes(query) ||
        room.type.toLowerCase().includes(query)
      );
    });
  }, [structure, floorId, roomQuery]);

  const selectedRoom = useMemo(
    () => (structure?.rooms ?? []).find((room) => String(room.id) === roomId) ?? null,
    [structure, roomId],
  );

  const accepted = observations.filter((item) => item.status === 'accepted');
  const pending = observations.filter((item) => item.status === 'pending');
  const rejected = observations.filter((item) => item.status === 'rejected');
  const canSubmit = accepted.length > 0 && scan?.scan.status === 'draft';

  const openDraft = (target: Scan) => {
    setBuildingId('');
    setFloorId('');
    setRoomId(String(target.roomId));
    void loadScan(target.id);
    setStep(target.status === 'submitted' ? 3 : 2);
  };

  const resetFlow = () => {
    setScan(null);
    setObservations([]);
    setPhotos([]);
    setNotes('');
    setSubmitResult(null);
    setStep(0);
    setRoomId('');
    setParams({}, { replace: true });
    if (can('scan:read')) {
      api
        .get<{ scans: Scan[] }>('/api/scans')
        .then((payload) => setRecentScans(payload.scans))
        .catch(() => undefined);
    }
  };

  const updateObservation = async (observation: ScanObservation, status: ScanObservation['status']) => {
    if (!scan) return;
    setBusy(`obs-${observation.id}`);
    try {
      await api.patch(`/api/scans/${scan.scan.id}/observations/${observation.id}`, { status });
      setObservations((current) =>
        current.map((item) => (item.id === observation.id ? { ...item, status } : item)),
      );
    } catch (err) {
      setScanError(errorMessage(err));
    } finally {
      setBusy(null);
    }
  };

  const addPhoto = async (url: string, file: File) => {
    if (!scan) return;
    const caption = file.name.replace(/\.[^.]+$/, '').replace(/[-_]/g, ' ');
    const payload = await api.post<{ id: number; url: string; caption: string; createdAt: string }>(
      `/api/scans/${scan.scan.id}/photos`,
      { url, caption },
    );
    setPhotos((current) => [
      ...current,
      {
        id: payload.id,
        scanId: scan.scan.id,
        url: payload.url,
        caption: payload.caption,
        createdAt: payload.createdAt,
      },
    ]);
  };

  const deletePhoto = async () => {
    if (!scan || !photoToDelete) return;
    setBusy('photo-delete');
    try {
      await api.del(`/api/scans/${scan.scan.id}/photos/${photoToDelete.id}`);
      setPhotos((current) => current.filter((photo) => photo.id !== photoToDelete.id));
      setPhotoToDelete(null);
    } catch (err) {
      setScanError(errorMessage(err));
    } finally {
      setBusy(null);
    }
  };

  const submitScan = async () => {
    if (!scan) return;
    setBusy('submit');
    try {
      const payload = await api.post<{
        created: Array<{ id: number; ref: string }>;
        message: string;
      }>(`/api/scans/${scan.scan.id}/submit`, { notes });
      setSubmitResult({ created: payload.created, message: payload.message });
      setSubmitConfirm(false);
      setScan((current) =>
        current
          ? {
              ...current,
              scan: { ...current.scan, status: 'submitted', submittedAt: new Date().toISOString(), notes },
            }
          : current,
      );
      setStep(3);
      api
        .get<{ scans: Scan[] }>('/api/scans')
        .then((response) => setRecentScans(response.scans))
        .catch(() => undefined);
    } catch (err) {
      setScanError(errorMessage(err));
      setSubmitConfirm(false);
    } finally {
      setBusy(null);
    }
  };

  /* ---------------- Render ---------------- */

  if (!canWrite) {
    return (
      <div className="stack-page">
        <div className="mx-auto max-w-md rounded-xl border border-border bg-card p-6 text-center">
          <ShieldCheck className="mx-auto mb-2 h-8 w-8 text-muted-foreground" />
          <h1 className="text-lg font-semibold">Room scanning is restricted</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Your role has read-only access. Ask an inspector or administrator to perform room
            inspections.
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
              <ScanEye className="h-5 w-5" />
            </span>
            <h1 className="text-2xl font-semibold tracking-tight">Room scanning</h1>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Capture evidence, record what you observed, then submit findings for independent review.
          </p>
        </div>
        {scan && (
          <Button variant="outline" size="sm" onClick={resetFlow}>
            <RefreshCw className="h-4 w-4" /> Start another scan
          </Button>
        )}
      </div>

      {/* Stepper */}
      <ol className="grid gap-2 sm:grid-cols-4" aria-label="Scan progress">
        {STEPS.map((item, index) => {
          const Icon = item.icon;
          const reachable = scan ? true : index === 0;
          const active = step === index;
          const complete = step > index;
          return (
            <li key={item.id}>
              <button
                type="button"
                disabled={!reachable || scanLoading || submitResult !== null}
                onClick={() => setStep(index)}
                aria-current={active ? 'step' : undefined}
                className={cn(
                  'flex w-full items-center gap-2 rounded-xl border px-3 py-2 text-left transition-colors disabled:cursor-not-allowed',
                  active
                    ? 'border-accent-foreground bg-accent text-accent-foreground'
                    : complete
                      ? 'border-success/40 bg-success/10 text-success'
                      : 'border-border bg-card text-muted-foreground',
                )}
              >
                <span
                  className={cn(
                    'grid h-6 w-6 shrink-0 place-items-center rounded-full border text-[11px] font-bold',
                    active
                      ? 'border-accent-foreground'
                      : complete
                        ? 'border-success bg-success text-white'
                        : 'border-border',
                  )}
                >
                  {complete ? <Check className="h-3 w-3" /> : <Icon className="h-3 w-3" />}
                </span>
                <span className="min-w-0">
                  <span className="block text-[10px] uppercase tracking-wider opacity-70">
                    Step {index + 1}
                  </span>
                  <span className="block truncate text-xs font-medium">{item.title}</span>
                </span>
              </button>
            </li>
          );
        })}
      </ol>

      {scanError && (
        <div className="flex items-start gap-2 rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span className="flex-1">{scanError}</span>
          <button onClick={() => setScanError(null)} aria-label="Dismiss error">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* STEP 0 — room selection */}
      {step === 0 && (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="rounded-xl border border-border bg-card p-4">
            <h2 className="text-sm font-semibold">Choose the room you are inspecting</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Pick a building, floor and room. Starting a scan creates a draft that only you can see
              until it is submitted.
            </p>

            {structureError ? (
              <div className="mt-4 rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
                {structureError}
                <Button
                  variant="link"
                  size="sm"
                  onClick={() => window.location.reload()}
                  className="ml-2"
                >
                  Retry
                </Button>
              </div>
            ) : structureLoading ? (
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
              </div>
            ) : (
              <div className="mt-4 space-y-3">
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="space-y-1.5 text-sm font-medium">
                    <span className="flex items-center gap-1">
                      <Building2 className="h-3.5 w-3.5" /> Building
                    </span>
                    <select
                      value={buildingId}
                      onChange={(event) => {
                        setBuildingId(event.target.value);
                        setFloorId('');
                        setRoomId('');
                      }}
                      className="h-10 w-full rounded-lg border border-input bg-background px-2 text-sm font-normal"
                    >
                      <option value="">Select a building…</option>
                      {(structure?.buildings ?? []).map((building) => (
                        <option key={building.id} value={building.id}>
                          {building.name} ({building.code})
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="space-y-1.5 text-sm font-medium">
                    <span className="flex items-center gap-1">
                      <Layers className="h-3.5 w-3.5" /> Floor
                    </span>
                    <select
                      value={floorId}
                      onChange={(event) => {
                        setFloorId(event.target.value);
                        setRoomId('');
                      }}
                      disabled={!buildingId}
                      className="h-10 w-full rounded-lg border border-input bg-background px-2 text-sm font-normal disabled:opacity-50"
                    >
                      <option value="">Select a floor…</option>
                      {floors.map((floor) => (
                        <option key={floor.id} value={floor.id}>
                          L{floor.level} · {floor.name}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>

                {floorId && (
                  <>
                    <Input
                      label="Filter rooms"
                      value={roomQuery}
                      onChange={(event) => setRoomQuery(event.target.value)}
                      placeholder="Room number, name or type…"
                    />
                    <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                      {rooms.length === 0 ? (
                        <p className="col-span-full rounded-lg border border-dashed border-border px-3 py-6 text-center text-xs text-muted-foreground">
                          No rooms on this floor match “{roomQuery}”.
                        </p>
                      ) : (
                        rooms.map((room) => {
                          const selected = String(room.id) === roomId;
                          return (
                            <button
                              key={room.id}
                              type="button"
                              onClick={() => setRoomId(String(room.id))}
                              aria-pressed={selected}
                              className={cn(
                                'flex items-start gap-2 rounded-lg border px-3 py-2 text-left transition-colors',
                                selected
                                  ? 'border-accent-foreground bg-accent'
                                  : 'border-border hover:bg-muted/60',
                              )}
                            >
                              <DoorOpen className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                              <span className="min-w-0">
                                <span className="block font-mono text-[10px] text-muted-foreground">
                                  {room.code}
                                </span>
                                <span className="block truncate text-xs font-medium text-foreground">
                                  {room.name}
                                </span>
                                <span className="block text-[10px] capitalize text-muted-foreground">
                                  {room.type.replace(/_/g, ' ')} · {room.capacity} capacity
                                </span>
                              </span>
                            </button>
                          );
                        })
                      )}
                    </div>
                  </>
                )}

                {selectedRoom && (
                  <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-muted/40 px-3 py-2">
                    <div className="min-w-0">
                      <p className="text-xs font-medium">{selectedRoom.name}</p>
                      <p className="text-[11px] text-muted-foreground">
                        {selectedRoom.code} · last inspected{' '}
                        {selectedRoom.lastInspectedAt
                          ? relativeTime(selectedRoom.lastInspectedAt)
                          : 'never'}
                      </p>
                    </div>
                    <Button
                      size="sm"
                      onClick={() => void startScan(selectedRoom.id)}
                      loading={starting}
                      disabled={starting}
                    >
                      Start scan <ArrowRight className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                )}
              </div>
            )}
          </div>

          <aside className="space-y-3">
            <div className="rounded-xl border border-border bg-card p-4">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                How this works
              </h3>
              <ol className="mt-2 space-y-2 text-xs text-muted-foreground">
                {[
                  'Select the room you are physically in.',
                  'Capture photos that support what you see.',
                  'Record each observation and its severity.',
                  'Review and submit. Findings are created as pending review, not verified hazards.',
                ].map((line, index) => (
                  <li key={line} className="flex gap-2">
                    <span className="grid h-4 w-4 shrink-0 place-items-center rounded-full bg-accent text-[9px] font-bold text-accent-foreground">
                      {index + 1}
                    </span>
                    {line}
                  </li>
                ))}
              </ol>
            </div>

            <div className="rounded-xl border border-border bg-card p-4">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Recent scans
              </h3>
              {recentScans.length === 0 ? (
                <p className="mt-2 text-xs text-muted-foreground">No scans recorded yet.</p>
              ) : (
                <ul className="mt-2 space-y-1.5">
                  {recentScans.slice(0, 5).map((item) => (
                    <li key={item.id}>
                      <button
                        onClick={() => openDraft(item)}
                        className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left hover:bg-accent"
                      >
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-xs font-medium">
                            {item.roomName ?? `Room ${item.roomId}`}
                          </span>
                          <span className="block text-[10px] text-muted-foreground">
                            {item.buildingName} · {relativeTime(item.startedAt)}
                          </span>
                        </span>
                        <Badge
                          variant={item.status === 'submitted' ? 'success' : 'warning'}
                          className="shrink-0 text-[9px] capitalize"
                        >
                          {item.status}
                        </Badge>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </aside>
        </div>
      )}

      {/* Scan context banner for steps 1-3 */}
      {step > 0 && scan && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-card px-4 py-2.5">
          <div className="flex min-w-0 items-center gap-2">
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-accent text-accent-foreground">
              <MapPin className="h-4 w-4" />
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">
                {scan.context.buildingName} · L{scan.context.floorLevel} · {scan.context.roomName}
              </p>
              <p className="font-mono text-[11px] text-muted-foreground">
                {scan.context.code} · scan #{scan.scan.id} ·{' '}
                {scan.scan.status === 'submitted' ? 'submitted' : 'draft'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <Badge variant={scan.scan.status === 'submitted' ? 'success' : 'warning'}>
              {scan.scan.status === 'submitted' ? 'Submitted' : 'Draft'}
            </Badge>
            <Badge variant="outline">{photos.length} photos</Badge>
            <Badge variant="outline">{observations.length} observations</Badge>
          </div>
        </div>
      )}

      {scanLoading && !scan && (
        <div className="space-y-3">
          <Skeleton className="h-24 w-full rounded-xl" />
          <Skeleton className="h-40 w-full rounded-xl" />
        </div>
      )}

      {/* STEP 1 — photos */}
      {step === 1 && scan && (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="space-y-4">
            <div className="rounded-xl border border-border bg-card p-4">
              <h2 className="text-sm font-semibold">Capture or upload photos</h2>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Photograph the specific condition from a safe position. Do not move equipment or enter
                a restricted area to take a photo. Uploads are stored on the campus server.
              </p>
              {scan.scan.status === 'draft' ? (
                <div className="mt-3">
                  <ImageUpload label="Add a photo to this scan" onUploaded={addPhoto} />
                </div>
              ) : (
                <p className="mt-3 rounded-lg border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
                  This scan has been submitted. Photos are read-only.
                </p>
              )}
            </div>

            <div className="rounded-xl border border-border bg-card p-4">
              <div className="mb-2 flex items-center justify-between">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Photos in this scan ({photos.length})
                </h3>
              </div>
              {photos.length === 0 ? (
                <p className="rounded-lg border border-dashed border-border px-3 py-8 text-center text-xs text-muted-foreground">
                  No photos yet. Photos are optional but strongly recommended for findings that need
                  evidence.
                </p>
              ) : (
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {photos.map((photo) => (
                    <figure
                      key={photo.id}
                      className="group relative overflow-hidden rounded-lg border border-border bg-muted"
                    >
                      <img
                        src={photo.url}
                        alt={photo.caption || 'Inspection photo'}
                        className="aspect-[4/3] w-full object-cover"
                        loading="lazy"
                      />
                      <figcaption className="truncate px-2 py-1 text-[10px] text-muted-foreground">
                        {photo.caption || 'Untitled'}
                      </figcaption>
                      {scan.scan.status === 'draft' && (
                        <button
                          type="button"
                          onClick={() => setPhotoToDelete(photo)}
                          className="absolute right-1.5 top-1.5 grid h-7 w-7 place-items-center rounded-md bg-black/60 text-white opacity-0 transition-opacity group-hover:opacity-100 focus:opacity-100"
                          aria-label={`Remove photo ${photo.caption || photo.id}`}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </figure>
                  ))}
                </div>
              )}
            </div>
          </div>

          <aside className="space-y-3">
            <div className="rounded-xl border border-border bg-card p-4">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Photo guidance
              </h3>
              <ul className="mt-2 space-y-1.5 text-xs text-muted-foreground">
                <li>• Include something for scale where safe to do so.</li>
                <li>• Avoid faces, ID badges and student work in frame.</li>
                <li>• Do not photograph restricted or classified areas.</li>
                <li>• Delete accidental photos before submitting.</li>
              </ul>
            </div>
            <StepNav
              onBack={() => setStep(0)}
              onNext={() => setStep(2)}
              nextLabel="Record observations"
            />
          </aside>
        </div>
      )}

      {/* STEP 2 — observations */}
      {step === 2 && scan && (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="space-y-4">
            <div className="rounded-xl border border-border bg-card p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <h2 className="text-sm font-semibold">Observations</h2>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Record what you observed. Accepted observations become hazards in
                    <span className="font-medium text-foreground"> pending review</span> after you
                    submit.
                  </p>
                </div>
                {scan.scan.status === 'draft' && (
                  <Button size="sm" onClick={() => setObservationDialog(true)}>
                    <Plus className="h-4 w-4" /> Add observation
                  </Button>
                )}
              </div>

              {observations.length === 0 ? (
                <p className="mt-3 rounded-lg border border-dashed border-border px-3 py-8 text-center text-xs text-muted-foreground">
                  No observations recorded. Add at least one before submitting.
                </p>
              ) : (
                <ul className="mt-3 space-y-2">
                  {observations.map((observation) => (
                    <li
                      key={observation.id}
                      className={cn(
                        'rounded-lg border p-3',
                        observation.status === 'accepted'
                          ? 'border-success/30 bg-success/5'
                          : observation.status === 'rejected'
                            ? 'border-border bg-muted/40 opacity-70'
                            : 'border-border',
                      )}
                    >
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <SeverityBadge severity={observation.severity} />
                            <Badge
                              variant={
                                observation.status === 'accepted'
                                  ? 'success'
                                  : observation.status === 'rejected'
                                    ? 'muted'
                                    : 'warning'
                              }
                              className="text-[9px] capitalize"
                            >
                              {observation.status}
                            </Badge>
                            <Badge variant="outline" className="text-[9px]">
                              {observation.source === 'ai' ? 'AI suggested' : 'Manual finding'}
                            </Badge>
                          </div>
                          <p className="mt-1 text-sm font-medium">{observation.title}</p>
                          {observation.description && (
                            <p className="mt-0.5 text-xs text-muted-foreground">
                              {observation.description}
                            </p>
                          )}
                          {observation.hazardId && (
                            <p className="mt-1 font-mono text-[10px] text-muted-foreground">
                              Linked hazard #{observation.hazardId}
                            </p>
                          )}
                        </div>

                        {scan.scan.status === 'draft' && observation.status === 'pending' && (
                          <div className="flex shrink-0 gap-1.5">
                            <Button
                              size="sm"
                              variant="outline"
                              loading={busy === `obs-${observation.id}`}
                              onClick={() => void updateObservation(observation, 'rejected')}
                            >
                              <X className="h-3.5 w-3.5" /> Reject
                            </Button>
                            <Button
                              size="sm"
                              loading={busy === `obs-${observation.id}`}
                              onClick={() => void updateObservation(observation, 'accepted')}
                            >
                              <Check className="h-3.5 w-3.5" /> Accept
                            </Button>
                          </div>
                        )}
                        {scan.scan.status === 'draft' && observation.status !== 'pending' && (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => void updateObservation(observation, 'pending')}
                          >
                            Reopen
                          </Button>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              )}

              <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-border pt-2 text-[11px] text-muted-foreground">
                <span className="inline-flex items-center gap-1">
                  <CheckCircle2 className="h-3.5 w-3.5 text-success" /> {accepted.length} accepted
                </span>
                <span className="inline-flex items-center gap-1">
                  <Circle className="h-3.5 w-3.5 text-warning" /> {pending.length} pending
                </span>
                <span className="inline-flex items-center gap-1">
                  <X className="h-3.5 w-3.5" /> {rejected.length} rejected
                </span>
              </div>
            </div>

            {/* Honest AI state */}
            <div className="rounded-xl border border-border bg-card p-4">
              <div className="flex items-start gap-2">
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground">
                  <Sparkles className="h-4 w-4" />
                </span>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-sm font-semibold">Automated photo suggestions</h3>
                    <Badge variant="muted" className="text-[9px]">
                      {aiStatus?.configured ? 'Configured' : 'Not configured'}
                    </Badge>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {aiStatus?.message ??
                      'No vision model is configured in this installation. Suggestions are disabled; observations are manual findings and still require verification.'}
                  </p>
                  {!aiStatus?.configured && (
                    <p className="mt-1.5 text-[11px] text-muted-foreground">
                      Nothing is generated automatically. Any area that would show suggestions stays
                      empty until a model is connected and configured server-side.
                    </p>
                  )}
                </div>
              </div>
            </div>
          </div>

          <aside className="space-y-3">
            <div className="rounded-xl border border-border bg-card p-4">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                About severity
              </h3>
              <ul className="mt-2 space-y-1.5">
                {SEVERITIES.map((severity) => {
                  const meta = SEVERITY_META[severity];
                  return (
                    <li key={severity} className="flex items-start gap-1.5 text-[11px]">
                      <span
                        className="mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded-full text-[8px] font-bold text-white"
                        style={{ background: meta.hex }}
                        aria-hidden="true"
                      >
                        {meta.symbol}
                      </span>
                      <span>
                        <span className="font-medium text-foreground">{meta.label}</span>
                        <span className="block text-muted-foreground">{meta.description}</span>
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>
            <StepNav
              onBack={() => setStep(1)}
              onNext={() => setStep(3)}
              nextLabel="Review findings"
              nextDisabled={accepted.length === 0}
              nextHint={
                accepted.length === 0
                  ? 'Accept at least one observation to continue.'
                  : undefined
              }
            />
          </aside>
        </div>
      )}

      {/* STEP 3 — review & submit */}
      {step === 3 && scan && (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="space-y-4">
            {submitResult ? (
              <div className="rounded-xl border border-success/40 bg-success/10 p-5">
                <div className="flex items-start gap-2">
                  <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-success" />
                  <div>
                    <h2 className="text-sm font-semibold text-success">Scan submitted</h2>
                    <p className="mt-1 text-xs text-muted-foreground">{submitResult.message}</p>
                    {submitResult.created.length > 0 && (
                      <ul className="mt-2 flex flex-wrap gap-1.5">
                        {submitResult.created.map((item) => (
                          <li key={item.id}>
                            <Badge variant="outline" className="font-mono text-[10px]">
                              {item.ref}
                            </Badge>
                          </li>
                        ))}
                      </ul>
                    )}
                    <div className="mt-3 flex gap-2">
                      <Button size="sm" variant="outline" onClick={resetFlow}>
                        Start another scan
                      </Button>
                      <Button size="sm" onClick={() => setStep(2)}>
                        View submitted findings
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="rounded-xl border border-border bg-card p-4">
                <h2 className="text-sm font-semibold">Review before submitting</h2>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Only accepted observations are sent. Each becomes a hazard in
                  <span className="font-medium text-foreground"> pending review</span>, not a verified
                  hazard. A different authorised reviewer must confirm them.
                </p>

                <div className="mt-3 grid gap-2 sm:grid-cols-3">
                  {[
                    { label: 'Photos', value: photos.length },
                    { label: 'Accepted findings', value: accepted.length },
                    { label: 'Rejected', value: rejected.length },
                  ].map((stat) => (
                    <div key={stat.label} className="rounded-lg border border-border bg-muted/40 p-2.5">
                      <p className="text-lg font-semibold leading-none">{stat.value}</p>
                      <p className="mt-1 text-[10px] text-muted-foreground">{stat.label}</p>
                    </div>
                  ))}
                </div>

                <h3 className="mt-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Findings to be created
                </h3>
                {accepted.length === 0 ? (
                  <p className="mt-2 rounded-lg border border-dashed border-border px-3 py-6 text-center text-xs text-muted-foreground">
                    No accepted observations. Return to step 3 and accept at least one finding.
                  </p>
                ) : (
                  <ul className="mt-2 space-y-1.5">
                    {accepted.map((observation) => (
                      <li
                        key={observation.id}
                        className="flex items-start gap-2 rounded-lg border border-border px-3 py-2"
                      >
                        <SeverityBadge severity={observation.severity} showLabel={false} className="mt-0.5" />
                        <div className="min-w-0">
                          <p className="text-xs font-medium">{observation.title}</p>
                          <p className="text-[11px] text-muted-foreground">
                            {SEVERITY_META[observation.severity].label} · pending review
                          </p>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}

                <div className="mt-4">
                  <Textarea
                    label="Scan notes"
                    value={notes}
                    onChange={(event) => setNotes(event.target.value)}
                    maxLength={3000}
                    disabled={scan.scan.status === 'submitted'}
                    placeholder="Anything the reviewer should know about this inspection."
                    helper="Notes are stored with the scan record and visible to reviewers."
                  />
                </div>

                {scan.scan.status === 'draft' ? (
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <Button
                      onClick={() => setSubmitConfirm(true)}
                      disabled={!canSubmit || busy === 'submit'}
                      loading={busy === 'submit'}
                    >
                      <ShieldCheck className="h-4 w-4" /> Submit for review
                    </Button>
                    <Button variant="outline" onClick={() => setStep(2)}>
                      <ArrowLeft className="h-4 w-4" /> Back to observations
                    </Button>
                    {!canSubmit && (
                      <p className="text-[11px] text-muted-foreground">
                        Accept at least one observation before submitting.
                      </p>
                    )}
                  </div>
                ) : (
                  <p className="mt-3 rounded-lg border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
                    This scan was submitted {relativeTime(scan.scan.submittedAt)} and can no longer be
                    edited.
                  </p>
                )}
              </div>
            )}
          </div>

          <aside className="space-y-3">
            <div className="rounded-xl border border-border bg-card p-4">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                What happens next
              </h3>
              <ol className="mt-2 space-y-2 text-xs text-muted-foreground">
                <li className="flex gap-2">
                  <span className="grid h-4 w-4 shrink-0 place-items-center rounded-full bg-accent text-[9px] font-bold text-accent-foreground">
                    1
                  </span>
                  Findings appear in the hazard workspace as pending review.
                </li>
                <li className="flex gap-2">
                  <span className="grid h-4 w-4 shrink-0 place-items-center rounded-full bg-accent text-[9px] font-bold text-accent-foreground">
                    2
                  </span>
                  An inspector or administrator verifies or rejects each finding.
                </li>
                <li className="flex gap-2">
                  <span className="grid h-4 w-4 shrink-0 place-items-center rounded-full bg-accent text-[9px] font-bold text-accent-foreground">
                    3
                  </span>
                  Corrective actions are assigned and tracked to completion.
                </li>
              </ol>
            </div>
            {!submitResult && (
              <div className="rounded-xl border border-info/30 bg-info/5 p-3 text-[11px] text-muted-foreground">
                <Info className="mb-1 inline h-3.5 w-3.5 text-info" /> Submitting does not contact
                emergency services. For immediate danger, use the SOS action or call your local
                emergency number.
              </div>
            )}
          </aside>
        </div>
      )}

      {/* Add observation dialog */}
      <ObservationDialog
        open={observationDialog}
        onOpenChange={setObservationDialog}
        onCreated={(observation) => {
          setObservations((current) => [...current, observation]);
          setObservationDialog(false);
        }}
        scanId={scan?.scan.id ?? null}
      />

      <ConfirmDialog
        open={submitConfirm}
        onOpenChange={setSubmitConfirm}
        title="Submit this scan for review?"
        description={`${accepted.length} accepted finding${
          accepted.length === 1 ? '' : 's'
        } will be created as hazards in pending review. The scan cannot be edited afterwards.`}
        confirmLabel="Submit scan"
        loading={busy === 'submit'}
        onConfirm={() => void submitScan()}
      />

      <ConfirmDialog
        open={photoToDelete !== null}
        onOpenChange={(open) => (!open ? setPhotoToDelete(null) : null)}
        title="Remove this photo?"
        description="The photo is removed from this scan. The stored file is not added to any hazard record."
        confirmLabel="Remove photo"
        destructive
        loading={busy === 'photo-delete'}
        onConfirm={() => void deletePhoto()}
      />
    </div>
  );
}

function StepNav({
  onBack,
  onNext,
  nextLabel,
  nextDisabled,
  nextHint,
}: {
  onBack: () => void;
  onNext: () => void;
  nextLabel: string;
  nextDisabled?: boolean;
  nextHint?: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-3">
      <div className="flex flex-col gap-2">
        <Button variant="outline" size="sm" onClick={onBack}>
          <ArrowLeft className="h-3.5 w-3.5" /> Back
        </Button>
        <Button size="sm" onClick={onNext} disabled={nextDisabled}>
          {nextLabel} <ArrowRight className="h-3.5 w-3.5" />
        </Button>
      </div>
      {nextHint && <p className="mt-1.5 text-[10px] text-muted-foreground">{nextHint}</p>}
    </div>
  );
}

function ObservationDialog({
  open,
  onOpenChange,
  onCreated,
  scanId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (observation: ScanObservation) => void;
  scanId: number | null;
}) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [severity, setSeverity] = useState<Severity>('medium');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reset = () => {
    setTitle('');
    setDescription('');
    setSeverity('medium');
    setError(null);
  };

  const submit = async () => {
    if (!scanId) return;
    if (!title.trim()) {
      setError('Give the observation a short title.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const payload = await api.post<{ id: number }>(`/api/scans/${scanId}/observations`, {
        title: title.trim(),
        description: description.trim(),
        severity,
      });
      onCreated({
        id: payload.id,
        scanId,
        title: title.trim(),
        description: description.trim(),
        severity,
        source: 'manual',
        status: 'pending',
        hazardId: null,
        createdAt: new Date().toISOString(),
      });
      reset();
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
      <DialogContent aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ClipboardCheck className="h-4 w-4" /> Add observation
          </DialogTitle>
          <DialogDescription>
            This is recorded as a manual finding from your inspection. It is not an automated result
            and is not verified.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <Input
            label="Title"
            required
            maxLength={140}
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="e.g. Blocked emergency exit"
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
                      'flex items-center justify-center gap-1 rounded-lg border px-1.5 py-1.5 text-[11px] font-medium transition-colors',
                      active ? 'text-white' : 'border-border text-muted-foreground hover:bg-muted',
                    )}
                    style={
                      active ? { background: meta.hex, borderColor: meta.hex, color: '#fff' } : undefined
                    }
                  >
                    <span aria-hidden="true">{meta.symbol}</span> {meta.label}
                  </button>
                );
              })}
            </div>
          </div>

          <Textarea
            label="What did you observe?"
            value={description}
            maxLength={3000}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="Describe the condition precisely, including measurements where you took them."
          />

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
            Add observation
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
