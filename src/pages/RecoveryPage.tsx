'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Building2,
  CheckCircle2,
  ClipboardList,
  DoorClosed,
  DoorOpen,
  Download,
  Flag,
  ListChecks,
  Plus,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  Timer,
  UserRound,
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
import { SEVERITY_META, SeverityBadge, absoluteTime, relativeTime } from '@/components/ui/hazard-bits';
import { api, errorMessage } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { cn } from '@/components/ui/card';
import type {
  Building,
  DamageAssessment,
  RecoveryPayload,
  RecoveryTask,
  Room,
  Severity,
} from '@/lib/types';

type TaskStatus = 'open' | 'in_progress' | 'done';

const TASK_STATUS_META: Record<TaskStatus, { label: string; className: string }> = {
  open: { label: 'Open', className: 'border-info/30 bg-info/10 text-info' },
  in_progress: { label: 'In progress', className: 'border-warning/30 bg-warning/10 text-warning' },
  done: { label: 'Done', className: 'border-success/30 bg-success/10 text-success' },
};

const DAMAGE_META: Record<
  DamageAssessment['damageLevel'],
  { label: string; className: string; hint: string }
> = {
  none: { label: 'No damage', className: 'border-success/30 bg-success/10 text-success', hint: 'No visible damage recorded.' },
  minor: { label: 'Minor', className: 'border-warning/30 bg-warning/10 text-warning', hint: 'Cosmetic or limited damage.' },
  moderate: { label: 'Moderate', className: 'border-warning/30 bg-warning/10 text-warning', hint: 'Repairs required before normal use.' },
  severe: { label: 'Severe', className: 'border-danger/30 bg-danger/10 text-danger', hint: 'Unsafe until repaired and cleared.' },
};

const CLEARANCE_META: Record<
  DamageAssessment['clearance'],
  { label: string; className: string; description: string }
> = {
  pending: {
    label: 'Pending',
    className: 'border-info/30 bg-info/10 text-info',
    description: 'Assessment recorded; no clearance decision yet.',
  },
  restricted: {
    label: 'Restricted',
    className: 'border-danger/30 bg-danger/10 text-danger',
    description: 'Access limited until cleared by an authorized assessor.',
  },
  cleared: {
    label: 'Cleared',
    className: 'border-success/30 bg-success/10 text-success',
    description: 'Assessor confirms the area can return to use.',
  },
};

const PRIORITIES: Severity[] = ['critical', 'high', 'medium', 'low'];

function emptyTask() {
  return {
    title: '',
    description: '',
    incidentId: '',
    ownerId: '',
    priority: 'medium' as Severity,
    dueAt: '',
  };
}

function emptyAssessment() {
  return {
    incidentId: '',
    buildingId: '',
    roomId: '',
    damageLevel: 'none' as DamageAssessment['damageLevel'],
    clearance: 'pending' as DamageAssessment['clearance'],
    notes: '',
  };
}

