export const FEATURE_TABLES = [
  'workspace_members',
  'inspection_schedules',
  'room_assets',
  'room_features',
  'map_versions',
  'map_zones',
  'sos_requests',
  'rollcall_people',
  'rollcall_events',
  'location_reports',
  'occupancy_reports',
  'resource_movements',
  'assistance_requests',
  'hazard_feedback',
  'push_subscriptions',
  'outbound_deliveries',
  'school_settings',
  'student_guardians',
  'delivery_jobs',
];
export const FEATURE_SCHEMA = `
CREATE TABLE IF NOT EXISTS school_workspaces (beis_id TEXT PRIMARY KEY, owner_user_id INTEGER NOT NULL REFERENCES users(id), created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS workspace_members (workspace_id TEXT NOT NULL REFERENCES school_workspaces(beis_id), user_id INTEGER NOT NULL REFERENCES users(id), role TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 1, PRIMARY KEY(workspace_id,user_id));
CREATE TABLE IF NOT EXISTS inspection_schedules (id INTEGER PRIMARY KEY AUTOINCREMENT, room_id INTEGER NOT NULL UNIQUE REFERENCES rooms(id), interval_days INTEGER NOT NULL, next_due_at TEXT NOT NULL, reviewer_id INTEGER REFERENCES users(id), updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS room_assets (id INTEGER PRIMARY KEY AUTOINCREMENT, room_id INTEGER NOT NULL REFERENCES rooms(id), kind TEXT NOT NULL, url TEXT NOT NULL, title TEXT NOT NULL, metadata TEXT NOT NULL DEFAULT '{}', created_by INTEGER REFERENCES users(id), created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS room_features (id INTEGER PRIMARY KEY AUTOINCREMENT, room_id INTEGER NOT NULL REFERENCES rooms(id), kind TEXT NOT NULL, label TEXT NOT NULL, x REAL NOT NULL, y REAL NOT NULL, accessible INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS map_versions (id INTEGER PRIMARY KEY AUTOINCREMENT, entity_type TEXT NOT NULL, entity_id INTEGER NOT NULL, snapshot TEXT NOT NULL, actor_id INTEGER REFERENCES users(id), created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS map_zones (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, kind TEXT NOT NULL, geometry TEXT NOT NULL, verified INTEGER NOT NULL DEFAULT 0, source TEXT NOT NULL, expires_at TEXT, created_by INTEGER REFERENCES users(id), updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS sos_requests (id INTEGER PRIMARY KEY AUTOINCREMENT, incident_id INTEGER NOT NULL UNIQUE REFERENCES incidents(id), reporter_id INTEGER NOT NULL REFERENCES users(id), state TEXT NOT NULL, silent INTEGER NOT NULL DEFAULT 0, responder_id INTEGER REFERENCES users(id), acknowledged_at TEXT, cancelled_at TEXT, cancel_reason TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS rollcall_people (id INTEGER PRIMARY KEY AUTOINCREMENT, class_id INTEGER NOT NULL REFERENCES rollcall_classes(id), student_id INTEGER REFERENCES users(id), display_name TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'not_checked', qr_token TEXT NOT NULL UNIQUE, assembly_point_id INTEGER REFERENCES assembly_points(id), updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS rollcall_events (id INTEGER PRIMARY KEY AUTOINCREMENT, person_id INTEGER NOT NULL REFERENCES rollcall_people(id), status TEXT NOT NULL, note TEXT NOT NULL DEFAULT '', actor_id INTEGER REFERENCES users(id), created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS location_reports (user_id INTEGER PRIMARY KEY REFERENCES users(id), lat REAL NOT NULL, lng REAL NOT NULL, accuracy REAL NOT NULL, incident_id INTEGER NOT NULL REFERENCES incidents(id), expires_at TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS occupancy_reports (id INTEGER PRIMARY KEY AUTOINCREMENT, assembly_point_id INTEGER NOT NULL REFERENCES assembly_points(id), count INTEGER NOT NULL, source TEXT NOT NULL, reported_by INTEGER REFERENCES users(id), observed_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS resource_movements (id INTEGER PRIMARY KEY AUTOINCREMENT, equipment_id INTEGER NOT NULL REFERENCES safety_equipment(id), kind TEXT NOT NULL, quantity INTEGER NOT NULL, holder TEXT NOT NULL DEFAULT '', incident_id INTEGER REFERENCES incidents(id), note TEXT NOT NULL DEFAULT '', actor_id INTEGER REFERENCES users(id), created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS assistance_requests (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL REFERENCES users(id), incident_id INTEGER REFERENCES incidents(id), kind TEXT NOT NULL, note TEXT NOT NULL, state TEXT NOT NULL DEFAULT 'submitted', referral TEXT NOT NULL DEFAULT '', assigned_to INTEGER REFERENCES users(id), created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS hazard_feedback (id INTEGER PRIMARY KEY AUTOINCREMENT, hazard_id INTEGER NOT NULL REFERENCES hazards(id), user_id INTEGER NOT NULL REFERENCES users(id), kind TEXT NOT NULL, note TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL, UNIQUE(hazard_id,user_id,kind));
CREATE TABLE IF NOT EXISTS push_subscriptions (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL REFERENCES users(id), endpoint TEXT NOT NULL UNIQUE, subscription TEXT NOT NULL, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS outbound_deliveries (id INTEGER PRIMARY KEY AUTOINCREMENT, channel TEXT NOT NULL, user_id INTEGER REFERENCES users(id), alert_id INTEGER REFERENCES alerts(id), state TEXT NOT NULL, detail TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS school_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS delivery_jobs (id INTEGER PRIMARY KEY AUTOINCREMENT, alert_id INTEGER NOT NULL REFERENCES alerts(id), user_id INTEGER NOT NULL REFERENCES users(id), state TEXT NOT NULL DEFAULT 'pending', updated_at TEXT NOT NULL, UNIQUE(alert_id,user_id));
CREATE TABLE IF NOT EXISTS student_guardians (student_id INTEGER NOT NULL REFERENCES users(id), guardian_id INTEGER NOT NULL REFERENCES users(id), approved_by INTEGER NOT NULL REFERENCES users(id), created_at TEXT NOT NULL, PRIMARY KEY(student_id,guardian_id));
`;
