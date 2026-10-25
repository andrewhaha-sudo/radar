import { waitUntil } from '@vercel/functions';
import { authorizedCron } from '../server/serverless-maintenance.mjs';
// Vercel function adapter. Persistent records and files must use Supabase;
// never initialize a disposable SQLite school inside a serverless function.
export const config = { maxDuration: 300 };
let application;
export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'private, no-store');
  if (
    process.env.RADAR_DATABASE_DRIVER !== 'postgres' ||
    !process.env.SUPABASE_DB_URL ||
    !process.env.SUPABASE_SERVICE_ROLE_KEY ||
    !process.env.SUPABASE_URL ||
    !process.env.SUPABASE_PUBLISHABLE_KEY
  ) {
    res.statusCode = 503;
    res.setHeader('Content-Type', 'application/json');
    res.end(
      JSON.stringify({
        error:
          'Cloud setup is incomplete. Add the required Supabase server environment variables in Vercel and redeploy. See docs/VERCEL.md.',
        code: 'CLOUD_SETUP_REQUIRED',
      }),
    );
    return;
  }
  try {
    const url = new URL(req.url, 'https://radar.invalid');
    const routed = url.searchParams.get('radarPath');
    if (routed) {
      if (!routed.startsWith('/api/') && !routed.startsWith('/uploads/')) {
        res.statusCode = 400;
        return res.end('Invalid request route.');
      }
      url.searchParams.delete('radarPath');
      req.url = routed + (url.searchParams.size ? '?' + url.searchParams.toString() : '');
    }
    if (new URL(req.url, 'https://radar.invalid').pathname === '/api/internal/maintenance') {
      if (!authorizedCron(req.headers.authorization)) {
        res.statusCode = 403;
        res.setHeader('Content-Type', 'application/json');
        return res.end(JSON.stringify({ error: 'Scheduler authorization required.' }));
      }
      const { maintainBatch } = await import('../server/serverless-maintenance.mjs');
      res.setHeader('Content-Type', 'application/json');
      return res.end(JSON.stringify(await maintainBatch()));
    }
    application ??= import('../server/http.mjs').catch((error) => {
      application = undefined;
      throw error;
    });
    const { handleRequest } = await application;
    await handleRequest(req, res);
    if (
      process.env.VERCEL &&
      res.statusCode < 400 &&
      /^\/api\/(alerts|notifications)(?:[/?]|$)/.test(req.url)
    ) {
      waitUntil(
        import('../server/serverless-maintenance.mjs')
          .then((m) => m.maintainSelected(req))
          .catch(() =>
            console.error('[radar] Background maintenance failed; inspect queued jobs.'),
          ),
      );
    }
  } catch {
    if (res.writableEnded) return;
    if (res.headersSent) return res.end();
    res.statusCode = 503;
    res.setHeader('Content-Type', 'application/json');
    res.end(
      JSON.stringify({
        error:
          'The cloud backend is not ready. Check the database connection, project configuration and server logs.',
        code: 'CLOUD_BACKEND_UNAVAILABLE',
      }),
    );
  }
}
