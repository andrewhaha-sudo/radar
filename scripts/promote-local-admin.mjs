// Operator-only local development utility. Public registration never grants admin.
if (process.env.RADAR_DATABASE_DRIVER === 'postgres')
  throw new Error(
    'Hosted mode uses a confirmed Supabase account and RADAR_ADMIN_EMAIL. This local utility does not change hosted roles.',
  );
const email = String(process.argv[2] ?? '')
  .trim()
  .toLowerCase();
if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
  throw new Error('Usage: npm run admin:local -- your-existing-account@gmail.com');
const { coreDb, nowIso } = await import('../server/db.mjs');
const account = await coreDb.prepare('SELECT id,email FROM users WHERE lower(email)=?').get(email);
if (!account)
  throw new Error(
    'Register this email in the local app first. This command does not create an account or password.',
  );
await coreDb.prepare("UPDATE users SET role='admin',active=1 WHERE id=?").run(account.id);
await coreDb
  .prepare(
    'INSERT INTO audit_log(actor_id,action,entity,entity_id,meta,created_at) VALUES (?,?,?,?,?,?)',
  )
  .run(
    null,
    'operator.local_admin',
    'user',
    String(account.id),
    JSON.stringify({ source: 'local server terminal' }),
    nowIso(),
  );
console.log(
  'Local administrator role saved. Sign out and sign back in with your existing email and password. School ownership and private workspace membership stay separate.',
);
