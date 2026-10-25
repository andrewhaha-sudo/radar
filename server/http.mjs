import crypto from 'node:crypto';
import { usesSupabase, cloudDownload, cloudSignedDownload } from './supabase.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { handleApi } from './api.mjs';
import { workspaceRecord, workspaceAccess, workspaceUploads } from './workspaces.mjs';
import { getUserFromRequest } from './auth.mjs';
import { UPLOAD_DIR, db } from './db.mjs';
import { runInWorkspace } from './workspaces.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIST_DIR = path.resolve(__dirname, '..', 'dist');
const isDev = process.env.NODE_ENV !== 'production';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.glb': 'model/gltf-binary',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.map': 'application/json; charset=utf-8',
};

function setSecurityHeaders(res) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'same-origin');
  res.setHeader('Permissions-Policy', 'camera=(self), geolocation=(self), microphone=()');
}

function serveFile(res, filePath, cache = 'no-cache') {
  const ext = path.extname(filePath).toLowerCase();
  const stat = fs.statSync(filePath);
  res.writeHead(200, {
    'Content-Type': MIME[ext] ?? 'application/octet-stream',
    'Content-Length': stat.size,
    'Cache-Control': cache,
  });
  fs.createReadStream(filePath).pipe(res);
}

function safeJoin(root, requestPath) {
  const decoded = decodeURIComponent(requestPath);
  const resolved = path.resolve(root, `.${decoded}`);
  return resolved === root || resolved.startsWith(root + path.sep) ? resolved : null;
}

// Reject cross-site state-changing requests (defence in depth alongside SameSite cookies).
function checkOrigin(req) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return true;
  const origin = req.headers.origin;
  if (!origin) return true; // non-browser clients (curl/tests)
  try {
    const originUrl = new URL(origin);
    const host = req.headers.host;
    return (
      originUrl.host === host ||
      originUrl.hostname === 'localhost' ||
      originUrl.hostname === '127.0.0.1'
    );
  } catch {
    return false;
  }
}

export async function handleRequest(req, res) {
  const requestId = crypto.randomUUID(),
    started = Date.now();
  res.setHeader('X-Request-ID', requestId);
  if (process.env.RADAR_STRUCTURED_LOGS === 'true')
    res.once('finish', () =>
      console.log(
        JSON.stringify({
          event: 'http',
          requestId,
          method: req.method,
          path: String(req.url).split('?')[0],
          status: res.statusCode,
          durationMs: Date.now() - started,
        }),
      ),
    );
  try {
    await dispatch(req, res);
  } catch (error) {
    console.error('[radar] HTTP request failed:', error.message);
    if (!res.headersSent) {
      res.writeHead(500, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
      res.end(JSON.stringify({ error: 'The server could not complete this request.' }));
    } else res.end();
  }
}
async function dispatch(req, res) {
  setSecurityHeaders(res);

  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': req.headers.origin ?? '*',
      'Access-Control-Allow-Credentials': 'true',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Allow-Methods': 'GET,POST,PATCH,DELETE,OPTIONS',
    });
    return res.end();
  }

  if (!checkOrigin(req)) {
    res.writeHead(403, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ error: 'Cross-origin request rejected.' }));
  }

  const url = new URL(req.url, `http://${req.headers.host ?? 'localhost'}`);

  if (url.pathname.startsWith('/api/')) {
    return await handleApi(req, res);
  }

  if (url.pathname === '/uploads' || url.pathname.startsWith('/uploads/')) {
    let uploadRoot = UPLOAD_DIR;
    let uploadPath = url.pathname.replace(/^\/uploads/, '');
    const workspaceMatch = /^\/uploads\/workspaces\/(\d{6})\/([^/]+)$/.exec(url.pathname);
    if (url.pathname.startsWith('/uploads/workspaces/')) {
      const user = await getUserFromRequest(req);
      const record = workspaceMatch && (await workspaceRecord(workspaceMatch[1]));
      if (!user || !record || !(await workspaceAccess(workspaceMatch[1], user.id))) {
        res.writeHead(403);
        return res.end('School workspace access denied.');
      }
      uploadRoot = workspaceUploads(workspaceMatch[1]);
      uploadPath = '/' + workspaceMatch[2];
    }
    if (usesSupabase) {
      const user = await getUserFromRequest(req);
      if (!user || (!workspaceMatch && user.workspaceId)) {
        res.writeHead(403);
        return res.end('Sign in to the correct school workspace.');
      }
      const name = workspaceMatch ? workspaceMatch[2] : uploadPath.slice(1);
      if (!/^[A-Za-z0-9_.-]+$/.test(name)) {
        res.writeHead(404);
        return res.end('Not found');
      }
      try {
        if (name.startsWith('direct-')) {
          const ready = async () =>
            await db
              .prepare("SELECT id FROM upload_receipts WHERE name=? AND state='complete'")
              .get(name);
          if (!(workspaceMatch ? await runInWorkspace(workspaceMatch[1], ready) : await ready())) {
            res.writeHead(404);
            return res.end('File is not ready.');
          }
        }
        if (process.env.VERCEL) {
          res.writeHead(302, {
            Location: await cloudSignedDownload(workspaceMatch?.[1], name),
            'Cache-Control': 'private, no-store',
          });
          return res.end();
        }
        const file = await cloudDownload(workspaceMatch?.[1], name);
        if (!file) {
          res.writeHead(404);
          return res.end('Not found');
        }
        res.writeHead(200, {
          'Content-Type': file.type || 'application/octet-stream',
          'Cache-Control': 'private, no-store',
          'Content-Security-Policy':
            "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'",
        });
        return res.end(file.buffer);
      } catch {
        res.writeHead(502);
        return res.end('Cloud file storage is unavailable.');
      }
    }
    if (!workspaceMatch) {
      const user = await getUserFromRequest(req);
      if (!user || user.workspaceId) {
        res.writeHead(403);
        return res.end('Sign in to the correct school workspace.');
      }
    }
    const filePath = safeJoin(uploadRoot, uploadPath);
    if (!filePath || !fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      return res.end('Not found');
    }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, {
      'Content-Type': MIME[ext] ?? 'application/octet-stream',
      'Cache-Control': 'private, no-store',
      'Content-Security-Policy': "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'",
    });
    return fs.createReadStream(filePath).pipe(res);
  }

  // In development Vite serves the SPA; the API server only answers /api and /uploads.
  if (isDev) {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    return res.end('RADAR API server. The UI is served by Vite on port 5173.');
  }

  if (!fs.existsSync(DIST_DIR)) {
    res.writeHead(500, { 'Content-Type': 'text/plain' });
    return res.end('Production build not found. Run `npm run build` first.');
  }

  const requested = url.pathname === '/' ? '/index.html' : url.pathname;
  const filePath = safeJoin(DIST_DIR, requested);
  if (filePath && fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
    const cache = requested.startsWith('/assets/')
      ? 'public, max-age=31536000, immutable'
      : 'no-cache';
    return serveFile(res, filePath, cache);
  }

  // SPA fallback
  return serveFile(res, path.join(DIST_DIR, 'index.html'), 'no-cache');
}
