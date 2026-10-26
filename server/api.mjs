import { visionApiKey, visionProvider, selectedVisionModel } from './vision-provider.mjs';
import { queueSosSms, drainSosSms } from './emergency-delivery.mjs';
import { advancedHandlers } from './advanced.mjs';
import { productHandlers } from './product.mjs';
import { queueAlertDelivery, drainDeliveryJobs } from './delivery.mjs';
import { inspectionReminders } from './maintenance.mjs';
import { featureHandlers } from './features.mjs';
import {
  usesSupabase,
  cloudSignIn,
  cloudSignUp,
  cloudUpload,
  cloudRequestPasswordReset,
  cloudUpdatePassword,
} from './supabase.mjs';
import fs from 'node:fs';
import {
  workspaceRecord,
  rememberWorkspace,
  workspaceAccess,
  workspaceSchool,
  createWorkspace,
  runInWorkspace,
} from './workspaces.mjs';
import path from 'node:path';
import crypto from 'node:crypto';
import { db, coreDb, currentDatabaseContext, UPLOAD_DIR, nowIso } from './db.mjs';
import {
  audit,
  can,
  clearCookie,
  createSession,
  destroySession,
  getUserFromRequest,
  publicUser,
  sessionCookie,
  verifyPassword,
  hashPassword,
} from './auth.mjs';

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

const MAX_JSON = 2 * 1024 * 1024;
const MAX_UPLOAD = 10 * 1024 * 1024;

const SEVERITY_ORDER = ['critical', 'high', 'medium', 'low', 'info'];
const STATUS_ORDER = ['new', 'pending_review', 'verified', 'in_progress', 'resolved'];

class HttpError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

function json(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store',
  });
  res.end(body);
}

function readJson(req) {
  if (req.body !== undefined) {
    try {
      const serialized =
        typeof req.body === 'string' || Buffer.isBuffer(req.body)
          ? req.body
          : JSON.stringify(req.body);
      if (Buffer.byteLength(serialized) > MAX_JSON)
        return Promise.reject(new HttpError(413, 'Request body is too large.'));
      const parsed =
        typeof req.body === 'object' && !Buffer.isBuffer(req.body)
          ? req.body
          : JSON.parse(serialized.toString());
      if (!parsed || Array.isArray(parsed) || typeof parsed !== 'object') throw new Error();
      return Promise.resolve(parsed);
    } catch {
      return Promise.reject(new HttpError(400, 'Request body must be valid JSON.'));
    }
  }
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_JSON) {
        reject(new HttpError(413, 'Request body is too large.'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      if (chunks.length === 0) return resolve({});
      try {
        const parsed = JSON.parse(Buffer.concat(chunks).toString('utf8'));
        if (!parsed || Array.isArray(parsed) || typeof parsed !== 'object') throw new Error();
        resolve(parsed);
      } catch {
        reject(new HttpError(400, 'Request body must be valid JSON.'));
      }
    });
    req.on('error', reject);
  });
}

