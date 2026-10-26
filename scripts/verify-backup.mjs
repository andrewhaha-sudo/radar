import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
const root = path.resolve(process.argv[2] ?? '');
if (!process.argv[2] || !fs.existsSync(path.join(root, 'manifest.json')))
  throw new Error('Usage: npm run backup:verify -- .backups/<snapshot-directory>');
let checked = 0;
function walk(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (entry.isSymbolicLink())
      throw new Error('Backup contains a symbolic link; inspect it manually.');
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) walk(file);
    else if (entry.name.endsWith('.db')) {
      const connection = new DatabaseSync(file, { readOnly: true });
      try {
        if (
          connection.prepare('PRAGMA integrity_check').get().integrity_check !== 'ok' ||
          connection.prepare('PRAGMA foreign_key_check').all().length
        )
          throw new Error('SQLite integrity or foreign-key check failed.');
        checked++;
      } finally {
        connection.close();
      }
    }
  }
}
walk(root);
if (!checked) throw new Error('No SQLite database snapshots found.');
console.log(
  `PASS: ${checked} local database snapshots passed integrity and foreign-key checks. This does not replace a separate application restore drill or hosted database/Storage restore.`,
);
