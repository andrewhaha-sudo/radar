'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  CheckCircle2,
  Circle,
  Clock,
  Image as ImageIcon,
  Loader2,
  MapPin,
  MessageSquarePlus,
  Plus,
  ShieldCheck,
  Trash2,
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
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import {
  SeverityBadge,
  StatusBadge,
  absoluteTime,
  relativeTime,
} from '@/components/ui/hazard-bits';
import { ImageUpload } from '@/components/forms/ImageUpload';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { api, errorMessage } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { cn } from '@/components/ui/card';
import type {
  CorrectiveAction,
  HazardDetail,
  HazardStatus,
  Severity,
} from '@/lib/types';

const STATUS_OPTIONS: HazardStatus[] = ['new', 'pending_review', 'verified', 'in_progress', 'resolved'];
const SEVERITY_OPTIONS: Severity[] = ['critical', 'high', 'medium', 'low', 'info'];

export function HazardDetailDrawer({
  hazardId,
  onClose,
  onChanged,
}: {
  hazardId: number | null;
  onClose: () => void;
  onChanged: () => void;
}) {
  const { can, user } = useAuth();
  const [detail, setDetail] = useState<HazardDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [directory, setDirectory] = useState<Array<{ id: number; name: string; role: string }>>([]);
  const [lightbox, setLightbox] = useState<{ url: string; caption: string } | null>(null);
  const [confirm, setConfirm] = useState<{
    title: string;
    description: string;
    destructive?: boolean;
    action: () => Promise<void>;
  } | null>(null);
  const [actionDialogOpen, setActionDialogOpen] = useState(false);
  const [newAction, setNewAction] = useState({ title: '', ownerId: '', dueAt: '', notes: '' });

  const load = useCallback(async () => {
    if (!hazardId) return;
    setLoading(true);
    setError(null);
    try {
      const data = await api.get<HazardDetail>(`/api/hazards/${hazardId}`);
      setDetail(data);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [hazardId]);

  useEffect(() => {
    if (!hazardId) {
      setDetail(null);
      return;
    }
    void load();
    if (can('hazards:write')) {
      api
        .get<{ users: Array<{ id: number; name: string; role: string }> }>('/api/directory')
        .then((data) => setDirectory(data.users))
        .catch(() => setDirectory([]));
    }
  }, [hazardId, load, can]);

  const mutate = async (key: string, fn: () => Promise<unknown>) => {
    setBusy(key);
    try {
      await fn();
      await load();
      onChanged();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(null);
    }
  };

  const requestStatusChange = (status: HazardStatus) => {
    if (!detail) return;
    if (status === detail.hazard.status) return;
    const needsConfirm = status === 'verified' || status === 'resolved';
    if (!needsConfirm) {
      void mutate('status', () => api.patch(`/api/hazards/${detail.hazard.id}`, { status }));
      return;
    }
    setConfirm({
      title: status === 'verified' ? 'Verify this hazard?' : 'Mark this hazard resolved?',
      description:
        status === 'verified'
          ? 'Verification confirms the finding is accurate and should be acted on. This is recorded on the audit trail.'
          : 'Resolving closes the hazard. Corrective actions are not changed automatically. Add evidence before closing if work was completed.',
      action: async () => {
        await api.patch(`/api/hazards/${detail.hazard.id}`, { status });
        setConfirm(null);
      },
    });
  };

  const requestSeverityChange = (severity: Severity) => {
    if (!detail || severity === detail.hazard.severity) return;
    void mutate('severity', () => api.patch(`/api/hazards/${detail.hazard.id}`, { severity }));
  };

  const requestAssignment = (assignedTo: string) => {
    if (!detail) return;
    void mutate('assignee', () =>
      api.patch(`/api/hazards/${detail.hazard.id}`, { assignedTo: assignedTo ? Number(assignedTo) : null }),
    );
  };

  const addEvidence = async (url: string, file: File) => {
    if (!detail) return;
    await api.post(`/api/hazards/${detail.hazard.id}/evidence`, {
      url,
      caption: file.name.replace(/\.[^.]+$/, '').replace(/[-_]/g, ' '),
    });
    await load();
    onChanged();
  };

  const submitAction = async () => {
    if (!detail) return;
    if (!newAction.title.trim()) return;
    setBusy('newAction');
    try {
      await api.post(`/api/hazards/${detail.hazard.id}/actions`, {
        title: newAction.title.trim(),
        ownerId: newAction.ownerId ? Number(newAction.ownerId) : user?.id,
        dueAt: newAction.dueAt ? new Date(newAction.dueAt).toISOString() : null,
        notes: newAction.notes,
      });
      setNewAction({ title: '', ownerId: '', dueAt: '', notes: '' });
      setActionDialogOpen(false);
      await load();
      onChanged();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(null);
    }
  };

  const updateActionStatus = (action: CorrectiveAction, status: CorrectiveAction['status']) => {
    if (!detail) return;
    void mutate(`action-${action.id}`, () =>
      api.patch(`/api/hazards/${detail.hazard.id}/actions/${action.id}`, { status }),
    );
  };

  const hazard = detail?.hazard;
  const canWrite = can('hazards:write');
  const canVerify = can('hazards:verify');

  return (
    <>
      <Drawer open={hazardId !== null} onOpenChange={(open) => (!open ? onClose() : null)}>
        <DrawerContent side="right" size="xl" aria-describedby={undefined}>
          <DrawerHeader>
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground">
                {hazard?.ref ?? 'Hazard'}
              </span>
              {hazard && <SeverityBadge severity={hazard.severity} />}
              {hazard && <StatusBadge status={hazard.status} />}
              {hazard?.source === 'ai_assisted' && (
                <Badge variant="outline" className="text-[10px]">
                  AI-assisted — requires verification
                </Badge>
              )}
            </div>
            <DrawerTitle className="mt-2">{hazard?.title ?? 'Loading hazard…'}</DrawerTitle>
            <DrawerDescription>
              {detail?.context ? (
                <span className="inline-flex items-center gap-1">
                  <MapPin className="h-3.5 w-3.5" />
                  {detail.context.buildingName} · L{detail.context.floorLevel} · {detail.context.roomName}
                  {detail.context.code ? ` (${detail.context.code})` : ''}
                </span>
              ) : (
                'Location not assigned'
              )}
            </DrawerDescription>
          </DrawerHeader>

          <DrawerBody className="space-y-6">
            {error && (
              <div className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
                {error}
                <button onClick={() => void load()} className="ml-2 font-semibold underline">
                  Retry
                </button>
              </div>
            )}

            {loading && !detail ? (
              <div className="space-y-3">
                <Skeleton className="h-24 w-full" />
                <Skeleton className="h-16 w-full" />
                <Skeleton className="h-40 w-full" />
              </div>
            ) : detail && hazard ? (
              <>
                {/* Overview */}
                <section className="rounded-xl border border-border bg-muted/30 p-4">
                  <p className="whitespace-pre-line text-sm leading-relaxed text-foreground">
                    {hazard.description || 'No description was recorded with this hazard.'}
                  </p>
                  <dl className="mt-4 grid gap-3 text-xs sm:grid-cols-2">
                    <div>
                      <dt className="text-muted-foreground">Reported by</dt>
                      <dd className="font-medium">{hazard.reporter ?? 'Unknown'}</dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">Reported</dt>
                      <dd className="font-medium">{absoluteTime(hazard.createdAt)}</dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">Assigned to</dt>
                      <dd className="font-medium">{hazard.assignee ?? 'Unassigned'}</dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">Last updated</dt>
                      <dd className="font-medium">{relativeTime(hazard.updatedAt)}</dd>
                    </div>
                  </dl>
                </section>

                {/* Management */}
                {canWrite && (
                  <section className="space-y-3 rounded-xl border border-border p-4">
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      Manage record
                    </h3>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="space-y-1.5">
                        <label className="text-xs font-medium text-muted-foreground" htmlFor="hazard-status">
                          Status
                        </label>
                        <select
                          id="hazard-status"
                          value={hazard.status}
                          onChange={(e) => requestStatusChange(e.target.value as HazardStatus)}
                          disabled={busy === 'status'}
                          className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm"
                        >
                          {STATUS_OPTIONS.map((status) => (
                            <option
                              key={status}
                              value={status}
                              disabled={(status === 'verified' || status === 'resolved') && !canVerify}
                            >
                              {status.replace(/_/g, ' ')}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-xs font-medium text-muted-foreground" htmlFor="hazard-severity">
                          Severity
                        </label>
                        <select
                          id="hazard-severity"
                          value={hazard.severity}
                          onChange={(e) => requestSeverityChange(e.target.value as Severity)}
                          disabled={busy === 'severity'}
                          className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm"
                        >
                          {SEVERITY_OPTIONS.map((severity) => (
                            <option key={severity} value={severity}>
                              {severity}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="space-y-1.5 sm:col-span-2">
                        <label className="text-xs font-medium text-muted-foreground" htmlFor="hazard-assignee">
                          Assignment
                        </label>
                        <select
                          id="hazard-assignee"
                          value={directory.find((u) => u.name === hazard.assignee)?.id ?? ''}
                          onChange={(e) => requestAssignment(e.target.value)}
                          disabled={busy === 'assignee'}
                          className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm"
                        >
                          <option value="">Unassigned</option>
                          {directory.map((member) => (
                            <option key={member.id} value={member.id}>
                              {member.name} · {member.role}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                    {!canVerify && (
                      <p className="text-[11px] text-muted-foreground">
                        Your role can record and update hazards but cannot verify or resolve them.
                      </p>
                    )}
                  </section>
                )}

                {/* Evidence */}
                <section className="space-y-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      <ImageIcon className="h-3.5 w-3.5" /> Evidence ({detail.evidence.length})
                    </h3>
                  </div>

                  {detail.evidence.length === 0 ? (
                    <p className="rounded-lg border border-dashed border-border px-3 py-4 text-xs text-muted-foreground">
                      No evidence attached yet.
                    </p>
                  ) : (
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                      {detail.evidence.map((item) => (
                        <figure
                          key={item.id}
                          className="group relative overflow-hidden rounded-lg border border-border bg-muted"
                        >
                          <button
                            onClick={() => setLightbox({ url: item.url, caption: item.caption })}
                            className="block aspect-[4/3] w-full"
                            aria-label={`View evidence: ${item.caption || 'inspection image'}`}
                          >
                            <img
                              src={item.url}
                              alt={item.caption || 'Hazard evidence'}
                              className="h-full w-full object-cover transition-transform group-hover:scale-105"
                              loading="lazy"
                            />
                          </button>
                          <figcaption className="px-2 py-1.5 text-[10px] text-muted-foreground">
                            <span className="line-clamp-1">{item.caption || 'Untitled'}</span>
                            <span className="block">by {item.uploadedByName ?? 'Unknown'}</span>
                          </figcaption>
                          {canWrite && (
                            <button
                              onClick={() =>
                                setConfirm({
                                  title: 'Remove this evidence?',
                                  description: 'The image file stays on disk, but it will no longer be linked to this hazard.',
                                  destructive: true,
                                  action: async () => {
                                    await api.del(`/api/hazards/${hazard.id}/evidence/${item.id}`);
                                    setConfirm(null);
                                  },
                                })
                              }
                              className="absolute right-1.5 top-1.5 grid h-7 w-7 place-items-center rounded-md bg-black/60 text-white opacity-0 transition-opacity group-hover:opacity-100 focus:opacity-100"
                              aria-label="Remove evidence"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </figure>
                      ))}
                    </div>
                  )}

                  {canWrite && (
                    <ImageUpload
                      compact
                      label="Attach evidence"
                      onUploaded={addEvidence}
                    />
                  )}
                </section>

                {/* Corrective actions */}
                <section className="space-y-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      <Wrench className="h-3.5 w-3.5" /> Corrective actions ({detail.actions.length})
                    </h3>
                    {canWrite && (
                      <Button size="sm" variant="outline" onClick={() => setActionDialogOpen(true)}>
                        <Plus className="h-3.5 w-3.5" /> Add action
                      </Button>
                    )}
                  </div>

                  {detail.actions.length === 0 ? (
                    <p className="rounded-lg border border-dashed border-border px-3 py-4 text-xs text-muted-foreground">
                      No corrective actions recorded.
                    </p>
                  ) : (
                    <ul className="space-y-2">
                      {detail.actions.map((action) => (
                        <li key={action.id} className="rounded-lg border border-border p-3">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <p
                                className={cn(
                                  'text-sm font-medium',
                                  action.status === 'done' && 'text-muted-foreground line-through',
                                )}
                              >
                                {action.title}
                              </p>
                              <p className="mt-0.5 text-[11px] text-muted-foreground">
                                {action.ownerName ?? 'Unassigned'}
                                {action.dueAt ? ` · due ${absoluteTime(action.dueAt)}` : ''}
                              </p>
                              {action.notes && (
                                <p className="mt-1 text-[11px] text-muted-foreground">{action.notes}</p>
                              )}
                            </div>
                            <Badge
                              variant={action.status === 'done' ? 'success' : action.status === 'in_progress' ? 'warning' : 'outline'}
                              className="shrink-0 capitalize"
                            >
                              {action.status.replace(/_/g, ' ')}
                            </Badge>
                          </div>
                          {canWrite && action.status !== 'done' && (
                            <div className="mt-2 flex gap-1.5">
                              {action.status === 'open' && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  loading={busy === `action-${action.id}`}
                                  onClick={() => updateActionStatus(action, 'in_progress')}
                                >
                                  Start
                                </Button>
                              )}
                              <Button
                                size="sm"
                                variant="outline"
                                loading={busy === `action-${action.id}`}
                                onClick={() =>
                                  setConfirm({
                                    title: 'Mark this action complete?',
                                    description:
                                      'Record completion only when the work has actually been carried out. This is added to the hazard timeline.',
                                    action: async () => {
                                      await api.patch(`/api/hazards/${hazard.id}/actions/${action.id}`, {
                                        status: 'done',
                                      });
                                      setConfirm(null);
                                    },
                                  })
                                }
                              >
                                <CheckCircle2 className="h-3.5 w-3.5" /> Complete
                              </Button>
                            </div>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </section>

                {/* Timeline */}
                <section className="space-y-3">
                  <h3 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    <Clock className="h-3.5 w-3.5" /> Status timeline
                  </h3>
                  <ol className="relative space-y-3 border-l border-border pl-5">
                    {detail.timeline.map((event) => (
                      <li key={event.id} className="relative">
                        <span className="absolute -left-[26px] top-0.5 grid h-4 w-4 place-items-center rounded-full border border-border bg-card">
                          <Circle className="h-2 w-2 fill-accent-foreground text-accent-foreground" />
                        </span>
                        <p className="text-xs font-medium capitalize text-foreground">
                          {event.type.replace(/_/g, ' ')}
                        </p>
                        <p className="text-xs text-muted-foreground">{event.note}</p>
                        <p className="mt-0.5 text-[10px] text-muted-foreground">
                          {event.actorName ?? 'System'} · {absoluteTime(event.createdAt)}
                        </p>
                      </li>
                    ))}
                  </ol>
                </section>

                <p className="rounded-lg border border-border bg-muted/40 px-3 py-2 text-[11px] text-muted-foreground">
                  <ShieldCheck className="mr-1 inline h-3.5 w-3.5" />
                  Every change to this record is written to the audit log with the acting user and timestamp.
                </p>
              </>
            ) : error ? null : (
              <div className="grid place-items-center py-12 text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin" />
              </div>
            )}
          </DrawerBody>
        </DrawerContent>
      </Drawer>

      {/* Evidence lightbox */}
      <Dialog open={lightbox !== null} onOpenChange={(open) => (!open ? setLightbox(null) : null)}>
        <DialogContent className="max-w-4xl p-3" aria-describedby={undefined}>
          {lightbox && (
            <div className="space-y-2">
              <img
                src={lightbox.url}
                alt={lightbox.caption || 'Hazard evidence'}
                className="max-h-[70svh] w-full rounded-lg object-contain"
              />
              <p className="px-1 text-xs text-muted-foreground">{lightbox.caption || 'Untitled evidence'}</p>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Add corrective action */}
      <Dialog open={actionDialogOpen} onOpenChange={setActionDialogOpen}>
        <DialogContent aria-describedby={undefined}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <MessageSquarePlus className="h-4 w-4" /> Add corrective action
            </DialogTitle>
            <DialogDescription>
              Describe the work required and who owns it. Due dates are advisory and shown on the record.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Input
              label="Action"
              required
              value={newAction.title}
              onChange={(e) => setNewAction((p) => ({ ...p, title: e.target.value }))}
              placeholder="e.g. Replace the damaged cable run"
            />
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <label className="text-sm font-medium" htmlFor="action-owner">
                  Owner
                </label>
                <select
                  id="action-owner"
                  value={newAction.ownerId}
                  onChange={(e) => setNewAction((p) => ({ ...p, ownerId: e.target.value }))}
                  className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm"
                >
                  <option value="">Me ({user?.name})</option>
                  {directory.map((member) => (
                    <option key={member.id} value={member.id}>
                      {member.name} · {member.role}
                    </option>
                  ))}
                </select>
              </div>
              <Input
                label="Due date"
                type="date"
                value={newAction.dueAt}
                onChange={(e) => setNewAction((p) => ({ ...p, dueAt: e.target.value }))}
              />
            </div>
            <Input
              label="Notes"
              value={newAction.notes}
              onChange={(e) => setNewAction((p) => ({ ...p, notes: e.target.value }))}
              placeholder="Optional context for the owner"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setActionDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => void submitAction()}
              loading={busy === 'newAction'}
              disabled={!newAction.title.trim()}
            >
              Add action
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={confirm !== null}
        onOpenChange={(open) => (!open ? setConfirm(null) : null)}
        title={confirm?.title ?? ''}
        description={confirm?.description ?? ''}
        destructive={confirm?.destructive}
        loading={busy !== null}
        onConfirm={async () => {
          if (!confirm) return;
          setBusy('confirm');
          try {
            await confirm.action();
            await load();
            onChanged();
          } catch (err) {
            setError(errorMessage(err));
          } finally {
            setBusy(null);
          }
        }}
      />
    </>
  );
}
