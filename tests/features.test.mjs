import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { analyzeVisibleHazards, parseUsgs } from '../server/integrations.mjs';
import { planEvacuation } from '../server/routing.mjs';
import { verifySmsSignature, validPush } from '../server/delivery-utils.mjs';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BASE = 'http://127.0.0.1:8920',
  SCHOOL = '309622';
let child,
  temp,
  admin,
  teacher,
  otherTeacher,
  student,
  parent,
  responder,
  users,
  roomId,
  classId,
  personId,
  ownReport,
  resourceId;
const modes = new Map();
async function api(
  cookie,
  url,
  { method = 'GET', body, scope = modes.get(cookie) ?? '', headers = {} } = {},
) {
  const response = await fetch(BASE + url, {
    method,
    headers: {
      ...(cookie ? { Cookie: cookie } : {}),
      'X-Radar-Workspace': scope,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const raw = await response.text();
  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    data = raw;
  }
  return { status: response.status, body: data };
}
async function login(email, password) {
  const response = await fetch(BASE + '/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  assert.equal(response.status, 200);
  return response.headers
    .getSetCookie()
    .map((c) => c.split(';')[0])
    .join('; ');
}
async function select(cookie, id) {
  assert.equal(
    (
      await api(cookie, '/api/workspaces/select', {
        method: 'POST',
        body: { beisId: id },
      })
    ).status,
    200,
  );
  modes.set(cookie, id ?? '');
}
async function post(cookie, url, body) {
  return api(cookie, url, { method: 'POST', body });
}
const assertOK = (response, status = 200) => {
  assert.equal(response.status, status, JSON.stringify(response.body));
  return response.body;
};
before(async () => {
  temp = fs.mkdtempSync(path.join(os.tmpdir(), 'radar-features-'));
  const pg = process.env.RADAR_FEATURE_PG === '1';
  child = spawn(process.execPath, ['server/index.mjs'], {
    cwd: ROOT,
    env: {
      ...process.env,
      NODE_ENV: pg ? 'test' : 'development',
      PORT: '8920',
      HOST: '127.0.0.1',
      RADAR_DB_DIR: path.join(temp, 'data'),
      RADAR_DATABASE_DRIVER: pg ? 'postgres' : 'sqlite',
      RADAR_PGLITE_TEST_DIR: pg ? path.join(temp, 'pg') : '',
      RADAR_ALLOW_TEST_SEED: '1',
      RADAR_TEST_CLOUD_AUTH: '0',
      RADAR_VISION_API_KEY: '',
      RADAR_TURN_SECRET: '',
      RADAR_TURN_URLS: '',
      RADAR_USGS_FEED_ENABLED: 'false',
      RADAR_VAPID_PUBLIC_KEY: '',
      RADAR_VAPID_PRIVATE_KEY: '',
      RADAR_TWILIO_SID: '',
      RADAR_TWILIO_TOKEN: '',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  child.stdout.on('data', (c) => {
    output += c;
  });
  child.stderr.on('data', (c) => {
    output += c;
    if (process.env.RADAR_FEATURE_DEBUG) process.stderr.write(c);
  });
  const deadline = Date.now() + 45000;
  while (Date.now() < deadline && !output.includes('listening on') && child.exitCode === null)
    await new Promise((r) => setTimeout(r, 100));
  assert.match(output, /listening on/, output);
  admin = await login('admin@northridge.edu', 'Admin#2026');
  teacher = await login('teacher@northridge.edu', 'Teach#2026');
  otherTeacher = await login('inspector@northridge.edu', 'Inspect#2026');
  student = await login('student@northridge.edu', 'Student#2026');
  parent = await login('parent@northridge.edu', 'Parent#2026');
  responder = await login('responder@northridge.edu', 'Respond#2026');
  users = assertOK(await api(admin, '/api/admin/users')).users;
  assertOK(await post(admin, '/api/workspaces', { beisId: SCHOOL }), 201);
  await select(admin, SCHOOL);
  for (const [email, role] of [
    ['teacher@northridge.edu', 'teacher'],
    ['inspector@northridge.edu', 'teacher'],
    ['student@northridge.edu', 'student'],
    ['parent@northridge.edu', 'parent'],
    ['responder@northridge.edu', 'responder'],
  ])
    assertOK(await post(admin, '/api/members', { email, role }), 201);
  for (const cookie of [teacher, otherTeacher, student, parent, responder])
    await select(cookie, SCHOOL);
  const b = assertOK(
    await post(admin, '/api/buildings', {
      name: 'Fixture building',
      code: 'T',
      lat: 14.12,
      lng: 122.95,
    }),
    201,
  ).building;
  const f = assertOK(
    await post(admin, `/api/buildings/${b.id}/floors`, {
      name: 'Fixture floor',
      level: 1,
    }),
    201,
  ).floor;
  roomId = assertOK(
    await post(admin, `/api/floors/${f.id}/rooms`, {
      name: 'Fixture classroom',
      code: '101',
    }),
    201,
  ).room.id;
});
after(async () => {
  if (child?.exitCode === null) {
    child.kill('SIGTERM');
    await new Promise((r) => child.once('exit', r));
  }
  if (temp) fs.rmSync(temp, { recursive: true, force: true });
});

test('health and missing-route diagnostics identify the running API without hiding errors', async () => {
  const health = assertOK(await api(null, '/api/health'));
  assert.equal(health.apiVersion, '2.1');
  const missing = await api(null, '/api/no-such-feature');
  assert.equal(missing.status, 404);
  assert.equal(missing.body.code, 'API_ENDPOINT_NOT_FOUND');
  assert.equal(missing.body.path, '/api/no-such-feature');
});
test('members gain only their school role and cannot grant themselves administrator privileges', async () => {
  assert.equal(assertOK(await api(teacher, '/api/auth/me')).user.role, 'teacher');
  assert.ok(
    assertOK(await api(teacher, '/api/workspaces')).workspaces.some((w) => w.beisId === SCHOOL),
  );
  assert.equal(
    (
      await post(student, '/api/members', {
        email: 'student@northridge.edu',
        role: 'admin',
      })
    ).status,
    403,
  );
  assert.equal((await api(student, '/api/members')).status, 403);
  assert.equal((await post(teacher, '/api/workspaces', { beisId: '112082' })).status, 403);
  assert.equal((await api(student, '/api/operations')).body.rooms, undefined);
});
test('rosters are class-scoped, audited, and reconcile individual attendance', async () => {
  const assigned = users.find((u) => u.email === 'teacher@northridge.edu').id;
  const other = users.find((u) => u.email === 'inspector@northridge.edu').id;
  classId = assertOK(
    await post(admin, '/api/rollcall/classes', {
      name: 'Fixture section A',
      grade: '11',
      teacherId: assigned,
      roomId,
      expected: 2,
    }),
    201,
  ).id;
  const second = assertOK(
    await post(admin, '/api/rollcall/classes', {
      name: 'Fixture section B',
      grade: '12',
      teacherId: other,
      roomId,
      expected: 1,
    }),
    201,
  ).id;
  assert.equal(assertOK(await api(teacher, '/api/rollcall')).classes.length, 1);
  assert.equal((await api(teacher, `/api/rollcall/${second}/roster`)).status, 403);
  personId = assertOK(
    await post(teacher, `/api/rollcall/${classId}/roster`, {
      name: 'Linked fixture student',
      studentId: users.find((u) => u.role === 'student').id,
    }),
    201,
  ).id;
  assertOK(
    await post(teacher, `/api/rollcall/${classId}/roster`, {
      name: 'Manual fixture student',
    }),
    201,
  );
  assert.equal((await api(student, `/api/rollcall/${classId}/roster`)).status, 403);
  const roster = assertOK(await api(teacher, `/api/rollcall/${classId}/roster`)).people;
  assertOK(
    await post(student, '/api/rollcall/qr', {
      token: roster.find((p) => p.id === personId).qrToken,
    }),
  );
  assert.equal(assertOK(await api(teacher, '/api/rollcall')).classes[0].present, 1);
  assert.equal((await post(parent, '/api/rollcall/qr', { token: roster[0].qrToken })).status, 403);
  assert.equal(
    (
      await post(otherTeacher, `/api/rollcall/people/${personId}/status`, {
        status: 'present',
      })
    ).status,
    403,
  );
  assertOK(
    await post(teacher, `/api/rollcall/people/${personId}/status`, {
      status: 'injured',
    }),
  );
  assert.equal(assertOK(await api(teacher, '/api/rollcall')).classes[0].present, 0);
  assert.equal(
    (
      await api(teacher, `/api/rollcall/${classId}`, {
        method: 'PATCH',
        body: { present: 2, status: 'complete' },
      })
    ).status,
    409,
  );
  const report = await api(teacher, `/api/rollcall/${classId}/report`);
  assert.equal(report.status, 200);
  assert.match(report.body, /injured/);
  assert.equal((await api(parent, `/api/rollcall/${classId}/report`)).status, 403);
});
test('inspection schedules, genuine no-findings submissions, QR records and transparent scores work', async () => {
  assertOK(
    await post(admin, `/api/rooms/${roomId}/schedule`, {
      intervalDays: 7,
      nextDueAt: new Date(Date.now() - 3600000).toISOString(),
    }),
  );
  assert.equal(assertOK(await api(admin, '/api/operations')).overdue, 1);
  const before = assertOK(await api(admin, '/api/notifications')).notifications.length;
  assertOK(await post(admin, '/api/inspections/reminders', {}));
  const after = assertOK(await api(admin, '/api/notifications')).notifications.length;
  assert.ok(after > before);
  assert.equal(assertOK(await post(admin, '/api/inspections/reminders', {})).sent, 0);
  const key = crypto.randomUUID();
  const scan = assertOK(
    await post(admin, '/api/scans', { roomId, clientRequestId: key }),
    201,
  ).scanId;
  assert.equal(
    assertOK(await post(admin, '/api/scans', { roomId, clientRequestId: key })).scanId,
    scan,
  );
  assert.equal(
    (
      await post(admin, `/api/scans/${scan}/checklist`, {
        checklist: { entrance: true },
        noFindings: true,
      })
    ).status,
    400,
  );
  const upload = await fetch(BASE + '/api/uploads', {
    method: 'POST',
    headers: {
      Cookie: admin,
      'X-Radar-Workspace': SCHOOL,
      'Content-Type': 'image/svg+xml',
    },
    body: '<svg xmlns="http://www.w3.org/2000/svg"/>',
  });
  assert.equal(upload.status, 201, await upload.clone().text());
  const file = await upload.json();
  assertOK(
    await post(admin, `/api/scans/${scan}/photos`, {
      url: file.url,
      caption: 'Fixture evidence',
    }),
    201,
  );
  const checklist = Object.fromEntries(
    ['entrance', 'exits', 'walls', 'ceiling', 'electrical', 'equipment'].map((k) => [k, true]),
  );
  assertOK(
    await post(admin, `/api/scans/${scan}/checklist`, {
      checklist,
      noFindings: true,
    }),
  );
  assertOK(
    await post(admin, `/api/scans/${scan}/submit`, {
      notes: 'Visual inspection only',
    }),
  );
  const record = assertOK(await api(admin, `/api/rooms/${roomId}/record`));
  assert.equal(record.score.value, 100);
  assert.match(record.score.note, /not a safety certification/);
  assert.ok(record.qr.image.startsWith('data:image/png;base64,'));
  assert.ok(Date.parse(record.schedule.nextDueAt) > Date.now());
  assert.equal((await api(student, `/api/rooms/${roomId}/record`)).status, 403);
});
test('student reports remain unverified and cannot alter another reporter’s evidence', async () => {
  const key = crypto.randomUUID();
  ownReport = assertOK(
    await post(student, '/api/hazards', {
      title: 'Student fixture observation',
      severity: 'high',
      roomId,
      category: 'blocked_exit',
      clientRequestId: key,
    }),
    201,
  ).hazard.id;
  assert.equal(
    assertOK(
      await post(student, '/api/hazards', {
        title: 'Retry',
        severity: 'high',
        roomId,
        clientRequestId: key,
      }),
    ).hazard.id,
    ownReport,
  );
  assert.equal(
    (
      await api(student, `/api/hazards/${ownReport}`, {
        method: 'PATCH',
        body: { status: 'verified' },
      })
    ).status,
    403,
  );
  const another = assertOK(
    await post(admin, '/api/hazards', {
      title: 'Other fixture observation',
      severity: 'low',
      roomId,
    }),
    201,
  ).hazard.id;
  const upload = await fetch(BASE + '/api/uploads', {
    method: 'POST',
    headers: {
      Cookie: student,
      'X-Radar-Workspace': SCHOOL,
      'Content-Type': 'image/svg+xml',
    },
    body: '<svg xmlns="http://www.w3.org/2000/svg"/>',
  });
  assert.equal(upload.status, 201, await upload.clone().text());
  const file = await upload.json();
  assert.equal(
    (await post(student, `/api/hazards/${another}/evidence`, { url: file.url })).status,
    403,
  );
  assertOK(
    await post(student, `/api/hazards/${ownReport}/evidence`, {
      url: file.url,
      caption: 'Own evidence',
    }),
    201,
  );
  assertOK(
    await post(student, `/api/hazards/${ownReport}/feedback`, {
      kind: 'confirm',
      note: 'Corroboration does not verify a hazard',
    }),
  );
  assertOK(
    await post(student, `/api/hazards/${ownReport}/feedback`, {
      kind: 'confirm',
    }),
  );
  assert.equal(
    (
      await post(student, '/api/hazards', {
        title: 'Hidden identity',
        severity: 'low',
        anonymous: true,
      })
    ).status,
    403,
  );
  assertOK(await post(admin, '/api/settings/reporting', { allowAnonymous: true }));
  assertOK(
    await post(student, '/api/hazards', {
      title: 'Policy-approved hidden identity',
      severity: 'low',
      anonymous: true,
    }),
    201,
  );
  assertOK(await post(admin, `/api/hazards/${ownReport}/pin`, { x: 0.4, y: 0.6 }));
  assert.equal((await post(admin, `/api/hazards/${ownReport}/pin`, { x: 2, y: 0.6 })).status, 400);
  const record = assertOK(await api(admin, `/api/rooms/${roomId}/record`));
  assert.equal(record.score.value, 75);
  assert.equal(record.score.provisional, true);
  assert.ok(record.hazards.some((h) => h.pinX === 0.4));
  assertOK(await post(admin, '/api/map/snapshots', {}), 201);
  assert.ok(assertOK(await api(admin, '/api/map/versions')).versions.length > 0);
  assert.equal((await api(student, '/api/map/versions')).status, 403);
});
test('inventory checkout is bounded by available stock and retains movement history', async () => {
  resourceId = assertOK(
    await post(admin, '/api/resources', {
      type: 'water',
      label: 'Fixture water',
      status: 'ok',
      quantity: 3,
      roomId,
    }),
    201,
  ).resource?.id;
  if (!resourceId)
    resourceId = assertOK(await api(admin, '/api/resources')).items.find(
      (r) => r.label === 'Fixture water',
    ).id;
  assertOK(
    await post(admin, `/api/resources/${resourceId}/movements`, {
      kind: 'checkout',
      quantity: 2,
      holder: 'Fixture team',
    }),
  );
  assert.equal(
    (
      await post(admin, `/api/resources/${resourceId}/movements`, {
        kind: 'consume',
        quantity: 2,
      })
    ).status,
    409,
  );
  assertOK(
    await post(admin, `/api/resources/${resourceId}/movements`, {
      kind: 'replenish',
      quantity: 4,
    }),
  );
  assert.equal(
    assertOK(await api(admin, `/api/resources/${resourceId}/history`)).history.length,
    2,
  );
  assert.equal(
    (
      await post(student, `/api/resources/${resourceId}/movements`, {
        kind: 'checkout',
        quantity: 1,
      })
    ).status,
    403,
  );
});
test('SOS acknowledgement, safeguarded cancellation and optional coordinates are permission checked', async () => {
  const incident = assertOK(
    await post(student, '/api/sos', {
      kind: 'medical',
      note: 'Fixture only',
      silent: true,
    }),
    201,
  ).incidentId;
  assert.equal(
    (
      await post(student, `/api/sos/${incident}/respond`, {
        state: 'acknowledged',
      })
    ).status,
    403,
  );
  assertOK(
    await post(responder, `/api/sos/${incident}/respond`, {
      state: 'acknowledged',
    }),
  );
  assert.equal(
    (
      await post(student, '/api/safety/location', {
        consent: false,
        incidentId: incident,
        lat: 14.12,
        lng: 122.95,
        accuracy: 15,
      })
    ).status,
    400,
  );
  assertOK(
    await post(student, '/api/safety/location', {
      consent: true,
      incidentId: incident,
      lat: 14.12,
      lng: 122.95,
      accuracy: 15,
    }),
  );
  assert.equal(assertOK(await api(responder, '/api/operations')).locations.length, 1);
  assert.equal(assertOK(await api(parent, '/api/operations')).locations, undefined);
  assert.equal(assertOK(await api(teacher, '/api/operations')).locations, undefined);
  assertOK(await api(student, '/api/safety/location', { method: 'DELETE' }));
  assert.equal(assertOK(await api(responder, '/api/operations')).locations.length, 0);
  assert.equal(
    assertOK(
      await post(student, `/api/sos/${incident}/cancel`, {
        reason: 'Fixture cancellation',
      }),
    ).state,
    'cancel_requested',
  );
  assertOK(
    await post(responder, `/api/sos/${incident}/respond`, {
      state: 'cancelled',
    }),
  );
  assert.equal(
    (
      await post(student, '/api/safety/location', {
        consent: true,
        incidentId: incident,
        lat: 14.12,
        lng: 122.95,
        accuracy: 15,
      })
    ).status,
    400,
  );
});
test('confidential recovery requests and guardian relationships expose only authorized records', async () => {
  const request = assertOK(
    await post(student, '/api/assistance', {
      kind: 'supplies',
      note: 'Private fixture assistance',
    }),
    201,
  ).id;
  assert.equal(assertOK(await api(parent, '/api/operations')).assistance.length, 0);
  assert.equal(
    (
      await api(student, `/api/assistance/${request}`, {
        method: 'PATCH',
        body: { state: 'fulfilled' },
      })
    ).status,
    403,
  );
  assertOK(
    await api(admin, `/api/assistance/${request}`, {
      method: 'PATCH',
      body: { state: 'referred', referral: 'Confidential fixture referral' },
    }),
  );
  assertOK(
    await post(admin, '/api/guardians', {
      studentId: users.find((u) => u.role === 'student').id,
      guardianId: users.find((u) => u.role === 'parent').id,
    }),
    201,
  );
  assertOK(
    await post(student, '/api/safety/check', {
      status: 'safe',
      sharing: false,
    }),
  );
  const check = assertOK(await api(parent, '/api/guardians/checkins')).checks[0];
  assert.equal(check.status, 'safe');
  assert.equal(check.lat, undefined);
  assert.equal(check.note, undefined);
  assert.equal(
    (await post(teacher, '/api/guardians', { studentId: 5, guardianId: 6 })).status,
    403,
  );
});
test('class-targeted announcements reach only assigned users and approved guardians', async () => {
  const result = assertOK(
    await post(admin, '/api/alerts', {
      title: 'Section fixture notice',
      body: 'Class-only fixture',
      level: 'yellow',
      kind: 'announcement',
      audience: 'section',
      audienceValue: String(classId),
    }),
    201,
  );
  const id = result.alert.id;
  assert.ok(assertOK(await api(student, '/api/alerts')).items.some((a) => a.id === id));
  assert.ok(assertOK(await api(teacher, '/api/alerts')).items.some((a) => a.id === id));
  assert.ok(!assertOK(await api(otherTeacher, '/api/alerts')).items.some((a) => a.id === id));
  assert.ok(assertOK(await api(parent, '/api/alerts')).items.some((a) => a.id === id));
  assert.equal(
    (
      await post(student, '/api/alerts', {
        title: 'Unauthorized suspension',
        level: 'red',
        kind: 'suspension',
        body: 'No authority',
      })
    ).status,
    403,
  );
});
test('provider opt-ins validate destinations and unsigned delivery callbacks cannot forge receipts', async () => {
  assert.equal(
    (
      await post(student, '/api/notifications/push/subscribe', {
        consent: true,
        subscription: { endpoint: 'http://127.0.0.1/internal', keys: {} },
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await post(student, '/api/notifications/sms/consent', {
        consent: true,
        phone: 'invalid',
      })
    ).status,
    400,
  );
  assertOK(await post(student, '/api/notifications/sms/consent', { consent: false }));
  const callback = await fetch(BASE + '/api/notifications/sms-status', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'MessageStatus=delivered&MessageSid=SM00000000000000000000000000000000',
  });
  assert.equal(callback.status, 403);
});
test('prepared assets and floor plans stay school-scoped and coverage reflects real inspections', async () => {
  const record = assertOK(await api(admin, `/api/rooms/${roomId}/record`));
  assert.equal(new URL(record.qr.url).searchParams.get('school'), SCHOOL);
  const upload = async (buffer, mime) => {
    const response = await fetch(BASE + '/api/uploads', {
      method: 'POST',
      headers: {
        Cookie: admin,
        'X-Radar-Workspace': SCHOOL,
        'Content-Type': mime,
      },
      body: buffer,
    });
    assert.equal(response.status, 201, await response.clone().text());
    return response.json();
  };
  const glb = (doc) => {
    const raw = Buffer.from(JSON.stringify(doc));
    const json = Buffer.concat([raw, Buffer.alloc((4 - (raw.length % 4)) % 4, 32)]);
    const b = Buffer.alloc(20 + json.length);
    b.write('glTF');
    b.writeUInt32LE(2, 4);
    b.writeUInt32LE(b.length, 8);
    b.writeUInt32LE(json.length, 12);
    b.write('JSON', 16);
    json.copy(b, 20);
    return b;
  };
  const invalid = await fetch(BASE + '/api/uploads', {
    method: 'POST',
    headers: {
      Cookie: admin,
      'X-Radar-Workspace': SCHOOL,
      'Content-Type': 'model/gltf-binary',
    },
    body: glb({
      asset: { version: '2.0' },
      buffers: [{ uri: 'https://other.example/model.bin' }],
    }),
  });
  assert.equal(invalid.status, 400);
  const model = await upload(
    glb({ asset: { version: '2.0' }, scene: 0, scenes: [{ nodes: [] }] }),
    'model/gltf-binary',
  );
  assertOK(
    await post(admin, `/api/rooms/${roomId}/assets`, {
      kind: 'model',
      url: model.url,
      title: 'Fixture recorded model',
      walkthrough: { verified: true, spawn: [0, 0, 0], eyeHeight: 1.6 },
    }),
    201,
  );
  assert.equal((await fetch(BASE + model.url)).status, 403);
  assert.equal((await fetch(BASE + model.url, { headers: { Cookie: admin } })).status, 200);
  const image = await upload(Buffer.from('fixture-bytes'), 'image/png');
  assertOK(
    await post(admin, `/api/floors/${record.room.floorId}/plan`, {
      url: image.url,
      source: 'Fixture approved plan',
      verified: true,
      width: 1000,
      height: 620,
    }),
  );
  const updated = assertOK(await api(admin, `/api/rooms/${roomId}/record`));
  assert.equal(updated.floor.planVerified, 1);
  assert.equal(JSON.parse(updated.assets[0].metadata).walkthrough.eyeHeight, 1.6);
  const overview = assertOK(await api(admin, '/api/operations'));
  assert.equal(overview.coverage[0].percent, 100);
  assert.equal(overview.rooms[0].inspectionState, 'awaiting_verification');
  const nearest = assertOK(await api(admin, '/api/resources/nearest?lat=14.12&lng=122.95'));
  assert.equal(nearest.resources[0].distanceMeters, 0);
  assert.equal(nearest.resources[0].approximate, true);
});
test('optional delivery failure does not suppress in-app alerts and concurrent offline retries create one report', async () => {
  const id = assertOK(
    await post(admin, '/api/alerts', {
      title: 'Fixture channel status',
      body: 'Provider not configured',
      level: 'green',
      sendPush: true,
      audience: 'school',
    }),
    201,
  ).alert.id;
  assertOK(await post(admin, '/api/notifications/drain', {}));
  const channel = assertOK(await api(admin, '/api/notifications/channels'));
  assert.ok(channel.deliveries.some((d) => d.alertId === id && d.state === 'not_configured'));
  assert.ok(assertOK(await api(student, '/api/alerts')).items.some((a) => a.id === id));
  const key = crypto.randomUUID();
  const responses = await Promise.all(
    Array.from({ length: 4 }, () =>
      post(student, '/api/hazards', {
        title: 'Concurrent retry fixture',
        severity: 'low',
        clientRequestId: key,
      }),
    ),
  );
  for (const response of responses)
    assert.ok([200, 201].includes(response.status), JSON.stringify(response));
  assert.equal(new Set(responses.map((r) => r.body.hazard.id)).size, 1);
  assert.equal(
    (
      await post(admin, '/api/alerts', {
        title: 'Invalid suspension',
        body: 'Reason',
        kind: 'suspension',
        level: 'yellow',
        effectiveAt: '2027-01-02T00:00:00Z',
        resumeAt: '2027-01-01T00:00:00Z',
      })
    ).status,
    400,
  );
});
test('school location editing is admin-only, validated, persisted and independent of building coordinates', async () => {
  const record = assertOK(await api(admin, `/api/rooms/${roomId}/record`));
  const before = assertOK(await api(admin, '/api/map')).buildings[0];
  assert.equal(
    (
      await api(student, '/api/school/location', {
        method: 'PATCH',
        body: {
          lat: 14.12,
          lng: 122.95,
          verified: true,
          source: 'Fixture survey',
        },
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await api(admin, '/api/school/location', {
        method: 'PATCH',
        body: {
          lat: 999,
          lng: 122.95,
          verified: true,
          source: 'Fixture survey',
        },
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await api(admin, '/api/school/location', {
        method: 'PATCH',
        body: { lat: 14.11, lng: 122.94, source: 'Fixture survey' },
      })
    ).status,
    400,
  );
  assertOK(
    await api(admin, '/api/school/location', {
      method: 'PATCH',
      body: {
        lat: 14.11,
        lng: 122.94,
        verified: true,
        source: 'Fixture approved survey',
      },
    }),
  );
  const school = assertOK(await api(admin, '/api/auth/me')).school;
  assert.equal(school.lat, 14.11);
  assert.equal(school.locationSource, 'Fixture approved survey');
  assert.ok(school.locationUpdatedAt);
  const after = assertOK(await api(admin, '/api/map')).buildings[0];
  assert.equal(after.lat, before.lat);
  assert.equal(after.lng, before.lng);
  assert.equal(record.context.buildingName, after.name);
});
test('Gmail registration never grants staff privileges and school requests require scoped administrator approval', async () => {
  assert.equal(assertOK(await api(null, '/api/auth/config')).signupEnabled, true);
  assert.equal(
    (
      await post(null, '/api/auth/signup', {
        email: 'invalid@@gmail.com',
        password: 'SomePassword123!',
        name: 'Fixture',
      })
    ).status,
    400,
  );
  assertOK(
    await post(null, '/api/auth/signup', {
      email: 'new.fixture@gmail.com',
      password: 'SomePassword123!',
      name: 'Gmail fixture',
      role: 'admin',
    }),
    201,
  );
  assert.equal(
    (
      await post(null, '/api/auth/signup', {
        email: 'NEW.FIXTURE@gmail.com',
        password: 'SomePassword123!',
        name: 'Again',
      })
    ).status,
    409,
  );
  const gmail = await login('new.fixture@gmail.com', 'SomePassword123!');
  assert.equal(assertOK(await api(gmail, '/api/auth/me')).user.role, 'student');
  assert.equal((await post(gmail, `/api/schools/${SCHOOL}/join`, { role: 'admin' })).status, 400);
  assertOK(
    await post(gmail, `/api/schools/${SCHOOL}/join`, {
      role: 'teacher',
      note: 'Fixture request',
    }),
    201,
  );
  assert.equal(
    assertOK(await post(gmail, `/api/schools/${SCHOOL}/join`, { role: 'teacher' })).request.state,
    'pending',
  );
  assert.equal((await api(gmail, '/api/membership/requests')).status, 403);
  const request = assertOK(await api(admin, '/api/membership/requests')).requests.find(
    (r) => r.email === 'new.fixture@gmail.com',
  );
  assert.ok(request);
  assert.equal(
    (
      await post(gmail, `/api/membership/requests/${request.id}/decision`, {
        state: 'approved',
        role: 'admin',
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await post(admin, `/api/membership/requests/${request.id}/decision`, {
        state: 'approved',
        role: 'admin',
      })
    ).status,
    400,
  );
  assertOK(
    await post(admin, `/api/membership/requests/${request.id}/decision`, {
      state: 'approved',
      role: 'teacher',
    }),
  );
  assert.equal(
    (
      await post(admin, `/api/membership/requests/${request.id}/decision`, {
        state: 'approved',
        role: 'teacher',
      })
    ).status,
    409,
  );
  await select(gmail, SCHOOL);
  assert.equal(assertOK(await api(gmail, '/api/auth/me')).user.role, 'teacher');
  assert.equal((await api(gmail, '/api/setup/readiness')).status, 403);
  assertOK(await api(admin, `/api/members/${request.userId}`, { method: 'DELETE' }));
  assert.equal((await api(gmail, '/api/operations')).status, 403);
});
test('setup readiness distinguishes local records from unconfigured services and threshold suggestions require verified hazards', async () => {
  const readiness = assertOK(await api(admin, '/api/setup/readiness'));
  assert.equal(readiness.checks.find((c) => c.id === 'location').state, 'ready');
  assert.equal(readiness.checks.find((c) => c.id === 'vision').state, 'missing');
  assert.equal(readiness.checks.find((c) => c.id === 'push').state, 'missing');
  assert.equal((await api(student, '/api/escalation/rules')).status, 403);
  const id1 = assertOK(
    await post(admin, '/api/hazards', {
      title: 'Fixture obstruction doorway',
      severity: 'high',
      roomId,
      category: 'blocked_exit',
    }),
    201,
  ).hazard.id;
  const id2 = assertOK(
    await post(admin, '/api/hazards', {
      title: 'Fixture obstruction doorway',
      severity: 'high',
      roomId,
      category: 'blocked_exit',
    }),
    201,
  ).hazard.id;
  const duplicates = assertOK(await api(admin, `/api/hazards/${id1}/duplicates`));
  assert.ok(duplicates.matches.some((row) => row.id === id2 && row.similarity >= 90));
  assert.equal((await api(student, `/api/hazards/${id1}/duplicates`)).status, 403);
  assertOK(
    await post(admin, '/api/escalation/rules', {
      enabled: true,
      threshold: 2,
      severity: 'high',
    }),
  );
  assert.equal(assertOK(await api(admin, '/api/escalation/suggestions')).suggestions.length, 0);
  for (const id of [id1, id2])
    assertOK(
      await api(admin, `/api/hazards/${id}`, {
        method: 'PATCH',
        body: { status: 'verified' },
      }),
    );
  assert.equal(assertOK(await api(admin, '/api/escalation/suggestions')).suggestions[0].count, 2);
  const alerts = assertOK(await api(admin, '/api/alerts'));
  assert.ok(!alerts.items.some((row) => row.title === 'Fixture obstruction doorway'));
});
test('prepared model mappings reject cross-building room links and retain genuine floor and room records', async () => {
  const record = assertOK(await api(admin, `/api/rooms/${roomId}/record`));
  const model = record.assets.find((a) => a.kind === 'model');
  assertOK(
    await post(admin, `/api/rooms/${roomId}/assets`, {
      kind: 'model',
      url: model.url,
      title: 'Fixture mapped model',
      mapping: {
        floors: [{ node: 'FloorObject', floorId: record.room.floorId }],
        rooms: [{ node: 'RoomObject', roomId }],
      },
    }),
    201,
  );
  const updated = assertOK(await api(admin, `/api/rooms/${roomId}/record`));
  const metadata = JSON.parse(
    updated.assets.find((a) => a.title === 'Fixture mapped model').metadata,
  );
  assert.equal(metadata.mapping.rooms[0].label, `${record.room.code} ${record.room.name}`);
  assert.equal(
    (
      await post(admin, `/api/rooms/${roomId}/assets`, {
        kind: 'model',
        url: model.url,
        title: 'Invalid mapping',
        mapping: { rooms: [{ node: 'Nonexistent', roomId: 999999 }] },
      })
    ).status,
    400,
  );
});
test('bulk roster import previews, preserves attendance, deduplicates and enforces class ownership', async () => {
  const csv = 'name,email,externalRef\r\n"Fixture, Imported One",,a1\r\nImported Two,,a2\r\n';
  const preview = assertOK(await post(teacher, `/api/advanced/rosters/${classId}/import`, { csv }));
  assert.equal(preview.dryRun, true);
  assert.equal(preview.preview.length, 2);
  assert.equal(preview.added, 0);
  assert.equal(
    (
      await post(otherTeacher, `/api/advanced/rosters/${classId}/import`, {
        csv,
        commit: true,
      })
    ).status,
    403,
  );
  assert.equal(
    assertOK(
      await post(teacher, `/api/advanced/rosters/${classId}/import`, {
        csv,
        commit: true,
      }),
    ).added,
    2,
  );
  assert.equal(
    assertOK(
      await post(teacher, `/api/advanced/rosters/${classId}/import`, {
        csv,
        commit: true,
      }),
    ).added,
    0,
  );
  const roster = assertOK(await api(teacher, `/api/rollcall/${classId}/roster`)).people;
  assert.equal(roster.find((row) => row.id === personId).status, 'injured');
  assert.equal(
    (
      await post(teacher, `/api/advanced/rosters/${classId}/import`, {
        csv: 'name,email\nUnknown,not-a-member@gmail.com',
      })
    ).status,
    400,
  );
});
test('official map imports require source provenance, valid coordinates and role permissions', async () => {
  const geojson = {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        geometry: {
          type: 'LineString',
          coordinates: [
            [122.9, 14.1],
            [122.91, 14.11],
          ],
        },
        properties: { name: 'Parser test fixture only' },
      },
    ],
  };
  const layer = {
    kind: 'fault',
    title: 'TEST FIXTURE — not an actual official dataset',
    agency: 'Parser fixture',
    sourceUrl: 'https://www.phivolcs.dost.gov.ph/test-fixture.geojson',
    publishedAt: new Date().toISOString(),
    geojson,
    verified: false,
  };
  assert.equal((await post(student, '/api/advanced/layers', layer)).status, 403);
  assert.equal(
    (
      await post(admin, '/api/advanced/layers', {
        ...layer,
        sourceUrl: 'http://127.0.0.1/internal',
      })
    ).status,
    400,
  );
  const saved = assertOK(await post(admin, '/api/advanced/layers', layer), 201);
  const listed = assertOK(await api(student, '/api/advanced/layers')).layers.find(
    (row) => row.id === saved.id,
  );
  assert.equal(listed.freshness, 'unverified_import');
  assert.equal(listed.geojson.features.length, 1);
  assertOK(await api(admin, `/api/advanced/layers/${saved.id}`, { method: 'DELETE' }));
});
test('calibrated image projection carries an approximate pin into a human-reviewed inspection', async () => {
  const scan = assertOK(
    await post(admin, '/api/scans', {
      roomId,
      clientRequestId: crypto.randomUUID(),
    }),
    201,
  ).scanId;
  const file = await fetch(BASE + '/api/uploads', {
    method: 'POST',
    headers: {
      Cookie: admin,
      'X-Radar-Workspace': SCHOOL,
      'Content-Type': 'image/svg+xml',
    },
    body: '<svg xmlns="http://www.w3.org/2000/svg"/>',
  });
  const image = await file.json();
  assertOK(await post(admin, `/api/scans/${scan}/photos`, { url: image.url }), 201);
  assertOK(
    await post(admin, `/api/scans/${scan}/observations`, {
      title: 'Calibrated parser fixture observation',
      severity: 'low',
    }),
    201,
  );
  const detail = assertOK(await api(admin, `/api/scans/${scan}`));
  const photo = detail.photos[0].id,
    observation = detail.observations[0].id;
  const anchors = [
    [0, 0, 0, 0],
    [1, 0, 1, 0],
    [1, 1, 1, 1],
    [0, 1, 0, 1],
  ];
  assert.equal(
    (
      await post(student, `/api/advanced/photos/${photo}/calibrate`, {
        anchors,
        source: 'Fixture plane',
        verified: true,
      })
    ).status,
    403,
  );
  assertOK(
    await post(admin, `/api/advanced/photos/${photo}/calibrate`, {
      anchors,
      source: 'Fixture known planar correspondences',
      verified: true,
    }),
  );
  const point = assertOK(
    await post(admin, `/api/advanced/observations/${observation}/project`, {
      photoId: photo,
      x: 0.25,
      y: 0.6,
    }),
  );
  assert.ok(Math.abs(point.x - 0.25) < 1e-8);
  assertOK(
    await api(admin, `/api/scans/${scan}/observations/${observation}`, {
      method: 'PATCH',
      body: { status: 'accepted' },
    }),
  );
  assertOK(await post(admin, `/api/scans/${scan}/submit`, {}));
  const record = assertOK(await api(admin, `/api/rooms/${roomId}/record`));
  assert.ok(record.hazards.some((row) => row.pinX === 0.25 && row.pinY === 0.6));
});
test('foreground sharing has explicit consent, fixed expiry and responder-only sample access', async () => {
  const incident = assertOK(
    await post(student, '/api/sos', {
      kind: 'other',
      note: 'Temporary GPS fixture',
    }),
    201,
  ).incidentId;
  assert.equal(
    (
      await post(student, '/api/advanced/location/start', {
        incidentId: incident,
        minutes: 5,
      })
    ).status,
    400,
  );
  const session = assertOK(
    await post(student, '/api/advanced/location/start', {
      consent: true,
      incidentId: incident,
      minutes: 5,
    }),
  );
  const sample = assertOK(
    await post(student, '/api/advanced/location/sample', {
      lat: 14.1,
      lng: 122.9,
      accuracy: 20,
    }),
  );
  assert.equal(sample.expiresAt, session.endsAt);
  assert.equal(assertOK(await api(responder, '/api/operations')).locations.length, 1);
  assert.equal(assertOK(await api(parent, '/api/operations')).locations, undefined);
  assertOK(await api(student, '/api/advanced/location', { method: 'DELETE' }));
  assert.equal(
    (
      await post(student, '/api/advanced/location/sample', {
        lat: 14.1,
        lng: 122.9,
        accuracy: 20,
      })
    ).status,
    410,
  );
});
test('registered count devices are scoped, reject replayed readings, and revoke tokens', async () => {
  assert.equal(
    (await post(student, '/api/advanced/devices', { name: 'Unauthorized' })).status,
    403,
  );
  const device = assertOK(
    await post(admin, '/api/advanced/devices', {
      name: 'Aggregate test fixture',
      roomId,
    }),
    201,
  );
  const payload = {
    deviceId: device.id,
    count: 7,
    observedAt: new Date().toISOString(),
    nonce: crypto.randomUUID(),
  };
  assert.equal((await post(null, '/api/device/occupancy', payload)).status, 403);
  assertOK(
    await api(null, '/api/device/occupancy', {
      method: 'POST',
      body: payload,
      headers: { Authorization: `Bearer ${device.token}` },
    }),
    201,
  );
  assert.equal(
    (
      await api(null, '/api/device/occupancy', {
        method: 'POST',
        body: payload,
        headers: { Authorization: `Bearer ${device.token}` },
      })
    ).status,
    409,
  );
  const counts = assertOK(await api(responder, '/api/advanced/occupancy'));
  assert.equal(counts.rooms.find((row) => row.roomId === roomId).count, 7);
  const devices = assertOK(await api(admin, '/api/advanced/devices')).devices;
  assert.equal(devices[0].tokenHash, undefined);
  assert.equal(devices[0].token, undefined);
  assertOK(
    await api(admin, `/api/advanced/devices/${device.id}`, {
      method: 'DELETE',
    }),
  );
  assert.equal(
    (
      await api(null, '/api/device/occupancy', {
        method: 'POST',
        body: { ...payload, nonce: crypto.randomUUID() },
        headers: { Authorization: `Bearer ${device.token}` },
      })
    ).status,
    403,
  );
});
test('custom report fields are allowlisted and measured models need actual floor surveys', async () => {
  assert.equal(
    (
      await post(student, '/api/advanced/reports', {
        dataset: 'hazards',
        groupBy: ['severity'],
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await post(admin, '/api/advanced/reports', {
        dataset: 'hazards',
        groupBy: ['reported_by; DROP TABLE users'],
      })
    ).status,
    400,
  );
  const report = assertOK(
    await post(admin, '/api/advanced/reports', {
      dataset: 'hazards',
      groupBy: ['severity', 'status'],
    }),
  );
  assert.ok(report.sourceRecords > 0);
  assert.ok(report.csv.includes('averageResolutionHours'));
  assert.ok(assertOK(await api(admin, '/api/advanced/recurrence')).groups.length > 0);
  const record = assertOK(await api(admin, `/api/rooms/${roomId}/record`));
  assertOK(
    await post(admin, `/api/advanced/floors/${record.room.floorId}/survey`, {
      scale: 10,
      elevation: 3.2,
      source: 'Test fixture measured plane',
      verified: true,
      layoutVerified: true,
    }),
  );
  const map = assertOK(await api(admin, '/api/map'));
  const layout = assertOK(await api(admin, `/api/advanced/models/${map.buildings[0].id}/layout`));
  assert.equal(layout.ready, true);
  assert.equal(layout.floors[0].elevationM, 3.2);
});
test('relay drafts stay unverified, expire, reject other schools and cannot be replayed', async () => {
  const packet = {
    version: 1,
    id: crypto.randomUUID(),
    school: SCHOOL,
    kind: 'other',
    note: 'Test fixture, no actual emergency',
    expiresAt: new Date(Date.now() + 600000).toISOString(),
  };
  assert.equal((await post(student, '/api/advanced/relay/receive', { packet })).status, 403);
  assert.equal(
    (
      await post(responder, '/api/advanced/relay/receive', {
        packet: { ...packet, school: '112082' },
      })
    ).status,
    409,
  );
  assert.equal(
    (
      await post(responder, '/api/advanced/relay/receive', {
        packet: { ...packet, expiresAt: '2000-01-01T00:00:00Z' },
      })
    ).status,
    400,
  );
  const received = assertOK(await post(responder, '/api/advanced/relay/receive', { packet }), 201);
  assert.equal(received.verified, false);
  assert.equal((await post(responder, '/api/advanced/relay/receive', { packet })).status, 409);
});
test('acceptance records and notification policies require administrators and never imply provider delivery', async () => {
  assert.equal(
    (
      await post(student, '/api/advanced/testing/results', {
        testKey: 'sensor',
        state: 'passed',
        note: 'unauthorized',
      })
    ).status,
    403,
  );
  assertOK(
    await post(admin, '/api/advanced/testing/results', {
      testKey: 'sensor',
      state: 'blocked',
      note: 'Fixture only; no physical sensor configured.',
    }),
    201,
  );
  const notebook = assertOK(await api(admin, '/api/advanced/testing'));
  assert.equal(notebook.checks.smsConfigured, false);
  assert.ok(notebook.results.some((row) => row.state === 'blocked'));
  assertOK(
    await post(admin, '/api/advanced/delivery-policy', {
      fallbackSms: true,
      sosSms: true,
    }),
  );
  assert.equal(
    assertOK(await api(admin, '/api/advanced/delivery-policy')).policy.fallbackSms,
    true,
  );
  assert.equal((await api(student, '/api/advanced/health')).status, 403);
  assert.equal(assertOK(await api(admin, '/api/advanced/health')).database, true);
});
test('SMS fallback and SOS jobs honor consent and show unconfigured providers instead of fabricated delivery', async () => {
  assertOK(
    await post(responder, '/api/notifications/sms/consent', {
      consent: true,
      phone: '+639001234567',
    }),
  );
  assertOK(
    await post(admin, '/api/advanced/delivery-policy', {
      fallbackSms: true,
      sosSms: true,
    }),
  );
  const incident = assertOK(
    await post(student, '/api/sos', {
      kind: 'other',
      note: 'Delivery policy test fixture only',
    }),
    201,
  ).incidentId;
  const alert = assertOK(
    await post(admin, '/api/alerts', {
      title: 'Fallback test fixture',
      body: 'No live messages',
      audience: 'school',
      level: 'green',
      sendPush: true,
    }),
    201,
  ).alert;
  assert.equal((await post(student, '/api/advanced/delivery/drain', {})).status, 403);
  assertOK(await post(admin, '/api/advanced/delivery/drain', {}));
  const policy = assertOK(await api(admin, '/api/advanced/delivery-policy'));
  assert.ok(policy.sosJobs.some((job) => job.incidentId === incident && job.state === 'processed'));
  const receipts = assertOK(await api(admin, '/api/notifications/channels')).deliveries;
  assert.ok(
    receipts.some(
      (row) => row.channel === 'sms' && row.alertId === alert.id && row.state === 'not_configured',
    ),
  );
  assert.ok(!receipts.some((row) => row.state === 'delivered'));
  assertOK(await post(responder, '/api/notifications/sms/consent', { consent: false }));
});
test('campus video surveys require reviewed school-scoped labels and never fabricate AI availability', async () => {
  const frames = [{ time: 1, image: 'data:image/jpeg;base64,YWJj' }];
  assert.equal(
    (
      await api(student, '/api/advanced/video-surveys', {
        method: 'POST',
        body: { title: 'Denied', frames, candidates: [], reviewed: true },
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await api(admin, '/api/advanced/video-surveys', {
        method: 'POST',
        body: { title: 'Not reviewed', frames, candidates: [] },
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await api(admin, '/api/advanced/video-surveys/analyze', {
        method: 'POST',
        body: { frames, consent: false },
      })
    ).status,
    400,
  );
  const ai = await api(admin, '/api/advanced/video-surveys/analyze', {
    method: 'POST',
    body: { frames, consent: true },
  });
  assert.equal(ai.status, 400);
  assert.match(ai.body.error, /configure|training/i);
  const saved = await api(admin, '/api/advanced/video-surveys', {
    method: 'POST',
    body: {
      title: 'Reviewed video fixture',
      frames,
      candidates: [
        {
          frameIndex: 0,
          x: 0.2,
          y: 0.4,
          label: 'Draft 1',
          description: 'Needs building match',
          buildingId: null,
        },
      ],
      reviewed: true,
    },
  });
  assert.equal(saved.status, 201);
  const read = await api(admin, `/api/advanced/video-surveys/${saved.body.id}`);
  assert.equal(read.body.payload.candidates[0].buildingId, null);
  assert.equal((await api(admin, '/api/advanced/video-provider')).body.configured, false);
  assert.equal(
    (
      await api(student, `/api/advanced/video-surveys/${saved.body.id}/dashboard`, {
        method: 'POST',
        body: {},
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await api(admin, `/api/advanced/video-surveys/${saved.body.id}/dashboard`, {
        method: 'POST',
        body: {},
      })
    ).status,
    200,
  );
  const closeView = await api(admin, '/api/campus-close-view');
  assert.equal(closeView.body.survey.id, saved.body.id);
  assert.equal(closeView.body.survey.payload.frames.length, 1);

  assert.equal(
    (
      await api(admin, `/api/advanced/video-surveys/${saved.body.id}`, {
        scope: '',
      })
    ).status,
    409,
  );
  assert.equal(
    (
      await api(admin, `/api/advanced/video-surveys/${saved.body.id}`, {
        method: 'DELETE',
      })
    ).status,
    200,
  );
});
test('image route sketches remain school-scoped drafts, require meaningful geometry and never activate evacuation routes', async () => {
  const image = 'data:image/jpeg;base64,YWJj';
  const payload = {
    title: 'Field-walk fixture',
    source: 'photo',
    image,
    paths: [
      {
        name: 'Visible walkway',
        description: 'Needs field walk',
        points: [
          [0.1, 0.2],
          [0.4, 0.5],
          [0.8, 0.6],
        ],
      },
    ],
    checks: {},
    notes: '',
    uncertainties: ['Check the gate'],
  };
  assert.equal((await post(student, '/api/advanced/image-paths', payload)).status, 403);
  assert.equal((await post(teacher, '/api/advanced/image-paths', payload)).status, 403);
  assert.equal(
    (
      await post(admin, '/api/advanced/image-paths', {
        ...payload,
        paths: [
          {
            name: 'Invalid GPS',
            points: [
              [14, 122],
              [15, 123],
            ],
          },
        ],
      })
    ).status,
    400,
  );
  assert.equal(
    (await post(admin, '/api/advanced/image-paths', { ...payload, checks: { surface: true } }))
      .status,
    400,
  );
  const before = assertOK(await api(admin, '/api/evacuation')).routes.length;
  const saved = assertOK(await post(admin, '/api/advanced/image-paths', payload), 201);
  const read = assertOK(await api(admin, `/api/advanced/image-paths/${saved.id}`));
  assert.equal(read.paths[0].points.length, 3);
  assert.equal(read.checks.surface, false);
  assert.equal(
    (await post(responder, '/api/advanced/image-paths', { ...payload, id: saved.id })).status,
    403,
  );
  const copy = assertOK(
    await post(responder, '/api/advanced/image-paths', { ...payload, title: 'Responder copy' }),
    201,
  );
  assert.equal(
    (await api(responder, `/api/advanced/image-paths/${saved.id}`, { method: 'DELETE' })).status,
    403,
  );
  assert.equal(
    (await api(responder, `/api/advanced/image-paths/${copy.id}`, { method: 'DELETE' })).status,
    200,
  );
  assert.equal(
    (await api(admin, `/api/advanced/image-paths/${saved.id}`, { scope: '' })).status,
    409,
  );
  assertOK(
    await post(admin, '/api/advanced/image-paths', {
      ...payload,
      id: saved.id,
      checks: { surface: true, access: true, obstructions: true, destination: true },
      notes: 'Synthetic field-check fixture only',
    }),
    201,
  );
  assert.equal(assertOK(await api(admin, '/api/evacuation')).routes.length, before);
  assert.equal(
    (await post(admin, '/api/advanced/image-paths/suggest', { image, consent: false })).status,
    400,
  );
  assert.equal(
    (await api(admin, `/api/advanced/image-paths/${saved.id}`, { method: 'DELETE' })).status,
    200,
  );
  assert.equal((await api(admin, `/api/advanced/image-paths/${saved.id}`)).status, 404);
});
test('all six approved school roles return to the same configured dashboard after logout and login',async()=>{
 const image='data:image/jpeg;base64,YWJj';
 const survey=assertOK(await post(admin,'/api/advanced/video-surveys',{title:'Login persistence fixture',frames:[{time:0,image,kind:'photo'}],candidates:[],reviewed:true}),201);
 assertOK(await post(admin,`/api/advanced/video-surveys/${survey.id}/dashboard`,{}));
 const map=assertOK(await api(admin,'/api/map'));
 for(const role of ['admin','inspector','teacher','responder','student','parent']){
  const email=`login-${role}@example.test`,password='Fixture#2026';
  assert.equal((await post(null,'/api/auth/signup',{name:`Login ${role}`,email,password})).status,201);
  assertOK(await post(admin,'/api/members',{email,role}),201);
  async function signIn(){const response=await fetch(BASE+'/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email,password})});assert.equal(response.status,200);const body=await response.json();const cookie=response.headers.getSetCookie().map(value=>value.split(';')[0]).join('; ');modes.set(cookie,body.activeWorkspaceId||'');assert.equal(body.activeWorkspaceId,SCHOOL);assert.equal(body.user.role,role);assert.equal(body.school.name,map.school.name);return cookie;}
  let cookie=await signIn();assertOK(await post(cookie,'/api/auth/logout',{}));cookie=await signIn();
  const restored=assertOK(await api(cookie,'/api/map'));assert.equal(restored.school.lat,map.school.lat);assert.equal(restored.buildings.length,map.buildings.length);
  assertOK(await api(cookie,'/api/dashboard'));
  assert.equal(assertOK(await api(cookie,'/api/campus-close-view')).survey.id,survey.id);
  assert.equal((await api(cookie,'/api/admin/users')).status,role==='admin'?200:403);
  assert.equal((await post(cookie,`/api/schools/${SCHOOL}/join`,{role})).status,409,'approved members must not request approval again');
 }
 assertOK(await api(admin,`/api/advanced/video-surveys/${survey.id}`,{method:'DELETE'}));
});
test('explicit original-workspace choices persist, while revoked schools are never restored on login',async()=>{
 const email='restore-revocation@example.test',password='Fixture#2026';
 assert.equal((await post(null,'/api/auth/signup',{name:'Restore fixture',email,password})).status,201);
 assertOK(await post(admin,'/api/members',{email,role:'student'}),201);
 async function signIn(){const response=await fetch(BASE+'/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email,password})});assert.equal(response.status,200);const body=await response.json();const cookie=response.headers.getSetCookie().map(v=>v.split(';')[0]).join('; ');modes.set(cookie,body.activeWorkspaceId||'');return {body,cookie};}
 let session=await signIn();assert.equal(session.body.activeWorkspaceId,SCHOOL);await select(session.cookie,null);assertOK(await post(session.cookie,'/api/auth/logout',{}));session=await signIn();assert.equal(session.body.activeWorkspaceId,null);
 await select(session.cookie,SCHOOL);assertOK(await post(session.cookie,'/api/auth/logout',{}));const member=assertOK(await api(admin,'/api/admin/users')).users.find(u=>u.email===email);assertOK(await api(admin,`/api/members/${member.id}`,{method:'DELETE'}));
 session=await signIn();assert.equal(session.body.activeWorkspaceId,null);assert.equal((await post(session.cookie,'/api/workspaces/select',{beisId:SCHOOL})).status,403);
});
test('revoking school membership removes access while retaining historical attendance', async () => {
  const id = users.find((u) => u.role === 'student').id;
  assertOK(await api(admin, `/api/members/${id}`, { method: 'DELETE' }));
  assert.equal((await api(student, '/api/operations')).status, 403);
  const rows = assertOK(await api(teacher, `/api/rollcall/${classId}/roster`)).people;
  assert.ok(rows.some((p) => p.id === personId));
});

test('route planning uses only verified connected walkways and avoids closures and full assembly points', () => {
  const point = {
    id: 1,
    name: 'Fixture point',
    status: 'open',
    accessible: 1,
    capacity: 20,
  };
  const route = {
    id: 1,
    path: [
      [14, 122],
      [14.001, 122],
    ],
    status: 'open',
    verified: 1,
    accessible: 1,
    building_id: 1,
    assembly_point_id: 1,
  };
  const valid = planEvacuation({
    routes: [route],
    points: [point],
    buildingId: 1,
  });
  assert.equal(valid.available, true);
  assert.ok(valid.distanceMeters > 100);
  assert.equal(
    planEvacuation({
      routes: [{ ...route, verified: 0 }],
      points: [point],
      buildingId: 1,
    }).available,
    false,
  );
  assert.equal(
    planEvacuation({
      routes: [{ ...route, status: 'closed' }],
      points: [point],
      buildingId: 1,
    }).available,
    false,
  );
  assert.equal(
    planEvacuation({
      routes: [route],
      points: [point],
      buildingId: 1,
      occupancy: [
        {
          assembly_point_id: 1,
          count: 20,
          observed_at: new Date().toISOString(),
        },
      ],
    }).available,
    false,
  );
  const zone = {
    kind: 'blocked',
    verified: 1,
    geometry: {
      type: 'Polygon',
      coordinates: [
        [
          [121.9999, 14.0004],
          [122.0001, 14.0004],
          [122.0001, 14.0006],
          [121.9999, 14.0006],
          [121.9999, 14.0004],
        ],
      ],
    },
  };
  assert.equal(
    planEvacuation({
      routes: [route],
      points: [point],
      buildingId: 1,
      zones: [zone],
    }).available,
    false,
  );
});
test('official feed parsing rejects stale data and never invents PEIS intensity or school impact', () => {
  const now = Date.now();
  const feed = {
    type: 'FeatureCollection',
    metadata: { generated: now },
    features: [
      {
        id: 'fixture',
        geometry: { type: 'Point', coordinates: [122.95, 14.12, 10] },
        properties: {
          time: now,
          updated: now,
          mag: 3,
          title: 'Fixture earthquake',
          place: 'Fixture region',
        },
      },
    ],
  };
  const events = parseUsgs(feed, now);
  assert.equal(events.length, 1);
  assert.equal(events[0].depthKm, 10);
  assert.equal(events[0].intensity, undefined);
  assert.throws(
    () => parseUsgs({ ...feed, metadata: { generated: now - 86400000 } }, now),
    /stale/,
  );
});
test('vision results are validated suggestions and malformed provider responses are rejected', async () => {
  const request = async () =>
    new Response(
      JSON.stringify({
        output: [
          {
            content: [
              {
                type: 'output_text',
                text: JSON.stringify({
                  findings: [
                    {
                      title: 'Fixture visible obstruction',
                      description: 'Visible only',
                      severity: 'low',
                      confidence: 0.7,
                    },
                  ],
                }),
              },
            ],
          },
        ],
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    );
  const findings = await analyzeVisibleHazards(['data:image/jpeg;base64,fixture'], {
    apiKey: 'fake-test-key',
    request,
  });
  assert.equal(findings[0].confidence, 0.7);
  assert.equal(findings[0].verified, undefined);
  await assert.rejects(
    () =>
      analyzeVisibleHazards([], {
        apiKey: 'fake-test-key',
        request: async () => new Response('{}'),
      }),
    /unsupported response/,
  );
});
test('SMS callbacks require an authentic provider signature and push endpoints cannot target private networks', () => {
  const url = 'https://school.example/api/notifications/sms-status';
  const params = new URLSearchParams({
    MessageStatus: 'delivered',
    MessageSid: 'SM00000000000000000000000000000000',
  });
  const text =
    url +
    [...params.keys()]
      .sort()
      .map((k) => k + params.get(k))
      .join('');
  const signature = crypto.createHmac('sha1', 'fake-provider-token').update(text).digest('base64');
  assert.equal(verifySmsSignature(url, params, signature, 'fake-provider-token'), true);
  assert.equal(verifySmsSignature(url, params, 'forged', 'fake-provider-token'), false);
  assert.equal(validPush({ endpoint: 'https://127.0.0.1/push', keys: {} }), false);
});