export function RecoveryPage() {
  const { can, user } = useAuth();
  const canWrite = can('recovery:write');

  const [data, setData] = useState<RecoveryPayload | null>(null);
  const [buildings, setBuildings] = useState<Building[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [directory, setDirectory] = useState<Array<{ id: number; name: string; role: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [incidentFilter, setIncidentFilter] = useState<'all' | number>('all');
  const [tab, setTab] = useState<'tasks' | 'assessments'>('tasks');
  const [taskStatusFilter, setTaskStatusFilter] = useState<'all' | TaskStatus>('all');

  const [taskOpen, setTaskOpen] = useState(false);
  const [taskForm, setTaskForm] = useState(emptyTask);
  const [taskError, setTaskError] = useState<string | null>(null);
  const [savingTask, setSavingTask] = useState(false);

  const [assessmentOpen, setAssessmentOpen] = useState(false);
  const [assessmentForm, setAssessmentForm] = useState(emptyAssessment);
  const [assessmentError, setAssessmentError] = useState<string | null>(null);
  const [savingAssessment, setSavingAssessment] = useState(false);

  const [completeTarget, setCompleteTarget] = useState<RecoveryTask | null>(null);
  const [completing, setCompleting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const payload = await api.get<RecoveryPayload>('/api/recovery');
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
    if (!can('buildings:read')) return;
    api
      .get<{ buildings: Building[]; rooms: Room[] }>('/api/buildings')
      .then((payload) => {
        setBuildings(payload.buildings);
        setRooms(payload.rooms);
      })
      .catch(() => undefined);
  }, [can]);

  useEffect(() => {
    if (!canWrite) return;
    api
      .get<{ users: Array<{ id: number; name: string; role: string }> }>('/api/directory')
      .then((payload) => setDirectory(payload.users))
      .catch(() => setDirectory([]));
  }, [canWrite]);

  const filteredTasks = useMemo(() => {
    if (!data) return [];
    return data.tasks.filter((task) => {
      if (incidentFilter !== 'all' && task.incidentId !== incidentFilter) return false;
      if (taskStatusFilter !== 'all' && task.status !== taskStatusFilter) return false;
      return true;
    });
  }, [data, incidentFilter, taskStatusFilter]);

  const filteredAssessments = useMemo(() => {
    if (!data) return [];
    return data.assessments.filter(
      (assessment) => incidentFilter === 'all' || assessment.incidentId === incidentFilter,
    );
  }, [data, incidentFilter]);

  const openTask = () => {
    setTaskForm({
      ...emptyTask(),
      incidentId:
        incidentFilter !== 'all'
          ? String(incidentFilter)
          : data?.incidents.find((incident) => incident.status === 'active')?.id
            ? String(data.incidents.find((incident) => incident.status === 'active')?.id)
            : '',
      ownerId: user ? String(user.id) : '',
    });
    setTaskError(null);
    setTaskOpen(true);
  };

  const createTask = async (event: React.FormEvent) => {
    event.preventDefault();
    setTaskError(null);
    if (!taskForm.title.trim()) {
      setTaskError('Give the recovery task a clear title.');
      return;
    }
    setSavingTask(true);
    try {
      await api.post('/api/recovery/tasks', {
        title: taskForm.title.trim(),
        description: taskForm.description.trim(),
        incidentId: taskForm.incidentId ? Number(taskForm.incidentId) : null,
        ownerId: taskForm.ownerId ? Number(taskForm.ownerId) : null,
        priority: taskForm.priority,
        dueAt: taskForm.dueAt ? new Date(taskForm.dueAt).toISOString() : null,
      });
      setTaskOpen(false);
      setNotice('Recovery task created and assigned.');
      await load();
    } catch (err) {
      setTaskError(errorMessage(err));
    } finally {
      setSavingTask(false);
    }
  };

  const setTaskStatus = async (task: RecoveryTask, status: TaskStatus) => {
    if (status === task.status) return;
    setError(null);
    try {
      await api.patch(`/api/recovery/tasks/${task.id}`, { status });
      setNotice(`${task.title} moved to ${TASK_STATUS_META[status].label.toLowerCase()}.`);
      await load();
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  const completeTask = async () => {
    if (!completeTarget) return;
    setCompleting(true);
    try {
      await api.patch(`/api/recovery/tasks/${completeTarget.id}`, { status: 'done' });
      setCompleteTarget(null);
      setNotice('Recovery task marked complete.');
      await load();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setCompleting(false);
    }
  };

  const openAssessment = () => {
    setAssessmentForm({
      ...emptyAssessment(),
      incidentId:
        incidentFilter !== 'all'
          ? String(incidentFilter)
          : data?.incidents.find((incident) => incident.status === 'active')?.id
            ? String(data.incidents.find((incident) => incident.status === 'active')?.id)
            : '',
    });
    setAssessmentError(null);
    setAssessmentOpen(true);
  };

  const submitAssessment = async (event: React.FormEvent) => {
    event.preventDefault();
    setAssessmentError(null);
    if (!assessmentForm.buildingId) {
      setAssessmentError('Select the building that was assessed.');
      return;
    }
    setSavingAssessment(true);
    try {
      await api.post('/api/recovery/assessments', {
        incidentId: assessmentForm.incidentId ? Number(assessmentForm.incidentId) : null,
        buildingId: Number(assessmentForm.buildingId),
        roomId: assessmentForm.roomId ? Number(assessmentForm.roomId) : null,
        damageLevel: assessmentForm.damageLevel,
        clearance: assessmentForm.clearance,
        notes: assessmentForm.notes.trim(),
      });
      setAssessmentOpen(false);
      setNotice(
        assessmentForm.clearance === 'restricted'
          ? 'Assessment recorded and the area marked restricted. Staff were notified.'
          : 'Damage assessment recorded.',
      );
      await load();
    } catch (err) {
      setAssessmentError(errorMessage(err));
    } finally {
      setSavingAssessment(false);
    }
  };

  const buildingName = useCallback(
    (id: number | null) => buildings.find((building) => building.id === id)?.name ?? `Building ${id}`,
    [buildings],
  );

  const roomsForAssessment = useMemo(() => {
    if (!assessmentForm.buildingId) return [];
    return rooms.filter((room) => room.buildingId === Number(assessmentForm.buildingId));
  }, [rooms, assessmentForm.buildingId]);

  return (
    <div className="stack-page space-y-5">
      <PageHeader
        eyebrow="Recovery & damage assessment"
        title="From stand-down to cleared for use"
        description="Track repairs, inspections and clearance decisions after an incident. A clearance is a recorded human decision with an assessor and timestamp — it is not an automated safety guarantee."
        icon={ClipboardList}
        actions={
          <>
            <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
              <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} /> Refresh
            </Button>
            <Button variant="outline" size="sm" asChild>
              <a href="/api/analytics/export?dataset=hazards">
                <Download className="h-4 w-4" /> Hazards CSV
              </a>
            </Button>
            {canWrite && (
              <>
                <Button variant="outline" size="sm" onClick={openAssessment}>
                  <ShieldCheck className="h-4 w-4" /> Assess damage
                </Button>
                <Button size="sm" onClick={openTask}>
                  <Plus className="h-4 w-4" /> New task
                </Button>
              </>
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
          <Skeleton className="h-96 w-full" />
        </div>
      ) : data ? (
        <>
          <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard
              label="Open tasks"
              value={data.summary.open}
              hint={`${data.summary.inProgress} in progress`}
              icon={ListChecks}
              tone="info"
            />
            <StatCard
              label="Overdue"
              value={data.summary.overdue}
              hint="Past due and not complete"
              icon={Timer}
              tone={data.summary.overdue ? 'danger' : 'neutral'}
            />
            <StatCard
              label="Restricted areas"
              value={data.summary.restricted}
              hint="Access limited by an assessor"
              icon={DoorClosed}
              tone={data.summary.restricted ? 'danger' : 'neutral'}
            />
            <StatCard
              label="Cleared"
              value={data.summary.cleared}
              hint="Assessor recorded clearance"
              icon={DoorOpen}
              tone="success"
            />
          </section>

          <Card hover={false} className="overflow-hidden">
            <div className="flex flex-wrap items-center gap-2 border-b border-border px-3 py-2.5">
              <div className="flex gap-1" role="tablist" aria-label="Recovery view">
                {(
                  [
                    { id: 'tasks', label: `Tasks (${filteredTasks.length})` },
                    { id: 'assessments', label: `Damage assessments (${filteredAssessments.length})` },
                  ] as const
                ).map((item) => (
                  <button
                    key={item.id}
                    onClick={() => setTab(item.id)}
                    role="tab"
                    aria-selected={tab === item.id}
                    className={cn(
                      'rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors',
                      tab === item.id
                        ? 'bg-primary text-primary-foreground'
                        : 'text-muted-foreground hover:bg-accent hover:text-foreground',
                    )}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
              <select
                value={incidentFilter}
                onChange={(event) =>
                  setIncidentFilter(event.target.value === 'all' ? 'all' : Number(event.target.value))
                }
                aria-label="Filter by incident"
                className="ml-auto h-8 max-w-[260px] rounded-lg border border-input bg-background px-2 text-xs"
              >
                <option value="all">All incidents</option>
                {data.incidents.map((incident) => (
                  <option key={incident.id} value={incident.id}>
                    {incident.ref} — {incident.title}
                  </option>
                ))}
              </select>
              {tab === 'tasks' && (
                <div className="flex gap-1" role="tablist" aria-label="Filter tasks by status">
                  {(['all', 'open', 'in_progress', 'done'] as const).map((status) => (
                    <button
                      key={status}
                      onClick={() => setTaskStatusFilter(status)}
                      role="tab"
                      aria-selected={taskStatusFilter === status}
                      className={cn(
                        'rounded-md px-2 py-1 text-[11px] font-medium transition-colors',
                        taskStatusFilter === status
                          ? 'bg-primary text-primary-foreground'
                          : 'text-muted-foreground hover:bg-accent',
                      )}
                    >
                      {status === 'all' ? 'All' : TASK_STATUS_META[status].label}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {tab === 'tasks' ? (
              filteredTasks.length === 0 ? (
                <div className="px-4 py-12 text-center">
                  <ListChecks className="mx-auto mb-2 h-7 w-7 text-muted-foreground" />
                  <p className="text-sm font-medium">No recovery tasks in this view</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Create a task to track a repair, inspection or clearance action.
                  </p>
                </div>
              ) : (
                <ul className="divide-y divide-border">
                  {filteredTasks.map((task) => {
                    const meta = TASK_STATUS_META[task.status];
                    const overdue =
                      task.status !== 'done' && task.dueAt && task.dueAt < new Date().toISOString();
                    return (
                      <li key={task.id} className="flex flex-col gap-3 px-4 py-4 lg:flex-row lg:items-start">
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-sm font-semibold">{task.title}</span>
                            <span
                              className={cn(
                                'inline-flex rounded-full border px-2 py-0.5 text-[11px] font-semibold',
                                meta.className,
                              )}
                            >
                              {meta.label}
                            </span>
                            <SeverityBadge severity={task.priority} />
                            {overdue && (
                              <Badge variant="destructive">
                                <AlertTriangle className="mr-1 h-3 w-3" /> Overdue
                              </Badge>
                            )}
                          </div>
                          {task.description && (
                            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                              {task.description}
                            </p>
                          )}
                          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
                            {task.incidentRef && (
                              <span className="inline-flex items-center gap-1">
                                <Flag className="h-3 w-3" /> {task.incidentRef}
                              </span>
                            )}
                            <span className="inline-flex items-center gap-1">
                              <UserRound className="h-3 w-3" /> {task.ownerName ?? 'Unassigned'}
                            </span>
                            {task.dueAt && (
                              <span className="inline-flex items-center gap-1">
                                <Timer className="h-3 w-3" /> Due {absoluteTime(task.dueAt)} (
                                {relativeTime(task.dueAt)})
                              </span>
                            )}
                            <span>Created by {task.createdByName ?? 'staff'}</span>
                            {task.completedAt && <span>Completed {relativeTime(task.completedAt)}</span>}
                          </div>
                        </div>
                        {canWrite && (
                          <div className="flex shrink-0 flex-wrap gap-1" role="group" aria-label={`Set status for ${task.title}`}>
                            {(['open', 'in_progress'] as TaskStatus[]).map((status) => (
                              <button
                                key={status}
                                type="button"
                                onClick={() => void setTaskStatus(task, status)}
                                aria-pressed={task.status === status}
                                className={cn(
                                  'rounded-md border px-2.5 py-1.5 text-[11px] font-semibold transition-colors',
                                  task.status === status
                                    ? TASK_STATUS_META[status].className
                                    : 'border-input text-muted-foreground hover:bg-accent',
                                )}
                              >
                                {TASK_STATUS_META[status].label}
                              </button>
                            ))}
                            {task.status !== 'done' && (
                              <Button variant="outline" size="sm" onClick={() => setCompleteTarget(task)}>
                                <CheckCircle2 className="h-3.5 w-3.5" /> Complete
                              </Button>
                            )}
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )
            ) : filteredAssessments.length === 0 ? (
              <div className="px-4 py-12 text-center">
                <ShieldCheck className="mx-auto mb-2 h-7 w-7 text-muted-foreground" />
                <p className="text-sm font-medium">No damage assessments recorded</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  After an incident, an authorized assessor records damage and a clearance decision here.
                </p>
              </div>
            ) : (
              <ul className="divide-y divide-border">
                {filteredAssessments.map((assessment) => {
                  const damage = DAMAGE_META[assessment.damageLevel];
                  const clearance = CLEARANCE_META[assessment.clearance];
                  return (
                    <li key={assessment.id} className="px-4 py-4">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-semibold">
                          {assessment.buildingName ?? buildingName(assessment.buildingId)}
                          {assessment.roomName ? ` · ${assessment.roomName}` : ''}
                        </span>
                        <span
                          className={cn(
                            'inline-flex rounded-full border px-2 py-0.5 text-[11px] font-semibold',
                            damage.className,
                          )}
                          title={damage.hint}
                        >
                          {damage.label}
                        </span>
                        <span
                          className={cn(
                            'inline-flex rounded-full border px-2 py-0.5 text-[11px] font-semibold',
                            clearance.className,
                          )}
                          title={clearance.description}
                        >
                          {clearance.label}
                        </span>
                      </div>
                      {assessment.notes && (
                        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{assessment.notes}</p>
                      )}
                      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
                        <span className="inline-flex items-center gap-1">
                          <UserRound className="h-3 w-3" /> {assessment.assessorName ?? 'Assessor not recorded'}
                        </span>
                        <span className="inline-flex items-center gap-1">
                          <Building2 className="h-3 w-3" /> Assessed {absoluteTime(assessment.assessedAt)}
                        </span>
                        <span>{relativeTime(assessment.assessedAt)}</span>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card hover={false} className="p-4">
              <h2 className="text-sm font-semibold">Clearance meanings</h2>
              <ul className="mt-2 space-y-2 text-xs leading-relaxed text-muted-foreground">
                {(Object.keys(CLEARANCE_META) as Array<DamageAssessment['clearance']>).map((key) => (
                  <li key={key} className="flex gap-2">
                    <span
                      className={cn(
                        'mt-0.5 inline-flex h-fit shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold',
                        CLEARANCE_META[key].className,
                      )}
                    >
                      {CLEARANCE_META[key].label}
                    </span>
                    <span>{CLEARANCE_META[key].description}</span>
                  </li>
                ))}
              </ul>
            </Card>
            <Card hover={false} className="p-4">
              <h2 className="flex items-center gap-1.5 text-sm font-semibold">
                <ShieldAlert className="h-4 w-4 text-warning" /> Honest limits
              </h2>
              <ul className="mt-2 space-y-2 text-xs leading-relaxed text-muted-foreground">
                <li>An assessment records one assessor's observation at one point in time.</li>
                <li>
                  Clearing a room does not certify structural, electrical or fire safety — licensed
                  professionals do that.
                </li>
                <li>
                  RADAR does not contact insurers, contractors or emergency services. Those steps happen
                  through your school's normal process.
                </li>
              </ul>
            </Card>
          </div>
        </>
      ) : null}

      <Dialog open={taskOpen} onOpenChange={setTaskOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>New recovery task</DialogTitle>
            <DialogDescription>
              Assign a repair, inspection or administrative follow-up. The assignee receives an in-app
              notification.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={createTask} className="space-y-4">
            <Input
              label="Title"
              value={taskForm.title}
              onChange={(event) => setTaskForm((form) => ({ ...form, title: event.target.value }))}
              placeholder="e.g. Verify distribution board and lab circuits"
            />
            <Textarea
              label="Description"
              value={taskForm.description}
              onChange={(event) => setTaskForm((form) => ({ ...form, description: event.target.value }))}
              rows={3}
            />
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="space-y-1.5 text-sm">
                <span className="font-medium">Incident</span>
                <select
                  value={taskForm.incidentId}
                  onChange={(event) => setTaskForm((form) => ({ ...form, incidentId: event.target.value }))}
                  className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm"
                >
                  <option value="">No incident (standalone)</option>
                  {data?.incidents.map((incident) => (
                    <option key={incident.id} value={incident.id}>
                      {incident.ref} — {incident.title}
                    </option>
                  ))}
                </select>
              </label>
              <label className="space-y-1.5 text-sm">
                <span className="font-medium">Priority</span>
                <select
                  value={taskForm.priority}
                  onChange={(event) =>
                    setTaskForm((form) => ({ ...form, priority: event.target.value as Severity }))
                  }
                  className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm capitalize"
                >
                  {PRIORITIES.map((priority) => (
                    <option key={priority} value={priority}>
                      {SEVERITY_META[priority].label} — {SEVERITY_META[priority].description}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="space-y-1.5 text-sm">
                <span className="font-medium">Owner</span>
                <select
                  value={taskForm.ownerId}
                  onChange={(event) => setTaskForm((form) => ({ ...form, ownerId: event.target.value }))}
                  className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm"
                >
                  <option value="">Unassigned</option>
                  {directory.map((person) => (
                    <option key={person.id} value={person.id}>
                      {person.name} ({person.role})
                    </option>
                  ))}
                </select>
              </label>
              <Input
                label="Due"
                type="datetime-local"
                value={taskForm.dueAt}
                onChange={(event) => setTaskForm((form) => ({ ...form, dueAt: event.target.value }))}
                helper="Optional target date"
              />
            </div>
            {taskError && (
              <p role="alert" className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-xs text-danger">
                {taskError}
              </p>
            )}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setTaskOpen(false)} disabled={savingTask}>
                Cancel
              </Button>
              <Button type="submit" loading={savingTask}>
                <Plus className="h-4 w-4" /> Create task
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={assessmentOpen} onOpenChange={setAssessmentOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Record damage assessment</DialogTitle>
            <DialogDescription>
              This records a human observation and can change the building or room status. Selecting
              “Restricted” notifies staff and limits the area in the map.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={submitAssessment} className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="space-y-1.5 text-sm">
                <span className="font-medium">Incident</span>
                <select
                  value={assessmentForm.incidentId}
                  onChange={(event) =>
                    setAssessmentForm((form) => ({ ...form, incidentId: event.target.value }))
                  }
                  className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm"
                >
                  <option value="">No linked incident</option>
                  {data?.incidents.map((incident) => (
                    <option key={incident.id} value={incident.id}>
                      {incident.ref} — {incident.title}
                    </option>
                  ))}
                </select>
              </label>
              <label className="space-y-1.5 text-sm">
                <span className="font-medium">Building</span>
                <select
                  value={assessmentForm.buildingId}
                  onChange={(event) =>
                    setAssessmentForm((form) => ({
                      ...form,
                      buildingId: event.target.value,
                      roomId: '',
                    }))
                  }
                  className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm"
                  required
                >
                  <option value="">Select building</option>
                  {buildings.map((building) => (
                    <option key={building.id} value={building.id}>
                      {building.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <label className="space-y-1.5 text-sm">
              <span className="font-medium">Room (optional)</span>
              <select
                value={assessmentForm.roomId}
                onChange={(event) => setAssessmentForm((form) => ({ ...form, roomId: event.target.value }))}
                className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm"
                disabled={!assessmentForm.buildingId}
              >
                <option value="">Whole building</option>
                {roomsForAssessment.map((room) => (
                  <option key={room.id} value={room.id}>
                    {room.code} — {room.name}
                  </option>
                ))}
              </select>
            </label>
            <div>
              <p className="mb-1.5 text-sm font-medium">Damage level</p>
              <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
                {(Object.keys(DAMAGE_META) as Array<DamageAssessment['damageLevel']>).map((level) => (
                  <button
                    key={level}
                    type="button"
                    onClick={() => setAssessmentForm((form) => ({ ...form, damageLevel: level }))}
                    aria-pressed={assessmentForm.damageLevel === level}
                    className={cn(
                      'rounded-lg border px-2 py-2 text-xs font-semibold transition-colors',
                      assessmentForm.damageLevel === level
                        ? DAMAGE_META[level].className
                        : 'border-input text-muted-foreground hover:bg-accent',
                    )}
                  >
                    {DAMAGE_META[level].label}
                  </button>
                ))}
              </div>
              <p className="mt-1 text-[11px] text-muted-foreground">
                {DAMAGE_META[assessmentForm.damageLevel].hint}
              </p>
            </div>
            <div>
              <p className="mb-1.5 text-sm font-medium">Clearance decision</p>
              <div className="grid grid-cols-3 gap-1.5">
                {(Object.keys(CLEARANCE_META) as Array<DamageAssessment['clearance']>).map((state) => (
                  <button
                    key={state}
                    type="button"
                    onClick={() => setAssessmentForm((form) => ({ ...form, clearance: state }))}
                    aria-pressed={assessmentForm.clearance === state}
                    className={cn(
                      'rounded-lg border px-2 py-2 text-xs font-semibold transition-colors',
                      assessmentForm.clearance === state
                        ? CLEARANCE_META[state].className
                        : 'border-input text-muted-foreground hover:bg-accent',
                    )}
                  >
                    {CLEARANCE_META[state].label}
                  </button>
                ))}
              </div>
              <p className="mt-1 text-[11px] text-muted-foreground">
                {CLEARANCE_META[assessmentForm.clearance].description}
              </p>
            </div>
            <Textarea
              label="Notes"
              value={assessmentForm.notes}
              onChange={(event) => setAssessmentForm((form) => ({ ...form, notes: event.target.value }))}
              rows={3}
              placeholder="What you observed, what remains untested, and who should verify next."
            />
            {assessmentForm.clearance === 'restricted' && (
              <p className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-[11px] leading-relaxed text-danger">
                Restricting an area will notify staff and show the location as restricted on the map. Confirm your
                school emergency plan supports this before submitting.
              </p>
            )}
            {assessmentError && (
              <p role="alert" className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-xs text-danger">
                {assessmentError}
              </p>
            )}
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setAssessmentOpen(false)}
                disabled={savingAssessment}
              >
                Cancel
              </Button>
              <Button type="submit" loading={savingAssessment}>
                Record assessment
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={Boolean(completeTarget)}
        onOpenChange={(open) => !open && setCompleteTarget(null)}
        title="Mark this task complete?"
        description={
          completeTarget
            ? `${completeTarget.title} will be closed with the current time. Make sure the work or verification is actually finished.`
            : ''
        }
        confirmLabel="Mark complete"
        loading={completing}
        onConfirm={completeTask}
      />
    </div>
  );
}
