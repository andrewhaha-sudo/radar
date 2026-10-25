import fs from 'node:fs';
import path from 'node:path';
import {
  coreDb,
  initializeDatabase,
  DATA_DIR,
  withDatabase,
  usesPostgres,
  newSchoolDatabase,
} from './db.mjs';

const schools = JSON.parse(
  fs.readFileSync(new URL('../src/data/camarines-norte-schools.json', import.meta.url), 'utf8'),
);
const connections = new Map();
export const workspaceDirectory = path.join(DATA_DIR, 'workspaces');
export async function workspaceRecord(id) {
  return await coreDb.prepare('SELECT * FROM school_workspaces WHERE beis_id = ?').get(id);
}
export async function workspaceAccess(id, userId) {
  const workspace = await workspaceRecord(id);
  if (!workspace) return null;
  if (workspace.owner_user_id === userId) return { role: 'admin', owner: true };
  const member = await coreDb
    .prepare(
      'SELECT role FROM workspace_members WHERE workspace_id = ? AND user_id = ? AND active = 1',
    )
    .get(id, userId);
  return member ? { role: member.role, owner: false } : null;
}
export function workspaceSchool(id) {
  return schools.find((s) => s.id === id);
}
export function workspaceUploads(id) {
  return path.join(workspaceDirectory, id, 'uploads');
}
export async function openWorkspace(id) {
  if (!/^\d{6}$/.test(id) || !(await workspaceRecord(id)))
    throw new Error('Workspace does not exist.');
  if (!connections.has(id)) {
    const file = path.join(workspaceDirectory, id, 'radar.db');
    // Do not silently replace a lost database with an empty database.
    if (!usesPostgres && !fs.existsSync(file))
      throw new Error('Workspace database is missing. Restore its backup.');
    const connection = newSchoolDatabase(id, file);
    await initializeDatabase(connection);
    connections.set(id, connection);
  }
  return connections.get(id);
}
export async function runInWorkspace(id, callback) {
  return withDatabase(
    { db: await openWorkspace(id), workspaceId: id, uploadDir: workspaceUploads(id) },
    callback,
  );
}
export async function createWorkspace(id, user) {
  const school = workspaceSchool(id);
  if (!school) throw new Error('Unknown directory school.');
  const existing = await workspaceRecord(id);
  if (existing) return existing;
  if (!usesPostgres) {
    fs.mkdirSync(path.join(workspaceDirectory, id), { recursive: true });
    fs.mkdirSync(workspaceUploads(id), { recursive: true });
  }
  const file = path.join(workspaceDirectory, id, 'radar.db');
  // An orphaned file is recoverable state, never overwrite it automatically.
  if (!usesPostgres && fs.existsSync(file))
    throw new Error(
      'A workspace file already exists without registration. Restore its registration before continuing.',
    );
  const connection = newSchoolDatabase(id, file);
  if (usesPostgres) {
    const existingSchema = await connection.query(
      'SELECT 1 FROM information_schema.schemata WHERE schema_name = $1',
      [connection.schema],
    );
    if (existingSchema.rows.length)
      throw new Error(
        'An unregistered school schema already exists. Restore its registration before continuing.',
      );
  }
  try {
    await initializeDatabase(connection);
    await connection.exec('BEGIN');
    await connection
      .prepare(
        'INSERT INTO schools (id,name,address,lat,lng,timezone,location_verified) VALUES (1,?,?,0,0,?,0)',
      )
      .run(
        school.name,
        [school.address, school.barangay, school.municipality, 'Camarines Norte, Philippines']
          .filter(Boolean)
          .join(', '),
        'Asia/Manila',
      );
    const account = await coreDb.prepare('SELECT * FROM users WHERE id = ?').get(user.id);
    await connection
      .prepare(
        `INSERT INTO users (id,email,password_hash,name,role,title,phone,school_id,grade,section)
      VALUES (?,?,?,?,?,?,?,1,?,?)`,
      )
      .run(
        account.id,
        account.email,
        account.password_hash,
        account.name,
        account.role,
        account.title,
        account.phone,
        account.grade,
        account.section,
      );
    await connection
      .prepare(
        'INSERT INTO audit_log(actor_id,action,entity,entity_id,meta,created_at) VALUES (?,?,?,?,?,?)',
      )
      .run(
        user.id,
        'workspace.create',
        'school',
        id,
        JSON.stringify({ beisId: id, name: school.name }),
        new Date().toISOString(),
      );
    await connection.exec('COMMIT');
    await coreDb
      .prepare('INSERT INTO school_workspaces(beis_id,owner_user_id,created_at) VALUES (?,?,?)')
      .run(id, user.id, new Date().toISOString());
    connections.set(id, connection);
    return await workspaceRecord(id);
  } catch (error) {
    if (connection.isTransaction) await connection.exec('ROLLBACK');
    await connection.close();
    throw error;
  }
}
