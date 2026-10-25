import { AsyncLocalStorage } from 'node:async_hooks';
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const SERVER_ROOT = __dirname;
// RADAR_DB_DIR lets tests and multi-instance deployments use an isolated data
// directory without touching the school's live database.
export const DATA_DIR = process.env.RADAR_DB_DIR
  ? path.resolve(process.env.RADAR_DB_DIR)
  : path.join(__dirname, 'data');
export const UPLOAD_DIR = path.join(__dirname, 'uploads');

fs.mkdirSync(DATA_DIR, { recursive: true });
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const DB_PATH = path.join(DATA_DIR, 'radar.db');
const LEGACY_DB_PATH = path.join(DATA_DIR, 'hazardlink.db');

// Forward-compatible rename: if a pre-RADAR database exists and no RADAR
// database has been created yet, copy it rather than silently starting empty.
if (!fs.existsSync(DB_PATH) && fs.existsSync(LEGACY_DB_PATH)) {
  fs.copyFileSync(LEGACY_DB_PATH, DB_PATH);
  console.log('[radar] migrated legacy hazardlink.db to radar.db');
}

const databaseContext = new AsyncLocalStorage();
export const coreDb = new DatabaseSync(DB_PATH);
export function currentDatabaseContext() { return databaseContext.getStore(); }
export function withDatabase(context, callback) { return databaseContext.run(context, callback); }
// Existing handlers use the database bound to this request, including asynchronous writes.
export const db = new Proxy({}, {
  get(_target, property) {
    const connection = currentDatabaseContext()?.db ?? coreDb;
    const value = connection[property];
    return typeof value === 'function' ? value.bind(connection) : value;
  },
});

