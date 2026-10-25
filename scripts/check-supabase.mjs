import { createClient } from '@supabase/supabase-js';
import { postgresPool } from '../server/postgres.mjs';
const names = [
  'SUPABASE_URL',
  'SUPABASE_PUBLISHABLE_KEY',
  'SUPABASE_DB_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
  'RADAR_ADMIN_EMAIL',
];
const missing = names.filter((name) => !process.env[name]);
if (missing.length) {
  console.error(
    `Missing server settings: ${missing.join(', ')}. Add them to .env; do not share private values in chat.`,
  );
  process.exitCode = 1;
} else {
  let pool;
  try {
    const response = await fetch(new URL('/auth/v1/settings', process.env.SUPABASE_URL), {
      headers: { apikey: process.env.SUPABASE_PUBLISHABLE_KEY },
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok)
      throw new Error(
        `Supabase Auth settings request returned HTTP ${response.status}. Check the project URL and publishable key.`,
      );
    console.log('PASS: Supabase Auth public connection');
    pool = postgresPool();
    await pool.query('SELECT 1');
    console.log('PASS: PostgreSQL connection with TLS verification');
    const service = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { error } = await service.storage.listBuckets();
    if (error)
      throw new Error('Supabase Storage authentication failed. Check the server-only storage key.');
    console.log('PASS: Supabase Storage server authentication');
    console.log(
      'Connection checks passed. Start RADAR and register/sign in to verify real account and school workflows.',
    );
  } catch (error) {
    console.error(`Connection check failed: ${error.message}`);
    process.exitCode = 1;
  } finally {
    if (pool) await pool.end();
  }
}
