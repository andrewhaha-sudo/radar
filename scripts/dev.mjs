import { spawn } from 'node:child_process';

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

run('api', process.execPath, ['server/index.mjs']);
run('vite', process.execPath, ['node_modules/vite/bin/vite.js']);
