'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Building2,
  CheckCircle2,
  Clock,
  DoorOpen,
  HandHeart,
  Lock,
  MapPin,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  Users,
} from 'lucide-react';
import { PageHeader } from '@/components/ui/page-header';
import { StatCard } from '@/components/ui/stat-card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Textarea } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { relativeTime, absoluteTime } from '@/components/ui/hazard-bits';
import { api, errorMessage } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { cn } from '@/components/ui/card';
import type {
  MapPayload,
  Room,
  SafetyCheck,
  SafetyMePayload,
  SafetyStatusPayload,
} from '@/lib/types';

type CheckStatus = 'safe' | 'need_help';

function statusStyles(status: CheckStatus) {
  return status === 'safe'
    ? { label: 'I’m safe', className: 'border-success/40 bg-success/10 text-success', hex: '#22C55E' }
    : { label: 'I need help', className: 'border-danger/40 bg-danger/10 text-danger', hex: '#EF4444' };
}

export function SafetyStatusPage() {
  const { can } = useAuth();
  const canSeeOthers = can('safety:read');
  const canBuildings = can('buildings:read');

  const [me, setMe] = useState<SafetyMePayload | null>(null);
  const [board, setBoard] = useState<SafetyStatusPayload | null>(null);
  const [buildings, setBuildings] = useState<MapPayload['buildings']>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [status, setStatus] = useState<CheckStatus>('safe');
  const [note, setNote] = useState('');
  const [sharing, setSharing] = useState(true);
  const [buildingId, setBuildingId] = useState('');
  const [roomId, setRoomId] = useState('');
  const [filter, setFilter] = useState<'all' | CheckStatus>('all');
  const [clearOpen, setClearOpen] = useState(false);
  const [clearing, setClearing] = useState(false);

  const hydrate = useCallback((payload: SafetyMePayload | null) => {
    setMe(payload);
    if (!payload?.check) {
      setStatus('safe');
      setNote('');
      setSharing(true);
      setBuildingId('');
      setRoomId('');
      return;
    }
    setStatus(payload.check.status);
    setNote(payload.check.note ?? '');
    setSharing(payload.check.sharing);
    setBuildingId(payload.check.buildingId ? String(payload.check.buildingId) : '');
    setRoomId(payload.check.roomId ? String(payload.check.roomId) : '');
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [mine, map] = await Promise.all([
        api.get<SafetyMePayload>('/api/safety/me'),
        api.get<MapPayload>('/api/map'),
      ]);
      hydrate(mine);
      setBuildings(map.buildings);
      if (canSeeOthers) {
        const payload = await api.get<SafetyStatusPayload>('/api/safety/status');
        setBoard(payload);
      }
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [canSeeOthers, hydrate]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!canBuildings || !buildingId) {
      setRooms([]);
      return;
    }
    let cancelled = false;
    api
      .get<{ rooms: Room[] }>(`/api/buildings/${buildingId}`)
      .then((payload) => {
        if (!cancelled) setRooms(payload.rooms);
      })
      .catch(() => {
        if (!cancelled) setRooms([]);
      });
    return () => {
      cancelled = true;
    };
  }, [buildingId, canBuildings]);

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const payload = await api.post<SafetyMePayload & { message: string }>('/api/safety/check', {
        status,
        note: note.trim(),
        sharing,
        buildingId: sharing && buildingId ? Number(buildingId) : null,
        roomId: sharing && roomId ? Number(roomId) : null,
        ttlHours: 4,
      });
      hydrate(payload);
      setNotice(payload.message);
      if (canSeeOthers) {
        const updated = await api.get<SafetyStatusPayload>('/api/safety/status');
        setBoard(updated);
      }
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const clear = async () => {
    setClearing(true);
    try {
      await api.del('/api/safety/me');
      hydrate(null);
      setClearOpen(false);
      setNotice('Your safety check-in was removed.');
      if (canSeeOthers) {
        const updated = await api.get<SafetyStatusPayload>('/api/safety/status');
        setBoard(updated);
      }
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setClearing(false);
    }
  };

  const visibleChecks = useMemo(() => {
    if (!board) return [];
    return filter === 'all' ? board.checks : board.checks.filter((check) => check.status === filter);
  }, [board, filter]);

  const myCheck = me?.check ?? null;
  const myExpired = Boolean(myCheck?.expiresAt && myCheck.expiresAt <= new Date().toISOString());

  return (
    <div className="stack-page space-y-5">
      <PageHeader
        eyebrow="Safety status"
        title="Check in, share only what you choose"
        description="During an emergency, report whether you are safe or need help. Location sharing is optional, time-limited and visible only to authorized staff. This is not a call to emergency services."
        icon={ShieldCheck}
        actions={
          <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
            <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} /> Refresh
          </Button>
        }
      />

      {error && (
        <div className="rounded-xl border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger">
          {error}
        </div>
      )}
      {notice && (
        <div className="rounded-xl border border-success/30 bg-success/10 px-4 py-3 text-sm text-success">
          {notice}
        </div>
      )}

      {loading && !me ? (
        <div className="space-y-3">
          <Skeleton className="h-64 w-full" />
          <Skeleton className="h-32 w-full" />
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[1.05fr_1.4fr]">
          <Card hover={false} className="p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold">Your check-in</h2>
                <p className="text-xs text-muted-foreground">
                  {myCheck
                    ? `Last updated ${relativeTime(myCheck.updatedAt)}`
                    : 'You have not checked in yet.'}
                </p>
              </div>
              {myCheck && (
                <span
                  className={cn(
                    'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold',
                    myExpired
                      ? 'border-border bg-muted text-muted-foreground'
                      : statusStyles(myCheck.status).className,
                  )}
                >
                  {myCheck.status === 'safe' ? <CheckCircle2 className="h-3 w-3" /> : <HandHeart className="h-3 w-3" />}
                  {myExpired ? 'Expired check-in' : statusStyles(myCheck.status).label}
                </span>
              )}
            </div>

            <form onSubmit={save} className="mt-4 space-y-4">
              <div>
                <p className="mb-1.5 text-sm font-medium">How are you?</p>
                <div className="grid grid-cols-2 gap-2">
                  {(['safe', 'need_help'] as CheckStatus[]).map((option) => {
                    const styles = statusStyles(option);
                    const active = status === option;
                    return (
                      <button
                        key={option}
                        type="button"
                        onClick={() => setStatus(option)}
                        aria-pressed={active}
                        className={cn(
                          'flex flex-col items-start gap-1 rounded-xl border px-3 py-3 text-left transition-all',
                          active
                            ? 'shadow-sm ring-1 ring-inset'
                            : 'border-border bg-background opacity-80 hover:opacity-100',
                        )}
                        style={
                          active
                            ? {
                                borderColor: `${styles.hex}77`,
                                background: `${styles.hex}14`,
                                color: styles.hex,
                              }
                            : undefined
                        }
                      >
                        {option === 'safe' ? (
                          <CheckCircle2 className="h-4 w-4" />
                        ) : (
                          <HandHeart className="h-4 w-4" />
                        )}
                        <span className="text-sm font-semibold">{styles.label}</span>
                        <span className="text-[11px] leading-snug opacity-80">
                          {option === 'safe'
                            ? 'You are accounted for.'
                            : 'Campus safety leads are notified in-app.'}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <Textarea
                label="Note (optional)"
                placeholder="e.g. With Grade 11-A at the north field."
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={2}
                maxLength={500}
              />

              <label className="flex items-start gap-2.5 rounded-lg border border-border bg-muted/30 p-3">
                <input
                  type="checkbox"
                  checked={sharing}
                  onChange={(e) => {
                    setSharing(e.target.checked);
                    if (!e.target.checked) {
                      setBuildingId('');
                      setRoomId('');
                    }
                  }}
                  className="mt-0.5 h-4 w-4 accent-[var(--accent-solid)]"
                />
                <span>
                  <span className="block text-xs font-medium text-foreground">
                    Share my approximate location
                  </span>
                  <span className="block text-[11px] leading-snug text-muted-foreground">
                    Expires in 4 hours and can be stopped at any time. Building and room are self-reported, not
                    GPS-verified.
                  </span>
                </span>
              </label>

              {sharing && (
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="space-y-1.5 text-sm">
                    <span className="font-medium">Building</span>
                    <select
                      value={buildingId}
                      onChange={(e) => {
                        setBuildingId(e.target.value);
                        setRoomId('');
                      }}
                      className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm"
                    >
                      <option value="">Not specified</option>
                      {buildings.map((building) => (
                        <option key={building.id} value={building.id}>
                          {building.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  {canBuildings && (
                    <label className="space-y-1.5 text-sm">
                      <span className="font-medium">Room</span>
                      <select
                        value={roomId}
                        onChange={(e) => setRoomId(e.target.value)}
                        disabled={!buildingId}
                        className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm disabled:opacity-50"
                      >
                        <option value="">Not specified</option>
                        {rooms.map((room) => (
                          <option key={room.id} value={room.id}>
                            {room.code} — {room.name}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}
                </div>
              )}

              <div className="flex flex-wrap items-center gap-2">
                <Button type="submit" loading={saving} className="flex-1 sm:flex-none">
                  <ShieldCheck className="h-4 w-4" />
                  {myCheck ? 'Update check-in' : 'Record check-in'}
                </Button>
                {myCheck && (
                  <Button type="button" variant="outline" onClick={() => setClearOpen(true)}>
                    Stop sharing & clear
                  </Button>
                )}
              </div>
            </form>

            {myCheck?.expiresAt && (
              <p className="mt-3 flex items-center gap-1.5 text-[11px] text-muted-foreground">
                <Clock className="h-3 w-3" />
                {myExpired ? 'This check-in has expired.' : `Expires ${absoluteTime(myCheck.expiresAt)}.`}
              </p>
            )}

            <div className="mt-4 rounded-lg border border-border bg-muted/40 p-3 text-[11px] leading-relaxed text-muted-foreground">
              <p className="flex items-start gap-1.5 font-medium text-foreground">
                <Lock className="mt-0.5 h-3 w-3 shrink-0" /> Privacy
              </p>
              <p className="mt-1">
                Only you and authorized campus safety staff can see your check-in. GPS alone cannot prove that
                someone is safe or inside a particular room.
              </p>
            </div>
          </Card>

          {canSeeOthers ? (
            <div className="space-y-4">
              <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <StatCard
                  label="Checked in"
                  value={board?.counts.total ?? 0}
                  hint="Current records"
                  icon={Users}
                  tone="info"
                />
                <StatCard
                  label="Reported safe"
                  value={board?.counts.safe ?? 0}
                  hint="Accounted for"
                  icon={CheckCircle2}
                  tone="success"
                />
                <StatCard
                  label="Need help"
                  value={board?.counts.needHelp ?? 0}
                  hint="Requires follow-up"
                  icon={HandHeart}
                  tone="danger"
                />
                <StatCard
                  label="Stale / expired"
                  value={board?.counts.stale ?? 0}
                  hint="Confirm before relying on it"
                  icon={Clock}
                  tone="warning"
                />
              </section>

              <Card hover={false} className="overflow-hidden">
                <div className="flex flex-wrap items-center gap-2 border-b border-border px-3 py-2.5">
                  <div className="flex gap-1" role="tablist" aria-label="Filter safety checks">
                    {(
                      [
                        { id: 'all', label: 'All' },
                        { id: 'need_help', label: 'Need help' },
                        { id: 'safe', label: 'Safe' },
                      ] as const
                    ).map((item) => (
                      <button
                        key={item.id}
                        onClick={() => setFilter(item.id)}
                        role="tab"
                        aria-selected={filter === item.id}
                        className={cn(
                          'rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors',
                          filter === item.id
                            ? 'bg-primary text-primary-foreground'
                            : 'text-muted-foreground hover:bg-accent hover:text-foreground',
                        )}
                      >
                        {item.label}
                      </button>
                    ))}
                  </div>
                  <span className="ml-auto text-[11px] text-muted-foreground">
                    Staff view · {visibleChecks.length} records
                  </span>
                </div>
                {visibleChecks.length === 0 ? (
                  <div className="px-4 py-10 text-center">
                    <ShieldCheck className="mx-auto mb-2 h-7 w-7 text-muted-foreground" />
                    <p className="text-sm font-medium">No check-ins in this view</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Check-ins appear here as people report their status.
                    </p>
                  </div>
                ) : (
                  <ul className="divide-y divide-border">
                    {visibleChecks.map((check) => (
                      <SafetyRow key={check.id} check={check} />
                    ))}
                  </ul>
                )}
              </Card>

              <p className="rounded-lg border border-warning/30 bg-warning/10 px-3 py-2 text-[11px] leading-relaxed text-warning">
                A check-in is not proof of safety. “Need help” is a request for campus follow-up, not a confirmed
                rescue. Escalate through your emergency plan and call local emergency services when required.
              </p>
            </div>
          ) : (
            <Card hover={false} className="flex flex-col justify-center p-6">
              <span className="grid h-11 w-11 place-items-center rounded-xl bg-accent text-accent-foreground">
                <MapPin className="h-5 w-5" />
              </span>
              <h2 className="mt-3 text-sm font-semibold">Your status stays private</h2>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                Students and guardians can record their own status. The campus-wide safety board is limited to
                authorized staff roles. If you are in immediate danger, call your local emergency number.
              </p>
              <div className="mt-4 space-y-2 text-xs">
                <a href="/evacuation" className="flex items-center gap-2 font-medium text-accent-foreground hover:underline">
                  <DoorOpen className="h-3.5 w-3.5" /> View evacuation routes
                </a>
                <a href="/alerts" className="flex items-center gap-2 font-medium text-accent-foreground hover:underline">
                  <ShieldAlert className="h-3.5 w-3.5" /> Read the alert board
                </a>
              </div>
            </Card>
          )}
        </div>
      )}

      <ConfirmDialog
        open={clearOpen}
        onOpenChange={setClearOpen}
        title="Clear your check-in?"
        description="Your status and any shared location will be removed. Campus safety staff will no longer see a current check-in from you."
        confirmLabel="Clear check-in"
        destructive
        loading={clearing}
        onConfirm={clear}
      />
    </div>
  );
}

function SafetyRow({ check }: { check: SafetyCheck }) {
  const styles = statusStyles(check.status);
  return (
    <li className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-start">
      <span
        className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-full"
        style={{ background: `${styles.hex}18`, color: styles.hex }}
      >
        {check.status === 'safe' ? <CheckCircle2 className="h-4 w-4" /> : <HandHeart className="h-4 w-4" />}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-semibold">{check.userName}</span>
          <Badge variant="outline" className="capitalize">
            {check.userRole}
          </Badge>
          <span
            className={cn(
              'inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold',
              check.expired || check.stale
                ? 'border-border bg-muted text-muted-foreground'
                : check.status === 'safe'
                  ? 'border-success/30 bg-success/10 text-success'
                  : 'border-danger/30 bg-danger/10 text-danger',
            )}
          >
            {check.expired ? 'Expired' : check.stale ? 'Stale' : styles.label}
          </span>
        </div>
        <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <Clock className="h-3 w-3" /> {relativeTime(check.updatedAt)}
          </span>
          {check.sharing ? (
            <span className="inline-flex items-center gap-1">
              <Building2 className="h-3 w-3" />
              {check.buildingName ?? 'Building not specified'}
              {check.roomName ? ` · ${check.roomName}` : ''}
            </span>
          ) : (
            <span className="inline-flex items-center gap-1">
              <Lock className="h-3 w-3" /> Location not shared
            </span>
          )}
        </div>
        {check.note && <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{check.note}</p>}
      </div>
      {check.status === 'need_help' && !check.expired && (
        <span className="inline-flex shrink-0 items-center gap-1 rounded-md border border-danger/30 bg-danger/10 px-2 py-1 text-[10px] font-semibold text-danger">
          <AlertTriangle className="h-3 w-3" /> Follow up
        </span>
      )}
    </li>
  );
}
