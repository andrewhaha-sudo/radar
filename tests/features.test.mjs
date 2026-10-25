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
    (await api(cookie, '/api/workspaces/select', { method: 'POST', body: { beisId: id } })).status,
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
    await post(admin, `/api/buildings/${b.id}/floors`, { name: 'Fixture floor', level: 1 }),
    201,
  ).floor;
  roomId = assertOK(
    await post(admin, `/api/floors/${f.id}/rooms`, { name: 'Fixture classroom', code: '101' }),
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
    (await post(student, '/api/members', { email: 'student@northridge.edu', role: 'admin' }))
      .status,
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
    await post(teacher, `/api/rollcall/${classId}/roster`, { name: 'Manual fixture student' }),
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
    (await post(otherTeacher, `/api/rollcall/people/${personId}/status`, { status: 'present' }))
      .status,
    403,
  );
  assertOK(await post(teacher, `/api/rollcall/people/${personId}/status`, { status: 'injured' }));
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
    headers: { Cookie: admin, 'X-Radar-Workspace': SCHOOL, 'Content-Type': 'image/svg+xml' },
    body: '<svg xmlns="http://www.w3.org/2000/svg"/>',
  });
  assert.equal(upload.status, 201, await upload.clone().text());
  const file = await upload.json();
  assertOK(
    await post(admin, `/api/scans/${scan}/photos`, { url: file.url, caption: 'Fixture evidence' }),
    201,
  );
  const checklist = Object.fromEntries(
    ['entrance', 'exits', 'walls', 'ceiling', 'electrical', 'equipment'].map((k) => [k, true]),
  );
  assertOK(await post(admin, `/api/scans/${scan}/checklist`, { checklist, noFindings: true }));
  assertOK(await post(admin, `/api/scans/${scan}/submit`, { notes: 'Visual inspection only' }));
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
    headers: { Cookie: student, 'X-Radar-Workspace': SCHOOL, 'Content-Type': 'image/svg+xml' },
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
  assertOK(await post(student, `/api/hazards/${ownReport}/feedback`, { kind: 'confirm' }));
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
    (await post(admin, `/api/resources/${resourceId}/movements`, { kind: 'consume', quantity: 2 }))
      .status,
    409,
  );
  assertOK(
    await post(admin, `/api/resources/${resourceId}/movements`, { kind: 'replenish', quantity: 4 }),
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
    await post(student, '/api/sos', { kind: 'medical', note: 'Fixture only', silent: true }),
    201,
  ).incidentId;
  assert.equal(
    (await post(student, `/api/sos/${incident}/respond`, { state: 'acknowledged' })).status,
    403,
  );
  assertOK(await post(responder, `/api/sos/${incident}/respond`, { state: 'acknowledged' }));
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
    assertOK(await post(student, `/api/sos/${incident}/cancel`, { reason: 'Fixture cancellation' }))
      .state,
    'cancel_requested',
  );
  assertOK(await post(responder, `/api/sos/${incident}/respond`, { state: 'cancelled' }));
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
  assertOK(await post(student, '/api/safety/check', { status: 'safe', sharing: false }));
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
    (await post(student, '/api/notifications/sms/consent', { consent: true, phone: 'invalid' }))
      .status,
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
      headers: { Cookie: admin, 'X-Radar-Workspace': SCHOOL, 'Content-Type': mime },
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
    headers: { Cookie: admin, 'X-Radar-Workspace': SCHOOL, 'Content-Type': 'model/gltf-binary' },
    body: glb({ asset: { version: '2.0' }, buffers: [{ uri: 'https://other.example/model.bin' }] }),
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
test('revoking school membership removes access while retaining historical attendance', async () => {
  const id = users.find((u) => u.role === 'student').id;
  assertOK(await api(admin, `/api/members/${id}`, { method: 'DELETE' }));
  assert.equal((await api(student, '/api/operations')).status, 403);
  const rows = assertOK(await api(teacher, `/api/rollcall/${classId}/roster`)).people;
  assert.ok(rows.some((p) => p.id === personId));
});

test('route planning uses only verified connected walkways and avoids closures and full assembly points', () => {
  const point = { id: 1, name: 'Fixture point', status: 'open', accessible: 1, capacity: 20 };
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
  const valid = planEvacuation({ routes: [route], points: [point], buildingId: 1 });
  assert.equal(valid.available, true);
  assert.ok(valid.distanceMeters > 100);
  assert.equal(
    planEvacuation({ routes: [{ ...route, verified: 0 }], points: [point], buildingId: 1 })
      .available,
    false,
  );
  assert.equal(
    planEvacuation({ routes: [{ ...route, status: 'closed' }], points: [point], buildingId: 1 })
      .available,
    false,
  );
  assert.equal(
    planEvacuation({
      routes: [route],
      points: [point],
      buildingId: 1,
      occupancy: [{ assembly_point_id: 1, count: 20, observed_at: new Date().toISOString() }],
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
    planEvacuation({ routes: [route], points: [point], buildingId: 1, zones: [zone] }).available,
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