function readBinary(req) {
  if (req.body !== undefined) {
    const buffer = Buffer.isBuffer(req.body)
      ? req.body
      : Buffer.from(
          typeof req.body === 'string'
            ? req.body
            : String(req.headers['content-type'] ?? '').includes(
                  'application/x-www-form-urlencoded',
                )
              ? new URLSearchParams(req.body).toString()
              : JSON.stringify(req.body),
        );
    return buffer.length > MAX_UPLOAD
      ? Promise.reject(new HttpError(413, 'Upload exceeds the 10 MB limit.'))
      : Promise.resolve(buffer);
  }
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_UPLOAD) {
        reject(new HttpError(413, 'Image exceeds the 10 MB limit.'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function str(value, max = 2000, field = 'field') {
  if (value == null) return '';
  const s = String(value).trim();
  if (s.length > max) throw new HttpError(400, `${field} must be ${max} characters or fewer.`);
  return s;
}

function optionalInt(value, field) {
  if (value == null || value === '') return null;
  const n = Number(value);
  if (!Number.isInteger(n)) throw new HttpError(400, `${field} must be an integer.`);
  return n;
}

function oneOf(value, allowed, field) {
  if (!allowed.includes(value)) {
    throw new HttpError(400, `${field} must be one of: ${allowed.join(', ')}.`);
  }
  return value;
}

function camel(row) {
  if (row == null) return row;
  const out = {};
  for (const [k, v] of Object.entries(row)) {
    out[k.replace(/_([a-z])/g, (_, c) => c.toUpperCase())] = v;
  }
  return out;
}

function camelAll(rows) {
  return rows.map(camel);
}

async function requireUser(req) {
  const user = await getUserFromRequest(req);
  if (!user) throw new HttpError(401, 'Sign in required.');
  return user;
}

function requirePermission(user, permission) {
  if (!can(user, permission)) {
    throw new HttpError(403, 'Your role does not allow this action.');
  }
}

function csv(value) {
  return String(value ?? '')
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean);
}

async function getSchool(user) {
  const id = user.schoolId ?? 1;
  const school = camel(await db.prepare('SELECT * FROM schools WHERE id = ?').get(id));
  if (school) school.locationVerified = Boolean(school.locationVerified);
  if (school && !school.locationVerified) {
    school.lat = null;
    school.lng = null;
  }
  return school;
}

async function roomContext(roomId) {
  if (!roomId) return null;
  return camel(
    await db
      .prepare(
        `SELECT r.id, r.code, r.name AS room_name, r.type, r.capacity, r.status AS room_status,
                f.id AS floor_id, f.level AS floor_level, f.name AS floor_name,
                b.id AS building_id, b.code AS building_code, b.name AS building_name
         FROM rooms r
         JOIN floors f ON f.id = r.floor_id
         JOIN buildings b ON b.id = f.building_id
         WHERE r.id = ?`,
      )
      .get(roomId),
  );
}

function locationLabel(ctx) {
  if (!ctx) return 'Unassigned location';
  return `${ctx.buildingName} · ${ctx.roomName}`;
}

/* ------------------------------------------------------------------ */
/* Stage 5–7 helpers                                                    */
/* ------------------------------------------------------------------ */

const ALERT_LEVELS = ['green', 'yellow', 'orange', 'red'];
const ALERT_KINDS = ['alert', 'announcement', 'suspension'];
const ALERT_AUDIENCES = ['school', 'staff', 'students', 'parents', 'grade', 'section', 'building'];
const ADVISORY_CATEGORIES = [
  'earthquake',
  'typhoon',
  'volcano',
  'flood',
  'landslide',
  'fire',
  'other',
];
const RESOURCE_STATUS = ['ok', 'due', 'expired', 'missing'];
const ROUTE_STATUS = ['open', 'restricted', 'closed'];
const DAMAGE_LEVELS = ['none', 'minor', 'moderate', 'severe'];
const CLEARANCE_STATES = ['pending', 'restricted', 'cleared'];

const ALERT_LEVEL_LABEL = {
  green: 'Green — Normal',
  yellow: 'Yellow — Advisory',
  orange: 'Orange — High alert',
  red: 'Red — Emergency',
};

const ADVISORY_CATEGORY_LABEL = {
  earthquake: 'Earthquake',
  typhoon: 'Typhoon',
  volcano: 'Volcano',
  flood: 'Flood',
  landslide: 'Landslide',
  fire: 'Fire',
  other: 'Other',
};

async function nextAlertRef() {
  const rows = await db
    .prepare("SELECT ref FROM alerts WHERE ref LIKE 'A-%' ORDER BY id DESC")
    .all();
  let max = 0;
  for (const row of rows) {
    const m = /A-\d{4}-(\d+)/.exec(row.ref);
    if (m) max = Math.max(max, Number(m[1]));
  }
  return `A-${new Date().getFullYear()}-${String(max + 1).padStart(4, '0')}-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
}

function alertState(row, now = nowIso()) {
  if (row.archived_at) return 'archived';
  if (row.effective_at && row.effective_at > now) return 'scheduled';
  if (row.expires_at && row.expires_at <= now) return 'expired';
  return 'active';
}

function alertAudienceLabel(row) {
  if (row.target_kind) return row.target_label || 'Selected school group';
  switch (row.audience) {
    case 'staff':
      return 'Staff';
    case 'students':
      return 'Students';
    case 'parents':
      return 'Parents & guardians';
    case 'grade':
      return `Grade ${row.audience_value || '—'}`;
    default:
      return 'Whole school';
  }
}

/**
 * SQL fragment limiting an alerts query (aliased `a`) to the audiences this
 * user may read. Safety command roles see every notice; teachers see
 * school/staff notices; students see school/student/their-grade notices; parents
 * see school/parent notices. The same rule is applied to the alert board and to
 * the dashboard banner.
 */
function visibleAlertFilter(user) {
  if (['admin', 'inspector', 'responder'].includes(user.role)) return { sql: '', params: [] };
  const classes = `SELECT id FROM rollcall_classes WHERE teacher_id=? UNION SELECT class_id FROM rollcall_people WHERE student_id=? UNION SELECT p.class_id FROM rollcall_people p JOIN student_guardians g ON g.student_id=p.student_id WHERE g.guardian_id=?`;
  const base =
    user.role === 'teacher'
      ? "a.audience IN ('school','staff')"
      : user.role === 'student'
        ? "(a.audience IN ('school','students') OR (a.audience='grade' AND a.audience_value=?))"
        : "a.audience IN ('school','parents')";
  const params = user.role === 'student' ? [user.grade ?? ''] : [];
  return {
    sql: `WHERE ((a.target_kind='' AND ${base}) OR (a.target_kind='section' AND a.target_value IN (SELECT CAST(c.id AS TEXT) FROM rollcall_classes c WHERE c.id IN (${classes}))) OR (a.target_kind='building' AND a.target_value IN (SELECT CAST(f.building_id AS TEXT) FROM rollcall_classes c JOIN rooms r ON r.id=c.room_id JOIN floors f ON f.id=r.floor_id WHERE c.id IN (${classes}))))`,
    params: [...params, user.id, user.id, user.id, user.id, user.id, user.id],
  };
}

async function alertRecipients(row) {
  if (row.target_kind) {
    const list =
      row.target_kind === 'section'
        ? 'SELECT id FROM rollcall_classes WHERE id=?'
        : 'SELECT c.id FROM rollcall_classes c JOIN rooms r ON r.id=c.room_id JOIN floors f ON f.id=r.floor_id WHERE f.building_id=?';
    const id = Number(row.target_value);
    return db
      .prepare(
        `SELECT id,name FROM users WHERE active=1 AND (role IN ('admin','inspector','responder') OR id IN (SELECT teacher_id FROM rollcall_classes WHERE id IN (${list})) OR id IN (SELECT student_id FROM rollcall_people WHERE class_id IN (${list})) OR id IN (SELECT g.guardian_id FROM student_guardians g JOIN rollcall_people p ON p.student_id=g.student_id WHERE p.class_id IN (${list})))`,
      )
      .all(id, id, id);
  }

  if (row.audience === 'staff') {
    return await db
      .prepare(
        "SELECT id, name FROM users WHERE role IN ('admin','inspector','teacher','responder')",
      )
      .all();
  }
  if (row.audience === 'students') {
    return await db.prepare("SELECT id, name FROM users WHERE role = 'student'").all();
  }
  if (row.audience === 'parents') {
    return await db.prepare("SELECT id, name FROM users WHERE role = 'parent'").all();
  }
  if (row.audience === 'grade') {
    const grade = String(row.audience_value ?? '').trim();
    if (!grade) return [];
    return await db
      .prepare("SELECT id, name FROM users WHERE role = 'student' AND grade = ?")
      .all(grade);
  }
  return await db.prepare('SELECT id, name FROM users').all();
}

/**
 * Lazy delivery: scheduled alerts become notifications when their effective
 * time has passed. Called by alert and notification reads so a scheduled
 * announcement is never lost without requiring a background daemon.
 */
async function materializeAlerts() {
  const now = nowIso();
  const due = await db
    .prepare(
      `SELECT * FROM alerts WHERE archived_at IS NULL AND effective_at <= ?
       AND (expires_at IS NULL OR expires_at > ?)`,
    )
    .all(now, now);

  for (const alert of due) {
    const recipients = await alertRecipients(alert);
    const insert = db.prepare(
      'INSERT OR IGNORE INTO alert_deliveries (alert_id, user_id, delivered_at) VALUES (?, ?, ?)',
    );
    for (const recipient of recipients) {
      const result = await insert.run(alert.id, recipient.id, now);
      if (!result.changes) continue;
      const type =
        alert.level === 'red' || alert.level === 'orange'
          ? 'alert'
          : alert.level === 'yellow'
            ? 'warning'
            : 'info';
      await addNotification(
        recipient.id,
        type,
        `${ALERT_LEVEL_LABEL[alert.level]} — ${alert.title}`,
        alert.body || `${alertAudienceLabel(alert)} announcement`,
        '/alerts',
      );
      await queueAlertDelivery(alert, recipient.id);
    }
  }
}

async function alertPayload(row) {
  const deliveryCount = (
    await db.prepare('SELECT COUNT(*) AS c FROM alert_deliveries WHERE alert_id = ?').get(row.id)
  ).c;
  return {
    ...camel(row),
    audience: row.target_kind || row.audience,
    state: alertState(row),
    audienceLabel: alertAudienceLabel(row),
    levelLabel: ALERT_LEVEL_LABEL[row.level] ?? row.level,
    deliveryCount,
  };
}

function advisoryFreshness(row) {
  if (row.status === 'archived') return 'archived';
  const now = Date.now();
  if (row.valid_until && new Date(row.valid_until).getTime() <= now) return 'expired';
  const published = new Date(row.published_at).getTime();
  if (Number.isFinite(published) && now - published > 24 * 60 * 60 * 1000) return 'stale';
  return 'current';
}

function advisoryPayload(row) {
  return {
    ...camel(row),
    freshness: advisoryFreshness(row),
    categoryLabel: ADVISORY_CATEGORY_LABEL[row.category] ?? row.category,
  };
}

async function resourceRows(whereSql = '', params = []) {
  return camelAll(
    await db
      .prepare(
        `SELECT e.*, r.name AS room_name,
                COALESCE(b.id, rb.id) AS resolved_building_id,
                COALESCE(b.name, rb.name) AS resolved_building_name,
                f.level AS floor_level
         FROM safety_equipment e
         LEFT JOIN rooms r ON r.id = e.room_id
         LEFT JOIN floors f ON f.id = r.floor_id
         LEFT JOIN buildings b ON b.id = e.building_id
         LEFT JOIN buildings rb ON rb.id = f.building_id
         ${whereSql}
         ORDER BY
           CASE e.status WHEN 'missing' THEN 0 WHEN 'expired' THEN 1 WHEN 'due' THEN 2 ELSE 3 END,
           e.label`,
      )
      .all(...params),
  );
}

async function recoveryTaskRows(whereSql = '', params = []) {
  return camelAll(
    await db
      .prepare(
        `SELECT t.*, u.name AS owner_name, c.name AS created_by_name, i.ref AS incident_ref, i.title AS incident_title
         FROM recovery_tasks t
         LEFT JOIN users u ON u.id = t.owner_id
         LEFT JOIN users c ON c.id = t.created_by
         LEFT JOIN incidents i ON i.id = t.incident_id
         ${whereSql}
         ORDER BY CASE t.status WHEN 'open' THEN 0 WHEN 'in_progress' THEN 1 ELSE 2 END,
                  CASE t.priority WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END,
                  t.due_at IS NULL, t.due_at`,
      )
      .all(...params),
  );
}

async function assessmentRows(whereSql = '', params = []) {
  return camelAll(
    await db
      .prepare(
        `SELECT d.*, b.name AS building_name, r.name AS room_name, u.name AS assessor_name
         FROM damage_assessments d
         LEFT JOIN buildings b ON b.id = d.building_id
         LEFT JOIN rooms r ON r.id = d.room_id
         LEFT JOIN users u ON u.id = d.assessed_by
         ${whereSql}
         ORDER BY d.assessed_at DESC`,
      )
      .all(...params),
  );
}

function csvEscape(value) {
  if (value == null) return '';
  const raw = String(value);
  const safe = typeof value === 'string' && /^[\s]*[=+@-]/.test(raw) ? "'" + raw : raw;
  const text = safe.replace(/"/g, '""');
  return /[",\n\r]/.test(text) ? `"${text}"` : text;
}

function sendCsv(res, filename, columns, rows) {
  const header = columns.map((c) => csvEscape(c.label)).join(',');
  const body = rows
    .map((row) =>
      columns
        .map((c) => csvEscape(typeof c.value === 'function' ? c.value(row) : row[c.value]))
        .join(','),
    )
    .join('\n');
  const payload = `${header}\n${body}\n`;
  res.writeHead(200, {
    'Content-Type': 'text/csv; charset=utf-8',
    'Content-Disposition': `attachment; filename="${filename}"`,
    'Cache-Control': 'no-store',
    'Content-Length': Buffer.byteLength(payload),
  });
  res.end(payload);
}

async function nextHazardRef() {
  const rows = await db
    .prepare("SELECT ref FROM hazards WHERE ref LIKE 'H-%' ORDER BY id DESC")
    .all();
  let max = 42;
  for (const row of rows) {
    const m = /H-\d{4}-(\d+)/.exec(row.ref);
    if (m) max = Math.max(max, Number(m[1]));
  }
  return `H-${new Date().getFullYear()}-${String(max + 1).padStart(4, '0')}-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
}

async function nextIncidentRef() {
  const rows = await db
    .prepare("SELECT ref FROM incidents WHERE ref LIKE 'INC-%' ORDER BY id DESC")
    .all();
  let max = 0;
  for (const row of rows) {
    const m = /INC-\d{4}-(\d+)/.exec(row.ref);
    if (m) max = Math.max(max, Number(m[1]));
  }
  return `INC-${new Date().getFullYear()}-${String(max + 1).padStart(4, '0')}-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
}

async function addNotification(userId, type, title, body, href = null) {
  if (!userId) return;
  await db
    .prepare(
      'INSERT INTO notifications (user_id, type, title, body, href, read, created_at) VALUES (?, ?, ?, ?, ?, 0, ?)',
    )
    .run(userId, type, title, body, href, nowIso());
}

async function notifyRoles(roles, type, title, body, href) {
  const placeholders = roles.map(() => '?').join(',');
  const users = await db
    .prepare(`SELECT id FROM users WHERE role IN (${placeholders})`)
    .all(...roles);
  for (const u of users) await addNotification(u.id, type, title, body, href);
}

async function hazardBaseRow(id) {
  return await db
    .prepare(
      `SELECT h.*, u.name AS reporter_name, a.name AS assignee_name
       FROM hazards h
       LEFT JOIN users u ON u.id = h.reported_by
       LEFT JOIN users a ON a.id = h.assigned_to
       WHERE h.id = ?`,
    )
    .get(id);
}

async function hazardListItem(row) {
  const ctx = await roomContext(row.room_id);
  return {
    id: row.id,
    ref: row.ref,
    title: row.title,
    description: row.description,
    severity: row.severity,
    status: row.status,
    location: row.location_note
      ? `${locationLabel(ctx)} — ${row.location_note}`
      : locationLabel(ctx),
    roomId: row.room_id,
    buildingId: ctx?.buildingId ?? null,
    buildingName: ctx?.buildingName ?? null,
    floorLevel: ctx?.floorLevel ?? null,
    reporter: row.anonymous ? 'Identity hidden' : row.reporter_name,
    assignee: row.assignee_name,
    source: row.source,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    verifiedAt: row.verified_at,
    resolvedAt: row.resolved_at,
    actionCount: (
      await db
        .prepare('SELECT COUNT(*) AS c FROM corrective_actions WHERE hazard_id = ?')
        .get(row.id)
    ).c,
    evidenceCount: (
      await db.prepare('SELECT COUNT(*) AS c FROM hazard_evidence WHERE hazard_id = ?').get(row.id)
    ).c,
  };
}

/* ------------------------------------------------------------------ */
/* Handlers                                                            */
/* ------------------------------------------------------------------ */

const handlers = {};

/* ---- Auth ---- */

handlers['GET /api/auth/config'] = async (ctx) =>
  json(ctx.res, 200, {
    provider: usesSupabase ? 'supabase' : 'local',
    training: process.env.RADAR_TEST_LAB === '1',
    signupEnabled: usesSupabase || process.env.RADAR_ALLOW_LOCAL_SIGNUP !== 'false',
    recoveryEnabled: usesSupabase,
    largeCloudUploads: Boolean(process.env.VERCEL) && usesSupabase,
  });
handlers['POST /api/auth/password-reset'] = async (ctx) => {
  if (!usesSupabase)
    throw new HttpError(400, 'Password recovery requires the configured Supabase Auth service.');
  const body = await readJson(ctx.req);
  const email = str(body.email, 200, 'email').toLowerCase();
  await checkAuthRate(ctx.req, email);
  if (!email.includes('@')) throw new HttpError(400, 'Enter a valid email address.');
  try {
    await cloudRequestPasswordReset(email);
  } catch {
    throw new HttpError(502, 'Password recovery is unavailable. Try again later.');
  }
  return json(ctx.res, 200, {
    message:
      'If that email can receive a recovery message, a password reset link has been requested. Check your inbox.',
  });
};
handlers['POST /api/auth/password-update'] = async (ctx) => {
  if (!usesSupabase) throw new HttpError(400, 'Password recovery is not configured.');
  const body = await readJson(ctx.req);
  const password = String(body.password ?? '');
  const token = String(body.accessToken ?? '');
  if (password.length < 8 || password.length > 200 || !token || token.length > 10000)
    throw new HttpError(400, 'Provide a valid recovery link and a password of 8–200 characters.');
  try {
    await cloudUpdatePassword(token, password);
  } catch (error) {
    throw new HttpError(400, error.message);
  }
  return json(ctx.res, 200, { message: 'Password updated. Sign in with your new password.' });
};

handlers['POST /api/auth/signup'] = async (ctx) => {
  if (!usesSupabase && process.env.RADAR_ALLOW_LOCAL_SIGNUP === 'false')
    throw new HttpError(400, 'Account registration is disabled by this installation.');
  const body = await readJson(ctx.req);
  const email = str(body.email, 200, 'email').toLowerCase();
  const name = str(body.name, 120, 'name');
  const password = String(body.password ?? '');
  await checkAuthRate(ctx.req, email);
  if (
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
    !name ||
    password.length < 8 ||
    password.length > 200
  )
    throw new HttpError(400, 'Enter your name, a valid email, and a password of 8–200 characters.');
  if (!usesSupabase) {
    if (await coreDb.prepare('SELECT id FROM users WHERE lower(email)=?').get(email))
      throw new HttpError(409, 'An account with this email already exists. Sign in instead.');
    const result = await coreDb
      .prepare(
        "INSERT INTO users(email,password_hash,name,role,school_id,created_at) VALUES (?,?,?,'student',1,?) ON CONFLICT(email) DO NOTHING RETURNING id",
      )
      .get(email, hashPassword(password), name, nowIso());
    if (!result)
      throw new HttpError(409, 'An account with this email already exists. Sign in instead.');
    await audit(result.id, 'auth.signup', 'user', result.id, { provider: 'local' });
    return json(ctx.res, 201, {
      message:
        'Account created. Sign in with your email, then choose your school and request access. School permissions require administrator approval.',
    });
  }
  try {
    return json(ctx.res, 200, await cloudSignUp(email, password, name));
  } catch (error) {
    throw new HttpError(400, error.message);
  }
};

handlers['POST /api/auth/login'] = async (ctx) => {
  const body = await readJson(ctx.req);
  const email = str(body.email, 200, 'email').toLowerCase();
  const password = String(body.password ?? '');
  await checkAuthRate(ctx.req, email);
  if (!email || !password) throw new HttpError(400, 'Email and password are required.');

  const row = usesSupabase
    ? await cloudSignIn(email, password)
    : await db.prepare('SELECT * FROM users WHERE lower(email) = ?').get(email);
  if (!row || row.active === 0 || (!usesSupabase && !verifyPassword(password, row.password_hash))) {
    throw new HttpError(401, 'Those credentials do not match an active account.');
  }
  const { token, expires, workspaceId } = await createSession(row.id);
  await audit(row.id, 'auth.login', 'user', row.id, { email: row.email });
  ctx.res.setHeader('Set-Cookie', sessionCookie(token, expires));
  const payload = async () => {
    const user = await getUserFromRequest({ headers: { cookie: `radar_session=${token}` } });
    if (!user) {
      await destroySession(token);
      throw new HttpError(401, 'This account or school membership is no longer active.');
    }
    return {
      user: publicUser(user),
      school: await getSchool(user),
      activeWorkspaceId: user.workspaceId ?? null,
    };
  };
  return json(ctx.res, 200, workspaceId ? await runInWorkspace(workspaceId, payload) : await payload());
};

handlers['POST /api/auth/logout'] = async (ctx) => {
  const user = await getUserFromRequest(ctx.req);
  if (user) {
    await destroySession(user.sessionToken);
    await audit(user.id, 'auth.logout', 'user', user.id, {});
  }
  ctx.res.setHeader('Set-Cookie', clearCookie());
  return json(ctx.res, 200, { ok: true });
};

handlers['GET /api/auth/me'] = async (ctx) => {
  const user = await requireUser(ctx.req);
  return json(ctx.res, 200, {
    user: publicUser(user),
    school: await getSchool(user),
    activeWorkspaceId: user.workspaceId ?? null,
  });
};

/* ---- School workspaces: control endpoints always use the account database. ---- */
handlers['GET /api/workspaces'] = async (ctx) => {
  const user = await requireUser(ctx.req);
  const workspaces = await coreDb
    .prepare(
      'SELECT w.beis_id, w.created_at FROM school_workspaces w LEFT JOIN workspace_members m ON m.workspace_id = w.beis_id AND m.user_id = ? AND m.active = 1 WHERE w.owner_user_id = ? OR m.user_id IS NOT NULL ORDER BY w.created_at',
    )
    .all(user.id, user.id);
  return json(ctx.res, 200, {
    workspaces: workspaces.map((w) => ({ beisId: w.beis_id, createdAt: w.created_at })),
    activeWorkspaceId: user.workspaceId,
  });
};
handlers['POST /api/workspaces'] = async (ctx) => {
  const user = await requireUser(ctx.req);
  requirePermission(user, 'admin:users');
  const body = await readJson(ctx.req);
  const id = String(body.beisId ?? '');
  if (!workspaceSchool(id))
    throw new HttpError(400, 'Choose a school from the Camarines Norte directory.');
  const existing = await workspaceRecord(id);
  if (existing && existing.owner_user_id !== user.id)
    throw new HttpError(403, 'This school workspace belongs to another administrator.');
  await createWorkspace(id, user);
  return json(ctx.res, existing ? 200 : 201, { beisId: id });
};
handlers['POST /api/workspaces/select'] = async (ctx) => {
  const user = await requireUser(ctx.req);
  const body = await readJson(ctx.req);
  const id = body.beisId == null ? null : String(body.beisId);
  if (id !== null) {
    const record = await workspaceRecord(id);
    if (!record) throw new HttpError(404, 'Create this school workspace first.');
    if (!(await workspaceAccess(id, user.id)))
      throw new HttpError(403, 'You do not have access to this school workspace.');
  }
  await coreDb
    .prepare('UPDATE sessions SET workspace_id = ? WHERE token = ?')
    .run(id, user.sessionToken);
  await rememberWorkspace(user.id, id);
  return json(ctx.res, 200, { activeWorkspaceId: id });
};

/* ---- Dashboard ---- */

handlers['GET /api/dashboard'] = async (ctx) => {
  const user = await requireUser(ctx.req);
  requirePermission(user, 'dashboard:read');
  const school = await getSchool(user);

  // Each aggregate is scoped to the permissions that govern the underlying data.
  const canHazards = can(user, 'hazards:read');
  const canIncidents = can(user, 'incidents:read');
  const canRollcall = can(user, 'rollcall:read');
  const canScan = can(user, 'scan:read');
  const canAudit = can(user, 'admin:audit');

  const totalRooms = (await db.prepare('SELECT COUNT(*) AS c FROM rooms').get()).c;
  const roomsScanned = canScan
    ? (
        await db
          .prepare("SELECT COUNT(DISTINCT room_id) AS c FROM scans WHERE status = 'submitted'")
          .get()
      ).c
    : 0;

  const severityRows = canHazards
    ? await db.prepare('SELECT severity, COUNT(*) AS c FROM hazards GROUP BY severity').all()
    : [];
  const severity = Object.fromEntries(SEVERITY_ORDER.map((s) => [s, 0]));
  for (const row of severityRows) severity[row.severity] = row.c;

  const statusRows = canHazards
    ? await db.prepare('SELECT status, COUNT(*) AS c FROM hazards GROUP BY status').all()
    : [];
  const statusCounts = Object.fromEntries(STATUS_ORDER.map((s) => [s, 0]));
  for (const row of statusRows) statusCounts[row.status] = row.c;

  const activeIncidents = canIncidents
    ? (await db.prepare("SELECT COUNT(*) AS c FROM incidents WHERE status != 'closed'").get()).c
    : 0;
  const activeAlerts = canIncidents
    ? (
        await db
          .prepare(
            "SELECT COUNT(*) AS c FROM incidents WHERE status = 'active' AND severity IN ('critical','high')",
          )
          .get()
      ).c
    : 0;

  const roll = canRollcall
    ? await db
        .prepare(
          'SELECT COALESCE(SUM(expected),0) AS expected, COALESCE(SUM(present),0) AS present FROM rollcall_classes',
        )
        .get()
    : { expected: 0, present: 0 };

  const last30 = canHazards
    ? (
        await db
          .prepare(
            "SELECT COUNT(*) AS c FROM hazards WHERE created_at >= datetime('now','-30 days')",
          )
          .get()
      ).c
    : 0;
  const prev30 = canHazards
    ? (
        await db
          .prepare(
            "SELECT COUNT(*) AS c FROM hazards WHERE created_at >= datetime('now','-60 days') AND created_at < datetime('now','-30 days')",
          )
          .get()
      ).c
    : 0;
  const resolved30 = canHazards
    ? (
        await db
          .prepare(
            "SELECT COUNT(*) AS c FROM hazards WHERE resolved_at >= datetime('now','-30 days')",
          )
          .get()
      ).c
    : 0;
  const resolvedPrev30 = canHazards
    ? (
        await db
          .prepare(
            "SELECT COUNT(*) AS c FROM hazards WHERE resolved_at >= datetime('now','-60 days') AND resolved_at < datetime('now','-30 days')",
          )
          .get()
      ).c
    : 0;

  // Real 6-month trend from the database.
  const months = [];
  const now = new Date();
  for (let i = 5; i >= 0; i -= 1) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push({
      key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
      month: d.toLocaleDateString('en-US', { month: 'short' }),
    });
  }
  const createdRows = canHazards
    ? await db
        .prepare('SELECT substr(created_at,1,7) AS k, COUNT(*) AS c FROM hazards GROUP BY k')
        .all()
    : [];
  const resolvedRows = canHazards
    ? await db
        .prepare(
          'SELECT substr(resolved_at,1,7) AS k, COUNT(*) AS c FROM hazards WHERE resolved_at IS NOT NULL GROUP BY k',
        )
        .all()
    : [];
  const createdMap = Object.fromEntries(createdRows.map((r) => [r.k, r.c]));
  const resolvedMap = Object.fromEntries(resolvedRows.map((r) => [r.k, r.c]));
  const trend = months.map((m) => ({
    month: m.month,
    reported: createdMap[m.key] ?? 0,
    resolved: resolvedMap[m.key] ?? 0,
  }));

  const activity = canAudit
    ? camelAll(
        await db
          .prepare(
            `SELECT a.action, a.entity, a.entity_id, a.meta, a.created_at, u.name AS actor_name, u.role AS actor_role
             FROM audit_log a LEFT JOIN users u ON u.id = a.actor_id
             ORDER BY a.created_at DESC LIMIT 8`,
          )
          .all(),
      )
    : [];

  const unread = (
    await db
      .prepare('SELECT COUNT(*) AS c FROM notifications WHERE user_id = ? AND read = 0')
      .get(user.id)
  ).c;

  const lastScan = canScan
    ? (
        await db
          .prepare("SELECT MAX(submitted_at) AS at FROM scans WHERE status = 'submitted'")
          .get()
      ).at
    : null;

  await materializeAlerts();
  const alertAudience = visibleAlertFilter(user);
  const alertAudienceSql = alertAudience.sql
    ? `AND ${alertAudience.sql.replace(/^WHERE /, '')}`
    : '';
  const activeAlertRows = can(user, 'alerts:read')
    ? await db
        .prepare(
          `SELECT a.level, a.title, a.kind FROM alerts a
           WHERE a.archived_at IS NULL AND a.effective_at <= ? AND (a.expires_at IS NULL OR a.expires_at > ?)
           ${alertAudienceSql}
           ORDER BY CASE a.level WHEN 'red' THEN 0 WHEN 'orange' THEN 1 WHEN 'yellow' THEN 2 ELSE 3 END, a.published_at DESC`,
        )
        .all(nowIso(), nowIso(), ...alertAudience.params)
    : [];
  const safetyNeedHelp = can(user, 'safety:read')
    ? (
        await db
          .prepare(
            "SELECT COUNT(*) AS c FROM safety_checks WHERE status = 'need_help' AND (expires_at IS NULL OR expires_at > ?)",
          )
          .get(nowIso())
      ).c
    : 0;
  const resourcesAttention = can(user, 'resources:read')
    ? (await db.prepare("SELECT COUNT(*) AS c FROM safety_equipment WHERE status != 'ok'").get()).c
    : 0;
  const recoveryOpen = can(user, 'recovery:read')
    ? (await db.prepare("SELECT COUNT(*) AS c FROM recovery_tasks WHERE status != 'done'").get()).c
    : 0;

  return json(ctx.res, 200, {
    school,
    generatedAt: nowIso(),
    kpis: {
      roomsScanned,
      totalRooms,
      roomCoverage: totalRooms ? Math.round((roomsScanned / totalRooms) * 100) : 0,
      verifiedHazards: canHazards
        ? (
            await db
              .prepare('SELECT COUNT(*) AS c FROM hazards WHERE verified_at IS NOT NULL')
              .get()
          ).c
        : 0,
      unresolved: canHazards
        ? (
            await db
              .prepare(
                "SELECT COUNT(*) AS c FROM hazards WHERE status IN ('new','pending_review','verified','in_progress')",
              )
              .get()
          ).c
        : 0,
      pendingReview: statusCounts.pending_review ?? 0,
      activeIncidents,
      activeAlerts,
      rollcallExpected: roll.expected,
      rollcallPresent: roll.present,
      rollcallCompletion: roll.expected ? Math.round((roll.present / roll.expected) * 100) : 0,
      reportedLast30: last30,
      resolvedLast30: resolved30,
      reportedDelta: prev30 ? Math.round(((last30 - prev30) / prev30) * 100) : null,
      resolvedDelta: resolvedPrev30
        ? Math.round(((resolved30 - resolvedPrev30) / resolvedPrev30) * 100)
        : null,
      unreadNotifications: unread,
      lastScanAt: lastScan,
      activeAlertCount: activeAlertRows.length,
      alertLevel: activeAlertRows[0]?.level ?? null,
      alertTitle: activeAlertRows[0]?.title ?? null,
      safetyNeedHelp,
      resourcesAttention,
      recoveryOpen,
    },
    severity,
    status: statusCounts,
    trend,
    activity,
  });
};

/* ---- Alerts & announcements (Stage 5) ---- */

handlers['GET /api/alerts'] = async (ctx) => {
  const user = await requireUser(ctx.req);
  requirePermission(user, 'alerts:read');
  await materializeAlerts();

  // Audience filtering happens on the server. A students-only or grade-specific
  // notice is not returned to staff or other grades just because they can read
  // the alert board. Safety command roles see the full picture.
  const audience = visibleAlertFilter(user);

  const items = await Promise.all(
    (
      await db
        .prepare(
          `SELECT a.*, u.name AS publisher_name, b.name AS building_name
       FROM alerts a
       LEFT JOIN users u ON u.id = a.published_by
       LEFT JOIN buildings b ON b.id = a.building_id
       ${audience.sql}
       ORDER BY a.published_at DESC, a.id DESC LIMIT 120`,
        )
        .all(...audience.params)
    ).map(alertPayload),
  );

  const counts = { active: 0, scheduled: 0, expired: 0, archived: 0 };
  const byLevel = Object.fromEntries(ALERT_LEVELS.map((l) => [l, 0]));
  for (const item of items) {
    counts[item.state] = (counts[item.state] ?? 0) + 1;
    if (item.state === 'active' || item.state === 'scheduled') byLevel[item.level] += 1;
  }

  return json(ctx.res, 200, {
    items,
    active: items.filter((item) => item.state === 'active'),
    counts,
    byLevel,
    levels: ALERT_LEVELS.map((id) => ({ id, label: ALERT_LEVEL_LABEL[id] })),
    generatedAt: nowIso(),
  });
};

handlers['POST /api/alerts'] = async (ctx) => {
  const user = await requireUser(ctx.req);
  requirePermission(user, 'alerts:publish');
  const body = await readJson(ctx.req);

  const level = oneOf(body.level, ALERT_LEVELS, 'level');
  const kind = oneOf(body.kind ?? 'alert', ALERT_KINDS, 'kind');
  const title = str(body.title, 180, 'title');
  if (!title) throw new HttpError(400, 'An alert title is required.');
  const message = str(body.body ?? '', 4000, 'body');
  const audience = oneOf(body.audience ?? 'school', ALERT_AUDIENCES, 'audience');
  const audienceValue = str(body.audienceValue ?? '', 60, 'audienceValue');
  if (audience === 'grade' && !audienceValue) {
    throw new HttpError(400, 'Choose a grade when targeting a grade level.');
  }
  let buildingId = optionalInt(body.buildingId, 'buildingId');
  let targetLabel = '';
  if (['section', 'building'].includes(audience)) {
    const targetId = finiteNumber(audienceValue, 'Target group', 1, 2147483647, true);
    const target = await db
      .prepare(
        audience === 'section'
          ? 'SELECT name FROM rollcall_classes WHERE id=?'
          : 'SELECT name FROM buildings WHERE id=?',
      )
      .get(targetId);
    if (!target) throw new HttpError(400, 'Select a registered class or building.');
    targetLabel = target.name;
    if (audience === 'building') buildingId = targetId;
  }
  const suspensionReason =
    kind === 'suspension' ? str(body.suspensionReason ?? body.body, 2000, 'Suspension reason') : '';
  if (kind === 'suspension' && !suspensionReason)
    throw new HttpError(400, 'Record the reason for the class suspension.');
  const resumeAt = body.resumeAt ? new Date(body.resumeAt) : null;
  if (resumeAt && Number.isNaN(resumeAt.getTime()))
    throw new HttpError(400, 'Choose a valid resumption date.');

  const effectiveAt = body.effectiveAt ? new Date(body.effectiveAt) : new Date();
  if (Number.isNaN(effectiveAt.getTime()))
    throw new HttpError(400, 'The effective date is invalid.');
  if (resumeAt && resumeAt.getTime() <= effectiveAt.getTime())
    throw new HttpError(400, 'Resumption must follow the suspension effective time.');
  let expiresAt = null;
  if (body.expiresAt) {
    const parsed = new Date(body.expiresAt);
    if (Number.isNaN(parsed.getTime())) throw new HttpError(400, 'The expiry date is invalid.');
    if (parsed.getTime() <= effectiveAt.getTime()) {
      throw new HttpError(400, 'The expiry time must be after the effective time.');
    }
    expiresAt = parsed.toISOString();
  }

  const at = nowIso();
  const ref = await nextAlertRef();
  const id = Number(
    (
      await db
        .prepare(
          `INSERT INTO alerts (ref, level, kind, title, body, audience, audience_value, building_id,
          effective_at, expires_at, published_by, published_at, archived_at, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?)`,
        )
        .run(
          ref,
          level,
          kind,
          title,
          message,
          ['section', 'building'].includes(audience) ? 'school' : audience,
          audienceValue,
          buildingId,
          effectiveAt.toISOString(),
          expiresAt,
          user.id,
          at,
          at,
        )
    ).lastInsertRowid,
  );

  await db
    .prepare(
      'UPDATE alerts SET send_push=?,send_sms=?,target_kind=?,target_value=?,target_label=?,suspension_reason=?,resume_at=? WHERE id=?',
    )
    .run(
      body.sendPush === true ? 1 : 0,
      body.sendSms === true ? 1 : 0,
      ['section', 'building'].includes(audience) ? audience : '',
      audienceValue,
      targetLabel,
      suspensionReason,
      resumeAt?.toISOString() ?? null,
      id,
    );
  await materializeAlerts();
  await audit(user.id, 'alert.publish', 'alert', id, { ref, level, kind, audience });
  const row = await db
    .prepare(
      `SELECT a.*, u.name AS publisher_name, b.name AS building_name FROM alerts a
       LEFT JOIN users u ON u.id = a.published_by LEFT JOIN buildings b ON b.id = a.building_id
       WHERE a.id = ?`,
    )
    .get(id);
  return json(ctx.res, 201, {
    alert: await alertPayload(row),
    message:
      effectiveAt.getTime() > Date.now()
        ? 'Announcement scheduled. In-app notifications are created when the effective time is reached.'
        : 'Announcement published. In-app notifications were created for the selected audience.',
  });
};

handlers['PATCH /api/alerts/:id'] = async (ctx) => {
  const user = await requireUser(ctx.req);
  requirePermission(user, 'alerts:publish');
  const id = Number(ctx.params.id);
  const row = await db.prepare('SELECT * FROM alerts WHERE id = ?').get(id);
  if (!row) throw new HttpError(404, 'Announcement not found.');
  const body = await readJson(ctx.req);
  const updates = [];
  const params = [];

  if (body.archived !== undefined) {
    updates.push('archived_at = ?');
    params.push(body.archived ? nowIso() : null);
  }
  if (body.expiresAt !== undefined) {
    if (!body.expiresAt) {
      updates.push('expires_at = ?');
      params.push(null);
    } else {
      const parsed = new Date(body.expiresAt);
      if (Number.isNaN(parsed.getTime())) throw new HttpError(400, 'The expiry date is invalid.');
      updates.push('expires_at = ?');
      params.push(parsed.toISOString());
    }
  }
  if (!updates.length) throw new HttpError(400, 'No supported fields were provided.');
  await db.prepare(`UPDATE alerts SET ${updates.join(', ')} WHERE id = ?`).run(...params, id);
  await audit(user.id, 'alert.update', 'alert', id, {
    fields: Object.keys(body),
    archived: body.archived,
  });
  const updated = await db.prepare('SELECT * FROM alerts WHERE id = ?').get(id);
  return json(ctx.res, 200, { alert: await alertPayload(updated) });
};

handlers['POST /api/alerts/:id/read'] = async (ctx) => {
  const user = await requireUser(ctx.req);
  requirePermission(user, 'alerts:read');
  const id = Number(ctx.params.id);
  await db
    .prepare(
      'UPDATE alert_deliveries SET read_at = ? WHERE alert_id = ? AND user_id = ? AND read_at IS NULL',
    )
    .run(nowIso(), id, user.id);
  return json(ctx.res, 200, { ok: true });
};

/* ---- Official advisories & feed connectors (Stage 5) ---- */

handlers['GET /api/advisories'] = async (ctx) => {
  const user = await requireUser(ctx.req);
  requirePermission(user, 'advisories:read');
  const rows = (
    await db
      .prepare(
        `SELECT a.*, u.name AS created_by_name FROM advisories a
       LEFT JOIN users u ON u.id = a.created_by
       ORDER BY a.published_at DESC, a.id DESC LIMIT 100`,
      )
      .all()
  ).map(advisoryPayload);
  const counts = { current: 0, stale: 0, expired: 0, archived: 0 };
  for (const row of rows) counts[row.freshness] = (counts[row.freshness] ?? 0) + 1;
  return json(ctx.res, 200, {
    items: rows,
    counts,
    categories: ADVISORY_CATEGORIES.map((id) => ({ id, label: ADVISORY_CATEGORY_LABEL[id] })),
    staleAfterHours: 24,
    generatedAt: nowIso(),
  });
};

handlers['POST /api/advisories'] = async (ctx) => {
  const user = await requireUser(ctx.req);
  requirePermission(user, 'advisories:write');
  const body = await readJson(ctx.req);

  const category = oneOf(body.category, ADVISORY_CATEGORIES, 'category');
  const title = str(body.title, 180, 'title');
  if (!title) throw new HttpError(400, 'An advisory title is required.');
  const summary = str(body.summary ?? '', 4000, 'summary');
  const sourceName = str(body.sourceName, 140, 'sourceName');
  if (!sourceName) throw new HttpError(400, 'Record the official source name.');
  const sourceUrl = str(body.sourceUrl ?? '', 500, 'sourceUrl');
  if (sourceUrl) {
    try {
      const parsed = new URL(sourceUrl);
      if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('protocol');
    } catch {
      throw new HttpError(400, 'The source URL must be a valid http(s) link.');
    }
  }
  const published = body.publishedAt ? new Date(body.publishedAt) : new Date();
  if (Number.isNaN(published.getTime()))
    throw new HttpError(400, 'The publication time is invalid.');
  let validUntil = null;
  if (body.validUntil) {
    const parsed = new Date(body.validUntil);
    if (Number.isNaN(parsed.getTime())) throw new HttpError(400, 'The validity time is invalid.');
    validUntil = parsed.toISOString();
  }
  const severity = oneOf(body.severity ?? 'info', SEVERITY_ORDER, 'severity');
  const at = nowIso();

  const id = Number(
    (
      await db
        .prepare(
          `INSERT INTO advisories (category, title, summary, source_name, source_url, published_at, valid_until,
          severity, status, created_by, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, ?)`,
        )
        .run(
          category,
          title,
          summary,
          sourceName,
          sourceUrl,
          published.toISOString(),
          validUntil,
          severity,
          user.id,
          at,
          at,
        )
    ).lastInsertRowid,
  );
  await audit(user.id, 'advisory.log', 'advisory', id, { category, sourceName, severity });
  await notifyRoles(
    ['admin', 'inspector', 'responder', 'teacher'],
    severity === 'critical' || severity === 'high' ? 'alert' : 'warning',
    'Official advisory recorded',
    `${ADVISORY_CATEGORY_LABEL[category]} — ${title} (${sourceName})`,
    '/disaster',
  );
  const row = await db.prepare('SELECT * FROM advisories WHERE id = ?').get(id);
  return json(ctx.res, 201, { advisory: advisoryPayload(row) });
};

handlers['PATCH /api/advisories/:id'] = async (ctx) => {
  const user = await requireUser(ctx.req);
  requirePermission(user, 'advisories:write');
  const id = Number(ctx.params.id);
  const row = await db.prepare('SELECT * FROM advisories WHERE id = ?').get(id);
  if (!row) throw new HttpError(404, 'Advisory not found.');
  const body = await readJson(ctx.req);
  const status = oneOf(body.status, ['active', 'archived'], 'status');
  await db
    .prepare('UPDATE advisories SET status = ?, updated_at = ? WHERE id = ?')
    .run(status, nowIso(), id);
  await audit(user.id, 'advisory.status', 'advisory', id, { status });
  const updated = await db.prepare('SELECT * FROM advisories WHERE id = ?').get(id);
  return json(ctx.res, 200, { advisory: advisoryPayload(updated) });
};

handlers['GET /api/feeds/status'] = async (ctx) => {
  const user = await requireUser(ctx.req);
  requirePermission(user, 'advisories:read');
  // Each adapter declares configuration separately from a successful fresh fetch.
  const connectors = [
    {
      id: 'earthquake',
      label: 'Earthquake bulletins',
      agency: 'USGS (PHIVOLCS PEIS is not inferred)',
      category: 'earthquake',
      configured: process.env.RADAR_USGS_FEED_ENABLED === 'true',
      requires: 'Enable RADAR_USGS_FEED_ENABLED and allow HTTPS access to earthquake.usgs.gov.',
      docs: 'https://earthquake.usgs.gov/earthquakes/feed/v1.0/geojson.php',
    },
    {
      id: 'typhoon',
      label: 'Tropical cyclone track',
      agency: 'PAGASA',
      category: 'typhoon',
      configured: false,
      requires: 'A server-side feed adapter for PAGASA bulletins.',
      docs: 'https://www.pagasa.dost.gov.ph/',
    },
    {
      id: 'volcano',
      label: 'Volcano alert levels',
      agency: 'PHIVOLCS',
      category: 'volcano',
      configured: false,
      requires: 'A server-side feed adapter for volcano bulletins.',
      docs: 'https://www.phivolcs.dost.gov.ph/',
    },
    {
      id: 'flood',
      label: 'Flood & rainfall warnings',
      agency: 'PAGASA / local DRRMO',
      category: 'flood',
      configured: false,
      requires: 'A server-side feed adapter or verified manual bulletins.',
      docs: 'https://www.pagasa.dost.gov.ph/',
    },
    {
      id: 'landslide',
      label: 'Landslide advisories',
      agency: 'MGB / local DRRMO',
      category: 'landslide',
      configured: false,
      requires: 'A server-side feed adapter or verified manual bulletins.',
      docs: 'https://www.mgb.gov.ph/',
    },
  ];
  const usgsStatus = await db
    .prepare("SELECT value FROM school_settings WHERE key='usgs_status'")
    .get();
  const usgs = usgsStatus ? JSON.parse(usgsStatus.value) : null;
  const verified =
    process.env.RADAR_USGS_FEED_ENABLED === 'true' &&
    usgs &&
    Date.now() - Date.parse(usgs.lastSuccessAt) < 7200000;
  return json(ctx.res, 200, {
    liveFeeds: Boolean(verified),
    lastUsgsSuccess: usgs?.lastSuccessAt ?? null,
    connectors,
    checkedAt: nowIso(),
    message: verified
      ? 'The USGS adapter has a recent successful source response. PHIVOLCS PEIS and school impact are not inferred. Other agencies require their own verified integrations.'
      : 'No live disaster connection is currently verified. Manual official advisories retain their source and publication time; configured adapters still need a successful source request.',
  });
};

/* ---- Personal safety check-in (Stage 5) ---- */

handlers['GET /api/safety/me'] = async (ctx) => {
  const user = await requireUser(ctx.req);
  const row = await db.prepare('SELECT * FROM safety_checks WHERE user_id = ?').get(user.id);
  if (!row) return json(ctx.res, 200, { check: null, context: null });
  return json(ctx.res, 200, { check: camel(row), context: await roomContext(row.room_id) });
};

handlers['POST /api/safety/check'] = async (ctx) => {
  const user = await requireUser(ctx.req);
  requirePermission(user, 'safety:write');
  const body = await readJson(ctx.req);
  const status = oneOf(body.status, ['safe', 'need_help'], 'status');
  const note = str(body.note ?? '', 500, 'note');
  const sharing = Boolean(body.sharing);
  if (!sharing) await db.prepare('DELETE FROM location_reports WHERE user_id=?').run(user.id);
  const roomId = sharing ? optionalInt(body.roomId, 'roomId') : null;
  const buildingId = sharing ? optionalInt(body.buildingId, 'buildingId') : null;
  if (roomId && !(await roomContext(roomId))) throw new HttpError(400, 'Select a valid room.');
  const ttlHours = Math.min(24, Math.max(1, Number(body.ttlHours ?? 4) || 4));
  const previous = await db.prepare('SELECT * FROM safety_checks WHERE user_id = ?').get(user.id);
  const at = nowIso();
  const expiresAt = new Date(Date.now() + ttlHours * 60 * 60 * 1000).toISOString();

  await db
    .prepare(
      `INSERT INTO safety_checks (user_id, status, note, building_id, room_id, sharing, expires_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(user_id) DO UPDATE SET
       status = excluded.status,
       note = excluded.note,
       building_id = excluded.building_id,
       room_id = excluded.room_id,
       sharing = excluded.sharing,
       expires_at = excluded.expires_at,
       updated_at = excluded.updated_at`,
    )
    .run(user.id, status, note, buildingId, roomId, sharing ? 1 : 0, expiresAt, at, at);

  const ctxRoom = await roomContext(roomId);
  const location = ctxRoom
    ? locationLabel(ctxRoom)
    : buildingId
      ? ((await db.prepare('SELECT name FROM buildings WHERE id = ?').get(buildingId))?.name ??
        'Campus building')
      : 'No location shared';

  if (status === 'need_help' && previous?.status !== 'need_help') {
    await notifyRoles(
      ['admin', 'responder', 'teacher'],
      'alert',
      'Assistance requested',
      `${user.name} (${user.role}) requested assistance. Location: ${location}.`,
      '/safety',
    );
  }
  for (const guardian of await db
    .prepare('SELECT guardian_id FROM student_guardians WHERE student_id=?')
    .all(user.id))
    await addNotification(
      guardian.guardian_id,
      'info',
      'Authorized student check-in',
      `${user.name} reported ${status === 'safe' ? 'safe' : 'a need for assistance'}. This is a reported status, not an independently verified location.`,
      '/operations?tab=guardians',
    );
  await audit(user.id, 'safety.check', 'safety_check', user.id, { status, sharing, location });
  const row = await db.prepare('SELECT * FROM safety_checks WHERE user_id = ?').get(user.id);
  return json(ctx.res, 200, {
    check: camel(row),
    context: ctxRoom,
    message:
      status === 'need_help'
        ? 'Your request is recorded for campus safety leads. This is not a call to emergency services.'
        : 'Your safety check-in is recorded. Location is only visible while sharing is enabled.',
  });
};

handlers['DELETE /api/safety/me'] = async (ctx) => {
  const user = await requireUser(ctx.req);
  await db.prepare('DELETE FROM location_reports WHERE user_id=?').run(user.id);
  requirePermission(user, 'safety:write');
  await db.prepare('DELETE FROM safety_checks WHERE user_id = ?').run(user.id);
  await audit(user.id, 'safety.clear', 'safety_check', user.id, {});
  return json(ctx.res, 200, { ok: true });
};

handlers['GET /api/safety/status'] = async (ctx) => {
  const user = await requireUser(ctx.req);
  requirePermission(user, 'safety:read');
  const url = new URL(ctx.req.url, 'http://localhost');
  const statusFilter = url.searchParams.get('status');
  const buildingId = optionalInt(url.searchParams.get('buildingId'), 'buildingId');
  const where = [];
  const params = [];
  if (statusFilter === 'safe' || statusFilter === 'need_help') {
    where.push('s.status = ?');
    params.push(statusFilter);
  }
  if (buildingId) {
    where.push('COALESCE(s.building_id, rb.id) = ?');
    params.push(buildingId);
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const rows = camelAll(
    await db
      .prepare(
        `SELECT s.*, u.name AS user_name, u.role AS user_role, u.title AS user_title,
                COALESCE(b.name, rb.name) AS building_name, r.name AS room_name, f.level AS floor_level
         FROM safety_checks s
         JOIN users u ON u.id = s.user_id
         LEFT JOIN buildings b ON b.id = s.building_id
         LEFT JOIN rooms r ON r.id = s.room_id
         LEFT JOIN floors f ON f.id = r.floor_id
         LEFT JOIN buildings rb ON rb.id = f.building_id
         ${whereSql}
         ORDER BY CASE s.status WHEN 'need_help' THEN 0 ELSE 1 END, s.updated_at DESC
         LIMIT 300`,
      )
      .all(...params),
  ).map((row) => {
    const expired = Boolean(row.expiresAt && row.expiresAt <= nowIso());
    return {
      ...row,
      sharing: Boolean(row.sharing),
      expired,
      stale: expired || Date.now() - new Date(row.updatedAt).getTime() > 60 * 60 * 1000,
    };
  });

  const counts = {
    total: rows.length,
    safe: rows.filter((r) => r.status === 'safe').length,
    needHelp: rows.filter((r) => r.status === 'need_help').length,
    sharing: rows.filter((r) => r.sharing && !r.expired).length,
    stale: rows.filter((r) => r.stale).length,
  };
  return json(ctx.res, 200, { checks: rows, counts, generatedAt: nowIso() });
};

/* ---- Map ---- */

handlers['GET /api/map'] = async (ctx) => {
  const user = await requireUser(ctx.req);
  requirePermission(user, 'map:read');
  const school = await getSchool(user);

  const buildings = camelAll(
    await db
      .prepare(
        `SELECT b.*, (SELECT COUNT(*) FROM floors f WHERE f.building_id = b.id) AS floor_count,
                (SELECT COUNT(*) FROM rooms r JOIN floors f2 ON f2.id = r.floor_id WHERE f2.building_id = b.id) AS room_count
         FROM buildings b WHERE b.school_id = ? ORDER BY b.name`,
      )
      .all(school.id),
  );

  const hazards = camelAll(
    await db
      .prepare(
        `SELECT h.id, h.ref, h.title, h.severity, h.status, h.room_id, h.location_note, h.created_at,
                b.id AS building_id, b.name AS building_name, r.name AS room_name, h.category
         FROM hazards h
         LEFT JOIN rooms r ON r.id = h.room_id
         LEFT JOIN floors f ON f.id = r.floor_id
         LEFT JOIN buildings b ON b.id = f.building_id
         WHERE h.status != 'resolved'
         ORDER BY CASE h.severity WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 WHEN 'low' THEN 3 ELSE 4 END`,
      )
      .all(),
  );

  const equipment = camelAll(
    await db
      .prepare(
        `SELECT e.id, e.type, e.label, e.status, e.last_checked_at, e.room_id, e.building_id,
                b.name AS building_name, r.name AS room_name
         FROM safety_equipment e
         LEFT JOIN buildings b ON b.id = e.building_id
         LEFT JOIN rooms r ON r.id = e.room_id`,
      )
      .all(),
  );

  const assemblyPoints = camelAll(
    await db.prepare('SELECT * FROM assembly_points WHERE school_id = ?').all(school.id),
  );

  const routes = camelAll(
    await db.prepare('SELECT * FROM evacuation_routes WHERE school_id = ?').all(school.id),
  ).map((r) => ({ ...r, path: JSON.parse(r.path) }));

  // Hazard severity is anchored to a building so the map can colour structures.
  for (const b of buildings) {
    const related = hazards.filter((h) => h.buildingId === b.id);
    b.hazardCount = related.length;
    b.worstSeverity =
      related.find((h) => h.severity === 'critical')?.severity ??
      related.find((h) => h.severity === 'high')?.severity ??
      related.find((h) => h.severity === 'medium')?.severity ??
      related[0]?.severity ??
      null;
  }

  return json(ctx.res, 200, {
    school,
    buildings,
    hazards,
    equipment,
    assemblyPoints,
    routes,
    generatedAt: nowIso(),
  });
};

/* ---- Buildings / floors / rooms ---- */

function workspaceUploadUrl(url) {
  const id = currentDatabaseContext()?.workspaceId;
  const prefix = id ? `/uploads/workspaces/${id}/` : '/uploads/';
  return url.startsWith(prefix) && /^[A-Za-z0-9_.-]+$/.test(url.slice(prefix.length));
}
function requiredText(value, field, max = 120) {
  const result = str(value, max, field);
  if (!result) throw new HttpError(400, `${field} is required.`);
  return result;
}
function finiteNumber(value, field, min, max, integer = false) {
  if (value === '' || value == null || typeof value === 'boolean')
    throw new HttpError(400, `${field} is required.`);
  const result = Number(value);
  if (
    !Number.isFinite(result) ||
    result < min ||
    result > max ||
    (integer && !Number.isInteger(result))
  )
    throw new HttpError(
      400,
      `${field} must be ${integer ? 'an integer' : 'a number'} between ${min} and ${max}.`,
    );
  return result;
}
handlers['POST /api/buildings'] = async (ctx) => {
  const user = await requireUser(ctx.req);
  requirePermission(user, 'admin:users');
  const body = await readJson(ctx.req);
  const name = requiredText(body.name, 'Building name');
  const code = requiredText(body.code, 'Building code', 30);
  const lat = finiteNumber(body.lat, 'Latitude', -90, 90);
  const lng = finiteNumber(body.lng, 'Longitude', -180, 180);
  if (
    await db
      .prepare('SELECT id FROM buildings WHERE school_id = ? AND lower(code) = lower(?)')
      .get(user.schoolId, code)
  )
    throw new HttpError(409, 'A building with that code already exists.');
  const id = Number(
    (
      await db
        .prepare(
          'INSERT INTO buildings(school_id,code,name,description,lat,lng,address) VALUES (?,?,?,?,?,?,?)',
        )
        .run(user.schoolId, code, name, str(body.description), lat, lng, str(body.address))
    ).lastInsertRowid,
  );
  await db
    .prepare(
      'UPDATE schools SET lat = ?, lng = ?, location_verified = 1 WHERE id = ? AND location_verified = 0',
    )
    .run(lat, lng, user.schoolId);
  await audit(user.id, 'building.create', 'building', id, { name, code });
  return json(ctx.res, 201, {
    building: camel(await db.prepare('SELECT * FROM buildings WHERE id = ?').get(id)),
  });
};
handlers['POST /api/buildings/:id/floors'] = async (ctx) => {
  const user = await requireUser(ctx.req);
  requirePermission(user, 'admin:users');
  const buildingId = Number(ctx.params.id);
  if (
    !(await db
      .prepare('SELECT id FROM buildings WHERE id = ? AND school_id = ?')
      .get(buildingId, user.schoolId))
  )
    throw new HttpError(404, 'Building not found.');
  const body = await readJson(ctx.req);
  const name = requiredText(body.name, 'Floor name');
  const level = finiteNumber(body.level, 'Floor level', -10, 150, true);
  if (
    await db
      .prepare('SELECT id FROM floors WHERE building_id = ? AND level = ?')
      .get(buildingId, level)
  )
    throw new HttpError(409, 'That floor level already exists in this building.');
  const id = Number(
    (
      await db
        .prepare('INSERT INTO floors(building_id,level,name) VALUES (?,?,?)')
        .run(buildingId, level, name)
    ).lastInsertRowid,
  );
  await audit(user.id, 'floor.create', 'floor', id, { buildingId, name, level });
  return json(ctx.res, 201, {
    floor: camel(await db.prepare('SELECT * FROM floors WHERE id = ?').get(id)),
  });
};
handlers['POST /api/floors/:id/rooms'] = async (ctx) => {
  const user = await requireUser(ctx.req);
  requirePermission(user, 'admin:users');
  const floorId = Number(ctx.params.id);
  if (
    !(await db
      .prepare(
        'SELECT f.id FROM floors f JOIN buildings b ON b.id = f.building_id WHERE f.id = ? AND b.school_id = ?',
      )
      .get(floorId, user.schoolId))
  )
    throw new HttpError(404, 'Floor not found.');
  const body = await readJson(ctx.req);
  const name = requiredText(body.name, 'Room name');
  const code = requiredText(body.code, 'Room code', 30);
  const type = oneOf(
    body.type ?? 'classroom',
    [
      'classroom',
      'laboratory',
      'office',
      'gymnasium',
      'library',
      'cafeteria',
      'circulation',
      'service',
      'restroom',
    ],
    'Room type',
  );
  const capacity = finiteNumber(body.capacity ?? 30, 'Capacity', 0, 100000, true);
  if (
    await db
      .prepare('SELECT id FROM rooms WHERE floor_id = ? AND lower(code) = lower(?)')
      .get(floorId, code)
  )
    throw new HttpError(409, 'A room with that code already exists on this floor.');
  const id = Number(
    (
      await db
        .prepare('INSERT INTO rooms(floor_id,code,name,type,capacity) VALUES (?,?,?,?,?)')
        .run(floorId, code, name, type, capacity)
    ).lastInsertRowid,
  );
  await audit(user.id, 'room.create', 'room', id, { floorId, name, code });
  return json(ctx.res, 201, {
    room: camel(await db.prepare('SELECT * FROM rooms WHERE id = ?').get(id)),
  });
};

handlers['GET /api/buildings'] = async (ctx) => {
  const user = await requireUser(ctx.req);
  requirePermission(user, 'buildings:read');
  const school = await getSchool(user);
  const buildings = camelAll(
    await db
      .prepare(
        `SELECT b.*, (SELECT COUNT(*) FROM rooms r JOIN floors f ON f.id = r.floor_id WHERE f.building_id = b.id) AS room_count,
                (SELECT COUNT(*) FROM floors f WHERE f.building_id = b.id) AS floor_count
         FROM buildings b WHERE b.school_id = ? ORDER BY b.name`,
      )
      .all(school.id),
  );
  const floors = camelAll(
    await db
      .prepare(
        `SELECT f.*, b.code AS building_code FROM floors f JOIN buildings b ON b.id = f.building_id
         WHERE b.school_id = ? ORDER BY b.name, f.level`,
      )
      .all(school.id),
  );
  const rooms = camelAll(
    await db
      .prepare(
        `SELECT r.id, r.code, r.name, r.type, r.capacity, r.status, r.last_inspected_at, f.id AS floor_id, f.level AS floor_level,
                b.id AS building_id, b.name AS building_name
         FROM rooms r JOIN floors f ON f.id = r.floor_id JOIN buildings b ON b.id = f.building_id
         WHERE b.school_id = ? ORDER BY b.name, f.level, r.code`,
      )
      .all(school.id),
  );
  return json(ctx.res, 200, { buildings, floors, rooms });
};

handlers['GET /api/buildings/:id'] = async (ctx) => {
  const user = await requireUser(ctx.req);
  requirePermission(user, 'buildings:read');
  const id = Number(ctx.params.id);
  const building = camel(
    await db
      .prepare(
        `SELECT b.*,
                (SELECT COUNT(*) FROM floors f WHERE f.building_id = b.id) AS floor_count,
                (SELECT COUNT(*) FROM rooms r JOIN floors f2 ON f2.id = r.floor_id WHERE f2.building_id = b.id) AS room_count
         FROM buildings b WHERE b.id = ?`,
      )
      .get(id),
  );
  if (!building) throw new HttpError(404, 'Building not found.');
  const floors = camelAll(
    await db.prepare('SELECT * FROM floors WHERE building_id = ? ORDER BY level').all(id),
  );
  const rooms = camelAll(
    await db
      .prepare(
        `SELECT r.*, f.level AS floor_level FROM rooms r JOIN floors f ON f.id = r.floor_id
         WHERE f.building_id = ? ORDER BY f.level, r.code`,
      )
      .all(id),
  );
  const equipment = camelAll(
    await db
      .prepare(
        `SELECT e.*, r.name AS room_name FROM safety_equipment e
         LEFT JOIN rooms r ON r.id = e.room_id
         LEFT JOIN floors f ON f.id = r.floor_id
         WHERE f.building_id = ? OR e.building_id = ?`,
      )
      .all(id, id),
  );
  const hazards = camelAll(
    await db
      .prepare(
        `SELECT h.*, r.name AS room_name FROM hazards h
         JOIN rooms r ON r.id = h.room_id JOIN floors f ON f.id = r.floor_id
         WHERE f.building_id = ? ORDER BY h.created_at DESC`,
      )
      .all(id),
  );
  return json(ctx.res, 200, { building, floors, rooms, equipment, hazards });
};

handlers['GET /api/floors/:id'] = async (ctx) => {
  const user = await requireUser(ctx.req);
  requirePermission(user, 'buildings:read');
  const id = Number(ctx.params.id);
  const floor = camel(await db.prepare('SELECT * FROM floors WHERE id = ?').get(id));
  if (!floor) throw new HttpError(404, 'Floor not found.');
  const building = camel(
    await db.prepare('SELECT * FROM buildings WHERE id = ?').get(floor.buildingId),
  );
  const rooms = camelAll(
    await db
      .prepare(
        `SELECT r.*,
          (SELECT COUNT(*) FROM hazards h WHERE h.room_id = r.id AND h.status != 'resolved') AS open_hazards,
          (SELECT COUNT(*) FROM safety_equipment e WHERE e.room_id = r.id) AS equipment_count
         FROM rooms r WHERE r.floor_id = ? ORDER BY r.code`,
      )
      .all(id),
  );
  const equipment = camelAll(
    await db
      .prepare(
        `SELECT e.*, r.name AS room_name FROM safety_equipment e
         JOIN rooms r ON r.id = e.room_id WHERE r.floor_id = ?`,
      )
      .all(id),
  );
  const hazards = camelAll(
    await db
      .prepare(
        `SELECT h.*, r.name AS room_name FROM hazards h JOIN rooms r ON r.id = h.room_id
         WHERE r.floor_id = ? AND h.status != 'resolved' ORDER BY h.created_at DESC`,
      )
      .all(id),
  );
  return json(ctx.res, 200, { floor, building, rooms, equipment, hazards });
};

handlers['GET /api/rooms/:id'] = async (ctx) => {
  const user = await requireUser(ctx.req);
  requirePermission(user, 'buildings:read');
  const id = Number(ctx.params.id);
  const ctxRoom = await roomContext(id);
  if (!ctxRoom) throw new HttpError(404, 'Room not found.');
  const room = camel(await db.prepare('SELECT * FROM rooms WHERE id = ?').get(id));
  const equipment = camelAll(
    await db.prepare('SELECT * FROM safety_equipment WHERE room_id = ? ORDER BY type').all(id),
  );
  const hazards = await Promise.all(
    camelAll(
      await db
        .prepare(
          `SELECT h.*, u.name AS reporter_name, a.name AS assignee_name FROM hazards h
         LEFT JOIN users u ON u.id = h.reported_by LEFT JOIN users a ON a.id = h.assigned_to
         WHERE h.room_id = ? ORDER BY h.created_at DESC`,
        )
        .all(id),
    ).map(hazardListItem),
  );
  const scans = camelAll(
    await db
      .prepare(
        `SELECT s.*, u.name AS inspector_name FROM scans s LEFT JOIN users u ON u.id = s.inspector_id
         WHERE s.room_id = ? ORDER BY s.started_at DESC LIMIT 5`,
      )
      .all(id),
  );
  return json(ctx.res, 200, { room, context: ctxRoom, equipment, hazards, scans });
};

/* ---- Evacuation routes & assembly points (Stage 6) ---- */

handlers['GET /api/evacuation'] = async (ctx) => {
  const user = await requireUser(ctx.req);
  requirePermission(user, 'evacuation:read');
  const school = await getSchool(user);

  const buildings = camelAll(
    await db.prepare('SELECT * FROM buildings WHERE school_id = ? ORDER BY name').all(school.id),
  );
  const assemblyPoints = camelAll(
    await db
      .prepare('SELECT * FROM assembly_points WHERE school_id = ? ORDER BY name')
      .all(school.id),
  ).map((point) => ({ ...point, accessible: Boolean(point.accessible) }));
  const routes = camelAll(
    await db
      .prepare('SELECT * FROM evacuation_routes WHERE school_id = ? ORDER BY name')
      .all(school.id),
  ).map((route) => ({
    ...route,
    path: JSON.parse(route.path),
    accessible: Boolean(route.accessible),
  }));

  const rollcall = can(user, 'rollcall:read')
    ? await db
        .prepare(
          'SELECT COALESCE(SUM(expected),0) AS expected, COALESCE(SUM(present),0) AS present, COUNT(*) AS classes FROM rollcall_classes',
        )
        .get()
    : null;

  return json(ctx.res, 200, {
    school,
    buildings,
    assemblyPoints,
    routes,
    rollcall,
    generatedAt: nowIso(),
    summary: {
      routes: routes.length,
      open: routes.filter((r) => r.status === 'open').length,
      restricted: routes.filter((r) => r.status === 'restricted').length,
      closed: routes.filter((r) => r.status === 'closed').length,
      accessible: routes.filter((r) => r.accessible).length,
      assemblyCapacity: assemblyPoints.reduce((sum, p) => sum + p.capacity, 0),
    },
    disclaimer:
      'Routes are planning aids based on mapped walkways. Approved school evacuation plans and on-scene responders take precedence.',
  });
};

handlers['PATCH /api/evacuation/routes/:id'] = async (ctx) => {
  const user = await requireUser(ctx.req);
  requirePermission(user, 'evacuation:write');
  const id = Number(ctx.params.id);
  const route = await db.prepare('SELECT * FROM evacuation_routes WHERE id = ?').get(id);
  if (!route) throw new HttpError(404, 'Evacuation route not found.');
  const body = await readJson(ctx.req);
  const updates = [];
  const params = [];
  if (body.status !== undefined) {
    updates.push('status = ?');
    params.push(oneOf(body.status, ROUTE_STATUS, 'status'));
  }
  if (body.notes !== undefined) {
    updates.push('notes = ?');
    params.push(str(body.notes, 1000, 'notes'));
  }
  if (body.accessible !== undefined) {
    updates.push('accessible = ?');
    params.push(body.accessible ? 1 : 0);
  }
  if (!updates.length) throw new HttpError(400, 'No supported fields were provided.');
  updates.push('updated_at = ?');
  params.push(nowIso());
  await db
    .prepare(`UPDATE evacuation_routes SET ${updates.join(', ')} WHERE id = ?`)
    .run(...params, id);
  await audit(user.id, 'evacuation.route.update', 'evacuation_route', id, {
    fields: Object.keys(body),
  });
  if (body.status && body.status !== 'open') {
    await notifyRoles(
      ['admin', 'inspector', 'teacher', 'responder'],
      body.status === 'closed' ? 'alert' : 'warning',
      `Evacuation route ${body.status}`,
      `${route.name} is now ${body.status}. Check the evacuation board for the alternate route.`,
      '/evacuation',
    );
  }
  const updated = await db.prepare('SELECT * FROM evacuation_routes WHERE id = ?').get(id);
  return json(ctx.res, 200, {
    route: {
      ...camel(updated),
      path: JSON.parse(updated.path),
      accessible: Boolean(updated.accessible),
    },
  });
};

handlers['PATCH /api/evacuation/assembly/:id'] = async (ctx) => {
  const user = await requireUser(ctx.req);
  requirePermission(user, 'evacuation:write');
  const id = Number(ctx.params.id);
  const point = await db.prepare('SELECT * FROM assembly_points WHERE id = ?').get(id);
  if (!point) throw new HttpError(404, 'Assembly point not found.');
  const body = await readJson(ctx.req);
  const updates = [];
  const params = [];
  if (body.status !== undefined) {
    updates.push('status = ?');
    params.push(oneOf(body.status, ROUTE_STATUS, 'status'));
  }
  if (body.capacity !== undefined) {
    const capacity = optionalInt(body.capacity, 'capacity');
    if (capacity == null || capacity < 0)
      throw new HttpError(400, 'Capacity must be zero or greater.');
    updates.push('capacity = ?');
    params.push(capacity);
  }
  if (body.accessible !== undefined) {
    updates.push('accessible = ?');
    params.push(body.accessible ? 1 : 0);
  }
  if (body.notes !== undefined) {
    updates.push('notes = ?');
    params.push(str(body.notes, 1000, 'notes'));
  }
  if (!updates.length) throw new HttpError(400, 'No supported fields were provided.');
  updates.push('updated_at = ?');
  params.push(nowIso());
  await db
    .prepare(`UPDATE assembly_points SET ${updates.join(', ')} WHERE id = ?`)
    .run(...params, id);
  await audit(user.id, 'assembly.update', 'assembly_point', id, { fields: Object.keys(body) });
  const updated = await db.prepare('SELECT * FROM assembly_points WHERE id = ?').get(id);
  return json(ctx.res, 200, {
    assemblyPoint: { ...camel(updated), accessible: Boolean(updated.accessible) },
  });
};

/* ---- Emergency resources (Stage 6) ---- */

handlers['GET /api/resources'] = async (ctx) => {
  const user = await requireUser(ctx.req);
  requirePermission(user, 'resources:read');
  const url = new URL(ctx.req.url, 'http://localhost');
  const q = str(url.searchParams.get('q') ?? '', 160);
  const statuses = csv(url.searchParams.get('status'));
  const type = str(url.searchParams.get('type') ?? '', 60);
  const buildingId = optionalInt(url.searchParams.get('buildingId'), 'buildingId');

  const where = [];
  const params = [];
  if (statuses.length) {
    where.push(`e.status IN (${statuses.map(() => '?').join(',')})`);
    params.push(...statuses);
  }
  if (type) {
    where.push('e.type = ?');
    params.push(type);
  }
  if (buildingId) {
    where.push('COALESCE(b.id, rb.id) = ?');
    params.push(buildingId);
  }
  if (q) {
    where.push(
      '(e.label LIKE ? OR e.type LIKE ? OR e.notes LIKE ? OR e.location_note LIKE ? OR r.name LIKE ? OR b.name LIKE ? OR rb.name LIKE ?)',
    );
    const like = `%${q}%`;
    params.push(like, like, like, like, like, like, like);
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const raw = await resourceRows(whereSql, params);
  const now = Date.now();
  const items = raw.map((row) => {
    const expiresAt = row.expiresAt;
    const expiryState = !expiresAt
      ? 'none'
      : new Date(expiresAt).getTime() < now
        ? 'expired'
        : new Date(expiresAt).getTime() - now < 30 * 24 * 60 * 60 * 1000
          ? 'expiring'
          : 'valid';
    return {
      ...row,
      buildingId: row.resolvedBuildingId ?? null,
      buildingName: row.resolvedBuildingName ?? null,
      expiryState,
    };
  });

  const all = (await resourceRows()).map((row) => ({
    ...row,
    buildingId: row.resolvedBuildingId ?? null,
    buildingName: row.resolvedBuildingName ?? null,
    expiryState: !row.expiresAt
      ? 'none'
      : new Date(row.expiresAt).getTime() < now
        ? 'expired'
        : new Date(row.expiresAt).getTime() - now < 30 * 24 * 60 * 60 * 1000
          ? 'expiring'
          : 'valid',
  }));
  const summary = {
    total: all.length,
    ok: all.filter((r) => r.status === 'ok').length,
    due: all.filter((r) => r.status === 'due').length,
    expired: all.filter((r) => r.status === 'expired' || r.expiryState === 'expired').length,
    missing: all.filter((r) => r.status === 'missing').length,
    expiring: all.filter((r) => r.expiryState === 'expiring').length,
    totalUnits: all.reduce((sum, r) => sum + (r.quantity ?? 0), 0),
  };
  return json(ctx.res, 200, {
    items,
    summary,
    types: [...new Set(all.map((r) => r.type))].sort(),
    generatedAt: nowIso(),
  });
};

handlers['POST /api/resources'] = async (ctx) => {
  const user = await requireUser(ctx.req);
  requirePermission(user, 'resources:write');
  const body = await readJson(ctx.req);
  const type = str(body.type, 60, 'type');
  const label = str(body.label, 160, 'label');
  if (!type || !label) throw new HttpError(400, 'Resource type and label are required.');
  const roomId = optionalInt(body.roomId, 'roomId');
  const buildingId = optionalInt(body.buildingId, 'buildingId');
  if (!roomId && !buildingId)
    throw new HttpError(400, 'Choose a room or a building for this resource.');
  const status = oneOf(body.status ?? 'ok', RESOURCE_STATUS, 'status');
  const quantity = Math.max(0, Number(body.quantity ?? 1) || 0);
  let expiresAt = null;
  if (body.expiresAt) {
    const parsed = new Date(body.expiresAt);
    if (Number.isNaN(parsed.getTime())) throw new HttpError(400, 'The expiry date is invalid.');
    expiresAt = parsed.toISOString();
  }
  const department = str(body.department ?? '', 120, 'department');
  const locationNote = str(body.locationNote ?? '', 200, 'locationNote');
  const notes = str(body.notes ?? '', 1000, 'notes');
  const lastCheckedAt = body.lastCheckedAt ? new Date(body.lastCheckedAt).toISOString() : null;

  const id = Number(
    (
      await db
        .prepare(
          `INSERT INTO safety_equipment (room_id, building_id, type, label, status, last_checked_at, notes,
          quantity, expires_at, department, location_note)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          roomId,
          buildingId,
          type,
          label,
          status,
          lastCheckedAt,
          notes,
          quantity,
          expiresAt,
          department,
          locationNote,
        )
    ).lastInsertRowid,
  );
  await audit(user.id, 'resource.create', 'safety_equipment', id, { type, label, status });
  if (status !== 'ok' || (expiresAt && new Date(expiresAt).getTime() < Date.now())) {
    await notifyRoles(
      ['admin', 'inspector', 'responder'],
      'warning',
      'Resource needs attention',
      `${label} is marked ${status}.`,
      '/resources',
    );
  }
  const created = (await resourceRows('WHERE e.id = ?', [id]))[0];
  return json(ctx.res, 201, {
    resource: {
      ...created,
      buildingId: created.resolvedBuildingId ?? null,
      buildingName: created.resolvedBuildingName ?? null,
    },
  });
};

