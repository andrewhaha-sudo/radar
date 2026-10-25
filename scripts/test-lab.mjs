import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'radar-training-'));
const port = process.env.RADAR_LAB_PORT ?? '8799';
const variables = {
  ...process.env,
  NODE_ENV: 'production',
  HOST: '127.0.0.1',
  PORT: port,
  RADAR_DATABASE_DRIVER: 'sqlite',
  RADAR_DB_DIR: directory,
  RADAR_UPLOAD_DIR: path.join(directory, 'uploads'),
  RADAR_TEST_LAB: '1',
  RADAR_ALLOW_LOCAL_SIGNUP: 'true',
  RADAR_PUBLIC_URL: `http://localhost:${port}`,
  VERCEL: '',
};
for (const key of Object.keys(variables))
  if (
    key.startsWith('SUPABASE_') ||
    key.startsWith('RADAR_TWILIO_') ||
    key.startsWith('RADAR_VAPID_') ||
    key.startsWith('RADAR_TURN_') ||
    key === 'RADAR_VISION_API_KEY' ||
    key === 'CRON_SECRET'
  )
    delete variables[key];
console.log(
  'RADAR TRAINING: disposable local database. No private .env is loaded; external delivery/AI are blocked.',
);
console.log(
  'Build first with npm run build. Demo login: admin@northridge.edu / Admin#2026. These are training credentials only.',
);
const child = spawn(process.execPath, ['server/index.mjs'], {
  env: variables,
  stdio: 'inherit',
});
let stopping = false;
function stop() {
  if (stopping) return;
  stopping = true;
  child.kill('SIGTERM');
}
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
child.once('exit', (code) => {
  fs.rmSync(directory, { recursive: true, force: true });
  process.exitCode = code ?? 0;
});
