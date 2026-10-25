import fs from 'node:fs';
import path from 'node:path';
import { parseEnv } from 'node:util';
import { createInterface } from 'node:readline/promises';
import { Writable } from 'node:stream';
import { spawnSync } from 'node:child_process';

const target = path.resolve('.env');
if (!fs.existsSync('.env.example') || !fs.existsSync('package.json'))
  throw new Error('Run this command inside the RADAR project folder.');
if (spawnSync('git', ['ls-files', '--error-unmatch', '.env'], { stdio: 'ignore' }).status === 0)
  throw new Error(
    '.env is tracked by Git. Remove it from tracking before entering private credentials.',
  );
if (spawnSync('git', ['check-ignore', '--quiet', '.env'], { stdio: 'ignore' }).status !== 0)
  throw new Error('.env must be ignored by Git before private credentials are saved.');
const original = fs.existsSync(target) ? fs.readFileSync(target, 'utf8') : '';
const current = parseEnv(original);
const defaults = parseEnv(fs.readFileSync('.env.example', 'utf8'));
let muted = false;
const output = new Writable({
  write(chunk, encoding, done) {
    if (!muted) process.stdout.write(chunk, encoding);
    done();
  },
});
const input = createInterface({
  input: process.stdin,
  output,
  terminal: process.stdin.isTTY,
  historySize: 0,
});
async function ask(name, label, hidden = false) {
  process.stdout.write(`${label}${current[name] ? ' (Enter keeps the saved setting)' : ''}: `);
  muted = hidden;
  try {
    const answer = await input.question('');
    return answer.trim() || current[name] || '';
  } finally {
    muted = false;
    if (hidden) process.stdout.write('\n');
  }
}
try {
  console.log(
    'Connect RADAR to Supabase. Private inputs are hidden and saved only in the Git-ignored .env file.',
  );
  const database = await ask(
    'SUPABASE_DB_URL',
    'Session pooler PostgreSQL URI (including your database password)',
    true,
  );
  let url;
  try {
    url = new URL(database);
  } catch {
    throw new Error('Enter a valid PostgreSQL URI from Supabase → Connect → Session pooler.');
  }
  if (!['postgres:', 'postgresql:'].includes(url.protocol) || !url.password)
    throw new Error('The PostgreSQL URI must include its database password.');
  if (url.port === '6543')
    throw new Error(
      'Choose Session pooler on port 5432 rather than Transaction pooler on port 6543.',
    );
  const storageKey = await ask(
    'SUPABASE_SERVICE_ROLE_KEY',
    'Server-only service_role or secret key',
    true,
  );
  if (!storageKey || storageKey.startsWith('sb_publishable_'))
    throw new Error(
      'A server-only storage key is required; the publishable key cannot replace it.',
    );
  const email = await ask('RADAR_ADMIN_EMAIL', 'Your administrator account email');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    throw new Error('Enter the real email you will confirm and use for your first RADAR sign-in.');
  const updates = {
    RADAR_DATABASE_DRIVER: 'postgres',
    SUPABASE_URL: current.SUPABASE_URL || defaults.SUPABASE_URL,
    SUPABASE_PUBLISHABLE_KEY: current.SUPABASE_PUBLISHABLE_KEY || defaults.SUPABASE_PUBLISHABLE_KEY,
    SUPABASE_DB_URL: database,
    SUPABASE_SERVICE_ROLE_KEY: storageKey,
    SUPABASE_STORAGE_BUCKET: current.SUPABASE_STORAGE_BUCKET || defaults.SUPABASE_STORAGE_BUCKET,
    RADAR_ADMIN_EMAIL: email,
    RADAR_PUBLIC_URL: current.RADAR_PUBLIC_URL || defaults.RADAR_PUBLIC_URL,
  };
  let text = original;
  for (const [name, value] of Object.entries(updates)) {
    const line = `${name}=${JSON.stringify(value)}`;
    const pattern = new RegExp(`^(?:export\\s+)?${name}\\s*=.*$`, 'gm');
    if (pattern.test(text)) text = text.replace(pattern, () => line);
    else text += `${text.endsWith('\n') || !text ? '' : '\n'}${line}\n`;
  }
  if (original) {
    const backup = target + `.backup-${Date.now()}`;
    fs.copyFileSync(target, backup);
    fs.chmodSync(backup, 0o600);
    console.log('The previous .env was backed up in a Git-ignored .env.backup file.');
  }
  fs.writeFileSync(target, text, { mode: 0o600 });
  fs.chmodSync(target, 0o600);
  console.log('Saved .env. No credentials were committed or sent to chat.');
  console.log('Next: npm run check:supabase, then restart npm run dev.');
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  input.close();
}
