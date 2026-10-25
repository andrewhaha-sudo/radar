import crypto from 'node:crypto';
export function authorizedCron(header, secret = process.env.CRON_SECRET) {
  if (!secret || typeof header !== 'string') return false;
  const actual = Buffer.from(header),
    expected = Buffer.from(`Bearer ${secret}`);
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}
export async function maintainSelected(req) {
  const { getUserFromRequest } = await import('./auth.mjs');
  const { workspaceAccess, runInWorkspace } = await import('./workspaces.mjs');
  const { maintenanceTick } = await import('./api.mjs');
  const account = await getUserFromRequest(req);
  if (!account) return;
  if (account.workspaceId) {
    if (await workspaceAccess(account.workspaceId, account.id))
      await runInWorkspace(account.workspaceId, maintenanceTick);
  } else await maintenanceTick();
}
export async function maintainBatch() {
  const { coreDb, nowIso } = await import('./db.mjs');
  const { runInWorkspace } = await import('./workspaces.mjs');
  const { maintenanceTick } = await import('./api.mjs');
  const stored = await coreDb
    .prepare("SELECT value FROM school_settings WHERE key='maintenance_cursor'")
    .get();
  const after = stored ? JSON.parse(stored.value) : '';
  const rows = await coreDb
    .prepare('SELECT beis_id FROM school_workspaces WHERE beis_id>? ORDER BY beis_id LIMIT 3')
    .all(after);
  await maintenanceTick();
  const results = [];
  for (const row of rows) {
    try {
      await runInWorkspace(row.beis_id, maintenanceTick);
      results.push({ school: row.beis_id, ok: true });
    } catch {
      results.push({ school: row.beis_id, ok: false });
    }
  }
  await coreDb
    .prepare(
      "INSERT INTO school_settings(key,value,updated_at) VALUES ('maintenance_cursor',?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at",
    )
    .run(JSON.stringify(rows.length < 3 ? '' : rows.at(-1).beis_id), nowIso());
  return {
    processed: results,
    note: 'Bounded maintenance batch. Scheduled delivery requires an appropriate scheduler cadence and successful provider requests.',
  };
}
