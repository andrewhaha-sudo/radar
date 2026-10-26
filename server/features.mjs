import { visionApiKey, visionProvider } from './vision-provider.mjs';
import { csvCell } from './advanced-utils.mjs';
import { projectPoint } from './advanced-utils.mjs';
import { grantSchoolMembership } from './memberships.mjs';
import { channelStatus, validPush, verifySmsSignature, drainDeliveryJobs } from './delivery.mjs';
import { runInWorkspace } from './workspaces.mjs';
import { planEvacuation, meters } from './routing.mjs';
import { inspectionReminders } from './maintenance.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { usesSupabase, cloudDownload } from './supabase.mjs';
import { UPLOAD_DIR } from './db.mjs';
import { analyzeVisibleHazards, fetchUsgs, parseUsgs } from './integrations.mjs';
import crypto from 'node:crypto';
import QRCode from 'qrcode';
import { db, coreDb, currentDatabaseContext, nowIso } from './db.mjs';
import { audit, can } from './auth.mjs';
import { workspaceRecord } from './workspaces.mjs';

export function featureHandlers(h) {
  const {
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
  } = h;
  const routes = {};
  const staff = (user) => ['admin', 'inspector', 'responder'].includes(user.role);
  const admin = (user) => requirePermission(user, 'admin:users');
  async function setting(key, fallback) {
    const row = await db.prepare('SELECT value FROM school_settings WHERE key = ?').get(key);
    return row ? JSON.parse(row.value) : fallback;
  }
  async function room(id) {
    const row = await db.prepare('SELECT * FROM rooms WHERE id = ?').get(id);
    if (!row) throw new HttpError(404, 'Room not found.');
    return row;
  }
  async function ownClass(user, id, write = false) {
    const row = await db.prepare('SELECT * FROM rollcall_classes WHERE id = ?').get(id);
    if (!row) throw new HttpError(404, 'Class not found.');
    requirePermission(user, write ? 'rollcall:write' : 'rollcall:read');
    if (user.role === 'teacher' && row.teacher_id !== user.id)
      throw new HttpError(403, 'This class is not assigned to you.');
    return row;
  }
  function text(value, label, max = 200) {
    const result = str(value, max, label);
    if (!result) throw new HttpError(400, `${label} is required.`);
    return result;
  }
  const date = (value) => {
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) throw new HttpError(400, 'Choose a valid date.');
    return d.toISOString();
  };
  async function snapshot(type, id, value, user) {
    await db
      .prepare(
        'INSERT INTO map_versions(entity_type,entity_id,snapshot,actor_id,created_at) VALUES (?,?,?,?,?)',
      )
      .run(type, id, JSON.stringify(value), user.id, nowIso());
  }

  routes['GET /api/operations'] = async (ctx) => {
    const user = await requireUser(ctx.req);
    const result = {
      generatedAt: nowIso(),
      scope: currentDatabaseContext()?.workspaceId ?? null,
      permissions: {
        staff: staff(user),
        admin: can(user, 'admin:users'),
        teacher: can(user, 'rollcall:write'),
      },
      schoolSettings: await setting('public', { emergencyContacts: [], procedures: '' }),
    };
    if (can(user, 'buildings:read')) {
      result.rooms = camelAll(
        await db
          .prepare(
            `SELECT r.*,f.name AS floor_name,b.name AS building_name,b.id AS building_id,s.next_due_at,s.interval_days,(SELECT sc.status FROM scans sc WHERE sc.room_id=r.id ORDER BY sc.id DESC LIMIT 1) AS latest_scan_status,(SELECT COUNT(*) FROM hazards h WHERE h.room_id=r.id AND h.status IN ('new','pending_review')) AS pending_findings FROM rooms r JOIN floors f ON f.id=r.floor_id JOIN buildings b ON b.id=f.building_id LEFT JOIN inspection_schedules s ON s.room_id=r.id ORDER BY b.name,f.level,r.code`,
          )
          .all(),
      );
      result.overdue = result.rooms.filter((r) => r.nextDueAt && r.nextDueAt < nowIso()).length;
      for (const room of result.rooms)
        room.inspectionState =
          room.nextDueAt && room.nextDueAt < nowIso()
            ? 'overdue'
            : room.latestScanStatus === 'draft'
              ? 'in_progress'
              : room.pendingFindings > 0
                ? 'awaiting_verification'
                : room.lastInspectedAt
                  ? 'scanned'
                  : 'unscanned';
      const groups = new Map();
      for (const room of result.rooms) {
        const key = `${room.buildingId}:${room.floorId}`;
        if (!groups.has(key))
          groups.set(key, {
            buildingId: room.buildingId,
            buildingName: room.buildingName,
            floorName: room.floorName,
            floorId: room.floorId,
            total: 0,
            inspected: 0,
            overdue: 0,
            pending: 0,
          });
        const group = groups.get(key);
        group.total++;
        if (room.lastInspectedAt) group.inspected++;
        if (room.inspectionState === 'overdue') group.overdue++;
        if (room.pendingFindings > 0) group.pending++;
      }
      result.coverage = [...groups.values()].map((group) => ({
        ...group,
        percent: Math.round((group.inspected / group.total) * 100),
      }));
    }
    result.sos = camelAll(
      await db
        .prepare(
          `SELECT s.*,i.ref,i.location,i.kind,i.title FROM sos_requests s JOIN incidents i ON i.id=s.incident_id ${can(user, 'incidents:read') ? '' : 'WHERE s.reporter_id = ?'} ORDER BY s.created_at DESC LIMIT 100`,
        )
        .all(...(can(user, 'incidents:read') ? [] : [user.id])),
    );
    result.assistance = camelAll(
      await db
        .prepare(
          `SELECT a.*,u.name AS requester_name FROM assistance_requests a JOIN users u ON u.id=a.user_id ${staff(user) ? '' : 'WHERE a.user_id = ?'} ORDER BY a.created_at DESC LIMIT 100`,
        )
        .all(...(staff(user) ? [] : [user.id])),
    );
    if (can(user, 'resources:read'))
      result.resources = camelAll(
        await db.prepare('SELECT * FROM safety_equipment ORDER BY label').all(),
      );
    if (can(user, 'evacuation:read')) {
      result.assembly = camelAll(
        await db.prepare('SELECT * FROM assembly_points ORDER BY name').all(),
      );
      result.occupancy = camelAll(
        await db
          .prepare(
            `SELECT o.*,a.name,a.capacity FROM occupancy_reports o JOIN assembly_points a ON a.id=o.assembly_point_id WHERE o.id IN (SELECT MAX(id) FROM occupancy_reports GROUP BY assembly_point_id)`,
          )
          .all(),
      );
    }
    if (['admin', 'responder'].includes(user.role)) {
      await db
        .prepare(
          "DELETE FROM location_reports WHERE expires_at < ? OR incident_id IN (SELECT id FROM incidents WHERE status='closed')",
        )
        .run(nowIso());
      result.locations = camelAll(
        await db
          .prepare(
            'SELECT l.*,u.name,u.role FROM location_reports l JOIN users u ON u.id=l.user_id',
          )
          .all(),
      );
      await audit(user.id, 'location.access', 'school', result.scope ?? 'original', {
        count: result.locations.length,
      });
    }
    if (user.role === 'parent') {
      result.guardianChecks = camelAll(
        await db
          .prepare(
            'SELECT u.name,s.status,s.updated_at FROM student_guardians g JOIN users u ON u.id=g.student_id LEFT JOIN safety_checks s ON s.user_id=u.id WHERE g.guardian_id=?',
          )
          .all(user.id),
      );
      await audit(user.id, 'guardian.checkins.read', 'user', user.id, {});
    }
    return json(ctx.res, 200, result);
  };
  routes['GET /api/rooms/:id/record'] = async (ctx) => {
    const user = await requireUser(ctx.req);
    requirePermission(user, 'buildings:read');
    const id = Number(ctx.params.id);
    const record = await room(id);
    const hazards = camelAll(
      await db
        .prepare(
          "SELECT id,ref,title,severity,status,pin_x,pin_y,category FROM hazards WHERE room_id = ? AND status != 'resolved'",
        )
        .all(id),
    );
    const penalties = { critical: 30, high: 20, medium: 10, low: 5, info: 0 };
    const score = record.last_inspected_at
      ? Math.max(0, 100 - hazards.reduce((sum, x) => sum + penalties[x.severity], 0))
      : null;
    const photos = camelAll(
      await db
        .prepare(
          'SELECT p.*,s.submitted_at,s.started_at FROM scan_photos p JOIN scans s ON s.id=p.scan_id WHERE s.room_id = ? ORDER BY p.created_at DESC',
        )
        .all(id),
    );
    const base =
      process.env.RADAR_PUBLIC_URL ||
      `${ctx.req.socket.encrypted || process.env.VERCEL ? 'https' : 'http'}://${ctx.req.headers.host}`;
    const url = new URL(
      `/operations?tab=rooms&roomId=${id}&school=${currentDatabaseContext()?.workspaceId ?? 'original'}`,
      base,
    ).toString();
    return json(ctx.res, 200, {
      room: camel(record),
      floor: camel(await db.prepare('SELECT * FROM floors WHERE id=?').get(record.floor_id)),
      context: await roomContext(id),
      hazards,
      photos,
      assets: camelAll(
        await db
          .prepare('SELECT * FROM room_assets WHERE room_id = ? ORDER BY created_at DESC')
          .all(id),
      ),
      features: camelAll(await db.prepare('SELECT * FROM room_features WHERE room_id = ?').all(id)),
      schedule: camel(
        await db.prepare('SELECT * FROM inspection_schedules WHERE room_id = ?').get(id),
      ),
      score: {
        value: score,
        provisional: hazards.some((x) => ['new', 'pending_review'].includes(x.status)),
        criteria: penalties,
        note: '100 minus unresolved-hazard penalties, bounded at zero; available only after an inspection. This is not a safety certification.',
      },
      qr: { url, image: await QRCode.toDataURL(url, { width: 256, margin: 2 }) },
    });
  };
  routes['PATCH /api/rooms/:id/layout'] = async (ctx) => {
    const user = await requireUser(ctx.req);
    admin(user);
    const id = Number(ctx.params.id);
    const old = await room(id);
    const body = await readJson(ctx.req);
    const floor = await db.prepare('SELECT * FROM floors WHERE id = ?').get(old.floor_id);
    const values = ['x', 'y', 'width', 'height'].map((key, i) =>
      finiteNumber(
        body[key] ?? old[key],
        key,
        i < 2 ? 0 : 1,
        i % 2 === 0 ? floor.plan_width : floor.plan_height,
      ),
    );
    if (values[0] + values[2] > floor.plan_width || values[1] + values[3] > floor.plan_height)
      throw new HttpError(400, 'The room must fit within the floor plan.');
    await snapshot('room', id, old, user);
    await db
      .prepare('UPDATE rooms SET x=?,y=?,width=?,height=?,capacity=? WHERE id=?')
      .run(...values, finiteNumber(body.capacity ?? old.capacity, 'capacity', 0, 100000, true), id);
    await audit(user.id, 'room.layout.update', 'room', id, { values });
    return json(ctx.res, 200, { ok: true });
  };
  routes['POST /api/rooms/:id/schedule'] = async (ctx) => {
    const user = await requireUser(ctx.req);
    requirePermission(user, 'scan:write');
    const id = Number(ctx.params.id);
    await room(id);
    const body = await readJson(ctx.req);
    const days = finiteNumber(body.intervalDays, 'Inspection interval', 1, 3650, true);
    const due = date(body.nextDueAt);
    const reviewer = optionalInt(body.reviewerId, 'reviewerId');
    if (
      reviewer &&
      !(await db
        .prepare("SELECT id FROM users WHERE id = ? AND role IN ('admin','inspector') AND active=1")
        .get(reviewer))
    )
      throw new HttpError(400, 'Choose a school member as reviewer.');
    await db
      .prepare(
        'INSERT INTO inspection_schedules(room_id,interval_days,next_due_at,reviewer_id,updated_at) VALUES (?,?,?,?,?) ON CONFLICT(room_id) DO UPDATE SET interval_days=excluded.interval_days,next_due_at=excluded.next_due_at,reviewer_id=excluded.reviewer_id,updated_at=excluded.updated_at',
      )
      .run(id, days, due, reviewer, nowIso());
    await audit(user.id, 'inspection.schedule', 'room', id, { intervalDays: days, nextDueAt: due });
    return json(ctx.res, 200, { ok: true });
  };
  routes['POST /api/rooms/:id/assets'] = async (ctx) => {
    const user = await requireUser(ctx.req);
    admin(user);
    const id = Number(ctx.params.id);
    await room(id);
    const body = await readJson(ctx.req);
    const kind = oneOf(body.kind, ['photo', 'panorama', 'model'], 'kind');
    const url = text(body.url, 'Upload URL', 1000);
    if (!workspaceUploadUrl(url))
      throw new HttpError(400, 'Use an uploaded file from this school workspace.');
    if (kind !== 'model' && !/[.](jpg|png|webp|gif)$/i.test(url))
      throw new HttpError(400, 'Choose an uploaded image for photos or panoramas.');
    if (kind === 'model' && !url.toLowerCase().endsWith('.glb'))
      throw new HttpError(400, 'Upload a self-contained GLB model.');
    let metadata = { preparedByUser: true };
    if (kind === 'model' && body.walkthrough?.verified === true) {
      const spawn = body.walkthrough.spawn;
      if (!Array.isArray(spawn) || spawn.length !== 3)
        throw new HttpError(400, 'Record the model’s verified starting floor coordinates.');
      for (const n of spawn) finiteNumber(n, 'Model coordinate', -100000, 100000);
      metadata = {
        ...metadata,
        walkthrough: {
          verified: true,
          spawn,
          eyeHeight: finiteNumber(body.walkthrough.eyeHeight ?? 1.6, 'Eye height', 0.5, 3),
        },
      };
    }
    if (kind === 'model' && body.mapping) {
      const context = await roomContext(id);
      const mapping = { floors: [], rooms: [] };
      const names = new Set();
      for (const kind of ['floors', 'rooms']) {
        const entries = body.mapping[kind] ?? [];
        if (!Array.isArray(entries) || entries.length > 200)
          throw new HttpError(400, 'Use at most 200 mapped objects per kind.');
        for (const entry of entries) {
          const node = text(entry.node, 'Model object name', 150);
          if (names.has(node)) throw new HttpError(400, 'Each model object name must be unique.');
          names.add(node);
          if (kind === 'rooms') {
            const mapped = await roomContext(
              finiteNumber(entry.roomId, 'Mapped room ID', 1, 2147483647, true),
            );
            if (!mapped || mapped.buildingId !== context.buildingId)
              throw new HttpError(400, 'Mapped rooms must belong to this building.');
            mapping.rooms.push({
              node,
              roomId: mapped.id,
              label: `${mapped.code} ${mapped.roomName}`,
            });
          } else {
            const floor = await db
              .prepare('SELECT * FROM floors WHERE id=? AND building_id=?')
              .get(
                finiteNumber(entry.floorId, 'Mapped floor ID', 1, 2147483647, true),
                context.buildingId,
              );
            if (!floor) throw new HttpError(400, 'Mapped floors must belong to this building.');
            mapping.floors.push({ node, floorId: floor.id, label: floor.name });
          }
        }
      }
      metadata = { ...metadata, mapping };
    }
    const result = await db
      .prepare(
        'INSERT INTO room_assets(room_id,kind,url,title,metadata,created_by,created_at) VALUES (?,?,?,?,?,?,?)',
      )
      .run(
        id,
        kind,
        url,
        text(body.title, 'Asset title'),
        JSON.stringify(metadata),
        user.id,
        nowIso(),
      );
    await audit(user.id, 'room.asset.add', 'room', id, { kind });
    return json(ctx.res, 201, { id: Number(result.lastInsertRowid) });
  };
  routes['POST /api/rooms/:id/features'] = async (ctx) => {
    const user = await requireUser(ctx.req);
    admin(user);
    const id = Number(ctx.params.id);
    await room(id);
    const body = await readJson(ctx.req);
    const result = await db
      .prepare(
        'INSERT INTO room_features(room_id,kind,label,x,y,accessible,created_at) VALUES (?,?,?,?,?,?,?)',
      )
      .run(
        id,
        oneOf(
          body.kind,
          ['door', 'exit', 'window', 'stairs', 'ramp', 'accessible_entrance'],
          'kind',
        ),
        text(body.label, 'Feature label'),
        finiteNumber(body.x, 'x', 0, 1),
        finiteNumber(body.y, 'y', 0, 1),
        body.accessible ? 1 : 0,
        nowIso(),
      );
    await snapshot('room_feature', Number(result.lastInsertRowid), body, user);
    return json(ctx.res, 201, { id: Number(result.lastInsertRowid) });
  };
  routes['GET /api/map/versions'] = async (ctx) => {
    const user = await requireUser(ctx.req);
    admin(user);
    return json(ctx.res, 200, {
      versions: camelAll(
        await db.prepare('SELECT * FROM map_versions ORDER BY created_at DESC LIMIT 100').all(),
      ),
    });
  };
  routes['POST /api/hazards/:id/pin'] = async (ctx) => {
    const user = await requireUser(ctx.req);
    requirePermission(user, 'hazards:verify');
    const id = Number(ctx.params.id);
    const hazard = await db.prepare('SELECT * FROM hazards WHERE id = ?').get(id);
    if (!hazard || !hazard.room_id) throw new HttpError(404, 'Choose a hazard assigned to a room.');
    const body = await readJson(ctx.req);
    const x = finiteNumber(body.x, 'x', 0, 1),
      y = finiteNumber(body.y, 'y', 0, 1);
    await snapshot('hazard_pin', id, hazard, user);
    await db
      .prepare('UPDATE hazards SET pin_x=?,pin_y=?,updated_at=? WHERE id=?')
      .run(x, y, nowIso(), id);
    await audit(user.id, 'hazard.pin', 'hazard', id, { x, y, position: 'approximate' });
    return json(ctx.res, 200, { ok: true });
  };
  routes['GET /api/members'] = async (ctx) => {
    const user = await requireUser(ctx.req);
    admin(user);
    return json(ctx.res, 200, {
      members: camelAll(
        await db.prepare('SELECT id,email,name,role,active FROM users ORDER BY name').all(),
      ),
    });
  };
  routes['POST /api/members'] = async (ctx) => {
    const user = await requireUser(ctx.req);
    admin(user);
    const scope = currentDatabaseContext()?.workspaceId;
    if (!scope) throw new HttpError(400, 'Open a school workspace before adding members.');
    const body = await readJson(ctx.req);
    const email = text(body.email, 'Email').toLowerCase();
    const role = oneOf(
      body.role,
      ['admin', 'inspector', 'teacher', 'responder', 'student', 'parent'],
      'role',
    );
    const target = await coreDb.prepare('SELECT * FROM users WHERE lower(email) = ?').get(email);
    if (!target)
      throw new HttpError(
        404,
        'This person must register and sign in to RADAR before being added.',
      );
    const owner = await workspaceRecord(scope);
    if (owner.owner_user_id === target.id)
      throw new HttpError(400, 'The workspace owner remains an administrator.');
    await grantSchoolMembership(scope, target, role);
    await audit(user.id, 'membership.add', 'user', target.id, { role });
    return json(ctx.res, 201, { ok: true });
  };
  routes['DELETE /api/members/:id'] = async (ctx) => {
    const user = await requireUser(ctx.req);
    admin(user);
    const scope = currentDatabaseContext()?.workspaceId;
    const id = Number(ctx.params.id);
    if (!scope) throw new HttpError(400, 'Open a school workspace.');
    const owner = await workspaceRecord(scope);
    if (id === owner.owner_user_id || id === user.id)
      throw new HttpError(400, 'The owner and current administrator cannot be removed here.');
    await coreDb
      .prepare('UPDATE workspace_members SET active=0 WHERE workspace_id=? AND user_id=?')
      .run(scope, id);
    await db.prepare('UPDATE users SET active=0,sms_consent=0 WHERE id=?').run(id);
    await db.prepare('DELETE FROM push_subscriptions WHERE user_id=?').run(id);
    await coreDb
      .prepare(
        "UPDATE school_join_requests SET state='revoked',decision_note='School access was revoked. Contact school staff before requesting access again.',updated_at=? WHERE workspace_id=? AND user_id=?",
      )
      .run(nowIso(), scope, id);
    await audit(user.id, 'membership.revoke', 'user', id, {});
    return json(ctx.res, 200, { ok: true });
  };
  routes['POST /api/rollcall/classes'] = async (ctx) => {
    const user = await requireUser(ctx.req);
    requirePermission(user, 'rollcall:write');
    const body = await readJson(ctx.req);
    const teacherId =
      user.role === 'teacher' ? user.id : (optionalInt(body.teacherId, 'teacherId') ?? user.id);
    const teacher = await db.prepare('SELECT id,role FROM users WHERE id=?').get(teacherId);
    if (!teacher || !['teacher', 'admin'].includes(teacher.role))
      throw new HttpError(400, 'Choose a school teacher or administrator.');
    const roomId = optionalInt(body.roomId, 'roomId');
    if (roomId) await room(roomId);
    const result = await db
      .prepare(
        "INSERT INTO rollcall_classes(name,grade,teacher_id,room_id,expected,present,status,updated_at) VALUES (?,?,?,?,?,0,'incomplete',?)",
      )
      .run(
        text(body.name, 'Class name'),
        text(body.grade, 'Grade', 60),
        teacherId,
        roomId,
        finiteNumber(body.expected ?? 0, 'Expected count', 0, 10000, true),
        nowIso(),
      );
    await audit(user.id, 'class.create', 'class', result.lastInsertRowid, {});
    return json(ctx.res, 201, { id: Number(result.lastInsertRowid) });
  };
  routes['GET /api/rollcall/:id/roster'] = async (ctx) => {
    const user = await requireUser(ctx.req);
    const id = Number(ctx.params.id);
    await ownClass(user, id);
    const people = camelAll(
      await db
        .prepare('SELECT * FROM rollcall_people WHERE class_id=? ORDER BY display_name')
        .all(id),
    );
    return json(ctx.res, 200, {
      people,
      events: camelAll(
        await db
          .prepare(
            'SELECT e.* FROM rollcall_events e JOIN rollcall_people p ON p.id=e.person_id WHERE p.class_id=? ORDER BY e.created_at DESC LIMIT 100',
          )
          .all(id),
      ),
    });
  };
  routes['POST /api/rollcall/:id/roster'] = async (ctx) => {
    const user = await requireUser(ctx.req);
    const id = Number(ctx.params.id);
    await ownClass(user, id, true);
    const body = await readJson(ctx.req);
    const studentId = optionalInt(body.studentId, 'studentId');
    const student = studentId
      ? await db.prepare("SELECT * FROM users WHERE id=? AND role='student'").get(studentId)
      : null;
    if (studentId && !student) throw new HttpError(400, 'Choose a student in this school.');
    if (
      studentId &&
      (await db
        .prepare('SELECT id FROM rollcall_people WHERE class_id=? AND student_id=?')
        .get(id, studentId))
    )
      throw new HttpError(409, 'This student is already in the class.');
    const result = await db
      .prepare(
        'INSERT INTO rollcall_people(class_id,student_id,display_name,qr_token,updated_at) VALUES (?,?,?,?,?)',
      )
      .run(
        id,
        studentId,
        text(body.name ?? student?.name, 'Student name'),
        crypto.randomBytes(24).toString('hex'),
        nowIso(),
      );
    const count = (
      await db.prepare('SELECT COUNT(*) AS c FROM rollcall_people WHERE class_id=?').get(id)
    ).c;
    await db
      .prepare(
        'UPDATE rollcall_classes SET expected=CASE WHEN expected < ? THEN ? ELSE expected END WHERE id=?',
      )
      .run(count, count, id);
    await audit(user.id, 'roster.add', 'class', id, { personId: result.lastInsertRowid });
    return json(ctx.res, 201, { id: Number(result.lastInsertRowid) });
  };
  routes['POST /api/rollcall/people/:id/status'] = async (ctx) => {
    const user = await requireUser(ctx.req);
    const id = Number(ctx.params.id);
    const person = await db.prepare('SELECT * FROM rollcall_people WHERE id=?').get(id);
    if (!person) throw new HttpError(404, 'Roster entry not found.');
    await ownClass(user, person.class_id, true);
    const body = await readJson(ctx.req);
    const status = oneOf(
      body.status,
      ['present', 'missing', 'injured', 'unaccounted', 'not_checked'],
      'status',
    );
    const point = optionalInt(body.assemblyPointId, 'assemblyPointId');
    if (point && !(await db.prepare('SELECT id FROM assembly_points WHERE id=?').get(point)))
      throw new HttpError(400, 'Choose a registered assembly point.');
    await db
      .prepare('UPDATE rollcall_people SET status=?,assembly_point_id=?,updated_at=? WHERE id=?')
      .run(status, point, nowIso(), id);
    await db
      .prepare(
        'INSERT INTO rollcall_events(person_id,status,note,actor_id,created_at) VALUES (?,?,?,?,?)',
      )
      .run(id, status, str(body.note), user.id, nowIso());
    const present = (
      await db
        .prepare("SELECT COUNT(*) AS c FROM rollcall_people WHERE class_id=? AND status='present'")
        .get(person.class_id)
    ).c;
    await db
      .prepare(
        "UPDATE rollcall_classes SET present=?,status=CASE WHEN expected=? THEN 'complete' ELSE 'incomplete' END,updated_at=? WHERE id=?",
      )
      .run(present, present, nowIso(), person.class_id);
    await audit(user.id, 'attendance.update', 'roster', id, { status });
    return json(ctx.res, 200, { ok: true });
  };
  routes['POST /api/rollcall/qr'] = async (ctx) => {
    const user = await requireUser(ctx.req);
    const body = await readJson(ctx.req);
    const person = await db
      .prepare('SELECT * FROM rollcall_people WHERE qr_token=?')
      .get(text(body.token, 'QR token', 100));
    if (!person) throw new HttpError(404, 'School ID QR code not recognized.');
    if (person.student_id === user.id) {
      await db
        .prepare("UPDATE rollcall_people SET status='present',updated_at=? WHERE id=?")
        .run(nowIso(), person.id);
      await db
        .prepare(
          'INSERT INTO rollcall_events(person_id,status,note,actor_id,created_at) VALUES (?,?,?,?,?)',
        )
        .run(person.id, 'present', 'Self check-in', user.id, nowIso());
      const present = (
        await db
          .prepare(
            "SELECT COUNT(*) AS c FROM rollcall_people WHERE class_id=? AND status='present'",
          )
          .get(person.class_id)
      ).c;
      await db
        .prepare('UPDATE rollcall_classes SET present=?,updated_at=? WHERE id=?')
        .run(present, nowIso(), person.class_id);
      await audit(user.id, 'attendance.self', 'roster', person.id, {});
      return json(ctx.res, 200, { ok: true });
    }
    await ownClass(user, person.class_id, true);
    return json(ctx.res, 200, { person: camel(person) });
  };
  routes['GET /api/rollcall/:id/report'] = async (ctx) => {
    const user = await requireUser(ctx.req);
    const id = Number(ctx.params.id);
    const group = await ownClass(user, id);
    const rows = await db
      .prepare(
        'SELECT display_name,status,updated_at FROM rollcall_people WHERE class_id=? ORDER BY display_name',
      )
      .all(id);
    const escape = csvCell;
    ctx.res.writeHead(200, {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="rollcall-${id}.csv"`,
    });
    ctx.res.end(
      [
        'Name,Status,Updated',
        ...rows.map((r) => [r.display_name, r.status, r.updated_at].map(escape).join(',')),
      ].join('\n'),
    );
    await audit(user.id, 'attendance.export', 'class', group.id, {});
  };
  routes['POST /api/resources/:id/movements'] = async (ctx) => {
    const user = await requireUser(ctx.req);
    requirePermission(user, 'resources:write');
    const id = Number(ctx.params.id);
    const item = await db.prepare('SELECT * FROM safety_equipment WHERE id=?').get(id);
    if (!item) throw new HttpError(404, 'Resource not found.');
    const body = await readJson(ctx.req);
    const kind = oneOf(body.kind, ['checkout', 'return', 'replenish', 'consume'], 'kind');
    const quantity = finiteNumber(body.quantity, 'Quantity', 1, 100000, true);
    const delta = ['checkout', 'consume'].includes(kind) ? -quantity : quantity;
    const result = await db
      .prepare('UPDATE safety_equipment SET quantity=quantity+? WHERE id=? AND quantity+? >= 0')
      .run(delta, id, delta);
    if (!result.changes) throw new HttpError(409, 'Insufficient stock. Refresh the register.');
    await db
      .prepare(
        'INSERT INTO resource_movements(equipment_id,kind,quantity,holder,incident_id,note,actor_id,created_at) VALUES (?,?,?,?,?,?,?,?)',
      )
      .run(
        id,
        kind,
        quantity,
        str(body.holder, 120),
        null,
        str(body.note, 1000),
        user.id,
        nowIso(),
      );
    await audit(user.id, 'resource.movement', 'equipment', id, { kind, quantity });
    return json(ctx.res, 200, { ok: true });
  };
  routes['GET /api/resources/:id/history'] = async (ctx) => {
    const user = await requireUser(ctx.req);
    requirePermission(user, 'resources:write');
    return json(ctx.res, 200, {
      history: camelAll(
        await db
          .prepare(
            'SELECT * FROM resource_movements WHERE equipment_id=? ORDER BY created_at DESC LIMIT 100',
          )
          .all(Number(ctx.params.id)),
      ),
    });
  };
  routes['POST /api/assistance'] = async (ctx) => {
    const user = await requireUser(ctx.req);
    const body = await readJson(ctx.req);
    const result = await db
      .prepare(
        'INSERT INTO assistance_requests(user_id,kind,note,created_at,updated_at) VALUES (?,?,?,?,?)',
      )
      .run(
        user.id,
        oneOf(body.kind, ['supplies', 'medical', 'repair', 'counselling', 'other'], 'kind'),
        text(body.note, 'Request', 2000),
        nowIso(),
        nowIso(),
      );
    await notifyRoles(
      ['admin', 'responder'],
      'info',
      'Assistance request',
      'A school member submitted a confidential assistance request.',
      '/operations?tab=recovery',
    );
    await audit(user.id, 'assistance.create', 'request', result.lastInsertRowid, {});
    return json(ctx.res, 201, { id: Number(result.lastInsertRowid) });
  };
  routes['PATCH /api/assistance/:id'] = async (ctx) => {
    const user = await requireUser(ctx.req);
    if (!staff(user))
      throw new HttpError(403, 'Only authorized recovery staff can update requests.');
    const body = await readJson(ctx.req);
    const id = Number(ctx.params.id);
    if (!(await db.prepare('SELECT id FROM assistance_requests WHERE id=?').get(id)))
      throw new HttpError(404, 'Request not found.');
    await db
      .prepare(
        'UPDATE assistance_requests SET state=?,referral=?,assigned_to=?,updated_at=? WHERE id=?',
      )
      .run(
        oneOf(body.state, ['submitted', 'acknowledged', 'referred', 'fulfilled'], 'state'),
        str(body.referral, 2000),
        user.id,
        nowIso(),
        id,
      );
    await audit(user.id, 'assistance.update', 'request', id, { state: body.state });
    return json(ctx.res, 200, { ok: true });
  };
  routes['POST /api/hazards/:id/feedback'] = async (ctx) => {
    const user = await requireUser(ctx.req);
    const id = Number(ctx.params.id);
    if (!(await db.prepare('SELECT id FROM hazards WHERE id=?').get(id)))
      throw new HttpError(404, 'Hazard not found.');
    const body = ctx.preparedBody ?? (await readJson(ctx.req));
    const kind = oneOf(body.kind, ['confirm', 'duplicate'], 'kind');
    await db
      .prepare(
        'INSERT INTO hazard_feedback(hazard_id,user_id,kind,note,created_at) VALUES (?,?,?,?,?) ON CONFLICT(hazard_id,user_id,kind) DO UPDATE SET note=excluded.note',
      )
      .run(id, user.id, kind, str(body.note, 1000), nowIso());
    await audit(user.id, 'hazard.feedback', 'hazard', id, { kind });
    return json(ctx.res, 200, { ok: true });
  };
  routes['POST /api/occupancy'] = async (ctx) => {
    const user = await requireUser(ctx.req);
    requirePermission(user, 'evacuation:write');
    const body = await readJson(ctx.req);
    const point = await db
      .prepare('SELECT * FROM assembly_points WHERE id=?')
      .get(Number(body.pointId));
    if (!point) throw new HttpError(404, 'Assembly point not found.');
    const count = finiteNumber(body.count, 'Estimated count', 0, 100000, true);
    await db
      .prepare(
        'INSERT INTO occupancy_reports(assembly_point_id,count,source,reported_by,observed_at) VALUES (?,?,?,?,?)',
      )
      .run(
        point.id,
        count,
        text(body.source, 'Measurement source'),
        user.id,
        body.observedAt ? date(body.observedAt) : nowIso(),
      );
    await audit(user.id, 'occupancy.report', 'assembly', point.id, { count, source: body.source });
    return json(ctx.res, 201, {
      capacity: point.capacity,
      nearCapacity: point.capacity > 0 && count >= point.capacity * 0.85,
      overCapacity: point.capacity > 0 && count > point.capacity,
    });
  };
  routes['POST /api/sos/:id/respond'] = async (ctx) => {
    const user = await requireUser(ctx.req);
    if (!['admin', 'responder'].includes(user.role))
      throw new HttpError(403, 'Only emergency responders can acknowledge requests.');
    const id = Number(ctx.params.id);
    const row = await db.prepare('SELECT * FROM sos_requests WHERE incident_id=?').get(id);
    if (!row) throw new HttpError(404, 'SOS request not found.');
    const body = await readJson(ctx.req);
    const state = oneOf(body.state, ['acknowledged', 'assigned', 'resolved', 'cancelled'], 'state');
    const responderId = optionalInt(body.responderId, 'responderId') ?? user.id;
    const member = await db.prepare('SELECT role FROM users WHERE id=?').get(responderId);
    if (!member || !['admin', 'responder'].includes(member.role))
      throw new HttpError(400, 'Choose a registered responder.');
    if (['resolved', 'cancelled'].includes(row.state))
      throw new HttpError(409, 'This request is already closed.');
    if (state === 'cancelled' && row.state !== 'cancel_requested')
      throw new HttpError(400, 'Only an explicit cancellation request can be approved.');
    await db
      .prepare(
        'UPDATE sos_requests SET state=?,responder_id=?,acknowledged_at=COALESCE(acknowledged_at,?),updated_at=? WHERE id=?',
      )
      .run(state, responderId, nowIso(), nowIso(), row.id);
    if (['resolved', 'cancelled'].includes(state))
      await db
        .prepare("UPDATE incidents SET status='closed',closed_at=? WHERE id=?")
        .run(nowIso(), id);
    await db
      .prepare(
        'INSERT INTO incident_updates(incident_id,note,actor_id,created_at) VALUES (?,?,?,?)',
      )
      .run(id, `SOS ${state}; responder assigned.`, user.id, nowIso());
    await audit(user.id, 'sos.respond', 'incident', id, { state, responderId });
    return json(ctx.res, 200, { ok: true });
  };
  routes['POST /api/sos/:id/cancel'] = async (ctx) => {
    const user = await requireUser(ctx.req);
    const row = await db
      .prepare('SELECT * FROM sos_requests WHERE incident_id=? AND reporter_id=?')
      .get(Number(ctx.params.id), user.id);
    if (!row) throw new HttpError(404, 'Your SOS request was not found.');
    if (['resolved', 'cancelled'].includes(row.state))
      throw new HttpError(409, 'This request is already closed.');
    const body = await readJson(ctx.req);
    const reason = text(body.reason, 'Cancellation reason', 500);
    const state = row.state === 'active' ? 'cancelled' : 'cancel_requested';
    await db
      .prepare(
        'UPDATE sos_requests SET state=?,cancel_reason=?,cancelled_at=?,updated_at=? WHERE id=?',
      )
      .run(state, reason, nowIso(), nowIso(), row.id);
    if (state === 'cancelled')
      await db
        .prepare("UPDATE incidents SET status='closed',closed_at=? WHERE id=?")
        .run(nowIso(), row.incident_id);
    await notifyRoles(
      ['admin', 'responder'],
      'alert',
      'SOS cancellation request',
      `A reported SOS was ${state === 'cancelled' ? 'cancelled before acknowledgement' : 'requested to be cancelled; responder review required'}.`,
      '/operations?tab=response',
    );
    await audit(user.id, 'sos.cancel', 'incident', row.incident_id, { state, reason });
    return json(ctx.res, 200, { state });
  };
  routes['POST /api/safety/location'] = async (ctx) => {
    const user = await requireUser(ctx.req);
    requirePermission(user, 'safety:write');
    const body = await readJson(ctx.req);
    if (body.consent !== true) throw new HttpError(400, 'Explicit consent is required.');
    const incident = await db
      .prepare("SELECT id FROM incidents WHERE id=? AND status!='closed'")
      .get(Number(body.incidentId));
    if (!incident)
      throw new HttpError(400, 'Choose an active school incident before sharing location.');
    const lat = finiteNumber(body.lat, 'latitude', -90, 90),
      lng = finiteNumber(body.lng, 'longitude', -180, 180),
      accuracy = finiteNumber(body.accuracy, 'accuracy', 0, 100000);
    const expires = new Date(
      Date.now() + Math.min(60, Math.max(5, Number(body.minutes) || 15)) * 60000,
    ).toISOString();
    await db
      .prepare(
        'INSERT INTO location_reports(user_id,lat,lng,accuracy,incident_id,expires_at,updated_at) VALUES (?,?,?,?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET lat=excluded.lat,lng=excluded.lng,accuracy=excluded.accuracy,incident_id=excluded.incident_id,expires_at=excluded.expires_at,updated_at=excluded.updated_at',
      )
      .run(user.id, lat, lng, accuracy, incident.id, expires, nowIso());
    await audit(user.id, 'location.consent', 'user', user.id, { expiresAt: expires });
    return json(ctx.res, 200, { expiresAt: expires, approximate: true });
  };
  routes['DELETE /api/safety/location'] = async (ctx) => {
    const user = await requireUser(ctx.req);
    await db.prepare('DELETE FROM location_reports WHERE user_id=?').run(user.id);
    await audit(user.id, 'location.stop', 'user', user.id, {});
    return json(ctx.res, 200, { ok: true });
  };
  routes['POST /api/map/zones'] = async (ctx) => {
    const user = await requireUser(ctx.req);
    requirePermission(user, 'evacuation:write');
    const body = await readJson(ctx.req);
    const geometry = body.geometry;
    if (
      geometry?.type !== 'Polygon' ||
      !Array.isArray(geometry.coordinates) ||
      geometry.coordinates.length !== 1
    )
      throw new HttpError(400, 'Use one GeoJSON Polygon ring.');
    const ring = geometry.coordinates[0];
    if (!Array.isArray(ring) || ring.length < 4 || ring.length > 500)
      throw new HttpError(400, 'A polygon needs 4–500 points including its closing point.');
    for (const p of ring) {
      if (!Array.isArray(p) || p.length !== 2)
        throw new HttpError(400, 'Use [longitude, latitude] points.');
      finiteNumber(p[0], 'longitude', -180, 180);
      finiteNumber(p[1], 'latitude', -90, 90);
    }
    if (JSON.stringify(ring[0]) !== JSON.stringify(ring[ring.length - 1]))
      throw new HttpError(400, 'Close the polygon by repeating its first point.');
    const values = [
      text(body.name, 'Zone name'),
      oneOf(
        body.kind,
        ['restricted', 'fire', 'flood', 'landslide', 'blocked', 'fault', 'volcano'],
        'kind',
      ),
      JSON.stringify(geometry),
      body.verified === true ? 1 : 0,
      text(body.source, 'Source / inspector'),
      body.expiresAt ? date(body.expiresAt) : null,
    ];
    if (ctx.params.id) {
      const id = Number(ctx.params.id);
      const previous = await db.prepare('SELECT * FROM map_zones WHERE id=?').get(id);
      if (!previous) throw new HttpError(404, 'Zone not found.');
      await snapshot('zone', id, previous, user);
      await db
        .prepare(
          'UPDATE map_zones SET name=?,kind=?,geometry=?,verified=?,source=?,expires_at=?,updated_at=? WHERE id=?',
        )
        .run(...values, nowIso(), id);
      return json(ctx.res, 200, { id });
    }
    const result = await db
      .prepare(
        'INSERT INTO map_zones(name,kind,geometry,verified,source,expires_at,created_by,updated_at) VALUES (?,?,?,?,?,?,?,?)',
      )
      .run(...values, user.id, nowIso());
    await snapshot('zone', Number(result.lastInsertRowid), body, user);
    return json(ctx.res, 201, { id: Number(result.lastInsertRowid) });
  };
  routes['PATCH /api/map/zones/:id'] = routes['POST /api/map/zones'];
  routes['GET /api/map/zones'] = async (ctx) => {
    const user = await requireUser(ctx.req);
    requirePermission(user, 'map:read');
    const zones = camelAll(
      await db
        .prepare(
          'SELECT * FROM map_zones WHERE expires_at IS NULL OR expires_at > ? ORDER BY updated_at DESC',
        )
        .all(nowIso()),
    );
    return json(ctx.res, 200, {
      zones: zones.map((z) => ({ ...z, geometry: JSON.parse(z.geometry) })),
    });
  };
  routes['DELETE /api/map/zones/:id'] = async (ctx) => {
    const user = await requireUser(ctx.req);
    requirePermission(user, 'evacuation:write');
    const id = Number(ctx.params.id);
    const row = await db.prepare('SELECT * FROM map_zones WHERE id=?').get(id);
    if (!row) throw new HttpError(404, 'Zone not found.');
    await snapshot('zone', id, row, user);
    await db.prepare('DELETE FROM map_zones WHERE id=?').run(id);
    await audit(user.id, 'zone.remove', 'zone', id, {});
    return json(ctx.res, 200, { ok: true });
  };
  routes['POST /api/settings/emergency'] = async (ctx) => {
    const user = await requireUser(ctx.req);
    admin(user);
    const body = await readJson(ctx.req);
    if (!Array.isArray(body.contacts) || body.contacts.length > 20)
      throw new HttpError(400, 'Supply up to 20 emergency contacts.');
    const contacts = body.contacts.map((c) => ({
      name: text(c.name, 'Contact name', 120),
      phone: text(c.phone, 'Contact number', 60),
    }));
    const value = JSON.stringify({
      emergencyContacts: contacts,
      procedures: str(body.procedures, 10000),
    });
    await db
      .prepare(
        'INSERT INTO school_settings(key,value,updated_at) VALUES (?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at',
      )
      .run('public', value, nowIso());
    await audit(user.id, 'emergency.settings', 'school', 1, {});
    return json(ctx.res, 200, { ok: true });
  };
  routes['POST /api/settings/reporting'] = async (ctx) => {
    const user = await requireUser(ctx.req);
    admin(user);
    const body = await readJson(ctx.req);
    await db
      .prepare(
        'INSERT INTO school_settings(key,value,updated_at) VALUES (?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at',
      )
      .run('reporting', JSON.stringify({ allowAnonymous: body.allowAnonymous === true }), nowIso());
    await audit(user.id, 'reporting.policy', 'school', 1, {
      allowAnonymous: body.allowAnonymous === true,
    });
    return json(ctx.res, 200, { ok: true });
  };
  routes['POST /api/guardians'] = async (ctx) => {
    const user = await requireUser(ctx.req);
    admin(user);
    const body = await readJson(ctx.req);
    const student = await db
      .prepare("SELECT id FROM users WHERE id=? AND role='student'")
      .get(Number(body.studentId));
    const guardian = await db
      .prepare("SELECT id FROM users WHERE id=? AND role='parent'")
      .get(Number(body.guardianId));
    if (!student || !guardian)
      throw new HttpError(400, 'Choose a registered student and parent in this school.');
    await db
      .prepare(
        'INSERT INTO student_guardians(student_id,guardian_id,approved_by,created_at) VALUES (?,?,?,?) ON CONFLICT(student_id,guardian_id) DO NOTHING',
      )
      .run(student.id, guardian.id, user.id, nowIso());
    await audit(user.id, 'guardian.link', 'user', student.id, { guardianId: guardian.id });
    return json(ctx.res, 201, { ok: true });
  };
  routes['GET /api/guardians/checkins'] = async (ctx) => {
    const user = await requireUser(ctx.req);
    if (user.role !== 'parent' && !can(user, 'admin:users'))
      throw new HttpError(403, 'Guardian access required.');
    await audit(user.id, 'guardian.checkins.read', 'user', user.id, {});
    return json(ctx.res, 200, {
      checks: camelAll(
        await db
          .prepare(
            'SELECT s.status,s.updated_at,u.name FROM student_guardians g JOIN users u ON u.id=g.student_id LEFT JOIN safety_checks s ON s.user_id=g.student_id WHERE g.guardian_id=?',
          )
          .all(user.id),
      ),
    });
  };
  routes['POST /api/inspections/reminders'] = async (ctx) => {
    const user = await requireUser(ctx.req);
    if (!staff(user)) throw new HttpError(403, 'Inspection staff access required.');
    return json(ctx.res, 200, { sent: await inspectionReminders() });
  };
  routes['POST /api/settings/followups'] = async (ctx) => {
    const user = await requireUser(ctx.req);
    admin(user);
    const body = await readJson(ctx.req);
    const minutes = finiteNumber(body.minutes, 'Follow-up interval', 5, 1440, true);
    await db
      .prepare(
        'INSERT INTO school_settings(key,value,updated_at) VALUES (?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at',
      )
      .run('rollcall_followup_minutes', JSON.stringify(minutes), nowIso());
    return json(ctx.res, 200, { ok: true });
  };
  routes['GET /api/emergency/pack'] = async (ctx) => {
    const user = await requireUser(ctx.req);
    const info = await setting('public', { emergencyContacts: [], procedures: '' });
    const rooms = can(user, 'buildings:read')
      ? camelAll(await db.prepare('SELECT * FROM rooms').all())
      : [];
    const floors = can(user, 'buildings:read')
      ? camelAll(await db.prepare('SELECT * FROM floors').all())
      : [];
    return json(ctx.res, 200, {
      ...info,
      rooms,
      floors,
      buildings: can(user, 'buildings:read')
        ? camelAll(await db.prepare('SELECT * FROM buildings').all())
        : [],
      savedAt: nowIso(),
    });
  };
  routes['POST /api/scans/:id/checklist'] = async (ctx) => {
    const user = await requireUser(ctx.req);
    requirePermission(user, 'scan:write');
    const id = Number(ctx.params.id);
    const scan = await db.prepare('SELECT * FROM scans WHERE id=?').get(id);
    if (!scan || scan.status !== 'draft')
      throw new HttpError(409, 'Choose an editable draft inspection.');
    const body = await readJson(ctx.req);
    const keys = ['entrance', 'exits', 'walls', 'ceiling', 'electrical', 'equipment'];
    if (!keys.every((k) => body.checklist?.[k] === true))
      throw new HttpError(400, 'Confirm that every listed inspection area was reviewed.');
    const photos = (
      await db.prepare('SELECT COUNT(*) AS c FROM scan_photos WHERE scan_id=?').get(id)
    ).c;
    if (!photos) throw new HttpError(400, 'Attach inspection evidence first.');
    const findings = (
      await db
        .prepare(
          "SELECT COUNT(*) AS c FROM scan_observations WHERE scan_id=? AND status!='rejected'",
        )
        .get(id)
    ).c;
    if (body.noFindings && findings)
      throw new HttpError(409, 'Review all findings before recording no visible findings.');
    await db
      .prepare('UPDATE scans SET inspection_checklist=?,no_findings_confirmed=? WHERE id=?')
      .run(
        JSON.stringify(Object.fromEntries(keys.map((k) => [k, true]))),
        body.noFindings === true ? 1 : 0,
        id,
      );
    await audit(user.id, 'scan.checklist', 'scan', id, {
      noVisibleFindings: body.noFindings === true,
    });
    return json(ctx.res, 200, { ok: true });
  };
  routes['POST /api/scans/:id/analyze'] = async (ctx) => {
    const user = await requireUser(ctx.req);
    requirePermission(user, 'scan:write');
    if (!visionApiKey())
      throw new HttpError(503, 'A vision provider has not been configured.');
    const id = Number(ctx.params.id);
    const scan = await db.prepare('SELECT * FROM scans WHERE id=?').get(id);
    if (!scan || scan.status !== 'draft') throw new HttpError(409, 'Choose a draft inspection.');
    const body = await readJson(ctx.req);
    if (body.consent !== true)
      throw new HttpError(
        400,
        'Confirm sending the selected inspection photos to the configured vision provider.',
      );
    const photos = await db
      .prepare('SELECT * FROM scan_photos WHERE scan_id=? ORDER BY created_at LIMIT 4')
      .all(id);
    if (!photos.length) throw new HttpError(400, 'Upload photos before requesting suggestions.');
    const images = [];
    const imagePhotos = [];
    for (const photo of photos) {
      if (!workspaceUploadUrl(photo.url))
        throw new HttpError(400, 'The image does not belong to the active school.');
      const name = photo.url.split('/').pop();
      const extension = path.extname(name).toLowerCase();
      const mime = { '.jpg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp' }[extension];
      if (!mime) continue;
      let buffer;
      if (usesSupabase) {
        const image = await cloudDownload(currentDatabaseContext()?.workspaceId, name);
        if (!image) throw new HttpError(404, 'An inspection image is unavailable.');
        buffer = image.buffer;
      } else
        buffer = fs.readFileSync(
          path.join(currentDatabaseContext()?.uploadDir ?? UPLOAD_DIR, name),
        );
      imagePhotos.push(photo);
      images.push(`data:${mime};base64,${buffer.toString('base64')}`);
    }
    if (!images.length)
      throw new HttpError(400, 'Use JPEG, PNG or WebP inspection images for analysis.');
    let findings;
    try {
      findings = await analyzeVisibleHazards(images, {
        calibratedImageIndexes: (
          await Promise.all(
            imagePhotos.map(async (photo, index) =>
              (await db
                .prepare('SELECT photo_id FROM photo_calibrations WHERE photo_id=?')
                .get(photo.id))
                ? index
                : null,
            ),
          )
        ).filter((index) => index != null),
      });
    } catch (error) {
      throw new HttpError(error.code === 'VISION_TIMEOUT' ? 504 : error.code === 'VISION_UNAVAILABLE' ? 503 : 502, error.message);
    }
    let added = 0;
    for (const f of findings) {
      if (
        await db
          .prepare(
            "SELECT id FROM scan_observations WHERE scan_id=? AND lower(title)=lower(?) AND source='ai'",
          )
          .get(id, f.title)
      )
        continue;
      const suggestion = await db
        .prepare(
          "INSERT INTO scan_observations(scan_id,title,description,severity,source,status,confidence,created_at) VALUES (?,?,?,?,'ai','pending',?,?)",
        )
        .run(id, f.title, f.description, f.severity, f.confidence, nowIso());
      await db.prepare('UPDATE scan_observations SET category=? WHERE id=?').run(f.category??'other',suggestion.lastInsertRowid);
      if (f.imagePoint && imagePhotos[f.imageIndex]) {
        const calibration = await db
          .prepare('SELECT anchors FROM photo_calibrations WHERE photo_id=?')
          .get(imagePhotos[f.imageIndex].id);
        if (calibration)
          try {
            const point = projectPoint(JSON.parse(calibration.anchors), ...f.imagePoint);
            await db
              .prepare('UPDATE scan_observations SET mapped_x=?,mapped_y=? WHERE id=?')
              .run(...point, suggestion.lastInsertRowid);
          } catch {
            /* Unsupported/out-of-plane positions remain unplaced for manual review. */
          }
      }
      added++;
    }
    await db.prepare('UPDATE scans SET no_findings_confirmed=0 WHERE id=?').run(id);
    await audit(user.id, 'scan.ai.request', 'scan', id, {
      added,
      provider: visionProvider(),
      reviewRequired: true,
    });
    return json(ctx.res, 200, {
      added,
      reviewRequired: true,
      message:
        'Suggestions only. Confirm or reject each finding; confidence is a model estimate, not a calibrated safety assessment.',
    });
  };
  routes['POST /api/feeds/earthquakes/sync'] = async (ctx) => {
    const user = await requireUser(ctx.req);
    requirePermission(user, 'advisories:write');
    if (process.env.RADAR_USGS_FEED_ENABLED !== 'true')
      throw new HttpError(503, 'The optional USGS connector is disabled in server settings.');
    let feed, events;
    try {
      feed = await fetchUsgs();
      events = parseUsgs(feed);
    } catch (error) {
      throw new HttpError(502, error.message);
    }
    let count = 0;
    for (const event of events) {
      const key = `usgs:${event.eventId}:${event.updatedAt}`;
      if (await db.prepare('SELECT key FROM school_settings WHERE key=?').get(key)) continue;
      await db
        .prepare(
          "INSERT INTO advisories(category,title,summary,source_name,source_url,published_at,severity,status,created_by,created_at,updated_at,details) VALUES ('earthquake',?,?,?,?,?,'info','active',?,?,?,?)",
        )
        .run(
          event.title,
          `${event.place}. Magnitude ${event.magnitude ?? 'not reported'}; depth ${event.depthKm} km. No PHIVOLCS PEIS intensity or school impact is inferred.`,
          'USGS',
          event.sourceUrl,
          event.publishedAt,
          user.id,
          nowIso(),
          nowIso(),
          JSON.stringify(event),
        );
      await db
        .prepare(
          'INSERT INTO school_settings(key,value,updated_at) VALUES (?,?,?) ON CONFLICT(key) DO NOTHING',
        )
        .run(key, '{}', nowIso());
      count++;
    }
    await db
      .prepare(
        'INSERT INTO school_settings(key,value,updated_at) VALUES (?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at',
      )
      .run(
        'usgs_status',
        JSON.stringify({
          lastSuccessAt: nowIso(),
          feedGeneratedAt: new Date(feed.metadata.generated).toISOString(),
          records: events.length,
        }),
        nowIso(),
      );
    await audit(user.id, 'feed.sync', 'USGS', 1, { added: count });
    return json(ctx.res, 200, { added: count, source: 'USGS', lastSuccessAt: nowIso() });
  };
  routes['GET /api/reports/mine'] = async (ctx) => {
    const user = await requireUser(ctx.req);
    return json(ctx.res, 200, {
      reports: camelAll(
        await db
          .prepare(
            `SELECT h.id,h.ref,h.title,h.severity,h.status,h.category,h.anonymous,h.created_at,(SELECT COUNT(*) FROM hazard_feedback f WHERE f.hazard_id=h.id AND f.kind='confirm') AS confirm_count,(SELECT COUNT(*) FROM hazard_feedback f WHERE f.hazard_id=h.id AND f.kind='duplicate') AS duplicate_count FROM hazards h WHERE h.reported_by=? ORDER BY created_at DESC`,
          )
          .all(user.id),
      ),
      policy: await setting('reporting', { allowAnonymous: false }),
    });
  };
  routes['POST /api/operations/feedback'] = async (ctx) => {
    const body = await readJson(ctx.req);
    const id = finiteNumber(body.hazardId, 'Hazard ID', 1, 2147483647, true);
    const original = ctx.req;
    return routes['POST /api/hazards/:id/feedback']({
      ...ctx,
      params: { id: String(id) },
      req: original,
      preparedBody: body,
    });
  };
  routes['POST /api/evacuation/assembly'] = async (ctx) => {
    const user = await requireUser(ctx.req);
    requirePermission(user, 'evacuation:write');
    const body = await readJson(ctx.req);
    const result = await db
      .prepare(
        "INSERT INTO assembly_points(school_id,name,lat,lng,capacity,notes,status,accessible,updated_at) VALUES (?,?,?,?,?,?,'open',?,?)",
      )
      .run(
        user.schoolId,
        text(body.name, 'Assembly point'),
        finiteNumber(body.lat, 'Latitude', -90, 90),
        finiteNumber(body.lng, 'Longitude', -180, 180),
        finiteNumber(body.capacity, 'Capacity', 0, 100000, true),
        str(body.notes, 2000),
        body.accessible === true ? 1 : 0,
        nowIso(),
      );
    await snapshot('assembly', Number(result.lastInsertRowid), body, user);
    return json(ctx.res, 201, { id: Number(result.lastInsertRowid) });
  };
  routes['POST /api/evacuation/routes'] = async (ctx) => {
    const user = await requireUser(ctx.req);
    requirePermission(user, 'evacuation:write');
    const body = await readJson(ctx.req);
    let points;
    try {
      points = typeof body.path === 'string' ? JSON.parse(body.path) : body.path;
    } catch {
      throw new HttpError(400, 'Use a JSON array of [latitude,longitude] points.');
    }
    if (!Array.isArray(points) || points.length < 2 || points.length > 500)
      throw new HttpError(400, 'A walkway needs 2–500 mapped points.');
    for (const p of points) {
      if (!Array.isArray(p) || p.length !== 2)
        throw new HttpError(400, 'Use [latitude,longitude] pairs.');
      finiteNumber(p[0], 'Latitude', -90, 90);
      finiteNumber(p[1], 'Longitude', -180, 180);
    }
    const building = await db
      .prepare('SELECT * FROM buildings WHERE id=?')
      .get(Number(body.buildingId));
    const target = await db
      .prepare('SELECT * FROM assembly_points WHERE id=?')
      .get(Number(body.pointId));
    if (!building || !target)
      throw new HttpError(400, 'Choose a registered building and assembly point.');
    if (
      meters(points[0], [building.lat, building.lng]) > 150 ||
      meters(points[points.length - 1], [target.lat, target.lng]) > 150
    )
      throw new HttpError(
        400,
        'Map the route from the selected building to the selected assembly point.',
      );
    if (body.verified !== true)
      throw new HttpError(
        400,
        'An authorized person must confirm this mapped walkway before it is used for routing.',
      );
    const length = points.slice(1).reduce((sum, p, i) => sum + meters(points[i], p), 0);
    const result = await db
      .prepare(
        "INSERT INTO evacuation_routes(school_id,name,building_id,path,notes,accessible,status,distance_m,walk_minutes,assembly_point_id,scenario,updated_at,verified,source,one_way) VALUES (?,?,?,?,?,?,'open',?,?,?,'general',?,1,?,?)",
      )
      .run(
        user.schoolId,
        text(body.name, 'Route name'),
        building.id,
        JSON.stringify(points),
        str(body.notes, 2000),
        body.accessible === true ? 1 : 0,
        Math.round(length),
        Math.ceil(length / 1.2 / 60),
        target.id,
        nowIso(),
        text(body.source, 'Approving source / staff'),
        body.oneWay === true ? 1 : 0,
      );
    await snapshot('route', Number(result.lastInsertRowid), body, user);
    return json(ctx.res, 201, { id: Number(result.lastInsertRowid) });
  };
  routes['GET /api/evacuation/plan'] = async (ctx) => {
    const user = await requireUser(ctx.req);
    requirePermission(user, 'evacuation:read');
    const buildingId = finiteNumber(
      ctx.url.searchParams.get('buildingId'),
      'Building ID',
      1,
      2147483647,
      true,
    );
    const pointId = ctx.url.searchParams.get('pointId')
      ? Number(ctx.url.searchParams.get('pointId'))
      : null;
    const routes = await db.prepare('SELECT * FROM evacuation_routes').all();
    const points = await db.prepare('SELECT * FROM assembly_points').all();
    const zones = await db
      .prepare('SELECT * FROM map_zones WHERE expires_at IS NULL OR expires_at>?')
      .all(nowIso());
    const occupancy = await db
      .prepare(
        'SELECT * FROM occupancy_reports WHERE id IN (SELECT MAX(id) FROM occupancy_reports GROUP BY assembly_point_id)',
      )
      .all();
    return json(
      ctx.res,
      200,
      planEvacuation({
        routes,
        points,
        zones,
        occupancy,
        buildingId,
        pointId,
        accessible: ctx.url.searchParams.get('accessible') === 'true',
      }),
    );
  };
  routes['GET /api/notifications/channels'] = async (ctx) => {
    const user = await requireUser(ctx.req);
    const result = channelStatus();
    return json(ctx.res, 200, {
      ...result,
      jobs: can(user, 'alerts:publish')
        ? camelAll(await db.prepare('SELECT * FROM delivery_jobs ORDER BY id DESC LIMIT 100').all())
        : [],
      deliveries: can(user, 'alerts:publish')
        ? camelAll(
            await db
              .prepare('SELECT * FROM outbound_deliveries ORDER BY created_at DESC LIMIT 100')
              .all(),
          )
        : [],
    });
  };
  routes['POST /api/notifications/push/subscribe'] = async (ctx) => {
    const user = await requireUser(ctx.req);
    const body = await readJson(ctx.req);
    if (body.consent !== true || !validPush(body.subscription))
      throw new HttpError(
        400,
        'Explicit consent and a supported browser push subscription are required.',
      );
    const subscription = {
      endpoint: body.subscription.endpoint,
      keys: { auth: body.subscription.keys.auth, p256dh: body.subscription.keys.p256dh },
      expirationTime: body.subscription.expirationTime ?? null,
    };
    await db
      .prepare(
        'INSERT INTO push_subscriptions(user_id,endpoint,subscription,created_at) VALUES (?,?,?,?) ON CONFLICT(endpoint) DO UPDATE SET user_id=excluded.user_id,subscription=excluded.subscription',
      )
      .run(user.id, subscription.endpoint, JSON.stringify(subscription), nowIso());
    await audit(user.id, 'push.consent', 'user', user.id, {});
    return json(ctx.res, 201, { ok: true });
  };
  routes['POST /api/notifications/push/unsubscribe'] = async (ctx) => {
    const user = await requireUser(ctx.req);
    const body = await readJson(ctx.req);
    await db
      .prepare('DELETE FROM push_subscriptions WHERE user_id=? AND endpoint=?')
      .run(user.id, String(body.endpoint ?? ''));
    return json(ctx.res, 200, { ok: true });
  };
  routes['POST /api/notifications/sms/consent'] = async (ctx) => {
    const user = await requireUser(ctx.req);
    const body = await readJson(ctx.req);
    if (body.consent === true && !/^\+[1-9]\d{7,14}$/.test(String(body.phone ?? '')))
      throw new HttpError(400, 'Use an E.164 phone number with country code.');
    await db
      .prepare('UPDATE users SET sms_consent=?,phone=? WHERE id=?')
      .run(
        body.consent === true ? 1 : 0,
        body.consent === true ? String(body.phone) : user.phone,
        user.id,
      );
    await audit(user.id, 'sms.consent', 'user', user.id, { consent: body.consent === true });
    return json(ctx.res, 200, { ok: true });
  };
  routes['POST /api/notifications/sms-status'] = async (ctx) => {
    const buffer = await readBinary(ctx.req);
    if (buffer.length > 10000) throw new HttpError(413, 'Callback too large.');
    const params = new URLSearchParams(buffer.toString('utf8'));
    const base = process.env.RADAR_PUBLIC_URL;
    if (
      !base ||
      !verifySmsSignature(
        base.replace(/\/$/, '') + ctx.req.url,
        params,
        ctx.req.headers['x-twilio-signature'],
      )
    )
      throw new HttpError(403, 'Invalid provider signature.');
    const state = oneOf(
      params.get('MessageStatus'),
      ['delivered', 'undelivered', 'failed', 'sent', 'queued', 'accepted', 'sending'],
      'Provider status',
    );
    const sid = params.get('MessageSid');
    if (!/^SM[a-fA-F0-9]{32}$/.test(sid ?? ''))
      throw new HttpError(400, 'Invalid provider message ID.');
    const scope = ctx.url.searchParams.get('scope');
    if (scope && !/^\d{6}$/.test(scope)) throw new HttpError(400, 'Invalid school scope.');
    const save = async () => {
      await db
        .prepare("UPDATE outbound_deliveries SET state=? WHERE channel='sms' AND detail LIKE ?")
        .run(state, `sid:${sid};%`);
    };
    if (scope) await runInWorkspace(scope, save);
    else await save();
    return json(ctx.res, 200, { ok: true });
  };
  routes['PATCH /api/rooms/:id/details'] = async (ctx) => {
    const user = await requireUser(ctx.req);
    admin(user);
    const id = Number(ctx.params.id);
    const old = await room(id);
    const body = await readJson(ctx.req);
    const width =
      body.widthM == null || body.widthM === ''
        ? null
        : finiteNumber(body.widthM, 'Width in metres', 0.1, 10000);
    const length =
      body.lengthM == null || body.lengthM === ''
        ? null
        : finiteNumber(body.lengthM, 'Length in metres', 0.1, 10000);
    await snapshot('room_details', id, old, user);
    await db
      .prepare(
        'UPDATE rooms SET width_m=?,length_m=?,intended_use=?,department=?,emergency_contact=? WHERE id=?',
      )
      .run(
        width,
        length,
        str(body.intendedUse, 200),
        str(body.department, 120),
        str(body.emergencyContact, 120),
        id,
      );
    await audit(user.id, 'room.details', 'room', id, {});
    return json(ctx.res, 200, { ok: true });
  };
  routes['POST /api/floors/:id/plan'] = async (ctx) => {
    const user = await requireUser(ctx.req);
    admin(user);
    const id = Number(ctx.params.id);
    const floor = await db.prepare('SELECT * FROM floors WHERE id=?').get(id);
    if (!floor) throw new HttpError(404, 'Floor not found.');
    const body = await readJson(ctx.req);
    if (!workspaceUploadUrl(String(body.url ?? '')) || !/[.](jpg|png|webp)$/i.test(body.url))
      throw new HttpError(400, 'Choose a school-uploaded floor-plan image.');
    const width = finiteNumber(body.width, 'Plan width', 1, 20000),
      height = finiteNumber(body.height, 'Plan height', 1, 20000);
    const rooms = await db.prepare('SELECT * FROM rooms WHERE floor_id=?').all(id);
    if (rooms.some((r) => r.x + r.width > width || r.y + r.height > height))
      throw new HttpError(400, 'Keep existing rooms inside the registered plan dimensions.');
    await snapshot('floor_plan', id, floor, user);
    await db
      .prepare(
        'UPDATE floors SET plan_image=?,plan_source=?,plan_verified=?,plan_width=?,plan_height=? WHERE id=?',
      )
      .run(
        body.url,
        text(body.source, 'Approved plan source'),
        body.verified === true ? 1 : 0,
        width,
        height,
        id,
      );
    return json(ctx.res, 200, { ok: true });
  };
  routes['POST /api/map/snapshots'] = async (ctx) => {
    const user = await requireUser(ctx.req);
    admin(user);
    const value = {
      buildings: camelAll(await db.prepare('SELECT * FROM buildings').all()),
      rooms: camelAll(await db.prepare('SELECT * FROM rooms').all()),
      floors: camelAll(await db.prepare('SELECT * FROM floors').all()),
      hazards: camelAll(
        await db.prepare('SELECT id,title,severity,status,room_id,pin_x,pin_y FROM hazards').all(),
      ),
      routes: camelAll(await db.prepare('SELECT * FROM evacuation_routes').all()),
      zones: camelAll(await db.prepare('SELECT * FROM map_zones').all()),
      capturedAt: nowIso(),
    };
    await snapshot('school_map', 1, value, user);
    return json(ctx.res, 201, { ok: true });
  };
  routes['PATCH /api/scans/:id/notes'] = async (ctx) => {
    const user = await requireUser(ctx.req);
    requirePermission(user, 'scan:write');
    const id = Number(ctx.params.id);
    const scan = await db.prepare('SELECT * FROM scans WHERE id=?').get(id);
    if (!scan || scan.status !== 'draft')
      throw new HttpError(409, 'Only draft inspection notes can be edited.');
    const body = await readJson(ctx.req);
    await db.prepare('UPDATE scans SET notes=? WHERE id=?').run(str(body.notes, 3000), id);
    await audit(user.id, 'scan.notes', 'scan', id, {});
    return json(ctx.res, 200, { ok: true });
  };
  routes['GET /api/map/search'] = async (ctx) => {
    const user = await requireUser(ctx.req);
    requirePermission(user, 'map:read');
    const q = str(ctx.url.searchParams.get('q'), 100).trim();
    if (q.length < 2) return json(ctx.res, 200, { results: [] });
    const like = `%${q}%`;
    const buildings = await db
      .prepare('SELECT id,name,lat,lng FROM buildings WHERE name LIKE ? OR code LIKE ? LIMIT 20')
      .all(like, like);
    const rooms = await db
      .prepare(
        'SELECT r.id,r.name,r.code,b.id AS building_id,b.lat,b.lng,b.name AS building_name,f.name AS floor_name FROM rooms r JOIN floors f ON f.id=r.floor_id JOIN buildings b ON b.id=f.building_id WHERE r.name LIKE ? OR r.code LIKE ? LIMIT 30',
      )
      .all(like, like);
    const equipment = can(user, 'resources:read')
      ? await db
          .prepare(
            'SELECT e.id,e.label,b.lat,b.lng,b.id AS building_id FROM safety_equipment e LEFT JOIN rooms r ON r.id=e.room_id LEFT JOIN floors f ON f.id=r.floor_id LEFT JOIN buildings b ON b.id=COALESCE(e.building_id,f.building_id) WHERE e.label LIKE ? OR e.type LIKE ? LIMIT 20',
          )
          .all(like, like)
      : [];
    const points = await db
      .prepare('SELECT id,name,lat,lng FROM assembly_points WHERE name LIKE ? LIMIT 20')
      .all(like);
    return json(ctx.res, 200, {
      results: [
        ...buildings.map((b) => ({
          ...camel(b),
          kind: 'building',
          buildingId: b.id,
          detail: 'Registered building',
        })),
        ...rooms.map((r) => ({
          ...camel(r),
          kind: 'room',
          detail: `${r.code} · ${r.building_name} · ${r.floor_name}`,
        })),
        ...equipment.map((e) => ({
          ...camel(e),
          name: e.label,
          kind: 'equipment',
          detail: 'Registered safety resource',
        })),
        ...points.map((p) => ({
          ...camel(p),
          kind: 'assembly',
          detail: 'Registered assembly point',
        })),
      ],
    });
  };
  routes['GET /api/resources/nearest'] = async (ctx) => {
    const user = await requireUser(ctx.req);
    requirePermission(user, 'resources:read');
    const lat = finiteNumber(ctx.url.searchParams.get('lat'), 'Latitude', -90, 90),
      lng = finiteNumber(ctx.url.searchParams.get('lng'), 'Longitude', -180, 180);
    const resources = await db
      .prepare(
        'SELECT e.*,b.lat,b.lng,b.name AS building_name FROM safety_equipment e LEFT JOIN rooms r ON r.id=e.room_id LEFT JOIN floors f ON f.id=r.floor_id LEFT JOIN buildings b ON b.id=COALESCE(e.building_id,f.building_id) WHERE b.lat IS NOT NULL AND b.lng IS NOT NULL',
      )
      .all();
    return json(ctx.res, 200, {
      resources: resources
        .map((r) => ({
          ...camel(r),
          distanceMeters: Math.round(meters([lat, lng], [r.lat, r.lng])),
          approximate: true,
        }))
        .sort((a, b) => a.distanceMeters - b.distanceMeters)
        .slice(0, 5),
      note: 'Distances use registered building positions, not exact equipment GPS. Confirm condition and availability on site.',
    });
  };
  routes['POST /api/notifications/drain'] = async (ctx) => {
    const user = await requireUser(ctx.req);
    requirePermission(user, 'alerts:publish');
    return json(ctx.res, 200, { processed: await drainDeliveryJobs() });
  };
  return routes;
}
