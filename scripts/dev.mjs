import { spawn } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import { parseEnv } from 'node:util';

if (fs.existsSync('.env')) {
  for (const [name, value] of Object.entries(parseEnv(fs.readFileSync('.env', 'utf8')))) {
    if (process.env[name] === undefined) process.env[name] = value;
  }
}
async function available(port) {
  return new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.once('error', (error) => (error.code === 'EADDRINUSE' ? resolve(false) : reject(error)));
    probe.listen(port, process.env.HOST ?? '127.0.0.1', () => probe.close(() => resolve(true)));
  });
}
const requested = Number(process.env.PORT ?? 8787);
if (!Number.isInteger(requested) || requested < 1 || requested > 65535)
  throw new Error('PORT must be a valid TCP port.');
let selected = requested;
while (!(await available(selected))) {
  if (process.env.PORT || selected >= requested + 20)
    throw new Error(
      `API port ${selected} is busy. Stop the older RADAR server or choose another PORT.`,
    );
  selected += 1;
}
process.env.PORT = String(selected);
process.env.API_TARGET = `http://127.0.0.1:${selected}`;
if (selected !== requested)
  console.log(`[dev] Port ${requested} is in use; this RADAR API will use ${selected}.`);
console.log(
  '[dev] Open the Local address printed by this Vite instance; older tabs may point to an older server.',
);

const children = [];
let shuttingDown = false;

function run(name, command, args) {
  const child = spawn(command, args, {
    stdio: 'inherit',
    env: { ...process.env, FORCE_COLOR: '1' },
    shell: false,
  });
  child.on('exit', (code, signal) => {
    if (shuttingDown) return;
    console.log(`[dev] ${name} exited (code=${code ?? 'null'}, signal=${signal ?? 'none'})`);
    shutdown(code ?? 1);
  });
  children.push(child);
  return child;
}

function shutdown(code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const child of children) {
    if (!child.killed) child.kill('SIGTERM');
  }
  setTimeout(() => process.exit(code), 200);
}

process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));

const apiArgs = ['--env-file-if-exists=.env', 'server/index.mjs'];
if (process.env.RADAR_API_WATCH === 'true') apiArgs.unshift('--watch', '--watch-preserve-output');
run('api', process.execPath, apiArgs);
run('vite', process.execPath, ['node_modules/vite/bin/vite.js']);
