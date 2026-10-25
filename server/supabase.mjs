import { createClient } from '@supabase/supabase-js';
import { coreDb, usesPostgres } from './db.mjs';
export const usesSupabase =
  usesPostgres &&
  (!process.env.RADAR_PGLITE_TEST_DIR ||
    (process.env.NODE_ENV === 'test' && process.env.RADAR_TEST_CLOUD_AUTH === '1'));
function client(secret = false) {
  const url = process.env.SUPABASE_URL;
  const key = secret ? process.env.SUPABASE_SERVICE_ROLE_KEY : process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key)
    throw new Error(
      secret
        ? 'Configure SUPABASE_URL and the server-only SUPABASE_SERVICE_ROLE_KEY for private uploads.'
        : 'Configure SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY for Supabase accounts.',
    );
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}
export async function cloudSignIn(email, password) {
  const { data, error } = await client().auth.signInWithPassword({ email, password });
  if (error || !data.user || !data.session) return null;
  const identity = data.user;
  const existing = await coreDb
    .prepare('SELECT * FROM users WHERE supabase_auth_id = ?')
    .get(identity.id);
  if (existing) return existing;
  // Never attach a cloud identity to an old local account merely because emails match.
  const collision = await coreDb
    .prepare('SELECT id FROM users WHERE lower(email) = ?')
    .get(identity.email.toLowerCase());
  if (collision)
    throw new Error(
      'An application profile with that email already exists. An administrator must migrate it before cloud sign-in.',
    );
  await coreDb
    .prepare(
      `INSERT INTO schools(id,name,address,lat,lng,timezone,location_verified) VALUES (1,?,?,0,0,'Asia/Manila',0) ON CONFLICT(id) DO NOTHING`,
    )
    .run('Camarines Norte School Directory', 'Camarines Norte, Philippines');
  const administrator =
    identity.email_confirmed_at &&
    process.env.RADAR_ADMIN_EMAIL &&
    identity.email.toLowerCase() === process.env.RADAR_ADMIN_EMAIL.trim().toLowerCase();
  const name = String(identity.user_metadata?.name ?? identity.email.split('@')[0]).slice(0, 120);
  await coreDb
    .prepare(
      `INSERT INTO users(email,password_hash,name,role,school_id,supabase_auth_id) VALUES (?,?,?,?,1,?) ON CONFLICT(supabase_auth_id) DO NOTHING`,
    )
    .run(
      identity.email.toLowerCase(),
      'supabase-auth',
      name,
      administrator ? 'admin' : 'student',
      identity.id,
    );
  return coreDb.prepare('SELECT * FROM users WHERE supabase_auth_id = ?').get(identity.id);
}
export async function cloudSignUp(email, password, name) {
  const options = { data: { name } };
  if (process.env.RADAR_PUBLIC_URL) options.emailRedirectTo = process.env.RADAR_PUBLIC_URL;
  const { error } = await client().auth.signUp({ email, password, options });
  if (error) throw new Error(error.message);
  return {
    message:
      'Check your email to confirm your account, then sign in. If email confirmation is disabled in your project, you can sign in now.',
  };
}
const BUCKET = process.env.SUPABASE_STORAGE_BUCKET ?? 'radar-uploads';
let bucketReady;
async function storageClient() {
  const service = client(true);
  if (!bucketReady)
    bucketReady = (async () => {
      const { data, error } = await service.storage.getBucket(BUCKET);
      if (data) {
        if (data.public) throw new Error('The RADAR uploads bucket must be private.');
        return;
      }
      if (error && !['404', '400'].includes(String(error.statusCode)))
        throw new Error('Cannot access the RADAR private uploads bucket.');
      const created = await service.storage.createBucket(BUCKET, {
        public: false,
        fileSizeLimit: 10 * 1024 * 1024,
      });
      if (created.error && !/already exists/i.test(created.error.message))
        throw new Error('Cannot create the RADAR private uploads bucket.');
    })().catch((error) => {
      bucketReady = undefined;
      throw error;
    });
  await bucketReady;
  return service;
}
export async function cloudUpload(workspaceId, name, buffer, contentType) {
  const service = await storageClient();
  const key = `${workspaceId ? `schools/${workspaceId}` : 'original'}/${name}`;
  const { error } = await service.storage
    .from(BUCKET)
    .upload(key, buffer, { contentType, upsert: false });
  if (error) throw new Error('The upload could not be saved to Supabase Storage.');
}
export async function cloudDownload(workspaceId, name) {
  const service = await storageClient();
  const key = `${workspaceId ? `schools/${workspaceId}` : 'original'}/${name}`;
  const { data, error } = await service.storage.from(BUCKET).download(key);
  if (error) return null;
  return { buffer: Buffer.from(await data.arrayBuffer()), type: data.type };
}

export async function cloudRequestPasswordReset(email) {
  const { error } = await client().auth.resetPasswordForEmail(email, {
    redirectTo: new URL(
      '/reset-password',
      process.env.RADAR_PUBLIC_URL ?? 'http://localhost:5173',
    ).toString(),
  });
  if (error) throw new Error('The password reset email could not be requested. Try again later.');
}
export async function cloudUpdatePassword(accessToken, password) {
  const response = await fetch(new URL('/auth/v1/user', process.env.SUPABASE_URL), {
    method: 'PUT',
    headers: {
      apikey: process.env.SUPABASE_PUBLISHABLE_KEY,
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ password }),
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok)
    throw new Error(
      'This recovery link is invalid or expired. Request a new password reset email.',
    );
}
