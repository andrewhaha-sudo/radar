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
    'Configure optional RADAR providers locally. Secret inputs are hidden. Enter keeps a saved value; CLEAR removes it. Nothing is activated until you restart or redeploy.',
  );
  const fields = [
    ['RADAR_VISION_API_KEY', 'Vision API key', true],
    ['RADAR_VISION_MODEL', 'Vision model', false],
    ['RADAR_VAPID_PUBLIC_KEY', 'Push VAPID public key', true],
    ['RADAR_VAPID_PRIVATE_KEY', 'Push VAPID private key', true],
    ['RADAR_VAPID_SUBJECT', 'VAPID contact subject (mailto: or HTTPS)', false],
    ['RADAR_TWILIO_SID', 'Twilio account SID', true],
    ['RADAR_TWILIO_TOKEN', 'Twilio auth token', true],
    ['RADAR_TWILIO_FROM', 'Twilio sender E.164 phone', true],
    ['CRON_SECRET', 'Scheduler bearer secret', true],
    ['RADAR_PUBLIC_URL', 'Public app origin (HTTPS for deployment)', false],
  ];
  let text = original;
  for (const [name, label, hidden] of fields) {
    const answer = await ask(name, label, hidden);
    if (!answer) continue;
    const value = answer === 'CLEAR' ? '' : answer;
    if (/[\r\n]/.test(value)) throw new Error('Settings must be single-line values.');
    if (name === 'RADAR_PUBLIC_URL' && value) {
      const parsed = new URL(value);
      if (
        !['https:', 'http:'].includes(parsed.protocol) ||
        parsed.username ||
        parsed.password ||
        parsed.pathname !== '/' ||
        parsed.search ||
        (parsed.protocol === 'http:' &&
          !['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname))
      )
        throw new Error('Use only your app origin, without credentials or a path.');
    }
    const line = name + '=' + JSON.stringify(value);
    const expression = new RegExp('^' + name + '=.*$', 'm');
    text = expression.test(text)
      ? text.replace(expression, () => line)
      : text + (text.endsWith('\n') || !text ? '' : '\n') + line + '\n';
  }
  if (original) {
    const backup = target + '.backup-' + Date.now();
    fs.copyFileSync(target, backup);
    fs.chmodSync(backup, 0o600);
  }
  const temporary = target + '.tmp-' + Date.now();
  fs.writeFileSync(temporary, text, { mode: 0o600 });
  fs.renameSync(temporary, target);
  fs.chmodSync(target, 0o600);
  console.log(
    'Saved private .env settings. Run npm run config:check; use npm run config:live for read-only provider checks. Restart/redeploy before using changed settings.',
  );
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  input.close();
}
