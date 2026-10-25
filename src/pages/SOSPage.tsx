'use client';

import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowRight,
  Building2,
  CheckCircle2,
  DoorOpen,
  Info,
  Layers,
  MapPin,
  PhoneCall,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/input';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { api, errorMessage } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { cn } from '@/components/ui/card';
import type { Building, Floor, Room } from '@/lib/types';

const KINDS = [
  { id: 'medical', label: 'Medical', hint: 'Injury or medical emergency' },
  { id: 'fire', label: 'Fire', hint: 'Smoke, fire or burning smell' },
  { id: 'security', label: 'Security', hint: 'Threat or intruder' },
  { id: 'weather', label: 'Weather', hint: 'Severe weather or flooding' },
  { id: 'other', label: 'Other', hint: 'Any other emergency' },
] as const;

type SosKind = (typeof KINDS)[number]['id'];

interface StructurePayload {
  buildings: Building[];
  floors: Floor[];
  rooms: Room[];
}

interface SosResult {
  incidentId: number;
  ref: string;
  location: string;
  dispatched: boolean;
  message: string;
}

export function SOSPage() {
  const { can, user, school } = useAuth();
  const navigate = useNavigate();

  const [kind, setKind] = useState<SosKind>('medical');
  const [buildingId, setBuildingId] = useState('');
  const [floorId, setFloorId] = useState('');
  const [roomId, setRoomId] = useState('');
  const [note, setNote] = useState('');
  const [structure, setStructure] = useState<StructurePayload | null>(null);
  const [structureError, setStructureError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<SosResult | null>(null);

  const canPickLocation = can('buildings:read');

  useEffect(() => {
    if (!canPickLocation) return;
    api
      .get<StructurePayload>('/api/buildings')
      .then((payload) => {
        setStructure(payload);
        setStructureError(null);
      })
      .catch((err) => setStructureError(errorMessage(err)));
  }, [canPickLocation]);

  const floors = useMemo(
    () => (structure?.floors ?? []).filter((floor) => String(floor.buildingId) === buildingId),
    [structure, buildingId],
  );
  const rooms = useMemo(
    () => (structure?.rooms ?? []).filter((room) => String(room.floorId) === floorId),
    [structure, floorId],
  );

  const selected = useMemo(() => {
    const kindMeta = KINDS.find((item) => item.id === kind);
    const building = structure?.buildings.find((item) => String(item.id) === buildingId);
    const floor = structure?.floors.find((item) => String(item.id) === floorId);
    const room = structure?.rooms.find((item) => String(item.id) === roomId);
    return { kindLabel: kindMeta?.label ?? 'Emergency', building, floor, room };
  }, [kind, structure, buildingId, floorId, roomId]);

  const reset = () => {
    setKind('medical');
    setBuildingId('');
    setFloorId('');
    setRoomId('');
    setNote('');
    setResult(null);
    setError(null);
  };

  const submit = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const payload = await api.post<SosResult>('/api/sos', {
        kind,
        note: note.trim(),
        buildingId: buildingId ? Number(buildingId) : null,
        roomId: roomId ? Number(roomId) : null,
      });
      setResult(payload);
      setConfirming(false);
    } catch (err) {
      setError(errorMessage(err));
      setConfirming(false);
    } finally {
      setSubmitting(false);
    }
  };

  if (!can('sos:create')) {
    return (
      <div className="stack-page">
        <div className="mx-auto max-w-md rounded-xl border border-border bg-card p-6 text-center">
          <ShieldCheck className="mx-auto mb-2 h-8 w-8 text-muted-foreground" />
          <h1 className="text-lg font-semibold">SOS is not available to your role</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Your account cannot raise an SOS from RADAR. For immediate danger, call your local
            emergency number.
          </p>
        </div>
      </div>
    );
  }

  if (result) {
    return (
      <div className="stack-page space-y-4">
        <div className="rounded-xl border border-warning/40 bg-warning/10 p-5">
          <div className="flex items-start gap-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-warning/20 text-warning">
              <ShieldAlert className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <h1 className="text-lg font-semibold">SOS recorded</h1>
              <p className="mt-1 text-sm text-muted-foreground">{result.message}</p>
              <div className="mt-3 flex flex-wrap items-center gap-1.5">
                <Badge variant="outline" className="font-mono text-[10px]">
                  {result.ref}
                </Badge>
                <Badge variant="outline" className="text-[10px]">
                  <MapPin className="mr-1 h-3 w-3" /> {result.location}
                </Badge>
                <Badge
                  variant={result.dispatched ? 'success' : 'warning'}
                  className="text-[10px]"
                >
                  {result.dispatched
                    ? 'Emergency services confirmed'
                    : 'No external dispatch confirmation'}
                </Badge>
              </div>
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-danger/30 bg-danger/5 p-4">
          <div className="flex items-start gap-2">
            <PhoneCall className="mt-0.5 h-4 w-4 shrink-0 text-danger" />
            <div className="text-sm">
              <p className="font-medium text-danger">Call your local emergency number now</p>
              <p className="mt-0.5 text-muted-foreground">
                RADAR alerted campus safety leads inside this application
                {result.dispatched
                  ? ' and the configured integration reported a successful dispatch.'
                  : '. It did not contact police, fire or ambulance services. No external dispatch was confirmed.'}
              </p>
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-border bg-card p-4">
          <h2 className="text-sm font-semibold">What happens next</h2>
          <ol className="mt-2 space-y-2 text-xs text-muted-foreground">
            <li className="flex gap-2">
              <span className="grid h-4 w-4 shrink-0 place-items-center rounded-full bg-accent text-[9px] font-bold text-accent-foreground">
                1
              </span>
              Campus safety leads receive the SOS notification in RADAR and can open the
              incident.
            </li>
            <li className="flex gap-2">
              <span className="grid h-4 w-4 shrink-0 place-items-center rounded-full bg-accent text-[9px] font-bold text-accent-foreground">
                2
              </span>
              A responder records updates on the incident. Keep your phone reachable if you provided
              a number.
            </li>
            <li className="flex gap-2">
              <span className="grid h-4 w-4 shrink-0 place-items-center rounded-full bg-accent text-[9px] font-bold text-accent-foreground">
                3
              </span>
              If the situation changes or worsens, raise another SOS or call emergency services.
            </li>
          </ol>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={reset}>
              <RefreshCw className="h-4 w-4" /> Raise another SOS
            </Button>
            <Button size="sm" variant="ghost" onClick={() => navigate('/dashboard')}>
              Back to dashboard <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="stack-page space-y-5">
      <div>
        <div className="flex items-center gap-2">
          <span className="grid h-9 w-9 place-items-center rounded-lg bg-danger/10 text-danger">
            <PhoneCall className="h-5 w-5" />
          </span>
          <h1 className="text-2xl font-semibold tracking-tight">Emergency SOS</h1>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          Raise an SOS to campus safety leads inside {school?.name ?? 'your campus'}. Use only for a
          real emergency.
        </p>
      </div>

      <div className="rounded-xl border border-danger/30 bg-danger/5 p-4">
        <div className="flex items-start gap-2">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-danger" />
          <div className="text-sm">
            <p className="font-medium text-danger">
              RADAR does not call emergency services
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              An SOS creates a critical incident and notifies campus safety leads inside this
              application. No police, fire or ambulance service is contacted automatically. Call your
              local emergency number for immediate danger.
            </p>
          </div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <section className="rounded-xl border border-border bg-card p-4">
          <h2 className="text-sm font-semibold">What is happening?</h2>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            {KINDS.map((option) => {
              const active = kind === option.id;
              return (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => setKind(option.id)}
                  aria-pressed={active}
                  className={cn(
                    'rounded-lg border p-2.5 text-left transition-colors',
                    active
                      ? 'border-danger bg-danger/10'
                      : 'border-border hover:bg-muted/60',
                  )}
                >
                  <span className="flex items-center justify-between gap-2">
                    <span className={cn('text-xs font-semibold', active && 'text-danger')}>
                      {option.label}
                    </span>
                    {active && <CheckCircle2 className="h-3.5 w-3.5 text-danger" />}
                  </span>
                  <span className="mt-0.5 block text-[10px] text-muted-foreground">
                    {option.hint}
                  </span>
                </button>
              );
            })}
          </div>

          <h2 className="mt-4 text-sm font-semibold">Where are you?</h2>
          {canPickLocation ? (
            <>
              {structureError && (
                <p className="mt-1 text-[11px] text-danger">
                  Could not load buildings: {structureError}. You can still describe your location in
                  the note.
                </p>
              )}
              <div className="mt-2 grid gap-2 sm:grid-cols-3">
                <label className="space-y-1.5 text-xs font-medium">
                  <span className="flex items-center gap-1">
                    <Building2 className="h-3 w-3" /> Building
                  </span>
                  <select
                    value={buildingId}
                    onChange={(event) => {
                      setBuildingId(event.target.value);
                      setFloorId('');
                      setRoomId('');
                    }}
                    className="h-9 w-full rounded-lg border border-input bg-background px-2 text-xs font-normal"
                  >
                    <option value="">Not specified</option>
                    {(structure?.buildings ?? []).map((building) => (
                      <option key={building.id} value={building.id}>
                        {building.name}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="space-y-1.5 text-xs font-medium">
                  <span className="flex items-center gap-1">
                    <Layers className="h-3 w-3" /> Floor
                  </span>
                  <select
                    value={floorId}
                    onChange={(event) => {
                      setFloorId(event.target.value);
                      setRoomId('');
                    }}
                    disabled={!buildingId}
                    className="h-9 w-full rounded-lg border border-input bg-background px-2 text-xs font-normal disabled:opacity-50"
                  >
                    <option value="">Not specified</option>
                    {floors.map((floor) => (
                      <option key={floor.id} value={floor.id}>
                        L{floor.level} · {floor.name}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="space-y-1.5 text-xs font-medium">
                  <span className="flex items-center gap-1">
                    <DoorOpen className="h-3 w-3" /> Room
                  </span>
                  <select
                    value={roomId}
                    onChange={(event) => setRoomId(event.target.value)}
                    disabled={!floorId}
                    className="h-9 w-full rounded-lg border border-input bg-background px-2 text-xs font-normal disabled:opacity-50"
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
            </>
          ) : (
            <p className="mt-2 rounded-lg border border-border bg-muted/40 px-3 py-2 text-[11px] text-muted-foreground">
              Your role cannot browse the room directory. Describe your exact location in the note
              below so responders can find you.
            </p>
          )}

          <div className="mt-3">
            <Textarea
              label="What can you tell responders?"
              value={note}
              maxLength={1000}
              onChange={(event) => setNote(event.target.value)}
              placeholder="Describe the emergency, your exact location, how many people are affected, and any immediate danger."
              helper={`${note.length}/1000 characters. Do not include passwords or private student information.`}
            />
          </div>

          {error && (
            <p
              role="alert"
              className="mt-3 flex items-start gap-2 rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-xs text-danger"
            >
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              {error}
            </p>
          )}

          <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-border pt-3">
            <Button
              variant="destructive"
              onClick={() => setConfirming(true)}
              disabled={submitting}
            >
              <PhoneCall className="h-4 w-4" /> Raise SOS
            </Button>
            <p className="text-[11px] text-muted-foreground">
              You will be asked to confirm before anything is sent.
            </p>
          </div>
        </section>

        <aside className="space-y-3">
          <div className="rounded-xl border border-border bg-card p-4">
            <h2 className="text-sm font-semibold">Who will be alerted</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Within RADAR, an SOS creates a critical incident and notifies administrators and
              campus responders. Students and parents do not receive the alert.
            </p>
            <ul className="mt-2 space-y-1.5 text-[11px] text-muted-foreground">
              <li className="flex items-center gap-1.5">
                <ShieldCheck className="h-3.5 w-3.5 text-success" /> Administrators
              </li>
              <li className="flex items-center gap-1.5">
                <ShieldCheck className="h-3.5 w-3.5 text-success" /> Campus responders
              </li>
              <li className="flex items-center gap-1.5">
                <Info className="h-3.5 w-3.5" /> External emergency services are not contacted.
              </li>
            </ul>
          </div>

          <div className="rounded-xl border border-border bg-card p-4">
            <h2 className="text-sm font-semibold">Your account</h2>
            <dl className="mt-2 space-y-1.5 text-[11px]">
              <div className="flex justify-between gap-2">
                <dt className="text-muted-foreground">Name</dt>
                <dd className="font-medium">{user?.name}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-muted-foreground">Role</dt>
                <dd className="font-medium capitalize">{user?.role}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-muted-foreground">Phone</dt>
                <dd className="font-medium">{user?.phone || 'Not recorded'}</dd>
              </div>
            </dl>
            <p className="mt-2 text-[10px] text-muted-foreground">
              Responders see this account information on the incident record.
            </p>
          </div>

          <div className="rounded-xl border border-info/30 bg-info/5 p-3 text-[11px] text-muted-foreground">
            <Info className="mb-1 inline h-3.5 w-3.5 text-info" /> Accidental activations still
            create an incident. Tell a campus safety lead immediately if you raised an SOS by mistake.
          </div>
        </aside>
      </div>

      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title="Raise this SOS now?"
        description={`This records a critical ${selected.kindLabel.toLowerCase()} incident for ${
          selected.room
            ? `${selected.building?.name ?? 'Building'} · ${selected.room.code} ${selected.room.name}`
            : selected.building?.name ?? 'a location you described in the note'
        } and alerts campus safety leads inside RADAR. Emergency services will not be contacted automatically.`}
        confirmLabel="Raise SOS"
        destructive
        loading={submitting}
        onConfirm={submit}
      />
    </div>
  );
}
