export type Role = 'admin' | 'inspector' | 'teacher' | 'responder' | 'student' | 'parent';
export type Severity = 'critical' | 'high' | 'medium' | 'low' | 'info';
export type HazardStatus = 'new' | 'pending_review' | 'verified' | 'in_progress' | 'resolved';
export type ResolvedMode = 'light' | 'dark';

export interface School {
  id: number;
  name: string;
  address: string;
  lat: number | null;
  lng: number | null;
  locationVerified?: boolean;
  timezone: string;
}

export interface User {
  id: number;
  accountScope?: string;
  email: string;
  name: string;
  role: Role;
  title: string | null;
  phone: string | null;
  schoolId: number;
  grade?: string | null;
  permissions: string[];
}

export interface Building {
  id: number;
  schoolId: number;
  code: string;
  name: string;
  description: string;
  lat: number;
  lng: number;
  address: string;
  yearBuilt: number | null;
  status?: 'operational' | 'restricted' | 'closed';
  floorCount: number;
  roomCount: number;
  hazardCount?: number;
  worstSeverity?: Severity | null;
}

export interface Floor {
  id: number;
  buildingId: number;
  level: number;
  name: string;
  planWidth: number;
  planHeight: number;
  notes: string;
}

export interface Room {
  id: number;
  floorId: number;
  code: string;
  name: string;
  type: string;
  x: number;
  y: number;
  width: number;
  height: number;
  capacity: number;
  status: string;
  lastInspectedAt: string | null;
  openHazards?: number;
  equipmentCount?: number;
  buildingId?: number;
  buildingName?: string;
  floorLevel?: number;
  floorName?: string;
}

export interface Hazard {
  id: number;
  ref: string;
  title: string;
  description: string;
  severity: Severity;
  status: HazardStatus;
  location: string;
  roomId: number | null;
  buildingId: number | null;
  buildingName: string | null;
  floorLevel: number | null;
  roomName?: string | null;
  reporter: string | null;
  assignee: string | null;
  source: 'manual' | 'ai_assisted';
  createdAt: string;
  updatedAt: string;
  verifiedAt: string | null;
  resolvedAt: string | null;
  actionCount: number;
  evidenceCount: number;
}

export interface HazardEvidence {
  id: number;
  hazardId: number;
  url: string;
  caption: string;
  uploadedByName: string | null;
  createdAt: string;
}

export interface HazardEvent {
  id: number;
  hazardId: number;
  type: string;
  note: string;
  actorName: string | null;
  actorRole: Role | null;
  createdAt: string;
}

export interface CorrectiveAction {
  id: number;
  hazardId: number;
  title: string;
  ownerId: number | null;
  ownerName: string | null;
  dueAt: string | null;
  status: 'open' | 'in_progress' | 'done';
  notes: string;
  completedAt: string | null;
  createdAt: string;
}

export interface RoomContext {
  id: number;
  code: string;
  roomName: string;
  type: string;
  capacity: number;
  roomStatus: string;
  floorId: number;
  floorLevel: number;
  floorName: string;
  buildingId: number;
  buildingCode: string;
  buildingName: string;
}

export interface HazardDetail {
  hazard: Hazard;
  context: RoomContext | null;
  evidence: HazardEvidence[];
  timeline: HazardEvent[];
  actions: CorrectiveAction[];
}

export interface Equipment {
  id: number;
  roomId: number | null;
  buildingId: number | null;
  type: string;
  label: string;
  status: 'ok' | 'due' | 'expired' | 'missing';
  lastCheckedAt: string | null;
  notes: string;
  quantity?: number;
  expiresAt?: string | null;
  department?: string;
  locationNote?: string;
  roomName?: string | null;
  buildingName?: string | null;
}

export interface MapPayload {
  school: School;
  buildings: Building[];
  hazards: Array<{
    id: number;
    ref: string;
    title: string;
    severity: Severity;
    status: HazardStatus;
    roomId: number | null;
    locationNote: string;
    createdAt: string;
    buildingId: number | null;
    buildingName: string | null;
    roomName: string | null;
  }>;
  equipment: Equipment[];
  assemblyPoints: AssemblyPoint[];
  routes: EvacuationRoute[];
}

export interface Scan {
  id: number;
  roomId: number;
  inspectorId: number;
  status: 'draft' | 'submitted';
  notes: string;
  startedAt: string;
  submittedAt: string | null;
  roomName?: string;
  buildingName?: string;
  floorLevel?: number;
  inspectorName?: string;
  photoCount?: number;
  observationCount?: number;
}

export interface ScanPhoto {
  id: number;
  scanId: number;
  url: string;
  caption: string;
  createdAt: string;
}

export interface ScanObservation {
  id: number;
  scanId: number;
  title: string;
  description: string;
  severity: Severity;
  source: 'manual' | 'ai';
  status: 'pending' | 'accepted' | 'rejected';
  hazardId: number | null;
  createdAt: string;
}

export interface Notification {
  id: number;
  userId: number;
  type: 'info' | 'warning' | 'success' | 'alert';
  title: string;
  body: string;
  href: string | null;
  read: boolean;
  createdAt: string;
}

