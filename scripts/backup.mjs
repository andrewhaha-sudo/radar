import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { DatabaseSync, backup } from 'node:sqlite';
if ((process.env.RADAR_DATABASE_DRIVER ?? 'sqlite') !== 'sqlite')
  throw new Error(
    'Hosted mode: use Supabase database backups/PITR and separately back up the private Storage bucket. See docs/RADAR-2-FEATURES.md.',
  );
const source = path.resolve(process.env.RADAR_DB_DIR ?? 'server/data');
const destination = path.resolve(
  '.backups',
  new Date().toISOString().replaceAll(':', '-') + '-' + crypto.randomBytes(3).toString('hex'),
);
if (!fs.existsSync(source)) throw new Error('No local data directory exists.');
fs.mkdirSync(destination, { recursive: true, mode: 0o700 });
const manifest = [];
async function copy(directory, relative = '') {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (entry.isSymbolicLink()) continue;
    const original = path.join(directory, entry.name),
      rel = path.join(relative, entry.name),
      target = path.join(destination, 'data', rel);
    if (entry.isDirectory()) {
      await copy(original, rel);
      continue;
    }
    if (!entry.isFile() || /-wal$|-shm$/.test(entry.name)) continue;
    fs.mkdirSync(path.dirname(target), { recursive: true, mode: 0o700 });
    if (entry.name.endsWith('.db')) {
      const db = new DatabaseSync(original, { readOnly: true });
      try {
        await backup(db, target);
      } finally {
        db.close();
      }
    } else fs.copyFileSync(original, target);
    fs.chmodSync(target, 0o600);
    manifest.push(rel);
  }
}
await copy(source);
// Default-workspace uploads live outside the DB directory. School uploads are
// already copied from data/workspaces. .env/private provider keys are excluded.
if (fs.existsSync('server/uploads'))
  fs.cpSync('server/uploads', path.join(destination, 'original-uploads'), {
    recursive: true,
    filter: (p) => !fs.lstatSync(p).isSymbolicLink(),
  });
fs.writeFileSync(
  path.join(destination, 'manifest.json'),
  JSON.stringify(
    {
      createdAt: new Date().toISOString(),
      files: manifest,
      note: 'Per-database consistent SQLite snapshots. Stop writes for an application-wide consistent restore point. Contains private school data; encrypt, restrict access and apply retention policy.',
    },
    null,
    2,
  ),
  { mode: 0o600 },
);
console.log(`Local backup saved: ${destination}`);
