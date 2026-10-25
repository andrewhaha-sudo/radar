export const ADVANCED_TABLES = [
  'imagery_route_drafts',
  'campus_video_surveys',
  'geo_layers',
  'room_counts',
  'photo_calibrations',
  'foreground_sessions',
  'occupancy_devices',
  'sensor_nonces',
  'acceptance_results',
  'relay_inbox',
  'emergency_sms_jobs',
];
export const ADVANCED_SCHEMA = `
CREATE TABLE IF NOT EXISTS imagery_route_drafts(id INTEGER PRIMARY KEY AUTOINCREMENT,title TEXT NOT NULL,source TEXT NOT NULL,image TEXT NOT NULL,paths TEXT NOT NULL,checks TEXT NOT NULL,notes TEXT NOT NULL,uncertainties TEXT NOT NULL,created_by INTEGER REFERENCES users(id),created_at TEXT NOT NULL,updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS campus_video_surveys(id INTEGER PRIMARY KEY AUTOINCREMENT,title TEXT NOT NULL,payload TEXT NOT NULL,created_by INTEGER REFERENCES users(id),created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS room_counts(id INTEGER PRIMARY KEY AUTOINCREMENT,room_id INTEGER NOT NULL REFERENCES rooms(id),count INTEGER NOT NULL,source TEXT NOT NULL,observed_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS geo_layers(id INTEGER PRIMARY KEY AUTOINCREMENT,kind TEXT NOT NULL,title TEXT NOT NULL,agency TEXT NOT NULL,source_url TEXT NOT NULL,geojson TEXT NOT NULL,published_at TEXT NOT NULL,expires_at TEXT,verified INTEGER NOT NULL DEFAULT 0,created_by INTEGER REFERENCES users(id),created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS photo_calibrations(photo_id INTEGER PRIMARY KEY REFERENCES scan_photos(id),anchors TEXT NOT NULL,source TEXT NOT NULL,created_by INTEGER REFERENCES users(id),created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS foreground_sessions(user_id INTEGER PRIMARY KEY REFERENCES users(id),incident_id INTEGER NOT NULL REFERENCES incidents(id),ends_at TEXT NOT NULL,started_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS occupancy_devices(id INTEGER PRIMARY KEY AUTOINCREMENT,workspace_id TEXT NOT NULL,assembly_point_id INTEGER NOT NULL,name TEXT NOT NULL,token_hash TEXT NOT NULL,active INTEGER NOT NULL DEFAULT 1,last_seen_at TEXT,created_by INTEGER REFERENCES users(id),created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS sensor_nonces(id INTEGER PRIMARY KEY AUTOINCREMENT,device_id INTEGER NOT NULL REFERENCES occupancy_devices(id),nonce TEXT NOT NULL,created_at TEXT NOT NULL,UNIQUE(device_id,nonce));
CREATE TABLE IF NOT EXISTS acceptance_results(id INTEGER PRIMARY KEY AUTOINCREMENT,test_key TEXT NOT NULL,state TEXT NOT NULL,note TEXT NOT NULL DEFAULT '',actor_id INTEGER REFERENCES users(id),created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS relay_inbox(id INTEGER PRIMARY KEY AUTOINCREMENT,packet_id TEXT NOT NULL UNIQUE,payload TEXT NOT NULL,received_by INTEGER REFERENCES users(id),created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS emergency_sms_jobs(id INTEGER PRIMARY KEY AUTOINCREMENT,incident_id INTEGER NOT NULL REFERENCES incidents(id),user_id INTEGER NOT NULL REFERENCES users(id),state TEXT NOT NULL DEFAULT 'pending',updated_at TEXT NOT NULL,UNIQUE(incident_id,user_id));
`;