handlers['PATCH /api/resources/:id'] = async (ctx) => {
  const user = await requireUser(ctx.req);
  requirePermission(user, 'resources:write');
  const id = Number(ctx.params.id);
  const row = await db.prepare('SELECT * FROM safety_equipment WHERE id = ?').get(id);
  if (!row) throw new HttpError(404, 'Resource not found.');
  const body = await readJson(ctx.req);
  const updates = [];
  const params = [];
  if (body.status !== undefined) {
    updates.push('status = ?');
    params.push(oneOf(body.status, RESOURCE_STATUS, 'status'));
  }
  if (body.quantity !== undefined) {
    updates.push('quantity = ?');
    params.push(Math.max(0, Number(body.quantity) || 0));
  }
  if (body.notes !== undefined) {
    updates.push('notes = ?');
    params.push(str(body.notes, 1000, 'notes'));
  }
  if (body.locationNote !== undefined) {
    updates.push('location_note = ?');
    params.push(str(body.locationNote, 200, 'locationNote'));
  }
  if (body.expiresAt !== undefined) {
    if (!body.expiresAt) {
      updates.push('expires_at = ?');
      params.push(null);
    } else {
      const parsed = new Date(body.expiresAt);
      if (Number.isNaN(parsed.getTime())) throw new HttpError(400, 'The expiry date is invalid.');
      updates.push('expires_at = ?');
      params.push(parsed.toISOString());
    }
  }
  if (body.checked !== undefined && body.checked) {
    updates.push('last_checked_at = ?');
    params.push(nowIso());
  }
  if (!updates.length) throw new HttpError(400, 'No supported fields were provided.');
  await db
    .prepare(`UPDATE safety_equipment SET ${updates.join(', ')} WHERE id = ?`)
    .run(...params, id);
  await audit(user.id, 'resource.update', 'safety_equipment', id, { fields: Object.keys(body) });
  const updated = (await resourceRows('WHERE e.id = ?', [id]))[0];
  return json(ctx.res, 200, {
    resource: {
      ...updated,
      buildingId: updated.resolvedBuildingId ?? null,
      buildingName: updated.resolvedBuildingName ?? null,
    },
  });
};