export interface Incident {
  id: number;
  ref: string;
  title: string;
  description: string;
  severity: Severity;
  status: 'active' | 'monitoring' | 'closed';
  location: string;
  kind: string;
  startedAt: string;
  closedAt: string | null;
  commanderName: string | null;
  updateCount?: number;
}

export interface RollCallClass {
  id: number;
  name: string;
  grade: string;
  expected: number;
  present: number;
  status: 'incomplete' | 'complete';
  updatedAt: string | null;
  teacherName: string | null;
  roomName: string | null;
  buildingName: string | null;
}

export interface DashboardPayload {
  school: School;
  generatedAt: string;
  kpis: {
    roomsScanned: number;
    totalRooms: number;
    roomCoverage: number;
    verifiedHazards: number;
    unresolved: number;
    pendingReview: number;
    activeIncidents: number;
    activeAlerts: number;
    rollcallExpected: number;
    rollcallPresent: number;
    rollcallCompletion: number;
    reportedLast30: number;
    resolvedLast30: number;
    reportedDelta: number | null;
    resolvedDelta: number | null;
    unreadNotifications: number;
    lastScanAt: string | null;
    activeAlertCount: number;
    alertLevel: AlertLevel | null;
    alertTitle: string | null;
    safetyNeedHelp: number;
    resourcesAttention: number;
    recoveryOpen: number;
  };
  severity: Record<Severity, number>;
  status: Record<HazardStatus, number>;
  trend: Array<{ month: string; reported: number; resolved: number }>;
  activity: Array<{
    action: string;
    entity: string;
    entityId: string | null;
    meta: string;
    createdAt: string;
    actorName: string | null;
    actorRole: Role | null;
  }>;
}

export interface SearchResult {
  kind: 'room' | 'hazard' | 'incident' | 'building' | 'alert' | 'advisory';
  id: number;
  ref?: string;
  title: string;
  severity?: Severity;
  status?: string;
  buildingName?: string;
  floorLevel?: number;
  name?: string;
  code?: string;
  level?: AlertLevel;
  category?: string;
  sourceName?: string;
}

/* ------------------------------------------------------------------ */
/* Stage 5 — alerts, advisories, safety check-ins                      */
/* ------------------------------------------------------------------ */

export type AlertLevel = 'green' | 'yellow' | 'orange' | 'red';
export type AlertKind = 'alert' | 'announcement' | 'suspension';
export type AlertState = 'active' | 'scheduled' | 'expired' | 'archived';
export type AlertAudience = 'school' | 'staff' | 'students' | 'parents' | 'grade';

export interface Alert {
  id: number;
  ref: string;
  level: AlertLevel;
  kind: AlertKind;
  title: string;
  body: string;
  audience: AlertAudience;
  audienceValue: string;
  audienceLabel: string;
  buildingId: number | null;
  buildingName: string | null;
  effectiveAt: string;
  expiresAt: string | null;
  publishedBy: number | null;
  publisherName: string | null;
  publishedAt: string;
  archivedAt: string | null;
  createdAt: string;
  state: AlertState;
  levelLabel: string;
  deliveryCount: number;
}

export interface AlertsPayload {
  items: Alert[];
  active: Alert[];
  counts: Record<AlertState, number>;
  byLevel: Record<AlertLevel, number>;
  levels: Array<{ id: AlertLevel; label: string }>;
  generatedAt: string;
}

export type AdvisoryCategory = 'earthquake' | 'typhoon' | 'volcano' | 'flood' | 'landslide' | 'fire' | 'other';
export type AdvisoryFreshness = 'current' | 'stale' | 'expired' | 'archived';

export interface Advisory {
  id: number;
  category: AdvisoryCategory;
  categoryLabel: string;
  title: string;
  summary: string;
  sourceName: string;
  sourceUrl: string;
  publishedAt: string;
  validUntil: string | null;
  severity: Severity;
  status: 'active' | 'archived';
  createdBy: number | null;
  createdByName: string | null;
  createdAt: string;
  updatedAt: string;
  freshness: AdvisoryFreshness;
}

export interface AdvisoriesPayload {
  items: Advisory[];
  counts: Record<AdvisoryFreshness, number>;
  categories: Array<{ id: AdvisoryCategory; label: string }>;
  staleAfterHours: number;
  generatedAt: string;
}

export interface FeedConnector {
  id: string;
  label: string;
  agency: string;
  category: AdvisoryCategory;
  configured: boolean;
  requires: string;
  docs: string;
}

export interface FeedStatusPayload {
  liveFeeds: boolean;
  connectors: FeedConnector[];
  checkedAt: string;
  message: string;
}

export interface SafetyCheck {
  id: number;
  userId: number;
  status: 'safe' | 'need_help';
  note: string;
  buildingId: number | null;
  roomId: number | null;
  sharing: boolean;
  expiresAt: string | null;
  createdAt: string;
  updatedAt: string;
  userName?: string;
  userRole?: Role;
  userTitle?: string | null;
  buildingName?: string | null;
  roomName?: string | null;
  floorLevel?: number | null;
  expired?: boolean;
  stale?: boolean;
}

