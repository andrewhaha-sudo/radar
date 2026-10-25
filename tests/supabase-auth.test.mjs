import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BASE = 'http://127.0.0.1:8912';
let mock, child, temp, admin, student, signupBody;
const files = new Map();
const identities = {
  'owner@example.test': {
    id: '11111111-1111-4111-8111-111111111111',
    email: 'owner@example.test',
    email_confirmed_at: '2026-01-01T00:00:00Z',
    user_metadata: { name: 'School owner' },
  },
  'student@example.test': {
    id: '22222222-2222-4222-8222-222222222222',
    email: 'student@example.test',
    email_confirmed_at: '2026-01-01T00:00:00Z',
    user_metadata: { name: 'Student' },
  },
};
async function api(cookie, route, body, workspace) {
  const res = await fetch(BASE + route, {
    method: body ? 'POST' : 'GET',
    headers: {
      ...(cookie ? { Cookie: cookie } : {}),
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(workspace ? { 'X-Radar-Workspace': workspace } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return {
    status: res.status,
    body: await res.json(),
    cookie: res.headers
      .getSetCookie()
      .map((c) => c.split(';')[0])
      .join('; '),
  };
}
before(async () => {
  mock = http.createServer(async (req, res) => {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const bytes = Buffer.concat(chunks);
    const url = new URL(req.url, 'http://localhost');
    res.setHeader('Content-Type', 'application/json');
    if (url.pathname === '/auth/v1/signup') {
      signupBody = JSON.parse(bytes);
      return res.end(
        JSON.stringify({
          user: {
            id: '33333333-3333-4333-8333-333333333333',
            email: signupBody.email,
            identities: [],
          },
          session: null,
        }),
      );
    }
    if (url.pathname === '/auth/v1/token') {
      const body = JSON.parse(bytes);
      const user = identities[body.email];
      if (!user || body.password !== 'TestPassword123!') {
        res.writeHead(400);
        return res.end(
          JSON.stringify({ error_code: 'invalid_credentials', msg: 'Invalid login credentials' }),
        );
      }
      const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
      const token = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: user.id, exp: Math.floor(Date.now() / 1000) + 3600 })}.test-signature`;
      return res.end(
        JSON.stringify({
          access_token: token,
          token_type: 'bearer',
          expires_in: 3600,
          refresh_token: 'test-refresh-token',
          user,
        }),
      );
    }
    if (url.pathname === '/storage/v1/bucket/radar-uploads')
      return res.end(JSON.stringify({ id: 'radar-uploads', name: 'radar-uploads', public: false }));
    if (req.method === 'POST' && url.pathname.startsWith('/storage/v1/object/radar-uploads/')) {
      files.set(url.pathname.replace('/storage/v1/object/', ''), bytes);
      return res.end(JSON.stringify({ Key: 'stored' }));
    }
    if (req.method === 'GET' && url.pathname.startsWith('/storage/v1/object/radar-uploads/')) {
      const bytes = files.get(url.pathname.replace('/storage/v1/object/', ''));
      if (!bytes) {
        res.writeHead(404);
        return res.end('{}');
      }
      res.setHeader('Content-Type', 'image/svg+xml');
      return res.end(bytes);
    }
    res.writeHead(404);
    res.end(JSON.stringify({ message: 'Unknown mock path' }));
  });
  await new Promise((resolve) => mock.listen(8911, '127.0.0.1', resolve));
  temp = fs.mkdtempSync(path.join(os.tmpdir(), 'radar-cloud-auth-'));
  child = spawn(process.execPath, ['server/index.mjs'], {
    cwd: ROOT,
    env: {
      ...process.env,
      NODE_ENV: 'test',
      PORT: '8912',
      HOST: '127.0.0.1',
      RADAR_DATABASE_DRIVER: 'postgres',
      RADAR_PGLITE_TEST_DIR: path.join(temp, 'pg'),
      RADAR_DB_DIR: path.join(temp, 'local'),
      RADAR_ALLOW_TEST_SEED: '0',
      RADAR_TEST_CLOUD_AUTH: '1',
      SUPABASE_URL: 'http://127.0.0.1:8911',
      SUPABASE_PUBLISHABLE_KEY: 'test-publishable',
      SUPABASE_SERVICE_ROLE_KEY: 'test-server-key',
      RADAR_ADMIN_EMAIL: 'owner@example.test',
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
});
after(async () => {
  if (child?.exitCode === null) {
    child.kill('SIGTERM');
    await new Promise((r) => child.once('exit', r));
  }
  if (mock) await new Promise((r) => mock.close(r));
  if (temp) fs.rmSync(temp, { recursive: true, force: true });
});
test('Supabase signup forwards only profile fields and leaves confirmation to Auth', async () => {
  const config = await api(null, '/api/auth/config');
  assert.equal(config.body.provider, 'supabase');
  assert.equal(config.body.signupEnabled, true);
  assert.equal(
    (
      await api(null, '/api/auth/signup', {
        email: 'new@example.test',
        name: 'New account',
        password: 'TestPassword123!',
        role: 'admin',
      })
    ).status,
    200,
  );
  assert.equal(signupBody.data.name, 'New account');
  assert.equal(signupBody.data.role, undefined);
  assert.equal(
    (
      await api(null, '/api/auth/signup', {
        email: 'new@example.test',
        name: 'New',
        password: '123',
      })
    ).status,
    400,
  );
});
test('Supabase password verification creates persistent app profiles with controlled initial roles', async () => {
  assert.equal(
    (await api(null, '/api/auth/login', { email: 'owner@example.test', password: 'WrongPassword' }))
      .status,
    401,
  );
  const owner = await api(null, '/api/auth/login', {
    email: 'owner@example.test',
    password: 'TestPassword123!',
  });
  assert.equal(owner.status, 200, JSON.stringify(owner.body));
  assert.equal(owner.body.user.role, 'admin');
  assert.equal(owner.body.user.accountScope, 'supabase:11111111-1111-4111-8111-111111111111');
  admin = owner.cookie;
  const other = await api(null, '/api/auth/login', {
    email: 'student@example.test',
    password: 'TestPassword123!',
  });
  assert.equal(other.body.user.role, 'student');
  student = other.cookie;
  const repeat = await api(null, '/api/auth/login', {
    email: 'owner@example.test',
    password: 'TestPassword123!',
  });
  assert.equal(repeat.body.user.id, owner.body.user.id);
  assert.equal((await api(admin, '/api/admin/users')).body.users.length, 2);
  assert.equal((await api(admin, '/api/dashboard')).body.kpis.totalRooms, 0);
});
test('hosted school records and private files are scoped to the workspace owner', async () => {
  assert.equal((await api(student, '/api/workspaces', { beisId: '309622' })).status, 403);
  assert.equal((await api(admin, '/api/workspaces', { beisId: '309622' })).status, 201);
  await api(admin, '/api/workspaces/select', { beisId: '309622' });
  assert.equal((await api(admin, '/api/auth/me')).body.school.name, 'Camarines Norte NHS-Annex');
  const upload = await fetch(BASE + '/api/uploads', {
    method: 'POST',
    headers: { Cookie: admin, 'X-Radar-Workspace': '309622', 'Content-Type': 'image/svg+xml' },
    body: '<svg xmlns="http://www.w3.org/2000/svg"/>',
  });
  assert.equal(upload.status, 201, await upload.clone().text());
  const { url } = await upload.json();
  assert.equal((await fetch(BASE + url, { headers: { Cookie: admin } })).status, 200);
  assert.equal((await fetch(BASE + url, { headers: { Cookie: student } })).status, 403);
  assert.equal((await fetch(BASE + url)).status, 403);
  assert.equal(files.size, 1);
});
