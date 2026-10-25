import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { handleApi } from './api.mjs';
import { workspaceRecord, workspaceUploads } from './workspaces.mjs';
import { getUserFromRequest } from './auth.mjs';
import { UPLOAD_DIR } from './db.mjs';
import './seed.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT ?? 8787);
const HOST = process.env.HOST ?? '127.0.0.1';
const DIST_DIR = path.resolve(__dirname, '..', 'dist');
const isDev = process.env.NODE_ENV !== 'production';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
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
  return resolved.startsWith(root) ? resolved : null;
}

// Reject cross-site state-changing requests (defence in depth alongside SameSite cookies).
function checkOrigin(req) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return true;
  const origin = req.headers.origin;
  if (!origin) return true; // non-browser clients (curl/tests)
  try {
    const originUrl = new URL(origin);
    const host = req.headers.host;
    return originUrl.host === host || originUrl.hostname === 'localhost' || originUrl.hostname === '127.0.0.1';
  } catch {
    return false;
  }
}

const server = http.createServer(async (req, res) => {
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
    return handleApi(req, res);
  }

  if (url.pathname === '/uploads' || url.pathname.startsWith('/uploads/')) {
    let uploadRoot = UPLOAD_DIR;
    let uploadPath = url.pathname.replace(/^\/uploads/, '');
    const workspaceMatch = /^\/uploads\/workspaces\/(\d{6})\/([^/]+)$/.exec(url.pathname);
    if (url.pathname.startsWith('/uploads/workspaces/')) {
      const user = getUserFromRequest(req);
      const record = workspaceMatch && workspaceRecord(workspaceMatch[1]);
      if (!user || !record || record.owner_user_id !== user.id) {
        res.writeHead(403); return res.end('School workspace access denied.');
      }
      uploadRoot = workspaceUploads(workspaceMatch[1]);
      uploadPath = '/' + workspaceMatch[2];
    }
    const filePath = safeJoin(uploadRoot, uploadPath);
    if (!filePath || !fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      return res.end('Not found');
    }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, {
      'Content-Type': MIME[ext] ?? 'application/octet-stream',
      'Cache-Control': workspaceMatch ? 'private, no-store' : 'public, max-age=31536000, immutable',
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
    const cache = requested.startsWith('/assets/') ? 'public, max-age=31536000, immutable' : 'no-cache';
    return serveFile(res, filePath, cache);
  }

  // SPA fallback
  return serveFile(res, path.join(DIST_DIR, 'index.html'), 'no-cache');
});

server.listen(PORT, HOST, () => {
  console.log(`[radar] API server listening on http://${HOST}:${PORT}`);
});