export interface SafetyMePayload {
  check: SafetyCheck | null;
  context: RoomContext | null;
}

export interface SafetyStatusPayload {
  checks: SafetyCheck[];
  counts: {
    total: number;
    safe: number;
    needHelp: number;
    sharing: number;
    stale: number;
  };
  generatedAt: string;
}

/* ------------------------------------------------------------------ */
/* Stage 6 — evacuation & resources                                    */
/* ------------------------------------------------------------------ */

export type RouteStatus = 'open' | 'restricted' | 'closed';

export interface EvacuationRoute {
  id: number;
  schoolId: number;
  name: string;
  buildingId: number | null;
  path: [number, number][];
  notes: string;
  accessible: boolean;
  status: RouteStatus;
  distanceM: number;
  walkMinutes: number;
  assemblyPointId: number | null;
  scenario: string;
  updatedAt: string | null;
}

export interface AssemblyPoint {
  id: number;
  schoolId: number;
  name: string;
  lat: number;
  lng: number;
  capacity: number;
  notes: string;
  status: RouteStatus;
  accessible: boolean;
  updatedAt: string | null;
}

export interface EvacuationPayload {
  school: School;
  buildings: Building[];
  assemblyPoints: AssemblyPoint[];
  routes: EvacuationRoute[];
  rollcall: { expected: number; present: number; classes: number } | null;
  summary: {
    routes: number;
    open: number;
    restricted: number;
    closed: number;
    accessible: number;
    assemblyCapacity: number;
  };
  generatedAt: string;
  disclaimer: string;
}

export interface ResourceItem extends Equipment {
  resolvedBuildingId: number | null;
  resolvedBuildingName: string | null;
  floorLevel: number | null;
  expiryState: 'none' | 'expired' | 'expiring' | 'valid';
}

export interface ResourcesPayload {
  items: ResourceItem[];
  summary: {
    total: number;
    ok: number;
    due: number;
    expired: number;
    missing: number;
    expiring: number;
    totalUnits: number;
  };
  types: string[];
  generatedAt: string;
}

/* ------------------------------------------------------------------ */
/* Stage 7 — recovery & analytics                                      */
/* ------------------------------------------------------------------ */

export interface RecoveryTask {
  id: number;
  incidentId: number | null;
  title: string;
  description: string;
  ownerId: number | null;
  ownerName: string | null;
  priority: Severity;
  status: 'open' | 'in_progress' | 'done';
  dueAt: string | null;
  completedAt: string | null;
  createdBy: number | null;
  createdByName: string | null;
  createdAt: string;
  updatedAt: string;
  incidentRef: string | null;
  incidentTitle: string | null;
}

export interface DamageAssessment {
  id: number;
  incidentId: number | null;
  buildingId: number;
  buildingName: string | null;
  roomId: number | null;
  roomName: string | null;
  damageLevel: 'none' | 'minor' | 'moderate' | 'severe';
  clearance: 'pending' | 'restricted' | 'cleared';
  notes: string;
  assessedBy: number | null;
  assessorName: string | null;
  assessedAt: string;
  createdAt: string;
}

export interface RecoveryPayload {
  incidents: Array<{
    id: number;
    ref: string;
    title: string;
    severity: Severity;
    status: 'active' | 'monitoring' | 'closed';
    startedAt: string;
    closedAt: string | null;
  }>;
  tasks: RecoveryTask[];
  assessments: DamageAssessment[];
  summary: {
    open: number;
    inProgress: number;
    done: number;
    overdue: number;
    restricted: number;
    cleared: number;
  };
  generatedAt: string;
}

export interface AnalyticsPayload {
  generatedAt: string;
  rangeDays: number;
  since: string;
  hazards: {
    severity: Record<Severity, number>;
    status: Record<HazardStatus, number>;
    total: number;
    reportedInRange: number;
    resolvedInRange: number;
    unresolved: number;
    pendingReview: number;
    overdueActions: number;
    avgResolutionDays: number | null;
    fastestResolutionDays: number | null;
    slowestResolutionDays: number | null;
  };
  trend: Array<{ month: string; reported: number; resolved: number }>;
  byBuilding: Array<{
    id: number;
    code: string;
    name: string;
    status: string;
    roomCount: number;
    scannedRooms: number;
    coverage: number;
    openHazards: number;
    equipment: number;
  }>;
  inspections: {
    totalRooms: number;
    scannedRooms: number;
    coverage: number;
    overdueRooms: number;
    scansInRange: number;
  };
  rollcall: { expected: number; present: number; classes: number; completion: number };
  incidents: { active: number; monitoring: number; closed: number; closedInRange: number };
  alerts: {
    publishedInRange: number;
    byLevel: Record<AlertLevel, number>;
    delivered: number;
    read: number;
  };
  resources: {
    total: number;
    ok: number;
    due: number;
    expired: number;
    missing: number;
    expiringSoon: number;
  };
  recovery: {
    tasks: { open: number; in_progress: number; done: number };
    clearance: { pending: number; restricted: number; cleared: number };
  };
}
