import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawn, spawnSync } from 'node:child_process';
import { parseEnv } from 'node:util';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import { PostgresDatabase } from '../server/postgres.mjs';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
test('setup wizard keeps credentials private, preserves settings and creates a protected backup', async () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'radar-setup-'));
  try {
    assert.equal(spawnSync('git', ['init', '--quiet'], { cwd: temp }).status, 0);
    fs.writeFileSync(path.join(temp, '.gitignore'), '.env\n.env.*\n');
    fs.writeFileSync(path.join(temp, 'package.json'), '{}');
    fs.copyFileSync(path.join(ROOT, '.env.example'), path.join(temp, '.env.example'));
    fs.writeFileSync(path.join(temp, '.env'), 'UNRELATED_SETTING=preserved\n');
    const db = 'postgresql://postgres.project:fake-test-password@localhost:5432/postgres';
    const key = 'fake-test-server-secret';
    const child = spawn(process.execPath, [path.join(ROOT, 'scripts/setup-supabase.mjs')], {
      cwd: temp,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let output = '',
      stage = 0;
    child.stdout.on('data', (c) => {
      output += c;
      if (stage === 0 && output.includes('including your database password)')) {
        stage = 1;
        child.stdin.write(db + '\n');
      } else if (stage === 1 && output.includes('Server-only service_role')) {
        stage = 2;
        child.stdin.write(key + '\n');
      } else if (stage === 2 && output.includes('Your administrator account email')) {
        stage = 3;
        child.stdin.write('owner@example.test\n');
      }
    });
    child.stderr.on('data', (c) => {
      output += c;
    });
    const code = await new Promise((r) => child.once('exit', r));
    assert.equal(code, 0, output);
    assert.equal(stage, 3);
    const values = parseEnv(fs.readFileSync(path.join(temp, '.env'), 'utf8'));
    assert.equal(values.SUPABASE_DB_URL, db);
    assert.equal(values.SUPABASE_SERVICE_ROLE_KEY, key);
    assert.equal(values.UNRELATED_SETTING, 'preserved');
    assert.equal(values.RADAR_DATABASE_DRIVER, 'postgres');
    assert.ok(!output.includes(db));
    assert.ok(!output.includes(key));
    assert.equal(fs.statSync(path.join(temp, '.env')).mode & 0o777, 0o600);
    assert.equal(fs.readdirSync(temp).filter((f) => f.startsWith('.env.backup-')).length, 1);
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
});
test('PostgreSQL app schemas deny untrusted roles even when tables contain data', async () => {
  const pg = new PGlite();
  const db = new PostgresDatabase('radar_main', pg);
  try {
    await db.initializeNamespace();
    await db.exec(
      'CREATE TABLE schools (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL)',
    );
    await db.prepare('INSERT INTO schools(name) VALUES (?)').run('Private school');
    await db.protectTables();
    const flags = await pg.query(
      "SELECT relrowsecurity FROM pg_class WHERE oid='radar_main.schools'::regclass",
    );
    assert.equal(flags.rows[0].relrowsecurity, true);
    await pg.exec('CREATE ROLE radar_untrusted; SET ROLE radar_untrusted;');
    await assert.rejects(() => pg.query('SELECT * FROM radar_main.schools'), /permission denied/);
    await pg.exec('RESET ROLE');
  } finally {
    await pg.close();
  }
});