/* ---- Hazards ---- */

handlers['GET /api/hazards'] = async (ctx) => {
  const user = await requireUser(ctx.req);
  requirePermission(user, 'hazards:read');
  const url = new URL(ctx.req.url, 'http://localhost');
  const q = str(url.searchParams.get('q') ?? '', 200);
  const statuses = csv(url.searchParams.get('status'));
  const severities = csv(url.searchParams.get('severity'));
  const buildingId = optionalInt(url.searchParams.get('buildingId'), 'buildingId');
  const assigned = url.searchParams.get('assigned');
  const sort = url.searchParams.get('sort') ?? 'updated_at';
  const dir = (url.searchParams.get('dir') ?? 'desc').toLowerCase() === 'asc' ? 'ASC' : 'DESC';
  const page = Math.max(1, Number(url.searchParams.get('page') ?? 1));
  const pageSize = Math.min(100, Math.max(1, Number(url.searchParams.get('pageSize') ?? 10)));

  const where = [];
  const params = [];

  if (statuses.length) {
    where.push(`h.status IN (${statuses.map(() => '?').join(',')})`);
    params.push(...statuses);
  }
  if (severities.length) {
    where.push(`h.severity IN (${severities.map(() => '?').join(',')})`);
    params.push(...severities);
  }
  if (buildingId) {
    where.push('b.id = ?');
    params.push(buildingId);
  }
  if (assigned === 'me') {
    where.push('h.assigned_to = ?');
    params.push(user.id);
  } else if (assigned === 'unassigned') {
    where.push('h.assigned_to IS NULL');
  }
  if (q) {
    where.push(
      '(h.ref LIKE ? OR h.title LIKE ? OR h.description LIKE ? OR r.name LIKE ? OR b.name LIKE ?)',
    );
    const like = `%${q}%`;
    params.push(like, like, like, like, like);
  }

  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const base = `FROM hazards h
    LEFT JOIN rooms r ON r.id = h.room_id
    LEFT JOIN floors f ON f.id = r.floor_id
    LEFT JOIN buildings b ON b.id = f.building_id
    LEFT JOIN users u ON u.id = h.reported_by
    LEFT JOIN users a ON a.id = h.assigned_to
    ${whereSql}`;

  const sortMap = {
    updated_at: 'h.updated_at',
    created_at: 'h.created_at',
    ref: 'h.ref',
    title: 'h.title',
    status: `CASE h.status ${STATUS_ORDER.map((s, i) => `WHEN '${s}' THEN ${i}`).join(' ')} ELSE 99 END`,
    severity: `CASE h.severity ${SEVERITY_ORDER.map((s, i) => `WHEN '${s}' THEN ${i}`).join(' ')} ELSE 99 END`,
  };
  const orderBy = sortMap[sort] ?? sortMap.updated_at;

  const total = (await db.prepare(`SELECT COUNT(*) AS c ${base}`).get(...params)).c;
  const rows = await db
    .prepare(
      `SELECT h.*, u.name AS reporter_name, a.name AS assignee_name, r.name AS room_name, b.name AS building_name, b.id AS building_id
       ${base} ORDER BY ${orderBy} ${dir}, h.id DESC LIMIT ? OFFSET ?`,
    )
    .all(...params, pageSize, (page - 1) * pageSize);

  const items = await Promise.all(
    rows.map(
      async (row) =>
        await hazardListItem({
          ...row,
          reporter_name: row.reporter_name,
          assignee_name: row.assignee_name,
        }),
    ),
  );

  const statusCounts = await db
    .prepare(`SELECT h.status, COUNT(*) AS c ${base} GROUP BY h.status`)
    .all(...params);
  const severityCounts = await db
    .prepare(`SELECT h.severity, COUNT(*) AS c ${base} GROUP BY h.severity`)
    .all(...params);

  return json(ctx.res, 200, {
    items,
    total,
    page,
    pageSize,
    faceted: {
      status: Object.fromEntries(statusCounts.map((r) => [r.status, r.c])),
      severity: Object.fromEntries(severityCounts.map((r) => [r.severity, r.c])),
    },
  });
};

