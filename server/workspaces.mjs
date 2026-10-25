import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { coreDb, initializeDatabase, DATA_DIR, withDatabase } from './db.mjs';

const schools = JSON.parse(fs.readFileSync(new URL('../src/data/camarines-norte-schools.json', import.meta.url), 'utf8'));
const connections = new Map();
export const workspaceDirectory = path.join(DATA_DIR, 'workspaces');
export function workspaceRecord(id) { return coreDb.prepare('SELECT * FROM school_workspaces WHERE beis_id = ?').get(id); }
export function workspaceSchool(id) { return schools.find(s => s.id === id); }
export function workspaceUploads(id) { return path.join(workspaceDirectory, id, 'uploads'); }
export function openWorkspace(id) {
  if (!/^\d{6}$/.test(id) || !workspaceRecord(id)) throw new Error('Workspace does not exist.');
  if (!connections.has(id)) {
    const file = path.join(workspaceDirectory, id, 'radar.db');
    // Do not silently replace a lost database with an empty database.
    if (!fs.existsSync(file)) throw new Error('Workspace database is missing. Restore its backup.');
    const connection = new DatabaseSync(file);
    initializeDatabase(connection);
    connections.set(id, connection);
  }
  return connections.get(id);
}
export function runInWorkspace(id, callback) {
  return withDatabase({ db: openWorkspace(id), workspaceId: id, uploadDir: workspaceUploads(id) }, callback);
}
export function createWorkspace(id, user) {
  const school = workspaceSchool(id);
  if (!school) throw new Error('Unknown directory school.');
  const existing = workspaceRecord(id);
  if (existing) return existing;
  fs.mkdirSync(path.join(workspaceDirectory, id), { recursive: true });
  fs.mkdirSync(workspaceUploads(id), { recursive: true });
  const file = path.join(workspaceDirectory, id, 'radar.db');
  // An orphaned file is recoverable state, never overwrite it automatically.
  if (fs.existsSync(file)) throw new Error('A workspace file already exists without registration. Restore its registration before continuing.');
  const connection = new DatabaseSync(file);
  try {
    initializeDatabase(connection);
    connection.exec('BEGIN');
    connection.prepare('INSERT INTO schools (id,name,address,lat,lng,timezone,location_verified) VALUES (1,?,?,0,0,?,0)').run(school.name, [school.address, school.barangay, school.municipality, 'Camarines Norte, Philippines'].filter(Boolean).join(', '), 'Asia/Manila');
    const account = coreDb.prepare('SELECT * FROM users WHERE id = ?').get(user.id);
    connection.prepare(`INSERT INTO users (id,email,password_hash,name,role,title,phone,school_id,grade,section)
      VALUES (?,?,?,?,?,?,?,1,?,?)`).run(account.id, account.email, account.password_hash, account.name, account.role, account.title, account.phone, account.grade, account.section);
    connection.prepare('INSERT INTO audit_log(actor_id,action,entity,entity_id,meta,created_at) VALUES (?,?,?,?,?,?)').run(user.id,'workspace.create','school',id,JSON.stringify({beisId:id,name:school.name}),new Date().toISOString());
    connection.exec('COMMIT');
    coreDb.prepare('INSERT INTO school_workspaces(beis_id,owner_user_id,created_at) VALUES (?,?,?)').run(id,user.id,new Date().toISOString());
    connections.set(id, connection);
    return workspaceRecord(id);
  } catch (error) {
    if (connection.isTransaction) connection.exec('ROLLBACK');
    connection.close();
    throw error;
  }
}
