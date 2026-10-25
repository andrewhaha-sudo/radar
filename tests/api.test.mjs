/**
 * API integration tests for RADAR.
 *
 * These run against a real, isolated temporary SQLite database and the real HTTP
 * server. They cover the safety-critical boundaries: authentication, server-side
 * role permissions, alert publishing, and the honesty of unconfigured integrations.
 *
 * Run with: npm test
 */

import test, { after, before, describe } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const PORT = 8899;
const BASE = `http://127.0.0.1:${PORT}`;

let child;
let dataDir;

function parseCookies(response) {
  const raw = response.headers.getSetCookie?.() ?? [];
  return raw.map((cookie) => cookie.split(';')[0]).join('; ');
}

async function login(email, password) {
  const response = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  assert.equal(response.status, 200, `login failed for ${email}`);
  const cookie = parseCookies(response);
  assert.match(cookie, /radar_session=/);
  return { cookie, payload: await response.json() };
}

async function api(cookie, pathname, options = {}) {
  const response = await fetch(`${BASE}${pathname}`, {
    ...options,
    headers: {
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(cookie ? { Cookie: cookie } : {}),
      ...(options.headers ?? {}),
    },
  });
  const text = await response.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  return { status: response.status, body };
}

before(async () => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'radar-test-'));
  child = spawn(process.execPath, ['server/index.mjs'], {
    cwd: ROOT,
    env: {
      ...process.env,
      RADAR_VISION_API_KEY: '',
      RADAR_USGS_FEED_ENABLED: 'false',
      RADAR_VAPID_PUBLIC_KEY: '',
      RADAR_VAPID_PRIVATE_KEY: '',
      RADAR_TWILIO_SID: '',
      RADAR_TWILIO_TOKEN: '',
      RADAR_DATABASE_DRIVER: 'sqlite',
      RADAR_PGLITE_TEST_DIR: '',
      RADAR_TEST_CLOUD_AUTH: '0',
      PORT: String(PORT),
      HOST: '127.0.0.1',
      RADAR_DB_DIR: dataDir,
      NODE_ENV: 'development',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let output = '';
  child.stdout.on('data', (chunk) => {
    output += String(chunk);
  });
  child.stderr.on('data', (chunk) => {
    output += String(chunk);
  });

  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    if (output.includes('listening on')) return;
    if (child.exitCode !== null) break;
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw new Error(`Test server did not start.\n${output}`);
});

after(async () => {
  if (child && child.exitCode === null) {
    child.kill('SIGTERM');
    await new Promise((resolve) => {
      const timer = setTimeout(resolve, 3000);
      child.once('exit', () => {
        clearTimeout(timer);
        resolve();
      });
    });
  }
  if (dataDir) fs.rmSync(dataDir, { recursive: true, force: true });
});

describe('authentication', () => {
  test('unauthenticated reads are rejected', async () => {
    const { status } = await api(null, '/api/dashboard');
    assert.equal(status, 401);
  });

  test('seeded accounts can sign in and receive a session', async () => {
    const { payload } = await login('student@northridge.edu', 'Student#2026');
    assert.equal(payload.user.role, 'student');
  });
});

describe('server-side role permissions', () => {
  test('a student can read the alert and evacuation boards but not recovery or analytics', async () => {
    const { cookie } = await login('student@northridge.edu', 'Student#2026');

    for (const pathname of [
      '/api/alerts',
      '/api/advisories',
      '/api/evacuation',
      '/api/resources',
    ]) {
      const { status } = await api(cookie, pathname);
      assert.equal(status, 200, `${pathname} should be readable by students`);
    }

    for (const pathname of ['/api/recovery', '/api/analytics', '/api/safety/status']) {
      const { status, body } = await api(cookie, pathname);
      assert.equal(status, 403, `${pathname} must be forbidden for students`);
      assert.match(body.error, /role does not allow/i);
    }

    const exported = await api(cookie, '/api/analytics/export?dataset=rollcall');
    assert.equal(exported.status, 403, 'CSV export must enforce permissions too');
  });

  test('administrators can read recovery and analytics', async () => {
    const { cookie } = await login('admin@northridge.edu', 'Admin#2026');
    for (const pathname of ['/api/recovery', '/api/analytics?days=90', '/api/safety/status']) {
      const { status } = await api(cookie, pathname);
      assert.equal(status, 200, `${pathname} should be readable by administrators`);
    }
  });
});

describe('alert publishing', () => {
  test('published alerts validate input, appear in the active list, and are audited', async () => {
    const { cookie } = await login('admin@northridge.edu', 'Admin#2026');

    const invalid = await api(cookie, '/api/alerts', {
      method: 'POST',
      body: JSON.stringify({ level: 'purple', title: 'Invalid level' }),
    });
    assert.equal(invalid.status, 400, 'unknown alert levels must be rejected');

    const created = await api(cookie, '/api/alerts', {
      method: 'POST',
      body: JSON.stringify({
        level: 'yellow',
        kind: 'announcement',
        title: 'Automated test advisory',
        body: 'Created by the integration test suite.',
        audience: 'school',
      }),
    });
    assert.equal(created.status, 201);
    assert.equal(created.body.alert.level, 'yellow');

    const list = await api(cookie, '/api/alerts');
    assert.equal(list.status, 200);
    assert.ok(
      list.body.items.some((alert) => alert.id === created.body.alert.id),
      'the new alert must be returned by the alerts board',
    );

    const archived = await api(cookie, `/api/alerts/${created.body.alert.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ archived: true }),
    });
    assert.equal(archived.status, 200);
    assert.ok(archived.body.alert.archivedAt, 'archiving must record a timestamp');

    const afterArchive = await api(cookie, '/api/alerts');
    const archivedItem = afterArchive.body.items.find(
      (alert) => alert.id === created.body.alert.id,
    );
    assert.equal(archivedItem.state, 'archived', 'archived alerts must keep an archived state');
    assert.ok(
      !afterArchive.body.active.some((alert) => alert.id === created.body.alert.id),
      'archived alerts must not appear in the active list',
    );
    assert.ok(afterArchive.body.counts.archived >= 1, 'archived alerts must be counted separately');

    const audit = await api(cookie, '/api/admin/audit?pageSize=50');
    assert.equal(audit.status, 200);
    assert.ok(
      audit.body.entries.some((entry) => entry.action === 'alert.publish'),
      'publishing an alert must be written to the audit log',
    );
  });

  test('students cannot publish alerts', async () => {
    const { cookie } = await login('student@northridge.edu', 'Student#2026');
    const attempt = await api(cookie, '/api/alerts', {
      method: 'POST',
      body: JSON.stringify({ level: 'red', title: 'Unauthorized alert' }),
    });
    assert.equal(attempt.status, 403);
  });

  test('audience targeting is enforced on the server', async () => {
    const admin = await login('admin@northridge.edu', 'Admin#2026');
    const created = await api(admin.cookie, '/api/alerts', {
      method: 'POST',
      body: JSON.stringify({
        level: 'yellow',
        kind: 'announcement',
        title: 'Students-only test notice',
        body: 'This notice must not be returned to teachers.',
        audience: 'students',
      }),
    });
    assert.equal(created.status, 201);
    const alertId = created.body.alert.id;

    const student = await login('student@northridge.edu', 'Student#2026');
    const teacher = await login('teacher@northridge.edu', 'Teach#2026');

    const studentList = await api(student.cookie, '/api/alerts');
    assert.ok(
      studentList.body.items.some((alert) => alert.id === alertId),
      'students must see a students-only notice',
    );

    const teacherList = await api(teacher.cookie, '/api/alerts');
    assert.ok(
      !teacherList.body.items.some((alert) => alert.id === alertId),
      'teachers must not see a students-only notice',
    );

    const studentDashboard = await api(student.cookie, '/api/dashboard');
    assert.equal(studentDashboard.body.kpis.alertTitle, 'Students-only test notice');
    const teacherDashboard = await api(teacher.cookie, '/api/dashboard');
    assert.notEqual(teacherDashboard.body.kpis.alertTitle, 'Students-only test notice');

    await api(admin.cookie, `/api/alerts/${alertId}`, {
      method: 'PATCH',
      body: JSON.stringify({ archived: true }),
    });
  });
});

describe('official advisories', () => {
  test('freshness is derived from publication and validity time, not hard-coded', async () => {
    const { cookie } = await login('admin@northridge.edu', 'Admin#2026');
    const publishedAt = new Date(Date.now() - 30 * 60 * 60 * 1000).toISOString();

    const created = await api(cookie, '/api/advisories', {
      method: 'POST',
      body: JSON.stringify({
        category: 'earthquake',
        title: 'Integration test advisory',
        summary: 'Recorded by the test suite to check freshness handling.',
        sourceName: 'Test bulletin',
        publishedAt,
        severity: 'info',
      }),
    });
    assert.equal(created.status, 201);
    assert.equal(created.body.advisory.freshness, 'stale');

    const list = await api(cookie, '/api/advisories');
    const item = list.body.items.find((advisory) => advisory.id === created.body.advisory.id);
    assert.equal(item.freshness, 'stale', 'older advisories must be labelled stale');
    assert.ok(list.body.counts.stale >= 1);

    const archived = await api(cookie, `/api/advisories/${created.body.advisory.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ status: 'archived' }),
    });
    assert.equal(archived.status, 200);
    assert.equal(archived.body.advisory.freshness, 'archived');
  });
});

describe('honest integration status', () => {
  test('AI and live disaster feeds report unconfigured rather than simulated', async () => {
    const { cookie } = await login('admin@northridge.edu', 'Admin#2026');

    const ai = await api(cookie, '/api/ai/status');
    assert.equal(ai.status, 200);
    assert.equal(ai.body.configured, false);

    const feeds = await api(cookie, '/api/feeds/status');
    assert.equal(feeds.status, 200);
    assert.equal(feeds.body.liveFeeds, false);
    assert.ok(feeds.body.connectors.length > 0);
    assert.ok(feeds.body.connectors.every((connector) => connector.configured === false));
  });
});