handlers['GET /api/hazards/:id'] = async (ctx) => {
  const user = await requireUser(ctx.req);
  requirePermission(user, 'hazards:read');
  const id = Number(ctx.params.id);
  const row = await hazardBaseRow(id);
  if (!row) throw new HttpError(404, 'Hazard not found.');

  const evidence = camelAll(
    await db
      .prepare(
        `SELECT e.*, u.name AS uploaded_by_name FROM hazard_evidence e
         LEFT JOIN users u ON u.id = e.uploaded_by WHERE e.hazard_id = ? ORDER BY e.created_at`,
      )
      .all(id),
  );
  const timeline = camelAll(
    await db
      .prepare(
        `SELECT e.*, u.name AS actor_name, u.role AS actor_role FROM hazard_events e
         LEFT JOIN users u ON u.id = e.actor_id WHERE e.hazard_id = ? ORDER BY e.created_at`,
      )
      .all(id),
  );
  const actions = camelAll(
    await db
      .prepare(
        `SELECT c.*, u.name AS owner_name FROM corrective_actions c
         LEFT JOIN users u ON u.id = c.owner_id WHERE c.hazard_id = ? ORDER BY c.created_at`,
      )
      .all(id),
  );

  return json(ctx.res, 200, {
    hazard: await hazardListItem(row),
    raw: camel(row),
    context: await roomContext(row.room_id),
    evidence,
    timeline,
    actions,
  });
};

handlers['POST /api/hazards'] = async (ctx) => {
  const user = await requireUser(ctx.req);
  if (!can(user, 'hazards:write') && !can(user, 'hazards:report'))
    throw new HttpError(403, 'Your role cannot report hazards.');
  const body = await readJson(ctx.req);
  const requestId = str(body.clientRequestId, 80, 'clientRequestId');
  if (requestId) {
    const existing = await db
      .prepare('SELECT id FROM hazards WHERE reported_by=? AND client_request_id=?')
      .get(user.id, requestId);
    if (existing)
      return json(ctx.res, 200, { hazard: await hazardListItem(await hazardBaseRow(existing.id)) });
  }

  const title = str(body.title, 140, 'title');
  if (!title) throw new HttpError(400, 'A hazard title is required.');
  const severity = oneOf(body.severity, SEVERITY_ORDER, 'severity');
  const roomId = optionalInt(body.roomId, 'roomId');
  const description = str(body.description, 4000, 'description');
  const locationNote = str(body.locationNote, 200, 'locationNote');
  const assignedTo = can(user, 'hazards:write') ? optionalInt(body.assignedTo, 'assignedTo') : null;
  if (roomId && !(await roomContext(roomId)))
    throw new HttpError(400, 'Choose a room in this school.');
  if (assignedTo && !(await db.prepare('SELECT id FROM users WHERE id=?').get(assignedTo)))
    throw new HttpError(400, 'Choose a responsible school member.');
  let anonymous = 0;
  if (body.anonymous === true) {
    const policy = await db
      .prepare("SELECT value FROM school_settings WHERE key='reporting'")
      .get();
    if (!policy || !JSON.parse(policy.value).allowAnonymous)
      throw new HttpError(403, 'This school does not allow identity-hidden reports.');
    anonymous = 1;
  }

  const ref = await nextHazardRef();
  const at = nowIso();
  const created = await db
    .prepare(
      `INSERT INTO hazards(ref,title,description,severity,status,room_id,location_note,reported_by,assigned_to,source,created_at,updated_at,client_request_id) VALUES (?,?,?,?,'new',?,?,?,?,'manual',?,?,?) ON CONFLICT(reported_by,client_request_id) DO NOTHING RETURNING id`,
    )
    .get(
      ref,
      title,
      description,
      severity,
      roomId,
      locationNote,
      user.id,
      assignedTo,
      at,
      at,
      requestId || null,
    );
  if (!created) {
    const existing = await db
      .prepare('SELECT id FROM hazards WHERE reported_by=? AND client_request_id=?')
      .get(user.id, requestId);
    return json(ctx.res, 200, { hazard: await hazardListItem(await hazardBaseRow(existing.id)) });
  }
  const id = Number(created.id);
  await db
    .prepare('UPDATE hazards SET anonymous=?,category=? WHERE id=?')
    .run(
      typeof anonymous === 'undefined' ? 0 : anonymous,
      oneOf(
        body.category ?? 'other',
        ['electrical', 'structural', 'fire', 'chemical', 'slip', 'blocked_exit', 'other'],
        'category',
      ),
      id,
    );
  await db
    .prepare(
      'INSERT INTO hazard_events (hazard_id, type, note, actor_id, created_at) VALUES (?, ?, ?, ?, ?)',
    )
    .run(id, 'reported', `Hazard reported by ${user.name}.`, user.id, at);
  await audit(user.id, 'hazard.create', 'hazard', id, { ref, severity });
  await notifyRoles(
    ['admin', 'inspector', 'responder'],
    severity === 'critical' ? 'alert' : 'warning',
    'New hazard reported',
    `${ref} — ${title}`,
    '/hazards',
  );
  if (assignedTo) {
    await addNotification(
      assignedTo,
      'info',
      'Hazard assigned to you',
      `${ref} — ${title}`,
      '/hazards',
    );
  }

  return json(ctx.res, 201, { hazard: await hazardListItem(await hazardBaseRow(id)) });
};

handlers['PATCH /api/hazards/:id'] = async (ctx) => {
  const user = await requireUser(ctx.req);
  requirePermission(user, 'hazards:write');
  const id = Number(ctx.params.id);
  const row = await hazardBaseRow(id);
  if (!row) throw new HttpError(404, 'Hazard not found.');
  const body = await readJson(ctx.req);
  const at = nowIso();

  const updates = [];
  const params = [];
  const events = [];

  if (body.status !== undefined) {
    const status = oneOf(body.status, STATUS_ORDER, 'status');
    if ((status === 'verified' || status === 'resolved') && !can(user, 'hazards:verify')) {
      throw new HttpError(403, 'Your role cannot verify or resolve hazards.');
    }
    updates.push('status = ?');
    params.push(status);
    if (status === 'verified' && !row.verified_at) {
      updates.push('verified_at = ?');
      params.push(at);
    }
    if (status === 'resolved') {
      updates.push('resolved_at = ?');
      params.push(at);
    }
    events.push([
      status === 'in_progress' ? 'assigned' : status,
      `Status changed from ${row.status} to ${status}.`,
      user.id,
    ]);
    await notifyRoles(
      ['admin', 'inspector'],
      'info',
      'Hazard status changed',
      `${row.ref} is now ${status.replace(/_/g, ' ')}.`,
      '/hazards',
    );
  }

  if (body.severity !== undefined) {
    const severity = oneOf(body.severity, SEVERITY_ORDER, 'severity');
    updates.push('severity = ?');
    params.push(severity);
    events.push([
      'severity_changed',
      `Severity changed from ${row.severity} to ${severity}.`,
      user.id,
    ]);
  }

  if (body.assignedTo !== undefined) {
    const assignedTo = optionalInt(body.assignedTo, 'assignedTo');
    updates.push('assigned_to = ?');
    params.push(assignedTo);
    const assignee = assignedTo
      ? await db.prepare('SELECT name FROM users WHERE id = ?').get(assignedTo)
      : null;
    events.push([
      'assigned',
      assignee ? `Assigned to ${assignee.name}.` : 'Assignment cleared.',
      user.id,
    ]);
    if (assignedTo)
      await addNotification(
        assignedTo,
        'info',
        'Hazard assigned to you',
        `${row.ref} — ${row.title}`,
        '/hazards',
      );
  }

  if (body.description !== undefined) {
    updates.push('description = ?');
    params.push(str(body.description, 4000, 'description'));
    events.push(['updated', 'Description updated.', user.id]);
  }

  if (!updates.length) throw new HttpError(400, 'No supported fields were provided.');

  updates.push('updated_at = ?');
  params.push(at);
  await db.prepare(`UPDATE hazards SET ${updates.join(', ')} WHERE id = ?`).run(...params, id);

  for (const [type, note, actor] of events) {
    await db
      .prepare(
        'INSERT INTO hazard_events (hazard_id, type, note, actor_id, created_at) VALUES (?, ?, ?, ?, ?)',
      )
      .run(id, type, note, actor, at);
  }
  await audit(user.id, 'hazard.update', 'hazard', id, { ref: row.ref, fields: Object.keys(body) });

  return json(ctx.res, 200, { hazard: await hazardListItem(await hazardBaseRow(id)) });
};

handlers['POST /api/hazards/:id/evidence'] = async (ctx) => {
  const user = await requireUser(ctx.req);

  const id = Number(ctx.params.id);
  const evidenceHazard = await hazardBaseRow(id);
  if (!evidenceHazard) throw new HttpError(404, 'Hazard not found.');
  if (
    !can(user, 'hazards:write') &&
    !(can(user, 'hazards:report') && evidenceHazard.reported_by === user.id)
  )
    throw new HttpError(403, 'Only authorized staff or this reporter can add evidence.');
  const body = await readJson(ctx.req);
  const url = str(body.url, 500, 'url');
  if (!workspaceUploadUrl(url))
    throw new HttpError(400, 'Evidence must reference an uploaded file.');
  const existingEvidence = await db
    .prepare('SELECT id FROM hazard_evidence WHERE hazard_id=? AND url=?')
    .get(id, url);
  if (existingEvidence) return json(ctx.res, 200, { id: existingEvidence.id, url });
  const caption = str(body.caption, 300, 'caption');
  const at = nowIso();
  const evidenceId = Number(
    (
      await db
        .prepare(
          'INSERT INTO hazard_evidence (hazard_id, url, caption, uploaded_by, created_at) VALUES (?, ?, ?, ?, ?)',
        )
        .run(id, url, caption, user.id, at)
    ).lastInsertRowid,
  );
  await audit(user.id, 'hazard.evidence.add', 'hazard', id, { evidenceId });
  return json(ctx.res, 201, { id: evidenceId, url, caption, createdAt: at });
};

handlers['DELETE /api/hazards/:hazardId/evidence/:evidenceId'] = async (ctx) => {
  const user = await requireUser(ctx.req);
  requirePermission(user, 'hazards:write');
  const hazardId = Number(ctx.params.hazardId);
  const evidenceId = Number(ctx.params.evidenceId);
  const row = await db
    .prepare('SELECT * FROM hazard_evidence WHERE id = ? AND hazard_id = ?')
    .get(evidenceId, hazardId);
  if (!row) throw new HttpError(404, 'Evidence not found.');
  await db.prepare('DELETE FROM hazard_evidence WHERE id = ?').run(evidenceId);
  await audit(user.id, 'hazard.evidence.remove', 'hazard', hazardId, { evidenceId });
  return json(ctx.res, 200, { ok: true });
};

