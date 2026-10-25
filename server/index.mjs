import http from 'node:http';
import { handleRequest } from './http.mjs';
import { maintenanceTick } from './api.mjs';
import { coreDb } from './db.mjs';
import { runInWorkspace } from './workspaces.mjs';
import './seed.mjs';
const PORT = Number(process.env.PORT ?? 8787),
  HOST = process.env.HOST ?? '127.0.0.1';
const server = http.createServer(handleRequest);
server.listen(PORT, HOST, () => {
  console.log(`[radar] API server listening on http://${HOST}:${PORT}`);
});

let maintaining = false;
const maintenance = setInterval(async () => {
  if (maintaining) return;
  maintaining = true;
  try {
    await maintenanceTick();
    const workspaces = await coreDb.prepare('SELECT beis_id FROM school_workspaces').all();
    for (const row of workspaces) await runInWorkspace(row.beis_id, maintenanceTick);
  } catch (error) {
    console.error('[radar] Scheduled maintenance failed:', error.message);
  } finally {
    maintaining = false;
  }
}, 60000);
maintenance.unref();
