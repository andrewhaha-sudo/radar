import { visionApiKey } from './vision-provider.mjs';
import crypto from 'node:crypto';
import { UPLOAD_MIMES, validateGlb } from './upload-validation.mjs';
import { cloudSignedUpload, cloudDownload, cloudRemoveUpload } from './supabase.mjs';
import { db, coreDb, currentDatabaseContext, nowIso, usesPostgres } from './db.mjs';
import { usesSupabase } from './supabase.mjs';
import { workspaceAccess, workspaceSchool } from './workspaces.mjs';
import { grantSchoolMembership } from './memberships.mjs';
import { audit, can } from './auth.mjs';
import { channelStatus } from './delivery-utils.mjs';
export function productHandlers(h) {
  const {
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
  } = h;
  const routes = {};
  routes['POST /api/uploads/sign'] = async (ctx) => {
    const user = await requireUser(ctx.req);
    if (!usesSupabase) throw new HttpError(400, 'Direct cloud uploads require Supabase.');
    if (!can(user, 'scan:write') && !can(user, 'hazards:write') && !can(user, 'hazards:report'))
      throw new HttpError(403, 'You cannot upload inspection evidence.');
    const body = await readJson(ctx.req);
    const mime = String(body.mime);
    const extension = UPLOAD_MIMES[mime];
    if (!extension) throw new HttpError(415, 'Unsupported file format.');
    if (extension === '.glb') requirePermission(user, 'admin:users');
    const bytes = finiteNumber(body.bytes, 'File size', 1, 10 * 1024 * 1024, true);
    const pending = (
      await db
        .prepare(
          "SELECT COUNT(*) AS n FROM upload_receipts WHERE user_id=? AND state='pending' AND expires_at>?",
        )
        .get(user.id, nowIso())
    ).n;
    if (pending >= 10)
      throw new HttpError(429, 'Finish your pending uploads or wait for them to expire.');
    const name = `direct-${Date.now()}-${crypto.randomBytes(12).toString('hex')}${extension}`;
    const scope = currentDatabaseContext()?.workspaceId;
    const signed = await cloudSignedUpload(scope, name);
    const result = await db
      .prepare(
        'INSERT INTO upload_receipts(name,user_id,mime,bytes,expires_at,created_at) VALUES (?,?,?,?,?,?)',
      )
      .run(name, user.id, mime, bytes, new Date(Date.now() + 3600000).toISOString(), nowIso());
    return json(ctx.res, 201, { ...signed, receiptId: Number(result.lastInsertRowid) });
  };
  routes['POST /api/uploads/complete'] = async (ctx) => {
    const user = await requireUser(ctx.req);
    if (!usesSupabase) throw new HttpError(400, 'Direct cloud uploads require Supabase.');
    const body = await readJson(ctx.req);
    const row = await db
      .prepare('SELECT * FROM upload_receipts WHERE id=? AND user_id=?')
      .get(Number(body.receiptId), user.id);
    if (!row) throw new HttpError(404, 'Upload receipt not found.');
    if (row.state === 'rejected' || row.expires_at < nowIso())
      throw new HttpError(410, 'This upload authorization expired.');
    const scope = currentDatabaseContext()?.workspaceId;
    if (row.state !== 'complete') {
      const file = await cloudDownload(scope, row.name);
      if (!file || file.buffer.length !== row.bytes)
        throw new HttpError(400, 'The uploaded file has not been received with the expected size.');
      try {
        if (UPLOAD_MIMES[row.mime] === '.glb') validateGlb(file.buffer);
      } catch {
        await db.prepare("UPDATE upload_receipts SET state='rejected' WHERE id=?").run(row.id);
        await cloudRemoveUpload(scope, row.name);
        throw new HttpError(
          400,
          'Upload a valid self-contained GLB 2.0 model with embedded resources.',
        );
      }
      await db.prepare("UPDATE upload_receipts SET state='complete' WHERE id=?").run(row.id);
      await audit(user.id, 'upload.complete', 'upload', row.name, {
        mime: row.mime,
        bytes: row.bytes,
      });
    }
    return json(ctx.res, 200, {
      url: scope ? `/uploads/workspaces/${scope}/${row.name}` : `/uploads/${row.name}`,
      mime: row.mime,
      bytes: row.bytes,
    });
  };
  routes['PATCH /api/school/location'] = async (ctx) => {
    const user = await requireUser(ctx.req);
    requirePermission(user, 'admin:users');
    const body = await readJson(ctx.req);
    if (body.verified !== true)
      throw new HttpError(400, 'Confirm that this is the actual school location.');
    const lat = finiteNumber(body.lat, 'Latitude', -90, 90),
      lng = finiteNumber(body.lng, 'Longitude', -180, 180);
    const source = str(body.source, 500).trim();
    if (!source) throw new HttpError(400, 'Describe how the school location was verified.');
    const schoolId = user.schoolId ?? 1;
    const old = await db.prepare('SELECT * FROM schools WHERE id=?').get(schoolId);
    if (!old) throw new HttpError(404, 'School not found.');
    await db
      .prepare(
        'UPDATE schools SET lat=?,lng=?,location_verified=1,location_source=?,location_updated_at=? WHERE id=?',
      )
      .run(lat, lng, source, nowIso(), schoolId);
    await audit(user.id, 'school.location', 'school', schoolId, {
      previous: { lat: old.lat, lng: old.lng },
      lat,
      lng,
      source,
    });
    return json(ctx.res, 200, {
      school: camel(await db.prepare('SELECT * FROM schools WHERE id=?').get(schoolId)),
      message: 'School location saved. Building pins keep their own surveyed coordinates.',
    });
  };
  routes['POST /api/schools/:id/join'] = async (ctx) => {
    const user = await requireUser(ctx.req);
    const scope = String(ctx.params.id);
    if (!workspaceSchool(scope)) throw new HttpError(404, 'School not found in the directory.');
    if (await workspaceAccess(scope, user.id))
      throw new HttpError(409, 'You already have access to this school.');
    const body = await readJson(ctx.req);
    const role = oneOf(
      body.role ?? 'student',
      ['student', 'parent', 'teacher', 'responder', 'inspector'],
      'Requested role',
    );
    const old = await coreDb
      .prepare('SELECT * FROM school_join_requests WHERE workspace_id=? AND user_id=?')
      .get(scope, user.id);
    if (old?.state === 'pending')
      return json(ctx.res, 200, {
        request: camel(old),
        message: 'Your request is awaiting school administrator review.',
      });
    if (old?.state === 'rejected' && Date.now() - Date.parse(old.updated_at) < 86400000)
      throw new HttpError(
        429,
        'This request was declined. Contact the school or wait 24 hours before submitting another request.',
      );
    const at = nowIso();
    await coreDb
      .prepare(
        "INSERT INTO school_join_requests(workspace_id,user_id,requested_role,note,state,created_at,updated_at) VALUES (?,?,?,?,'pending',?,?) ON CONFLICT(workspace_id,user_id) DO UPDATE SET requested_role=excluded.requested_role,note=excluded.note,state='pending',decision_note='',decided_by=NULL,updated_at=excluded.updated_at",
      )
      .run(scope, user.id, role, str(body.note, 1000), at, at);
    return json(ctx.res, 201, {
      message:
        'Request saved. School staff must verify your identity and approve access before campus records become available.',
    });
  };
  routes['GET /api/schools/requests/mine'] = async (ctx) => {
    const user = await requireUser(ctx.req);
    return json(ctx.res, 200, {
      requests: camelAll(
        await coreDb
          .prepare(
            'SELECT workspace_id,requested_role,state,decision_note,updated_at FROM school_join_requests WHERE user_id=? ORDER BY updated_at DESC',
          )
          .all(user.id),
      ),
    });
  };
  routes['GET /api/membership/requests'] = async (ctx) => {
    const user = await requireUser(ctx.req);
    requirePermission(user, 'admin:users');
    const scope = currentDatabaseContext()?.workspaceId;
    if (!scope) return json(ctx.res, 200, { requests: [] });
    return json(ctx.res, 200, {
      requests: camelAll(
        await coreDb
          .prepare(
            "SELECT r.*,u.name,u.email FROM school_join_requests r JOIN users u ON u.id=r.user_id WHERE r.workspace_id=? AND r.state='pending' ORDER BY r.created_at",
          )
          .all(scope),
      ),
    });
  };
  routes['POST /api/membership/requests/:id/decision'] = async (ctx) => {
    const user = await requireUser(ctx.req);
    requirePermission(user, 'admin:users');
    const scope = currentDatabaseContext()?.workspaceId;
    const request = await coreDb
      .prepare('SELECT * FROM school_join_requests WHERE id=? AND workspace_id=?')
      .get(Number(ctx.params.id), scope ?? '');
    if (!scope || !request) throw new HttpError(404, 'Request not found in this school.');
    if (request.state !== 'pending') throw new HttpError(409, 'This request was already decided.');
    const body = await readJson(ctx.req);
    const state = oneOf(body.state, ['approved', 'rejected'], 'Decision');
    const role = oneOf(
      body.role ?? request.requested_role,
      ['student', 'parent', 'teacher', 'responder', 'inspector'],
      'Approved role',
    );
    if (state === 'approved') {
      const target = await coreDb.prepare('SELECT * FROM users WHERE id=?').get(request.user_id);
      if (!target) throw new HttpError(404, 'Account no longer exists.');
      await grantSchoolMembership(scope, target, role);
    }
    await coreDb
      .prepare(
        'UPDATE school_join_requests SET state=?,requested_role=?,decided_by=?,decision_note=?,updated_at=? WHERE id=? AND workspace_id=?',
      )
      .run(state, role, user.id, str(body.note, 1000), nowIso(), request.id, scope);
    await audit(user.id, 'membership.request.decide', 'user', request.user_id, {
      state,
      role,
      requestId: request.id,
    });
    return json(ctx.res, 200, { ok: true });
  };
  routes['GET /api/setup/readiness'] = async (ctx) => {
    const user = await requireUser(ctx.req);
    requirePermission(user, 'admin:users');
    const school = await db
      .prepare('SELECT location_verified FROM schools WHERE id=?')
      .get(user.schoolId ?? 1);
    const channels = channelStatus();
    const count = async (table) => (await db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get()).n;
    const assets = await db
      .prepare('SELECT kind,COUNT(*) AS n FROM room_assets GROUP BY kind')
      .all();
    const checks = [
      {
        id: 'location',
        name: 'School map location',
        state: school?.location_verified ? 'ready' : 'missing',
        detail: school?.location_verified
          ? 'A school location is recorded. Confirm it on the map.'
          : 'Choose the actual school location in Buildings & rooms.',
        href: '/buildings',
      },
      {
        id: 'buildings',
        name: 'Campus buildings and rooms',
        state: (await count('rooms')) ? 'ready' : 'missing',
        detail: `${await count('buildings')} buildings and ${await count('rooms')} rooms registered. Survey accuracy must be checked by school staff.`,
        href: '/buildings',
      },
      {
        id: 'database',
        name: 'Durable cloud database',
        state: usesPostgres ? 'ready' : 'missing',
        detail: usesPostgres
          ? 'This request used PostgreSQL. Configure project backups and rehearse restores.'
          : 'Using local SQLite. Configure Supabase PostgreSQL before publishing real school data.',
        href: '/operations?tab=readiness',
      },
      {
        id: 'auth',
        name: 'Sign-in and email recovery',
        state: usesSupabase ? 'configured' : 'missing',
        detail: usesSupabase
          ? 'Supabase Auth is selected; test registration, confirmation, login and recovery with your project.'
          : 'Local sign-in/sign-up accepts Gmail and other valid emails. Email confirmation and email recovery require Supabase.',
        href: '/operations?tab=readiness',
      },
      {
        id: 'vision',
        name: 'AI photo suggestions',
        state: visionApiKey() ? 'configured' : 'missing',
        detail: visionApiKey()
          ? 'Server key is present. An inspector must consent and run an actual photo analysis to verify service access.'
          : 'Choose OpenAI or Gemini and configure its API key privately on the server. Manual inspections remain available.',
        href: '/scan',
      },
      {
        id: 'push',
        name: 'Browser push',
        state: channels.push.configured ? 'configured' : 'missing',
        detail:
          'Requires VAPID configuration, HTTPS, an installed service worker and each recipient’s consent. Confirm delivery on real devices.',
        href: '/operations?tab=integrations',
      },
      {
        id: 'sms',
        name: 'SMS delivery',
        state: channels.sms.configured ? 'configured' : 'missing',
        detail:
          'Requires a configured Twilio sender and explicit recipient consent. Provider charges and delivery restrictions apply.',
        href: '/operations?tab=integrations',
      },
      {
        id: 'models',
        name: 'Recorded 3D and 360 assets',
        state: assets.some((a) => a.kind === 'model' || a.kind === 'panorama')
          ? 'configured'
          : 'missing',
        detail: assets.length
          ? assets.map((a) => `${a.n} ${a.kind}`).join(' · ')
          : 'Upload real GLB models or 360 panoramas in a room record; no interiors are generated.',
        href: '/operations?tab=rooms',
      },
      {
        id: 'public',
        name: 'Public HTTPS address',
        state: process.env.RADAR_PUBLIC_URL?.startsWith('https://') ? 'configured' : 'missing',
        detail:
          'Set RADAR_PUBLIC_URL to the final HTTPS origin and configure Supabase confirmation/recovery redirect URLs.',
        href: '/operations?tab=readiness',
      },
    ];
    return json(ctx.res, 200, {
      checks,
      note: 'Ready means a local prerequisite exists. Configured means settings/assets exist, not that an external service or emergency delivery has been verified. Never publish private keys in the browser.',
    });
  };
  routes['GET /api/hazards/:id/duplicates'] = async (ctx) => {
    const user = await requireUser(ctx.req);
    requirePermission(user, 'hazards:read');
    const selected = await db
      .prepare('SELECT * FROM hazards WHERE id=?')
      .get(Number(ctx.params.id));
    if (!selected) throw new HttpError(404, 'Hazard not found.');
    const tokens = (s) =>
      new Set(
        String(s)
          .toLowerCase()
          .match(/[\p{L}\p{N}]{3,}/gu) ?? [],
      );
    const original = tokens(selected.title);
    const candidates = await db
      .prepare(
        "SELECT id,ref,title,room_id,category,severity,status,created_at FROM hazards WHERE id<>? AND status<>'resolved' ORDER BY created_at DESC LIMIT 500",
      )
      .all(selected.id);
    const matches = candidates
      .map((row) => {
        const words = tokens(row.title);
        const overlap =
          [...original].filter((w) => words.has(w)).length /
          Math.max(1, new Set([...original, ...words]).size);
        const sameRoom = selected.room_id != null && row.room_id === selected.room_id;
        const score =
          overlap * 0.7 +
          (sameRoom ? 0.2 : 0) +
          (row.category === selected.category && row.category !== 'other' ? 0.1 : 0);
        return { ...camel(row), similarity: Math.round(score * 100), sameRoom };
      })
      .filter((row) => row.similarity >= 35)
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, 8);
    return json(ctx.res, 200, {
      matches,
      note: 'Text/location similarities are review suggestions. Reports are never automatically merged or verified.',
    });
  };
  routes['GET /api/escalation/rules'] = async (ctx) => {
    const user = await requireUser(ctx.req);
    requirePermission(user, 'alerts:publish');
    const row = await db
      .prepare("SELECT value FROM school_settings WHERE key='escalation_rules'")
      .get();
    return json(ctx.res, 200, {
      rule: row ? JSON.parse(row.value) : { enabled: false, threshold: 3, severity: 'high' },
    });
  };
  routes['POST /api/escalation/rules'] = async (ctx) => {
    const user = await requireUser(ctx.req);
    requirePermission(user, 'admin:users');
    const body = await readJson(ctx.req);
    const rule = {
      enabled: body.enabled === true,
      threshold: finiteNumber(body.threshold, 'Threshold', 1, 1000, true),
      severity: oneOf(body.severity, ['critical', 'high', 'medium'], 'Severity'),
    };
    await db
      .prepare(
        "INSERT INTO school_settings(key,value,updated_at) VALUES ('escalation_rules',?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at",
      )
      .run(JSON.stringify(rule), nowIso());
    await audit(user.id, 'escalation.configure', 'school', 1, rule);
    return json(ctx.res, 200, { rule });
  };
  routes['GET /api/escalation/suggestions'] = async (ctx) => {
    const user = await requireUser(ctx.req);
    requirePermission(user, 'alerts:publish');
    const stored = await db
      .prepare("SELECT value FROM school_settings WHERE key='escalation_rules'")
      .get();
    const rule = stored ? JSON.parse(stored.value) : { enabled: false };
    if (!rule.enabled) return json(ctx.res, 200, { suggestions: [] });
    const levels = ['critical', 'high', 'medium'];
    const selected = levels.slice(0, levels.indexOf(rule.severity) + 1);
    const groups = await db
      .prepare(
        `SELECT b.id,b.name,COUNT(*) AS count FROM hazards h JOIN rooms r ON r.id=h.room_id JOIN floors f ON f.id=r.floor_id JOIN buildings b ON b.id=f.building_id WHERE h.status IN ('verified','in_progress') AND h.severity IN (${selected.map(() => '?').join(',')}) GROUP BY b.id,b.name HAVING COUNT(*)>=?`,
      )
      .all(...selected, rule.threshold);
    return json(ctx.res, 200, {
      suggestions: camelAll(groups),
      rule,
      note: 'Threshold suggestions require administrator review. No suspension, evacuation or external message is automatically published.',
    });
  };
  return routes;
}