handlers['POST /api/hazards/:id/actions'] = async (ctx) => {
  const user = await requireUser(ctx.req);
  requirePermission(user, 'hazards:write');
  const id = Number(ctx.params.id);
  const hazard = await hazardBaseRow(id);
  if (!hazard) throw new HttpError(404, 'Hazard not found.');
  const body = await readJson(ctx.req);
  const title = str(body.title, 200, 'title');
  if (!title) throw new HttpError(400, 'A corrective action title is required.');
  const ownerId = optionalInt(body.ownerId, 'ownerId') ?? user.id;
  const dueAt = body.dueAt ? new Date(body.dueAt).toISOString() : null;
  const notes = str(body.notes, 2000, 'notes');
  const at = nowIso();
  const actionId = Number(
    (
      await db
        .prepare(
          'INSERT INTO corrective_actions (hazard_id, title, owner_id, due_at, status, notes, completed_at, created_at) VALUES (?, ?, ?, ?, ?, ?, NULL, ?)',
        )
        .run(id, title, ownerId, dueAt, 'open', notes, at)
    ).lastInsertRowid,
  );
  await db
    .prepare(
      'INSERT INTO hazard_events (hazard_id, type, note, actor_id, created_at) VALUES (?, ?, ?, ?, ?)',
    )
    .run(id, 'action_created', `Corrective action added: ${title}`, user.id, at);
  await audit(user.id, 'hazard.action.create', 'hazard', id, { actionId });
  await addNotification(
    ownerId,
    'info',
    'Corrective action assigned',
    `${hazard.ref} — ${title}`,
    '/hazards',
  );
  return json(ctx.res, 201, { id: actionId });
};

handlers['PATCH /api/hazards/:hazardId/actions/:actionId'] = async (ctx) => {
  const user = await requireUser(ctx.req);
  requirePermission(user, 'hazards:write');
  const hazardId = Number(ctx.params.hazardId);
  const actionId = Number(ctx.params.actionId);
  const hazard = await hazardBaseRow(hazardId);
  if (!hazard) throw new HttpError(404, 'Hazard not found.');
  const action = await db
    .prepare('SELECT * FROM corrective_actions WHERE id = ? AND hazard_id = ?')
    .get(actionId, hazardId);
  if (!action) throw new HttpError(404, 'Corrective action not found.');
  const body = await readJson(ctx.req);
  const status = oneOf(body.status, ['open', 'in_progress', 'done'], 'status');
  const notes = body.notes !== undefined ? str(body.notes, 2000, 'notes') : action.notes;
  const at = nowIso();
  await db
    .prepare('UPDATE corrective_actions SET status = ?, notes = ?, completed_at = ? WHERE id = ?')
    .run(status, notes, status === 'done' ? at : null, actionId);
  await db
    .prepare(
      'INSERT INTO hazard_events (hazard_id, type, note, actor_id, created_at) VALUES (?, ?, ?, ?, ?)',
    )
    .run(
      hazardId,
      'action_updated',
      `Corrective action "${action.title}" marked ${status.replace(/_/g, ' ')}.`,
      user.id,
      at,
    );
  await audit(user.id, 'hazard.action.update', 'hazard', hazardId, { actionId, status });
  return json(ctx.res, 200, { ok: true });
};

export async function maintenanceTick() {
  await materializeAlerts();
  await drainDeliveryJobs();
  await drainSosSms();
  return inspectionReminders();
}

/* ---- Scans ---- */

handlers['GET /api/ai/status'] = async (ctx) => {
  await requireUser(ctx.req);
  // Configuration presence does not prove a successful provider analysis.
  return json(ctx.res, 200, {
    configured: Boolean(visionApiKey()) && process.env.RADAR_TEST_LAB !== '1',
    provider: visionApiKey() ? (visionProvider() === 'gemini' ? 'Google Gemini' : 'OpenAI') : null,
    model: visionApiKey() ? selectedVisionModel() : null,
    checkedAt: nowIso(),
    message: visionApiKey()
      ? `${visionProvider() === 'gemini' ? 'Google Gemini' : 'OpenAI'} is selected. Service access needs a successful photo analysis. Review the provider’s data-use terms before sending school photos. All suggestions require human review.`
      : 'No vision model is configured. Suggestions are disabled; observations you add are recorded as manual findings and still require verification.',
  });
};

handlers['GET /api/scans'] = async (ctx) => {
  const user = await requireUser(ctx.req);
  requirePermission(user, 'scan:read');
  const rows = camelAll(
    await db
      .prepare(
        `SELECT s.*, r.name AS room_name, b.name AS building_name, f.level AS floor_level, u.name AS inspector_name,
                (SELECT COUNT(*) FROM scan_photos p WHERE p.scan_id = s.id) AS photo_count,
                (SELECT COUNT(*) FROM scan_observations o WHERE o.scan_id = s.id) AS observation_count
         FROM scans s
         JOIN rooms r ON r.id = s.room_id
         JOIN floors f ON f.id = r.floor_id
         JOIN buildings b ON b.id = f.building_id
         LEFT JOIN users u ON u.id = s.inspector_id
         ORDER BY s.started_at DESC LIMIT 25`,
      )
      .all(),
  );
  return json(ctx.res, 200, { scans: rows });
};

handlers['POST /api/scans'] = async (ctx) => {
  const user = await requireUser(ctx.req);
  requirePermission(user, 'scan:write');
  const body = await readJson(ctx.req);
  const requestId = str(body.clientRequestId, 80, 'clientRequestId');
  if (requestId) {
    const existing = await db
      .prepare('SELECT id FROM scans WHERE inspector_id=? AND client_request_id=?')
      .get(user.id, requestId);
    if (existing) return json(ctx.res, 200, { scanId: existing.id, resumed: true });
  }
  const roomId = optionalInt(body.roomId, 'roomId');
  if (!roomId || !(await roomContext(roomId)))
    throw new HttpError(400, 'Select a valid room to scan.');

  const existing = await db
    .prepare(
      "SELECT * FROM scans WHERE room_id = ? AND inspector_id = ? AND status = 'draft' ORDER BY id DESC",
    )
    .get(roomId, user.id);
  if (existing && !requestId) return json(ctx.res, 200, { scanId: existing.id, resumed: true });

  const at = nowIso();
  const created = await db
    .prepare(
      "INSERT INTO scans(room_id,inspector_id,status,notes,started_at,client_request_id) VALUES (?,?,'draft','',?,?) ON CONFLICT(inspector_id,client_request_id) DO NOTHING RETURNING id",
    )
    .get(roomId, user.id, at, requestId || null);
  if (!created) {
    const existing = await db
      .prepare('SELECT id FROM scans WHERE inspector_id=? AND client_request_id=?')
      .get(user.id, requestId);
    return json(ctx.res, 200, { scanId: existing.id, resumed: true });
  }
  const id = Number(created.id);
  await audit(user.id, 'scan.start', 'scan', id, { roomId });
  return json(ctx.res, 201, { scanId: id, resumed: false });
};

handlers['GET /api/scans/:id'] = async (ctx) => {
  const user = await requireUser(ctx.req);
  requirePermission(user, 'scan:read');
  const id = Number(ctx.params.id);
  const scan = camel(await db.prepare('SELECT * FROM scans WHERE id = ?').get(id));
  if (!scan) throw new HttpError(404, 'Scan not found.');
  const photos = camelAll(
    await db.prepare('SELECT * FROM scan_photos WHERE scan_id = ? ORDER BY created_at').all(id),
  );
  const observations = camelAll(
    await db
      .prepare('SELECT * FROM scan_observations WHERE scan_id = ? ORDER BY created_at')
      .all(id),
  );
  return json(ctx.res, 200, {
    scan,
    context: await roomContext(scan.roomId),
    photos,
    observations,
  });
};

handlers['POST /api/scans/:id/photos'] = async (ctx) => {
  const user = await requireUser(ctx.req);
  requirePermission(user, 'scan:write');
  const id = Number(ctx.params.id);
  const scan = await db.prepare('SELECT * FROM scans WHERE id = ?').get(id);
  if (!scan) throw new HttpError(404, 'Scan not found.');
  if (scan.status === 'submitted')
    throw new HttpError(409, 'This scan has already been submitted.');
  const body = await readJson(ctx.req);
  const url = str(body.url, 500, 'url');
  if (!workspaceUploadUrl(url)) throw new HttpError(400, 'Photo must reference an uploaded file.');
  const caption = str(body.caption ?? '', 300, 'caption');
  const at = nowIso();
  const photoId = Number(
    (
      await db
        .prepare('INSERT INTO scan_photos (scan_id, url, caption, created_at) VALUES (?, ?, ?, ?)')
        .run(id, url, caption, at)
    ).lastInsertRowid,
  );
  return json(ctx.res, 201, { id: photoId, url, caption, createdAt: at });
};

handlers['DELETE /api/scans/:scanId/photos/:photoId'] = async (ctx) => {
  const user = await requireUser(ctx.req);
  requirePermission(user, 'scan:write');
  const scanId = Number(ctx.params.scanId);
  const photoId = Number(ctx.params.photoId);
  const photo = await db
    .prepare('SELECT * FROM scan_photos WHERE id = ? AND scan_id = ?')
    .get(photoId, scanId);
  if (!photo) throw new HttpError(404, 'Photo not found.');
  await db.prepare('DELETE FROM scan_photos WHERE id = ?').run(photoId);
  return json(ctx.res, 200, { ok: true });
};

handlers['POST /api/scans/:id/observations'] = async (ctx) => {
  const user = await requireUser(ctx.req);
  requirePermission(user, 'scan:write');
  const id = Number(ctx.params.id);
  const scan = await db.prepare('SELECT * FROM scans WHERE id = ?').get(id);
  if (!scan) throw new HttpError(404, 'Scan not found.');
  if (scan.status === 'submitted')
    throw new HttpError(409, 'This scan has already been submitted.');
  const body = await readJson(ctx.req);
  const title = str(body.title, 140, 'title');
  if (!title) throw new HttpError(400, 'An observation title is required.');
  const description = str(body.description, 3000, 'description');
  const severity = oneOf(body.severity, SEVERITY_ORDER, 'severity');
  const at = nowIso();
  const obsId = Number(
    (
      await db
        .prepare(
          "INSERT INTO scan_observations (scan_id, title, description, severity, source, status, hazard_id, created_at) VALUES (?, ?, ?, ?, 'manual', 'pending', NULL, ?)",
        )
        .run(id, title, description, severity, at)
    ).lastInsertRowid,
  );
  return json(ctx.res, 201, { id: obsId });
};

handlers['PATCH /api/scans/:scanId/observations/:obsId'] = async (ctx) => {
  const user = await requireUser(ctx.req);
  requirePermission(user, 'scan:write');
  const scanId = Number(ctx.params.scanId);
  const obsId = Number(ctx.params.obsId);
  const obs = await db
    .prepare('SELECT * FROM scan_observations WHERE id = ? AND scan_id = ?')
    .get(obsId, scanId);
  if (!obs) throw new HttpError(404, 'Observation not found.');
  const body = await readJson(ctx.req);
  const status = oneOf(body.status, ['pending', 'accepted', 'rejected'], 'status');
  await db.prepare('UPDATE scan_observations SET status = ? WHERE id = ?').run(status, obsId);
  return json(ctx.res, 200, { ok: true });
};

handlers['POST /api/scans/:id/submit'] = async (ctx) => {
  const user = await requireUser(ctx.req);
  requirePermission(user, 'scan:write');
  const id = Number(ctx.params.id);
  const scan = await db.prepare('SELECT * FROM scans WHERE id = ?').get(id);
  if (!scan) throw new HttpError(404, 'Scan not found.');
  if (scan.status === 'submitted')
    throw new HttpError(409, 'This scan has already been submitted.');

  const body = await readJson(ctx.req);
  const notes = str(body.notes ?? '', 3000, 'notes');
  const accepted = await db
    .prepare("SELECT * FROM scan_observations WHERE scan_id = ? AND status = 'accepted'")
    .all(id);
  if (accepted.length === 0 && !scan.no_findings_confirmed)
    throw new HttpError(
      400,
      'Review findings or explicitly complete the no-visible-findings checklist before submitting.',
    );

  const at = nowIso();
  const created = [];
  for (const obs of accepted) {
    const ref = await nextHazardRef();
    const hazardId = Number(
      (
        await db
          .prepare(
            `INSERT INTO hazards (ref, title, description, severity, status, room_id, location_note, reported_by, assigned_to, source, created_at, updated_at)
           VALUES (?, ?, ?, ?, 'pending_review', ?, '', ?, NULL, ?, ?, ?)`,
          )
          .run(
            ref,
            obs.title,
            obs.description,
            obs.severity,
            scan.room_id,
            user.id,
            obs.source === 'ai' ? 'ai_assisted' : 'manual',
            at,
            at,
          )
      ).lastInsertRowid,
    );
    await db
      .prepare(
        'INSERT INTO hazard_events (hazard_id, type, note, actor_id, created_at) VALUES (?, ?, ?, ?, ?)',
      )
      .run(
        hazardId,
        'reported',
        `Created from room scan #${id}. Awaiting independent verification.`,
        user.id,
        at,
      );
    await db
      .prepare('UPDATE scan_observations SET hazard_id = ? WHERE id = ?')
      .run(hazardId, obs.id);
    if (obs.mapped_x != null && obs.mapped_y != null)
      await db
        .prepare('UPDATE hazards SET pin_x=?,pin_y=? WHERE id=?')
        .run(obs.mapped_x, obs.mapped_y, hazardId);
    await db.prepare('UPDATE hazards SET category=? WHERE id=?').run(obs.category??'other',hazardId);
    created.push({ id: hazardId, ref });
  }

  await db
    .prepare("UPDATE scans SET status = 'submitted', notes = ?, submitted_at = ? WHERE id = ?")
    .run(notes, at, id);
  await db.prepare('UPDATE rooms SET last_inspected_at=? WHERE id=?').run(at, scan.room_id);
  const schedule = await db
    .prepare('SELECT * FROM inspection_schedules WHERE room_id=?')
    .get(scan.room_id);
  if (schedule)
    await db
      .prepare('UPDATE inspection_schedules SET next_due_at=?,updated_at=? WHERE room_id=?')
      .run(
        new Date(Date.now() + schedule.interval_days * 86400000).toISOString(),
        nowIso(),
        scan.room_id,
      );
  await audit(user.id, 'scan.submit', 'scan', id, { created: created.map((c) => c.ref) });
  await notifyRoles(
    ['admin', 'inspector'],
    'warning',
    'Room scan submitted',
    `${created.length} observation(s) pending review.`,
    '/hazards',
  );

  return json(ctx.res, 200, {
    ok: true,
    created,
    message: created.length
      ? 'Findings were saved as pending review. They are not verified until an authorised reviewer confirms them.'
      : 'The visual inspection was recorded with no visible findings. This is not a safety certification.',
  });
};

/* ---- Uploads ---- */

handlers['POST /api/uploads'] = async (ctx) => {
  const user = await requireUser(ctx.req);
  if (!can(user, 'scan:write') && !can(user, 'hazards:write') && !can(user, 'hazards:report')) {
    throw new HttpError(403, 'Your role cannot upload inspection images.');
  }
  const mime = String(ctx.req.headers['content-type'] ?? '')
    .split(';')[0]
    .trim();
  const allowed = {
    'image/jpeg': '.jpg',
    'image/png': '.png',
    'image/webp': '.webp',
    'image/gif': '.gif',
    'image/svg+xml': '.svg',
    'model/gltf-binary': '.glb',
    'application/octet-stream': '.glb',
  };
  if (!allowed[mime]) throw new HttpError(415, 'Upload a JPEG, PNG, WebP, GIF or SVG image.');

  const buf = await readBinary(ctx.req);
  if (buf.length === 0) throw new HttpError(400, 'The uploaded file is empty.');

  if (allowed[mime] === '.glb') {
    requirePermission(user, 'admin:users');
    try {
      if (
        buf.length < 20 ||
        buf.toString('ascii', 0, 4) !== 'glTF' ||
        buf.readUInt32LE(4) !== 2 ||
        buf.readUInt32LE(8) !== buf.length ||
        buf.toString('ascii', 16, 20) !== 'JSON'
      )
        throw new Error();
      const doc = JSON.parse(buf.toString('utf8', 20, 20 + buf.readUInt32LE(12)));
      if (
        [...(doc.buffers ?? []), ...(doc.images ?? [])].some(
          (asset) => asset.uri && !asset.uri.startsWith('data:'),
        )
      )
        throw new Error();
    } catch {
      throw new HttpError(
        400,
        'Upload a valid self-contained GLB 2.0 file with embedded textures.',
      );
    }
  }
  const name = `${Date.now()}-${crypto.randomBytes(8).toString('hex')}${allowed[mime]}`;
  const scope = currentDatabaseContext();
  if (usesSupabase) await cloudUpload(scope?.workspaceId, name, buf, mime);
  else {
    const directory = scope?.uploadDir ?? UPLOAD_DIR;
    fs.mkdirSync(directory, { recursive: true });
    fs.writeFileSync(path.join(directory, name), buf);
  }
  await audit(user.id, 'upload.create', 'upload', name, { mime, bytes: buf.length });
  return json(ctx.res, 201, {
    url: currentDatabaseContext()?.workspaceId
      ? `/uploads/workspaces/${currentDatabaseContext().workspaceId}/${name}`
      : `/uploads/${name}`,
    mime,
    bytes: buf.length,
  });
};

/* ---- Notifications ---- */

handlers['GET /api/notifications'] = async (ctx) => {
  const user = await requireUser(ctx.req);
  requirePermission(user, 'notifications:read');
  await materializeAlerts();
  const rows = camelAll(
    await db
      .prepare('SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 100')
      .all(user.id),
  );
  return json(ctx.res, 200, {
    notifications: rows.map((n) => ({ ...n, read: Boolean(n.read) })),
    unread: rows.filter((n) => !n.read).length,
  });
};

handlers['PATCH /api/notifications/:id/read'] = async (ctx) => {
  const user = await requireUser(ctx.req);
  requirePermission(user, 'notifications:write');
  const id = Number(ctx.params.id);
  await db
    .prepare('UPDATE notifications SET read = 1 WHERE id = ? AND user_id = ?')
    .run(id, user.id);
  return json(ctx.res, 200, { ok: true });
};

handlers['POST /api/notifications/read-all'] = async (ctx) => {
  const user = await requireUser(ctx.req);
  requirePermission(user, 'notifications:write');
  await db.prepare('UPDATE notifications SET read = 1 WHERE user_id = ?').run(user.id);
  return json(ctx.res, 200, { ok: true });
};

handlers['DELETE /api/notifications/read'] = async (ctx) => {
  const user = await requireUser(ctx.req);
  requirePermission(user, 'notifications:write');
  await db.prepare('DELETE FROM notifications WHERE user_id = ? AND read = 1').run(user.id);
  return json(ctx.res, 200, { ok: true });
};

/* ---- Search ---- */