export function initializeDatabase(db) {

db.exec('PRAGMA journal_mode = WAL;');
db.exec('PRAGMA foreign_keys = ON;');
db.exec('PRAGMA busy_timeout = 5000;');

db.exec(`
CREATE TABLE IF NOT EXISTS schools (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  address TEXT NOT NULL,
  lat REAL NOT NULL,
  lng REAL NOT NULL,
  timezone TEXT NOT NULL DEFAULT 'America/Chicago'
);

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin','inspector','teacher','responder','student','parent')),
  title TEXT,
  phone TEXT,
  school_id INTEGER REFERENCES schools(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS buildings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  school_id INTEGER NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  lat REAL NOT NULL,
  lng REAL NOT NULL,
  address TEXT NOT NULL DEFAULT '',
  year_built INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS floors (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  building_id INTEGER NOT NULL REFERENCES buildings(id) ON DELETE CASCADE,
  level INTEGER NOT NULL,
  name TEXT NOT NULL,
  plan_width INTEGER NOT NULL DEFAULT 1000,
  plan_height INTEGER NOT NULL DEFAULT 620,
  notes TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS rooms (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  floor_id INTEGER NOT NULL REFERENCES floors(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'classroom',
  x INTEGER NOT NULL DEFAULT 0,
  y INTEGER NOT NULL DEFAULT 0,
  width INTEGER NOT NULL DEFAULT 100,
  height INTEGER NOT NULL DEFAULT 100,
  capacity INTEGER NOT NULL DEFAULT 30,
  status TEXT NOT NULL DEFAULT 'operational',
  last_inspected_at TEXT
);

CREATE TABLE IF NOT EXISTS hazards (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ref TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  severity TEXT NOT NULL CHECK (severity IN ('critical','high','medium','low','info')),
  status TEXT NOT NULL CHECK (status IN ('new','pending_review','verified','in_progress','resolved')),
  room_id INTEGER REFERENCES rooms(id) ON DELETE SET NULL,
  location_note TEXT NOT NULL DEFAULT '',
  reported_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  assigned_to INTEGER REFERENCES users(id) ON DELETE SET NULL,
  source TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('manual','ai_assisted')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  verified_at TEXT,
  resolved_at TEXT
);

CREATE TABLE IF NOT EXISTS hazard_evidence (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  hazard_id INTEGER NOT NULL REFERENCES hazards(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  caption TEXT NOT NULL DEFAULT '',
  uploaded_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS hazard_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  hazard_id INTEGER NOT NULL REFERENCES hazards(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  actor_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS corrective_actions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  hazard_id INTEGER NOT NULL REFERENCES hazards(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  owner_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  due_at TEXT,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','in_progress','done')),
  notes TEXT NOT NULL DEFAULT '',
  completed_at TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS scans (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  room_id INTEGER NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  inspector_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','submitted')),
  notes TEXT NOT NULL DEFAULT '',
  started_at TEXT NOT NULL,
  submitted_at TEXT
);

CREATE TABLE IF NOT EXISTS scan_photos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  scan_id INTEGER NOT NULL REFERENCES scans(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  caption TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS scan_observations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  scan_id INTEGER NOT NULL REFERENCES scans(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  severity TEXT NOT NULL CHECK (severity IN ('critical','high','medium','low','info')),
  source TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('manual','ai')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','rejected')),
  hazard_id INTEGER REFERENCES hazards(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS safety_equipment (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  room_id INTEGER REFERENCES rooms(id) ON DELETE CASCADE,
  building_id INTEGER REFERENCES buildings(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  label TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'ok' CHECK (status IN ('ok','due','expired','missing')),
  last_checked_at TEXT,
  notes TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS assembly_points (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  school_id INTEGER NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  lat REAL NOT NULL,
  lng REAL NOT NULL,
  capacity INTEGER NOT NULL DEFAULT 0,
  notes TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS evacuation_routes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  school_id INTEGER NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  building_id INTEGER REFERENCES buildings(id) ON DELETE SET NULL,
  path TEXT NOT NULL,
  notes TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS incidents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ref TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  severity TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  location TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'other',
  started_at TEXT NOT NULL,
  closed_at TEXT,
  commander_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS incident_updates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  incident_id INTEGER NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
  note TEXT NOT NULL,
  actor_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS rollcall_classes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  grade TEXT NOT NULL,
  teacher_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  room_id INTEGER REFERENCES rooms(id) ON DELETE SET NULL,
  expected INTEGER NOT NULL DEFAULT 0,
  present INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'incomplete' CHECK (status IN ('incomplete','complete')),
  updated_at TEXT
);

CREATE TABLE IF NOT EXISTS notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  type TEXT NOT NULL DEFAULT 'info',
  title TEXT NOT NULL,
  body TEXT NOT NULL DEFAULT '',
  href TEXT,
  read INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  actor_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  entity TEXT NOT NULL,
  entity_id TEXT,
  meta TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS alerts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ref TEXT NOT NULL UNIQUE,
  level TEXT NOT NULL CHECK (level IN ('green','yellow','orange','red')),
  kind TEXT NOT NULL DEFAULT 'alert' CHECK (kind IN ('alert','announcement','suspension')),
  title TEXT NOT NULL,
  body TEXT NOT NULL DEFAULT '',
  audience TEXT NOT NULL DEFAULT 'school' CHECK (audience IN ('school','staff','students','parents','grade')),
  audience_value TEXT NOT NULL DEFAULT '',
  building_id INTEGER REFERENCES buildings(id) ON DELETE SET NULL,
  effective_at TEXT NOT NULL,
  expires_at TEXT,
  published_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  published_at TEXT NOT NULL,
  archived_at TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS alert_deliveries (
  alert_id INTEGER NOT NULL REFERENCES alerts(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  delivered_at TEXT NOT NULL,
  read_at TEXT,
  PRIMARY KEY (alert_id, user_id)
);

CREATE TABLE IF NOT EXISTS advisories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  category TEXT NOT NULL CHECK (category IN ('earthquake','typhoon','volcano','flood','landslide','fire','other')),
  title TEXT NOT NULL,
  summary TEXT NOT NULL DEFAULT '',
  source_name TEXT NOT NULL,
  source_url TEXT NOT NULL DEFAULT '',
  published_at TEXT NOT NULL,
  valid_until TEXT,
  severity TEXT NOT NULL DEFAULT 'info' CHECK (severity IN ('critical','high','medium','low','info')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','archived')),
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS safety_checks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('safe','need_help')),
  note TEXT NOT NULL DEFAULT '',
  building_id INTEGER REFERENCES buildings(id) ON DELETE SET NULL,
  room_id INTEGER REFERENCES rooms(id) ON DELETE SET NULL,
  sharing INTEGER NOT NULL DEFAULT 0,
  expires_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

/* ---- Stage 7: recovery & damage assessment ---- */

CREATE TABLE IF NOT EXISTS recovery_tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  incident_id INTEGER REFERENCES incidents(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  owner_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  priority TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('critical','high','medium','low')),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','in_progress','done')),
  due_at TEXT,
  completed_at TEXT,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS damage_assessments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  incident_id INTEGER REFERENCES incidents(id) ON DELETE SET NULL,
  building_id INTEGER REFERENCES buildings(id) ON DELETE CASCADE,
  room_id INTEGER REFERENCES rooms(id) ON DELETE CASCADE,
  damage_level TEXT NOT NULL DEFAULT 'none' CHECK (damage_level IN ('none','minor','moderate','severe')),
  clearance TEXT NOT NULL DEFAULT 'pending' CHECK (clearance IN ('pending','restricted','cleared')),
  notes TEXT NOT NULL DEFAULT '',
  assessed_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  assessed_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_hazards_status ON hazards(status);
CREATE INDEX IF NOT EXISTS idx_alerts_effective ON alerts(effective_at);
CREATE INDEX IF NOT EXISTS idx_advisories_published ON advisories(published_at);
CREATE INDEX IF NOT EXISTS idx_recovery_incident ON recovery_tasks(incident_id);
CREATE INDEX IF NOT EXISTS idx_assessments_building ON damage_assessments(building_id);
CREATE INDEX IF NOT EXISTS idx_hazards_severity ON hazards(severity);
CREATE INDEX IF NOT EXISTS idx_rooms_floor ON rooms(floor_id);
CREATE INDEX IF NOT EXISTS idx_events_hazard ON hazard_events(hazard_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id);
`);

/* ------------------------------------------------------------------ */
/* Forward-only migrations for databases created by earlier versions.  */
/* ------------------------------------------------------------------ */

function ensureColumn(table, column, definition) {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all();
  if (!columns.some((c) => c.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

ensureColumn('schools', 'location_verified', 'INTEGER NOT NULL DEFAULT 1');
ensureColumn('users', 'grade', 'TEXT');
ensureColumn('users', 'section', 'TEXT');
ensureColumn('buildings', 'status', "TEXT NOT NULL DEFAULT 'operational'");
ensureColumn('safety_equipment', 'quantity', 'INTEGER NOT NULL DEFAULT 1');
ensureColumn('safety_equipment', 'expires_at', 'TEXT');
ensureColumn('safety_equipment', 'department', "TEXT NOT NULL DEFAULT ''");
ensureColumn('safety_equipment', 'location_note', "TEXT NOT NULL DEFAULT ''");
ensureColumn('evacuation_routes', 'accessible', 'INTEGER NOT NULL DEFAULT 0');
ensureColumn('evacuation_routes', 'status', "TEXT NOT NULL DEFAULT 'open'");
ensureColumn('evacuation_routes', 'distance_m', 'INTEGER NOT NULL DEFAULT 0');
ensureColumn('evacuation_routes', 'walk_minutes', 'INTEGER NOT NULL DEFAULT 0');
ensureColumn('evacuation_routes', 'assembly_point_id', 'INTEGER');
ensureColumn('evacuation_routes', 'scenario', "TEXT NOT NULL DEFAULT 'general'");
ensureColumn('evacuation_routes', 'updated_at', 'TEXT');
ensureColumn('assembly_points', 'status', "TEXT NOT NULL DEFAULT 'open'");
ensureColumn('assembly_points', 'accessible', 'INTEGER NOT NULL DEFAULT 1');
ensureColumn('assembly_points', 'updated_at', 'TEXT');

}
initializeDatabase(coreDb);
coreDb.exec(`CREATE TABLE IF NOT EXISTS school_workspaces (
  beis_id TEXT PRIMARY KEY,
  owner_user_id INTEGER NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL
)`);
const sessionColumns = coreDb.prepare('PRAGMA table_info(sessions)').all();
if (!sessionColumns.some(c => c.name === 'workspace_id')) coreDb.exec('ALTER TABLE sessions ADD COLUMN workspace_id TEXT');

export function nowIso() {
  return new Date().toISOString();
}

export function isoDaysAgo(days, hours = 0) {
  return new Date(Date.now() - days * 86_400_000 - hours * 3_600_000).toISOString();
}

export function isoDaysFromNow(days) {
  return new Date(Date.now() + days * 86_400_000).toISOString();
}
