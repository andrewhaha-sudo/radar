import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BASE = 'http://127.0.0.1:8910';
let child, temp, cookie;
async function api(route, { method = 'GET', body, workspace } = {}) {
  const res = await fetch(BASE + route, {
    method,
    headers: {
      Cookie: cookie ?? '',
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(workspace !== undefined ? { 'X-Radar-Workspace': workspace ?? '' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = text;
  }
  return { status: res.status, body: data };
}
before(async () => {
  temp = fs.mkdtempSync(path.join(os.tmpdir(), 'radar-pg-'));
  child = spawn(process.execPath, ['server/index.mjs'], {
    cwd: ROOT,
    env: {
      ...process.env,
      NODE_ENV: 'test',
      PORT: '8910',
      HOST: '127.0.0.1',
      RADAR_DATABASE_DRIVER: 'postgres',
      RADAR_PGLITE_TEST_DIR: path.join(temp, 'pg'),
      RADAR_ALLOW_TEST_SEED: '1',
      RADAR_DB_DIR: path.join(temp, 'local'),
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  child.stdout.on('data', (c) => {
    output += c;
  });
  child.stderr.on('data', (c) => {
    output += c;
  });
  const deadline = Date.now() + 45000;
  while (Date.now() < deadline && !output.includes('listening on') && child.exitCode === null)
    await new Promise((r) => setTimeout(r, 100));
  assert.match(output, /listening on/, output);
  const login = await fetch(BASE + '/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'admin@northridge.edu', password: 'Admin#2026' }),
  });
  assert.equal(login.status, 200);
  cookie = login.headers
    .getSetCookie()
    .map((c) => c.split(';')[0])
    .join('; ');
});
after(async () => {
  if (child?.exitCode === null) {
    child.kill('SIGTERM');
    await new Promise((r) => child.once('exit', r));
  }
  if (temp) fs.rmSync(temp, { recursive: true, force: true });
});
test('PostgreSQL supports existing dashboard, map, analytics and campus workflows', async () => {
  for (const route of [
    '/api/dashboard',
    '/api/map',
    '/api/analytics',
    '/api/alerts',
    '/api/advisories',
    '/api/resources',
    '/api/recovery',
    '/api/buildings',
  ]) {
    const res = await api(route);
    assert.equal(res.status, 200, `${route}: ${JSON.stringify(res.body)}`);
  }
  assert.equal((await api('/api/dashboard')).body.kpis.totalRooms, 55);
  const hazard = await api('/api/hazards', {
    method: 'POST',
    body: { title: 'Postgres test finding', severity: 'low', roomId: 1 },
  });
  assert.equal(hazard.status, 201, JSON.stringify(hazard.body));
  assert.equal((await api(`/api/hazards/${hazard.body.hazard.id}`)).status, 200);
  const alert = await api('/api/alerts', {
    method: 'POST',
    body: {
      title: 'Postgres test alert',
      body: 'Test only',
      level: 'yellow',
      kind: 'alert',
      audience: 'school',
    },
  });
  assert.equal(alert.status, 201, JSON.stringify(alert.body));
  assert.ok((await api('/api/alerts')).body.items.some((a) => a.title === 'Postgres test alert'));
});
test('PostgreSQL workspaces use separate protected schemas and retain their records', async () => {
  let res = await api('/api/workspaces', { method: 'POST', body: { beisId: '309622' } });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  assert.equal(
    (await api('/api/workspaces/select', { method: 'POST', body: { beisId: '309622' } })).status,
    200,
  );
  const me = await api('/api/auth/me');
  assert.equal(me.body.school.name, 'Camarines Norte NHS-Annex');
  assert.equal((await api('/api/dashboard', { workspace: '309622' })).body.kpis.totalRooms, 0);
  const b = await api('/api/buildings', {
    workspace: '309622',
    method: 'POST',
    body: { name: 'PG test building', code: 'PG', lat: 14.1, lng: 122.9 },
  });
  assert.equal(b.status, 201, JSON.stringify(b.body));
  const f = await api(`/api/buildings/${b.body.building.id}/floors`, {
    workspace: '309622',
    method: 'POST',
    body: { name: 'Ground', level: 1 },
  });
  assert.equal(f.status, 201);
  const r = await api(`/api/floors/${f.body.floor.id}/rooms`, {
    workspace: '309622',
    method: 'POST',
    body: { name: 'PG room', code: '101' },
  });
  assert.equal(r.status, 201);
  assert.equal((await api('/api/dashboard', { workspace: '309622' })).body.kpis.totalRooms, 1);
  await api('/api/workspaces/select', { method: 'POST', body: { beisId: null } });
  assert.equal((await api('/api/dashboard', { workspace: '' })).body.kpis.totalRooms, 55);
});