handlers['GET /api/search'] = async (ctx) => {
  const user = await requireUser(ctx.req);
  requirePermission(user, 'search:read');
  const url = new URL(ctx.req.url, 'http://localhost');
  const q = str(url.searchParams.get('q') ?? '', 120);
  if (q.length < 2) return json(ctx.res, 200, { query: q, results: [] });
  const like = `%${q}%`;

  const rooms = can(user, 'map:read')
    ? (
        await db
          .prepare(
            `SELECT r.id, r.code, r.name, r.type, b.name AS building_name, f.level AS floor_level
           FROM rooms r JOIN floors f ON f.id = r.floor_id JOIN buildings b ON b.id = f.building_id
           WHERE r.name LIKE ? OR r.code LIKE ? OR b.name LIKE ? LIMIT 8`,
          )
          .all(like, like, like)
      ).map((r) => ({ ...camel(r), kind: 'room' }))
    : [];
  const hazards = can(user, 'hazards:read')
    ? (
        await db
          .prepare(
            `SELECT id, ref, title, severity, status FROM hazards
           WHERE ref LIKE ? OR title LIKE ? OR description LIKE ? LIMIT 8`,
          )
          .all(like, like, like)
      ).map((r) => ({ ...camel(r), kind: 'hazard' }))
    : [];
  const incidents = can(user, 'incidents:read')
    ? (
        await db
          .prepare(
            'SELECT id, ref, title, severity, status FROM incidents WHERE ref LIKE ? OR title LIKE ? LIMIT 5',
          )
          .all(like, like)
      ).map((r) => ({ ...camel(r), kind: 'incident' }))
    : [];
  const buildings = can(user, 'map:read')
    ? (
        await db
          .prepare(
            'SELECT id, code, name, description FROM buildings WHERE name LIKE ? OR code LIKE ? LIMIT 5',
          )
          .all(like, like)
      ).map((r) => ({ ...camel(r), kind: 'building' }))
    : [];
  const alerts = can(user, 'alerts:read')
    ? (
        await db
          .prepare(
            'SELECT id, ref, title, level, kind FROM alerts WHERE ref LIKE ? OR title LIKE ? OR body LIKE ? LIMIT 5',
          )
          .all(like, like, like)
      ).map((r) => ({ ...camel(r), kind: 'alert' }))
    : [];
  const advisories = can(user, 'advisories:read')
    ? (
        await db
          .prepare(
            'SELECT id, category, title, severity, source_name AS sourceName FROM advisories WHERE title LIKE ? OR summary LIKE ? LIMIT 5',
          )
          .all(like, like)
      ).map((r) => ({ ...camel(r), kind: 'advisory' }))
    : [];

  return json(ctx.res, 200, {
    query: q,
    results: [
      ...hazards,
      ...incidents,
      ...alerts,
      ...advisories,
      ...rooms.map((r) => ({ ...r, ref: r.code, title: r.name })),
      ...buildings.map((b) => ({ ...b, title: b.name })),
    ],
  });
};

/* ---- Roll call ---- */

handlers['GET /api/rollcall'] = async (ctx) => {
  const user = await requireUser(ctx.req);
  requirePermission(user, 'rollcall:read');
  const classes = camelAll(
    await db
      .prepare(
        `SELECT c.*, u.name AS teacher_name, r.name AS room_name, b.name AS building_name
         FROM rollcall_classes c
         LEFT JOIN users u ON u.id = c.teacher_id
         LEFT JOIN rooms r ON r.id = c.room_id
         LEFT JOIN floors f ON f.id = r.floor_id
         LEFT JOIN buildings b ON b.id = f.building_id
         ${user.role === 'teacher' ? 'WHERE c.teacher_id = ?' : ''} ORDER BY c.grade, c.name`,
      )
      .all(...(user.role === 'teacher' ? [user.id] : [])),
  );
  return json(ctx.res, 200, { classes });
};

handlers['PATCH /api/rollcall/:id'] = async (ctx) => {
  const user = await requireUser(ctx.req);
  requirePermission(user, 'rollcall:write');
  const id = Number(ctx.params.id);
  const row = await db.prepare('SELECT * FROM rollcall_classes WHERE id = ?').get(id);
  if (!row) throw new HttpError(404, 'Class not found.');
  if (user.role === 'teacher' && row.teacher_id !== user.id)
    throw new HttpError(403, 'This class is not assigned to you.');
  if ((await db.prepare('SELECT COUNT(*) AS c FROM rollcall_people WHERE class_id=?').get(id)).c)
    throw new HttpError(409, 'Update individual roster statuses for a class with a roster.');
  const body = await readJson(ctx.req);
  const present = Math.max(0, Math.min(row.expected, Number(body.present ?? row.present)));
  const status = oneOf(body.status, ['incomplete', 'complete'], 'status');
  await db
    .prepare('UPDATE rollcall_classes SET present = ?, status = ?, updated_at = ? WHERE id = ?')
    .run(present, status, nowIso(), id);
  await audit(user.id, 'rollcall.update', 'rollcall_class', id, { present, status });
  return json(ctx.res, 200, { ok: true, present, status });
};

/* ---- Incidents ---- */

handlers['GET /api/incidents'] = async (ctx) => {
  const user = await requireUser(ctx.req);
  requirePermission(user, 'incidents:read');
  const incidents = camelAll(
    await db
      .prepare(
        `SELECT i.*, u.name AS commander_name,
          (SELECT COUNT(*) FROM incident_updates iu WHERE iu.incident_id = i.id) AS update_count
         FROM incidents i LEFT JOIN users u ON u.id = i.commander_id
         ORDER BY CASE i.status WHEN 'active' THEN 0 WHEN 'monitoring' THEN 1 ELSE 2 END, i.started_at DESC`,
      )
      .all(),
  );
  return json(ctx.res, 200, { incidents });
};

handlers['GET /api/incidents/:id'] = async (ctx) => {
  const user = await requireUser(ctx.req);
  requirePermission(user, 'incidents:read');
  const id = Number(ctx.params.id);
  const incident = camel(
    await db
      .prepare(
        `SELECT i.*, u.name AS commander_name FROM incidents i LEFT JOIN users u ON u.id = i.commander_id WHERE i.id = ?`,
      )
      .get(id),
  );
  if (!incident) throw new HttpError(404, 'Incident not found.');
  const updates = camelAll(
    await db
      .prepare(
        `SELECT iu.*, u.name AS actor_name FROM incident_updates iu
         LEFT JOIN users u ON u.id = iu.actor_id WHERE iu.incident_id = ? ORDER BY iu.created_at`,
      )
      .all(id),
  );
  return json(ctx.res, 200, { incident, updates });
};

handlers['POST /api/incidents/:id/updates'] = async (ctx) => {
  const user = await requireUser(ctx.req);
  requirePermission(user, 'incidents:write');
  const id = Number(ctx.params.id);
  const incident = await db.prepare('SELECT * FROM incidents WHERE id = ?').get(id);
  if (!incident) throw new HttpError(404, 'Incident not found.');
  const body = await readJson(ctx.req);
  const note = str(body.note, 2000, 'note');
  if (!note) throw new HttpError(400, 'An update note is required.');
  const at = nowIso();
  await db
    .prepare(
      'INSERT INTO incident_updates (incident_id, note, actor_id, created_at) VALUES (?, ?, ?, ?)',
    )
    .run(id, note, user.id, at);
  if (body.status) {
    const status = oneOf(body.status, ['active', 'monitoring', 'closed'], 'status');
    await db
      .prepare('UPDATE incidents SET status = ?, closed_at = ? WHERE id = ?')
      .run(status, status === 'closed' ? at : incident.closed_at, id);
  }
  await audit(user.id, 'incident.update', 'incident', id, { note });
  return json(ctx.res, 200, { ok: true });
};

/* ---- Recovery & damage assessment (Stage 7) ---- */

handlers['GET /api/recovery'] = async (ctx) => {
  const user = await requireUser(ctx.req);
  requirePermission(user, 'recovery:read');
  const url = new URL(ctx.req.url, 'http://localhost');
  const incidentId = optionalInt(url.searchParams.get('incidentId'), 'incidentId');
  const filter = incidentId ? 'WHERE t.incident_id = ?' : '';
  const assessmentFilter = incidentId ? 'WHERE d.incident_id = ?' : '';

  const incidents = camelAll(
    await db
      .prepare(
        `SELECT id, ref, title, severity, status, started_at, closed_at FROM incidents
         ORDER BY CASE status WHEN 'active' THEN 0 WHEN 'monitoring' THEN 1 ELSE 2 END, started_at DESC`,
      )
      .all(),
  );
  const tasks = await recoveryTaskRows(filter, incidentId ? [incidentId] : []);
  const assessments = await assessmentRows(assessmentFilter, incidentId ? [incidentId] : []);

  return json(ctx.res, 200, {
    incidents,
    tasks,
    assessments,
    summary: {
      open: tasks.filter((t) => t.status === 'open').length,
      inProgress: tasks.filter((t) => t.status === 'in_progress').length,
      done: tasks.filter((t) => t.status === 'done').length,
      overdue: tasks.filter((t) => t.status !== 'done' && t.dueAt && t.dueAt < nowIso()).length,
      restricted: assessments.filter((a) => a.clearance === 'restricted').length,
      cleared: assessments.filter((a) => a.clearance === 'cleared').length,
    },
    generatedAt: nowIso(),
  });
};

handlers['POST /api/recovery/tasks'] = async (ctx) => {
  const user = await requireUser(ctx.req);
  requirePermission(user, 'recovery:write');
  const body = await readJson(ctx.req);
  const title = str(body.title, 180, 'title');
  if (!title) throw new HttpError(400, 'A recovery task title is required.');
  const description = str(body.description ?? '', 2000, 'description');
  const incidentId = optionalInt(body.incidentId, 'incidentId');
  const ownerId = optionalInt(body.ownerId, 'ownerId') ?? user.id;
  const priority = oneOf(body.priority ?? 'medium', SEVERITY_ORDER, 'priority');
  const dueAt = body.dueAt ? new Date(body.dueAt).toISOString() : null;
  const at = nowIso();
  const id = Number(
    (
      await db
        .prepare(
          `INSERT INTO recovery_tasks (incident_id, title, description, owner_id, priority, status, due_at,
          completed_at, created_by, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, 'open', ?, NULL, ?, ?, ?)`,
        )
        .run(incidentId, title, description, ownerId, priority, dueAt, user.id, at, at)
    ).lastInsertRowid,
  );
  await audit(user.id, 'recovery.task.create', 'recovery_task', id, { priority, incidentId });
  await addNotification(ownerId, 'info', 'Recovery task assigned', title, '/recovery');
  const task = (await recoveryTaskRows('WHERE t.id = ?', [id]))[0];
  return json(ctx.res, 201, { task });
};

handlers['PATCH /api/recovery/tasks/:id'] = async (ctx) => {
  const user = await requireUser(ctx.req);
  requirePermission(user, 'recovery:write');
  const id = Number(ctx.params.id);
  const row = await db.prepare('SELECT * FROM recovery_tasks WHERE id = ?').get(id);
  if (!row) throw new HttpError(404, 'Recovery task not found.');
  const body = await readJson(ctx.req);
  const updates = [];
  const params = [];
  if (body.status !== undefined) {
    const status = oneOf(body.status, ['open', 'in_progress', 'done'], 'status');
    updates.push('status = ?');
    params.push(status);
    updates.push('completed_at = ?');
    params.push(status === 'done' ? nowIso() : null);
  }
  if (body.priority !== undefined) {
    updates.push('priority = ?');
    params.push(oneOf(body.priority, SEVERITY_ORDER, 'priority'));
  }
  if (body.description !== undefined) {
    updates.push('description = ?');
    params.push(str(body.description, 2000, 'description'));
  }
  if (body.dueAt !== undefined) {
    updates.push('due_at = ?');
    params.push(body.dueAt ? new Date(body.dueAt).toISOString() : null);
  }
  if (!updates.length) throw new HttpError(400, 'No supported fields were provided.');
  updates.push('updated_at = ?');
  params.push(nowIso());
  await db
    .prepare(`UPDATE recovery_tasks SET ${updates.join(', ')} WHERE id = ?`)
    .run(...params, id);
  await audit(user.id, 'recovery.task.update', 'recovery_task', id, { fields: Object.keys(body) });
  return json(ctx.res, 200, { task: (await recoveryTaskRows('WHERE t.id = ?', [id]))[0] });
};

