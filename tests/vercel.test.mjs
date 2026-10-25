import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { authorizedCron } from '../server/serverless-maintenance.mjs';
const children = [];
let temporary;
async function start(port, configured) {
  const code = `import http from 'node:http';import handler from './api/index.mjs';http.createServer(async(req,res)=>{if(req.headers['x-test-parsed-body']==='1'){const parts=[];for await(const part of req)parts.push(part);req.body=JSON.parse(Buffer.concat(parts).toString());}await handler(req,res);}).listen(${port},'127.0.0.1',()=>console.log('fixture ready'));`;
  const child = spawn(process.execPath, ['--input-type=module', '-e', code], {
    cwd: path.resolve(import.meta.dirname, '..'),
    env: {
      ...process.env,
      NODE_ENV: 'test',
      RADAR_DATABASE_DRIVER: configured ? 'postgres' : 'sqlite',
      RADAR_DB_DIR: path.join(temporary, String(port)),
      RADAR_PGLITE_TEST_DIR: configured ? path.join(temporary, 'pg') : '',
      RADAR_TEST_CLOUD_AUTH: '0',
      SUPABASE_DB_URL: configured ? 'postgresql://fake:fake@localhost/fixture' : '',
      SUPABASE_URL: configured ? 'https://fixture.supabase.co' : '',
      SUPABASE_SERVICE_ROLE_KEY: configured ? 'fake-test-only' : '',
      SUPABASE_PUBLISHABLE_KEY: configured ? 'fake-test-public' : '',
      VERCEL: '',
      CRON_SECRET: 'test-scheduler-secret',
      RADAR_VISION_API_KEY: '',
      RADAR_TWILIO_SID: '',
      RADAR_TWILIO_TOKEN: '',
      RADAR_VAPID_PRIVATE_KEY: '',
      RADAR_VAPID_PUBLIC_KEY: '',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  children.push(child);
  let log = '';
  for (const stream of [child.stdout, child.stderr]) stream.on('data', (c) => (log += c));
  const until = Date.now() + 30000;
  while (Date.now() < until && !log.includes('fixture ready') && child.exitCode === null)
    await new Promise((r) => setTimeout(r, 100));
  assert.match(log, /fixture ready/, log);
}
before(async () => {
  temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'radar-vercel-'));
  await start(8925, false);
  await start(8926, true);
});
after(async () => {
  for (const child of children)
    if (child.exitCode === null && child.signalCode === null) {
      child.kill();
      await new Promise((r) => child.once('exit', r));
    }
  fs.rmSync(temporary, { recursive: true, force: true });
});
test('Vercel refuses disposable SQLite and explains missing private cloud settings', async () => {
  const response = await fetch('http://127.0.0.1:8925/api/index?radarPath=/api/health');
  assert.equal(response.status, 503);
  assert.equal((await response.json()).code, 'CLOUD_SETUP_REQUIRED');
  assert.ok(!fs.existsSync(path.join(temporary, '8925', 'radar.db')));
});
test('Vercel rewrites reach the PostgreSQL API and pre-parsed JSON does not hang', async () => {
  const health = await fetch('http://127.0.0.1:8926/api/index?radarPath=/api/health');
  assert.equal(health.status, 200, await health.clone().text());
  const body = await health.json();
  assert.equal(body.apiVersion, '2.1');
  assert.equal(body.database, 'postgres');
  const login = await fetch('http://127.0.0.1:8926/api/index?radarPath=/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Test-Parsed-Body': '1' },
    body: JSON.stringify({ email: 'nonexistent@gmail.com', password: 'irrelevant-test-password' }),
  });
  assert.equal(login.status, 401);
  const wrong = await fetch('http://127.0.0.1:8926/api/index?radarPath=/etc/passwd');
  assert.equal(wrong.status, 400);
});
test('scheduler rejects forged authorization and missing account/provider setup is never called healthy', async () => {
  assert.equal(authorizedCron('Bearer wrong', 'correct'), false);
  assert.equal(authorizedCron('Bearer correct', 'correct'), true);
  assert.equal(authorizedCron(undefined, 'correct'), false);
  assert.equal(
    (await fetch('http://127.0.0.1:8926/api/index?radarPath=/api/internal/maintenance')).status,
    403,
  );
});

test('shared authentication throttling survives a serverless instance restart', async () => {
  const target = 'http://127.0.0.1:8926/api/index?radarPath=/api/auth/login';
  const attempt = () =>
    fetch(target, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'rate.fixture@gmail.com', password: 'not-a-real-password' }),
    });
  for (let n = 0; n < 20; n++) assert.equal((await attempt()).status, 401);
  assert.equal((await attempt()).status, 429);
  const child = children.at(-1);
  child.kill('SIGTERM');
  await new Promise((r) => child.once('exit', r));
  await start(8926, true);
  assert.equal((await attempt()).status, 429);
});
