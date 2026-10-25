import { preferredWorkspace, rememberWorkspace } from './workspaces.mjs';
import crypto from 'node:crypto';
import { db, coreDb, currentDatabaseContext, nowIso } from './db.mjs';

const SESSION_DAYS = 7;
export const COOKIE_NAME = 'radar_session';

/* ------------------------------------------------------------------ */
/* Passwords                                                           */
/* ------------------------------------------------------------------ */

export function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `scrypt:${salt}:${hash}`;
}

export function verifyPassword(password, stored) {
  try {
    const [scheme, salt, hash] = String(stored).split(':');
    if (scheme !== 'scrypt' || !salt || !hash) return false;
    const candidate = crypto.scryptSync(password, salt, 64);
    const expected = Buffer.from(hash, 'hex');
    if (candidate.length !== expected.length) return false;
    return crypto.timingSafeEqual(candidate, expected);
  } catch {
    return false;
  }
}

/* ------------------------------------------------------------------ */
/* Sessions                                                            */
/* ------------------------------------------------------------------ */

export async function createSession(userId) {
  const token = crypto.randomBytes(32).toString('hex');
  const created = new Date();
  const expires = new Date(created.getTime() + SESSION_DAYS * 24 * 60 * 60 * 1000);
  const workspaceId = await preferredWorkspace(userId);
  await coreDb
    .prepare('INSERT INTO sessions (token,user_id,created_at,expires_at,workspace_id) VALUES (?,?,?,?,?)')
    .run(token, userId, created.toISOString(), expires.toISOString(), workspaceId);
  if (workspaceId) await rememberWorkspace(userId, workspaceId);
  return { token, expires, workspaceId };
}

export async function destroySession(token) {
  if (!token) return;
  await coreDb.prepare('DELETE FROM sessions WHERE token = ?').run(token);
}

export function parseCookies(header = '') {
  const out = {};
  for (const part of String(header).split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    const key = part.slice(0, idx).trim();
    const value = part.slice(idx + 1).trim();
    if (key) out[key] = decodeURIComponent(value);
  }
  return out;
}

export function sessionCookie(token, expires) {
  return `${COOKIE_NAME}=${token}; Path=/; HttpOnly; SameSite=Lax; Expires=${expires.toUTCString()}${process.env.RADAR_PUBLIC_URL?.startsWith('https://') ? '; Secure' : ''}`;
}

export function clearCookie() {
  return `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${process.env.RADAR_PUBLIC_URL?.startsWith('https://') ? '; Secure' : ''}`;
}

export async function getUserFromRequest(req) {
  const token = parseCookies(req.headers.cookie)[COOKIE_NAME];
  if (!token) return null;

  let row = await coreDb
    .prepare(
      `SELECT s.token, s.expires_at, s.workspace_id, u.id, u.email, u.name, u.role, u.title, u.phone, u.school_id, u.grade, u.supabase_auth_id, u.active AS account_active
       FROM sessions s JOIN users u ON u.id = s.user_id
       WHERE s.token = ?`,
    )
    .get(token);

  if (!row || row.account_active === 0) return null;
  if (new Date(row.expires_at).getTime() < Date.now()) {
    await destroySession(token);
    return null;
  }
  const accountScope = row.supabase_auth_id
    ? `supabase:${row.supabase_auth_id}`
    : `local:${row.id}`;
  const context = currentDatabaseContext();
  if (context?.workspaceId) {
    const member = await db.prepare('SELECT * FROM users WHERE id = ?').get(row.id);
    if (!member || member.active === 0) return null;
    row = { ...row, ...member };
  }
  return {
    accountScope,
    workspaceId: row.workspace_id ?? null,
    id: row.id,
    email: row.email,
    name: row.name,
    role: row.role,
    title: row.title,
    phone: row.phone,
    schoolId: row.school_id,
    grade: row.grade ?? null,
    sessionToken: token,
  };
}

/* ------------------------------------------------------------------ */
/* RBAC                                                                */
/* ------------------------------------------------------------------ */

// Actions are enforced server-side; the UI merely hides what is not allowed.
export const PERMISSIONS = {
  admin: ['*'],
  inspector: [
    'dashboard:read',
    'map:read',
    'hazards:read',
    'hazards:write',
    'hazards:verify',
    'scan:read',
    'scan:write',
    'buildings:read',
    'search:read',
    'notifications:read',
    'notifications:write',
    'sos:create',
    'alerts:read',
    'advisories:read',
    'safety:read',
    'safety:write',
    'evacuation:read',
    'resources:read',
    'resources:write',
    'recovery:read',
    'recovery:write',
    'analytics:read',
  ],
  teacher: [
    'dashboard:read',
    'map:read',
    'hazards:read',
    'hazards:write',
    'buildings:read',
    'rollcall:read',
    'rollcall:write',
    'search:read',
    'notifications:read',
    'notifications:write',
    'sos:create',
    'alerts:read',
    'advisories:read',
    'safety:read',
    'safety:write',
    'evacuation:read',
    'resources:read',
    'recovery:read',
    'analytics:read',
  ],
  responder: [
    'dashboard:read',
    'map:read',
    'hazards:read',
    'hazards:write',
    'hazards:verify',
    'buildings:read',
    'rollcall:read',
    'incidents:read',
    'incidents:write',
    'search:read',
    'notifications:read',
    'notifications:write',
    'sos:create',
    'alerts:read',
    'advisories:read',
    'safety:read',
    'safety:write',
    'evacuation:read',
    'evacuation:write',
    'resources:read',
    'resources:write',
    'recovery:read',
    'recovery:write',
    'analytics:read',
  ],
  student: [
    'hazards:report',
    'dashboard:read',
    'map:read',
    'search:read',
    'notifications:read',
    'sos:create',
    'alerts:read',
    'advisories:read',
    'safety:write',
    'evacuation:read',
    'resources:read',
  ],
  parent: [
    'dashboard:read',
    'map:read',
    'search:read',
    'notifications:read',
    'sos:create',
    'alerts:read',
    'advisories:read',
    'safety:write',
    'evacuation:read',
    'resources:read',
  ],
};

export function can(user, permission) {
  if (!user) return false;
  const allowed = PERMISSIONS[user.role] ?? [];
  return allowed.includes('*') || allowed.includes(permission);
}

export function publicUser(user) {
  if (!user) return null;
  return {
    id: user.id,
    accountScope: user.accountScope ?? `local:${user.id}`,
    email: user.email,
    name: user.name,
    role: user.role,
    title: user.title,
    phone: user.phone,
    schoolId: user.schoolId,
    grade: user.grade ?? null,
    permissions: PERMISSIONS[user.role] ?? [],
  };
}

/* ------------------------------------------------------------------ */
/* Audit                                                               */
/* ------------------------------------------------------------------ */

export async function audit(actorId, action, entity, entityId, meta = {}) {
  await db
    .prepare(
      'INSERT INTO audit_log (actor_id, action, entity, entity_id, meta, created_at) VALUES (?, ?, ?, ?, ?, ?)',
    )
    .run(
      actorId ?? null,
      action,
      entity,
      entityId == null ? null : String(entityId),
      JSON.stringify(meta),
      nowIso(),
    );
}