handlers['POST /api/recovery/assessments'] = async (ctx) => {
  const user = await requireUser(ctx.req);
  requirePermission(user, 'recovery:write');
  const body = await readJson(ctx.req);
  const buildingId = optionalInt(body.buildingId, 'buildingId');
  if (!buildingId) throw new HttpError(400, 'Select a building to assess.');
  const building = await db.prepare('SELECT * FROM buildings WHERE id = ?').get(buildingId);
  if (!building) throw new HttpError(404, 'Building not found.');
  const roomId = optionalInt(body.roomId, 'roomId');
  if (roomId) {
    const room = await db
      .prepare(
        'SELECT r.* FROM rooms r JOIN floors f ON f.id = r.floor_id WHERE r.id = ? AND f.building_id = ?',
      )
      .get(roomId, buildingId);
    if (!room) throw new HttpError(400, 'The room does not belong to the selected building.');
  }
  const incidentId = optionalInt(body.incidentId, 'incidentId');
  const damageLevel = oneOf(body.damageLevel ?? 'none', DAMAGE_LEVELS, 'damageLevel');
  const clearance = oneOf(body.clearance ?? 'pending', CLEARANCE_STATES, 'clearance');
  const notes = str(body.notes ?? '', 3000, 'notes');
  const at = nowIso();
  const id = Number(
    (
      await db
        .prepare(
          `INSERT INTO damage_assessments (incident_id, building_id, room_id, damage_level, clearance, notes,
          assessed_by, assessed_at, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(incidentId, buildingId, roomId, damageLevel, clearance, notes, user.id, at, at)
    ).lastInsertRowid,
  );

  const buildingStatus =
    clearance === 'restricted'
      ? 'restricted'
      : clearance === 'cleared'
        ? 'operational'
        : building.status;
  await db.prepare('UPDATE buildings SET status = ? WHERE id = ?').run(buildingStatus, buildingId);
  if (roomId) {
    const roomStatus =
      clearance === 'restricted'
        ? 'restricted'
        : clearance === 'cleared'
          ? 'operational'
          : 'under_review';
    await db.prepare('UPDATE rooms SET status = ? WHERE id = ?').run(roomStatus, roomId);
  }
  await audit(user.id, 'recovery.assessment.create', 'damage_assessment', id, {
    buildingId,
    roomId,
    clearance,
    damageLevel,
  });
  if (clearance === 'restricted' || damageLevel === 'severe') {
    await notifyRoles(
      ['admin', 'inspector', 'responder', 'teacher'],
      clearance === 'restricted' ? 'alert' : 'warning',
      clearance === 'restricted' ? 'Area restricted' : 'Damage assessment recorded',
      `${building.name}${roomId ? ' — room assessment' : ''}: ${damageLevel} damage, ${clearance}.`,
      '/recovery',
    );
  }
  return json(ctx.res, 201, { assessment: (await assessmentRows('WHERE d.id = ?', [id]))[0] });
};

/* ---- Analytics & exports (Stage 7) ---- */

handlers['GET /api/analytics'] = async (ctx) => {
  const user = await requireUser(ctx.req);
  requirePermission(user, 'analytics:read');
  const url = new URL(ctx.req.url, 'http://localhost');
  const requestedDays = Number(url.searchParams.get('days') ?? 90);
  const days = [30, 90, 180, 365].includes(requestedDays) ? requestedDays : 90;
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  const now = nowIso();

  const severityRows = await db
    .prepare('SELECT severity, COUNT(*) AS c FROM hazards GROUP BY severity')
    .all();
  const statusRows = await db
    .prepare('SELECT status, COUNT(*) AS c FROM hazards GROUP BY status')
    .all();
  const severity = Object.fromEntries(SEVERITY_ORDER.map((s) => [s, 0]));
  for (const row of severityRows) severity[row.severity] = row.c;
  const status = Object.fromEntries(STATUS_ORDER.map((s) => [s, 0]));
  for (const row of statusRows) status[row.status] = row.c;

  const reportedInRange = (
    await db.prepare('SELECT COUNT(*) AS c FROM hazards WHERE created_at >= ?').get(since)
  ).c;
  const resolvedInRange = (
    await db.prepare('SELECT COUNT(*) AS c FROM hazards WHERE resolved_at >= ?').get(since)
  ).c;
  const resolution = await db
    .prepare(
      `SELECT AVG(julianday(resolved_at) - julianday(created_at)) AS avg_days,
              MIN(julianday(resolved_at) - julianday(created_at)) AS fastest,
              MAX(julianday(resolved_at) - julianday(created_at)) AS slowest
       FROM hazards WHERE resolved_at IS NOT NULL AND resolved_at >= ?`,
    )
    .get(since);
  const overdueActions = (
    await db
      .prepare(
        "SELECT COUNT(*) AS c FROM corrective_actions WHERE status != 'done' AND due_at IS NOT NULL AND due_at < ?",
      )
      .get(now)
  ).c;

  const months = [];
  const baseDate = new Date();
  for (let i = 5; i >= 0; i -= 1) {
    const d = new Date(baseDate.getFullYear(), baseDate.getMonth() - i, 1);
    months.push({
      key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
      label: d.toLocaleDateString('en-US', { month: 'short' }),
    });
  }
  const createdRows = await db
    .prepare('SELECT substr(created_at,1,7) AS k, COUNT(*) AS c FROM hazards GROUP BY k')
    .all();
  const resolvedRows = await db
    .prepare(
      'SELECT substr(resolved_at,1,7) AS k, COUNT(*) AS c FROM hazards WHERE resolved_at IS NOT NULL GROUP BY k',
    )
    .all();
  const createdMap = Object.fromEntries(createdRows.map((r) => [r.k, r.c]));
  const resolvedMap = Object.fromEntries(resolvedRows.map((r) => [r.k, r.c]));
  const trend = months.map((m) => ({
    month: m.label,
    reported: createdMap[m.key] ?? 0,
    resolved: resolvedMap[m.key] ?? 0,
  }));

  const buildings = camelAll(
    await db.prepare('SELECT id, code, name, status FROM buildings ORDER BY name').all(),
  );
  const byBuilding = await Promise.all(
    buildings.map(async (b) => {
      const roomCount = (
        await db
          .prepare(
            'SELECT COUNT(*) AS c FROM rooms r JOIN floors f ON f.id = r.floor_id WHERE f.building_id = ?',
          )
          .get(b.id)
      ).c;
      const scanned = (
        await db
          .prepare(
            `SELECT COUNT(DISTINCT s.room_id) AS c FROM scans s
         JOIN rooms r ON r.id = s.room_id JOIN floors f ON f.id = r.floor_id
         WHERE f.building_id = ? AND s.status = 'submitted'`,
          )
          .get(b.id)
      ).c;
      const openHazards = (
        await db
          .prepare(
            `SELECT COUNT(*) AS c FROM hazards h JOIN rooms r ON r.id = h.room_id JOIN floors f ON f.id = r.floor_id
         WHERE f.building_id = ? AND h.status != 'resolved'`,
          )
          .get(b.id)
      ).c;
      const equipment = (
        await db
          .prepare(
            `SELECT COUNT(*) AS c FROM safety_equipment e
         LEFT JOIN rooms r ON r.id = e.room_id LEFT JOIN floors f ON f.id = r.floor_id
         WHERE e.building_id = ? OR f.building_id = ?`,
          )
          .get(b.id, b.id)
      ).c;
      return {
        ...b,
        roomCount,
        scannedRooms: scanned,
        coverage: roomCount ? Math.round((scanned / roomCount) * 100) : 0,
        openHazards,
        equipment,
      };
    }),
  );

  const totalRooms = (await db.prepare('SELECT COUNT(*) AS c FROM rooms').get()).c;
  const scannedRooms = (
    await db
      .prepare("SELECT COUNT(DISTINCT room_id) AS c FROM scans WHERE status = 'submitted'")
      .get()
  ).c;
  const overdueRooms = (
    await db
      .prepare(
        "SELECT COUNT(*) AS c FROM rooms WHERE status = 'operational' AND (last_inspected_at IS NULL OR last_inspected_at < datetime('now','-90 days'))",
      )
      .get()
  ).c;
  const scansInRange = (
    await db.prepare('SELECT COUNT(*) AS c FROM scans WHERE submitted_at >= ?').get(since)
  ).c;

  const rollcall = await db
    .prepare(
      'SELECT COALESCE(SUM(expected),0) AS expected, COALESCE(SUM(present),0) AS present, COUNT(*) AS classes FROM rollcall_classes',
    )
    .get();

  const incidentRows = await db
    .prepare('SELECT status, COUNT(*) AS c FROM incidents GROUP BY status')
    .all();
  const incidentStatus = { active: 0, monitoring: 0, closed: 0 };
  for (const row of incidentRows) incidentStatus[row.status] = row.c;
  const closedInRange = (
    await db.prepare('SELECT COUNT(*) AS c FROM incidents WHERE closed_at >= ?').get(since)
  ).c;

  const alertRows = await db
    .prepare('SELECT level, COUNT(*) AS c FROM alerts WHERE published_at >= ? GROUP BY level')
    .all(since);
  const alertByLevel = Object.fromEntries(ALERT_LEVELS.map((l) => [l, 0]));
  for (const row of alertRows) alertByLevel[row.level] = row.c;
  const alertDelivery = await db
    .prepare(
      `SELECT COUNT(*) AS delivered, SUM(CASE WHEN read_at IS NOT NULL THEN 1 ELSE 0 END) AS read
       FROM alert_deliveries WHERE delivered_at >= ?`,
    )
    .get(since);

  const resourceRowsAll = await resourceRows();
  const resourceSummary = {
    total: resourceRowsAll.length,
    ok: resourceRowsAll.filter((r) => r.status === 'ok').length,
    due: resourceRowsAll.filter((r) => r.status === 'due').length,
    expired: resourceRowsAll.filter((r) => r.status === 'expired').length,
    missing: resourceRowsAll.filter((r) => r.status === 'missing').length,
    expiringSoon: resourceRowsAll.filter(
      (r) =>
        r.expiresAt &&
        new Date(r.expiresAt).getTime() >= Date.now() &&
        new Date(r.expiresAt).getTime() - Date.now() < 30 * 864e5,
    ).length,
  };

  const recoveryTasks = await db
    .prepare('SELECT status, COUNT(*) AS c FROM recovery_tasks GROUP BY status')
    .all();
  const recoveryStatus = { open: 0, in_progress: 0, done: 0 };
  for (const row of recoveryTasks) recoveryStatus[row.status] = row.c;
  const assessments = await db
    .prepare('SELECT clearance, COUNT(*) AS c FROM damage_assessments GROUP BY clearance')
    .all();
  const clearance = { pending: 0, restricted: 0, cleared: 0 };
  for (const row of assessments) clearance[row.clearance] = row.c;

  return json(ctx.res, 200, {
    generatedAt: now,
    rangeDays: days,
    since,
    hazards: {
      severity,
      status,
      total: Object.values(severity).reduce((a, b) => a + b, 0),
      reportedInRange,
      resolvedInRange,
      unresolved: status.new + status.pending_review + status.verified + status.in_progress,
      pendingReview: status.pending_review,
      overdueActions,
      avgResolutionDays:
        resolution.avg_days == null ? null : Math.round(resolution.avg_days * 10) / 10,
      fastestResolutionDays:
        resolution.fastest == null ? null : Math.round(resolution.fastest * 10) / 10,
      slowestResolutionDays:
        resolution.slowest == null ? null : Math.round(resolution.slowest * 10) / 10,
    },
    trend,
    byBuilding,
    inspections: {
      totalRooms,
      scannedRooms,
      coverage: totalRooms ? Math.round((scannedRooms / totalRooms) * 100) : 0,
      overdueRooms,
      scansInRange,
    },
    rollcall: {
      expected: rollcall.expected,
      present: rollcall.present,
      classes: rollcall.classes,
      completion: rollcall.expected ? Math.round((rollcall.present / rollcall.expected) * 100) : 0,
    },
    incidents: {
      ...incidentStatus,
      closedInRange,
    },
    alerts: {
      publishedInRange: Object.values(alertByLevel).reduce((a, b) => a + b, 0),
      byLevel: alertByLevel,
      delivered: alertDelivery.delivered ?? 0,
      read: alertDelivery.read ?? 0,
    },
    resources: resourceSummary,
    recovery: {
      tasks: recoveryStatus,
      clearance,
    },
  });
};

handlers['GET /api/analytics/export'] = async (ctx) => {
  const user = await requireUser(ctx.req);
  const url = new URL(ctx.req.url, 'http://localhost');
  const dataset = url.searchParams.get('dataset') ?? 'hazards';

  if (dataset === 'hazards') {
    requirePermission(user, 'hazards:read');
    const rows = camelAll(
      await db
        .prepare(
          `SELECT h.ref, h.title, h.severity, h.status, h.created_at, h.verified_at, h.resolved_at,
                  b.name AS building, r.name AS room, u.name AS reporter
           FROM hazards h
           LEFT JOIN rooms r ON r.id = h.room_id LEFT JOIN floors f ON f.id = r.floor_id
           LEFT JOIN buildings b ON b.id = f.building_id LEFT JOIN users u ON u.id = h.reported_by
           ORDER BY h.created_at DESC`,
        )
        .all(),
    );
    return sendCsv(
      ctx.res,
      'radar-hazards.csv',
      [
        { label: 'Reference', value: 'ref' },
        { label: 'Title', value: 'title' },
        { label: 'Severity', value: 'severity' },
        { label: 'Status', value: 'status' },
        { label: 'Building', value: 'building' },
        { label: 'Room', value: 'room' },
        { label: 'Reported by', value: 'reporter' },
        { label: 'Created', value: 'createdAt' },
        { label: 'Verified', value: 'verifiedAt' },
        { label: 'Resolved', value: 'resolvedAt' },
      ],
      rows,
    );
  }

  if (dataset === 'resources') {
    requirePermission(user, 'resources:read');
    const rows = await resourceRows();
    return sendCsv(
      ctx.res,
      'radar-resources.csv',
      [
        { label: 'Label', value: 'label' },
        { label: 'Type', value: 'type' },
        { label: 'Status', value: 'status' },
        { label: 'Quantity', value: 'quantity' },
        { label: 'Building', value: 'resolvedBuildingName' },
        { label: 'Room', value: 'roomName' },
        { label: 'Location note', value: 'locationNote' },
        { label: 'Expires', value: 'expiresAt' },
        { label: 'Last checked', value: 'lastCheckedAt' },
        { label: 'Notes', value: 'notes' },
      ],
      rows,
    );
  }

  if (dataset === 'alerts') {
    requirePermission(user, 'alerts:read');
    const rows = camelAll(
      await db
        .prepare(
          `SELECT a.ref, a.level, a.kind, a.title, a.audience, a.audience_value, a.effective_at,
                  a.expires_at, a.published_at, a.archived_at, u.name AS publisher
           FROM alerts a LEFT JOIN users u ON u.id = a.published_by
           ORDER BY a.published_at DESC`,
        )
        .all(),
    );
    return sendCsv(
      ctx.res,
      'radar-alerts.csv',
      [
        { label: 'Reference', value: 'ref' },
        { label: 'Level', value: 'level' },
        { label: 'Kind', value: 'kind' },
        { label: 'Title', value: 'title' },
        { label: 'Audience', value: 'audience' },
        { label: 'Audience detail', value: 'audienceValue' },
        { label: 'Effective', value: 'effectiveAt' },
        { label: 'Expires', value: 'expiresAt' },
        { label: 'Published', value: 'publishedAt' },
        { label: 'Archived', value: 'archivedAt' },
        { label: 'Publisher', value: 'publisher' },
      ],
      rows,
    );
  }

  if (dataset === 'rollcall') {
    requirePermission(user, 'rollcall:read');
    const rows = camelAll(
      await db
        .prepare(
          `SELECT c.name, c.grade, c.expected, c.present, c.status, c.updated_at, u.name AS teacher,
                  r.name AS room, b.name AS building
           FROM rollcall_classes c LEFT JOIN users u ON u.id = c.teacher_id
           LEFT JOIN rooms r ON r.id = c.room_id LEFT JOIN floors f ON f.id = r.floor_id
           LEFT JOIN buildings b ON b.id = f.building_id ORDER BY c.grade, c.name`,
        )
        .all(),
    );
    return sendCsv(
      ctx.res,
      'radar-rollcall.csv',
      [
        { label: 'Class', value: 'name' },
        { label: 'Grade', value: 'grade' },
        { label: 'Expected', value: 'expected' },
        { label: 'Present', value: 'present' },
        { label: 'Status', value: 'status' },
        { label: 'Teacher', value: 'teacher' },
        { label: 'Room', value: 'room' },
        { label: 'Building', value: 'building' },
        { label: 'Updated', value: 'updatedAt' },
      ],
      rows,
    );
  }

  throw new HttpError(400, 'Unknown export dataset.');
};

/* ---- SOS ---- */

handlers['POST /api/sos'] = async (ctx) => {
  const user = await requireUser(ctx.req);
  requirePermission(user, 'sos:create');
  const body = await readJson(ctx.req);
  const kind = oneOf(
    body.kind ?? 'other',
    ['medical', 'fire', 'security', 'weather', 'other'],
    'kind',
  );
  const note = str(body.note ?? '', 1000, 'note');
  const buildingId = optionalInt(body.buildingId, 'buildingId');
  const roomId = optionalInt(body.roomId, 'roomId');

  const room = await roomContext(roomId);
  const building = buildingId
    ? camel(await db.prepare('SELECT * FROM buildings WHERE id = ?').get(buildingId))
    : room
      ? camel(await db.prepare('SELECT * FROM buildings WHERE id = ?').get(room.buildingId))
      : null;
  const location = room
    ? locationLabel(room)
    : building
      ? building.name
      : 'Campus location not specified';

  const ref = await nextIncidentRef();
  const at = nowIso();
  const incidentId = Number(
    (
      await db
        .prepare(
          `INSERT INTO incidents (ref, title, description, severity, status, location, kind, started_at, commander_id, created_at)
         VALUES (?, ?, ?, 'critical', 'active', ?, ?, ?, ?, ?)`,
        )
        .run(
          ref,
          `SOS — ${kind}`,
          note || 'SOS raised from the RADAR app.',
          location,
          kind,
          at,
          user.id,
          at,
        )
    ).lastInsertRowid,
  );
  await db
    .prepare(
      'INSERT INTO incident_updates (incident_id, note, actor_id, created_at) VALUES (?, ?, ?, ?)',
    )
    .run(incidentId, `SOS raised by ${user.name} (${user.role}).`, user.id, at);
  await db
    .prepare(
      'INSERT INTO sos_requests(incident_id,reporter_id,state,silent,created_at,updated_at) VALUES (?,?,?,?,?,?)',
    )
    .run(incidentId, user.id, 'active', body.silent === true ? 1 : 0, at, at);
  await notifyRoles(
    ['admin', 'responder'],
    'alert',
    'SOS raised',
    `${user.name} raised an SOS at ${location}.`,
    '/incidents',
  );
  await queueSosSms(incidentId);
  await audit(user.id, 'sos.create', 'incident', incidentId, { ref, kind, location });

  return json(ctx.res, 201, {
    incidentId,
    ref,
    location,
    dispatched: false,
    message:
      'Campus safety leads have been alerted inside RADAR. Emergency services were not contacted automatically. Call your local emergency number if there is immediate danger.',
  });
};

/* ---- Directory (staff lookup for assignment) ---- */

handlers['GET /api/directory'] = async (ctx) => {
  const user = await requireUser(ctx.req);
  requirePermission(user, 'hazards:write');
  const users = camelAll(
    await db
      .prepare(
        `SELECT id, name, role, title FROM users WHERE role IN ('admin','inspector','responder','teacher') ORDER BY name`,
      )
      .all(),
  );
  return json(ctx.res, 200, { users });
};

/* ---- Admin ---- */

handlers['GET /api/admin/users'] = async (ctx) => {
  const user = await requireUser(ctx.req);
  requirePermission(user, 'admin:users');
  const users = camelAll(
    await db
      .prepare(
        `SELECT u.id, u.email, u.name, u.role, u.title, u.phone, u.created_at FROM users u ORDER BY u.name`,
      )
      .all(),
  );
  return json(ctx.res, 200, { users });
};

handlers['PATCH /api/admin/users/:id/role'] = async (ctx) => {
  const user = await requireUser(ctx.req);
  requirePermission(user, 'admin:users');
  const id = Number(ctx.params.id);
  const target = await db.prepare('SELECT * FROM users WHERE id = ?').get(id);
  if (!target) throw new HttpError(404, 'User not found.');
  const body = await readJson(ctx.req);
  const role = oneOf(
    body.role,
    ['admin', 'inspector', 'teacher', 'responder', 'student', 'parent'],
    'role',
  );
  if (target.id === user.id && role !== 'admin') {
    throw new HttpError(400, 'You cannot remove your own administrator role.');
  }
  await db.prepare('UPDATE users SET role = ? WHERE id = ?').run(role, id);
  await audit(user.id, 'user.role.update', 'user', id, { from: target.role, to: role });
  return json(ctx.res, 200, { ok: true });
};

handlers['GET /api/admin/audit'] = async (ctx) => {
  const user = await requireUser(ctx.req);
  requirePermission(user, 'admin:audit');
  const rows = camelAll(
    await db
      .prepare(
        `SELECT a.*, u.name AS actor_name, u.role AS actor_role FROM audit_log a
         LEFT JOIN users u ON u.id = a.actor_id ORDER BY a.created_at DESC LIMIT 100`,
      )
      .all(),
  );
  return json(ctx.res, 200, { entries: rows });
};

/* ---- Profile ---- */

handlers['PATCH /api/me'] = async (ctx) => {
  const user = await requireUser(ctx.req);
  const body = await readJson(ctx.req);
  const name = str(body.name ?? user.name, 120, 'name');
  const phone = str(body.phone ?? user.phone ?? '', 40, 'phone');
  if (!name) throw new HttpError(400, 'A name is required.');
  await db.prepare('UPDATE users SET name = ?, phone = ? WHERE id = ?').run(name, phone, user.id);
  await audit(user.id, 'user.update', 'user', user.id, { name });
  const updated = await db.prepare('SELECT * FROM users WHERE id = ?').get(user.id);
  return json(ctx.res, 200, {
    user: publicUser({
      id: updated.id,
      accountScope: user.accountScope,
      email: updated.email,
      name: updated.name,
      role: updated.role,
      title: updated.title,
      phone: updated.phone,
      schoolId: updated.school_id,
    }),
  });
};

handlers['GET /api/health'] = async (ctx) =>
  json(ctx.res, 200, {
    ok: true,
    time: nowIso(),
    database: coreDb.dialect === 'postgres' ? 'postgres' : 'sqlite',
    apiVersion: '2.1',
  });

/* ------------------------------------------------------------------ */
/* Dispatch                                                            */
/* ------------------------------------------------------------------ */

Object.assign(
  handlers,
  featureHandlers({
    requireUser,
    requirePermission,
    readJson,
    readBinary,
    json,
    HttpError,
    camel,
    camelAll,
    str,
    oneOf,
    finiteNumber,
    optionalInt,
    roomContext,
    workspaceUploadUrl,
    notifyRoles,
  }),
);
Object.assign(
  handlers,
  productHandlers({
    requireUser,
    requirePermission,
    readJson,
    json,
    HttpError,
    camel,
    camelAll,
    str,
    oneOf,
    finiteNumber,
  }),
);
Object.assign(
  handlers,
  advancedHandlers({
    requireUser,
    requirePermission,
    readJson,
    json,
    HttpError,
    camel,
    camelAll,
    str,
    oneOf,
    finiteNumber,
  }),
);
async function checkAuthRate(req, email) {
  const address = process.env.VERCEL
    ? String(req.headers['x-vercel-forwarded-for'] ?? req.socket.remoteAddress)
        .split(',')[0]
        .trim()
    : req.socket.remoteAddress;
  const at = nowIso(),
    expires = new Date(Date.now() + 600000).toISOString();
  for (const [identity, limit] of [
    [`account:${address}:${String(email).toLowerCase()}:${req.url.split('?')[0]}`, 20],
    [`address:${address}`, 100],
  ]) {
    const key = crypto.createHash('sha256').update(identity).digest('hex');
    const row = await coreDb
      .prepare(
        'INSERT INTO auth_rate_limits(key,count,expires_at) VALUES (?,1,?) ON CONFLICT(key) DO UPDATE SET count=CASE WHEN auth_rate_limits.expires_at<=? THEN 1 ELSE auth_rate_limits.count+1 END,expires_at=CASE WHEN auth_rate_limits.expires_at<=? THEN excluded.expires_at ELSE auth_rate_limits.expires_at END RETURNING count',
      )
      .get(key, expires, at, at);
    if (row.count > limit)
      throw new HttpError(
        429,
        'Too many authentication attempts. Wait ten minutes before trying again.',
      );
  }
  await coreDb.prepare('DELETE FROM auth_rate_limits WHERE expires_at<?').run(at);
}
const ROUTES = Object.keys(handlers).map((key) => {
  const [method, pattern] = key.split(' ');
  const segments = pattern.split('/').filter(Boolean);
  return { method, segments, handler: handlers[key] };
});

function matchRoute(method, pathname) {
  const parts = pathname.split('/').filter(Boolean);
  for (const route of ROUTES) {
    if (route.method !== method) continue;
    if (route.segments.length !== parts.length) continue;
    const params = {};
    let ok = true;
    for (let i = 0; i < route.segments.length; i += 1) {
      const seg = route.segments[i];
      if (seg.startsWith(':')) params[seg.slice(1)] = decodeURIComponent(parts[i]);
      else if (seg !== parts[i]) {
        ok = false;
        break;
      }
    }
    if (ok) return { route, params };
  }
  return null;
}

export async function handleApi(req, res) {
  const url = new URL(req.url, 'http://localhost');
  const match = matchRoute(req.method, url.pathname);

  try {
    if (!match)
      return json(res, 404, {
        error: 'Endpoint not found.',
        code: 'API_ENDPOINT_NOT_FOUND',
        method: req.method,
        path: url.pathname,
        apiVersion: '2.1',
      });
    const account = await getUserFromRequest(req);
    const control =
      url.pathname.startsWith('/api/workspaces') ||
      url.pathname === '/api/notifications/sms-status' ||
      url.pathname === '/api/device/occupancy' ||
      (url.pathname.startsWith('/api/auth/') && url.pathname !== '/api/auth/me');
    const active = account?.workspaceId ?? null;
    if (
      usesSupabase &&
      account &&
      !active &&
      account.role !== 'admin' &&
      !control &&
      url.pathname !== '/api/auth/me' &&
      !url.pathname.startsWith('/api/schools/') &&
      !['/api/health', '/api/me'].includes(url.pathname)
    )
      throw new HttpError(
        403,
        'Choose a school and obtain school administrator approval before accessing campus records.',
      );
    // Reject writes from a stale tab instead of applying them to a newly selected school.
    if (
      !control &&
      !['GET', 'HEAD', 'OPTIONS'].includes(req.method) &&
      (req.headers['x-radar-workspace'] ?? '') !== (active ?? '')
    ) {
      throw new HttpError(409, 'The school workspace changed. Refresh this page before saving.');
    }
    if (
      !control &&
      url.pathname !== '/api/auth/me' &&
      ('x-radar-workspace' in req.headers || url.searchParams.has('workspace')) &&
      (req.headers['x-radar-workspace'] ?? url.searchParams.get('workspace') ?? '') !==
        (active ?? '')
    )
      throw new HttpError(409, 'The school workspace changed. Refresh this page.');
    const invoke = () => match.route.handler({ req, res, params: match.params, url });
    if (active && !control) {
      const record = await workspaceRecord(active);
      if (!record || !(await workspaceAccess(active, account.id)))
        throw new HttpError(403, 'School workspace access denied.');
      await runInWorkspace(active, invoke);
    } else {
      await invoke();
    }
  } catch (error) {
    if (res.headersSent) return;
    if (error instanceof HttpError) {
      return json(res, error.status, { error: error.message, details: error.details ?? null });
    }
    console.error('[radar] unhandled API error:', error);
    return json(res, 500, { error: 'An unexpected server error occurred.' });
  }
}
