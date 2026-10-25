import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BASE = 'http://127.0.0.1:8900';
const A = '309622', B = '112082';
let child, dataDir, admin, teacher, secondAdmin;
async function request(cookie, route, { workspace, method = 'GET', body, headers = {} } = {}) {
  const response = await fetch(BASE + route, { method, headers: { ...(cookie ? { Cookie: cookie } : {}), ...(workspace !== undefined ? { 'X-Radar-Workspace': workspace ?? '' } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}), ...headers }, body: body ? JSON.stringify(body) : undefined });
  const raw = await response.text();
  let payload; try { payload = JSON.parse(raw); } catch { payload = raw; }
  return {status: response.status, body: payload};
}
async function login(email, password) {
  const res = await fetch(BASE + '/api/auth/login', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email,password})});
  assert.equal(res.status,200);
  return res.headers.getSetCookie().map(c=>c.split(';')[0]).join('; ');
}
async function select(cookie, beisId) {
  const result = await request(cookie,'/api/workspaces/select',{method:'POST',body:{beisId}});
  assert.equal(result.status,200,JSON.stringify(result.body));
}
async function startServer() {
  child = spawn(process.execPath,['server/index.mjs'],{cwd:ROOT,env:{...process.env, RADAR_VISION_API_KEY:'',RADAR_USGS_FEED_ENABLED:'false',RADAR_VAPID_PUBLIC_KEY:'',RADAR_VAPID_PRIVATE_KEY:'',RADAR_TWILIO_SID:'',RADAR_TWILIO_TOKEN:'',RADAR_DATABASE_DRIVER:'sqlite',RADAR_PGLITE_TEST_DIR:'',RADAR_TEST_CLOUD_AUTH:'0',PORT:'8900',HOST:'127.0.0.1',RADAR_DB_DIR:dataDir,NODE_ENV:'development'},stdio:['ignore','pipe','pipe']});
  let output=''; child.stdout.on('data',c=>{output+=c}); child.stderr.on('data',c=>{output+=c});
  const deadline=Date.now()+20000;
  while(Date.now()<deadline && !output.includes('listening on') && child.exitCode===null) await new Promise(r=>setTimeout(r,100));
  assert.match(output,/listening on/,output);
}
before(async () => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(),'radar-workspaces-'));
  await startServer();
  admin=await login('admin@northridge.edu','Admin#2026');
  teacher=await login('teacher@northridge.edu','Teach#2026');
  // A distinct administrator must not inherit ownership of another administrator's workspace.
  const db=new DatabaseSync(path.join(dataDir,'radar.db'));
  db.prepare("INSERT INTO users(email,password_hash,name,role,school_id) SELECT 'other-admin@example.test',password_hash,'Other admin','admin',school_id FROM users WHERE role='admin' LIMIT 1").run(); db.close();
  secondAdmin=await login('other-admin@example.test','Admin#2026');
});
after(async()=>{
  if(child?.exitCode===null){child.kill('SIGTERM');await new Promise(resolve=>child.once('exit',resolve));}
  if(dataDir) fs.rmSync(dataDir,{recursive:true,force:true});
});

test('workspace creation validates school IDs, requires administrator access, and is idempotent',async()=>{
  assert.equal((await request(null,'/api/workspaces',{method:'POST',body:{beisId:A}})).status,401);
  assert.equal((await request(teacher,'/api/workspaces',{method:'POST',body:{beisId:A}})).status,403);
  assert.equal((await request(admin,'/api/workspaces',{method:'POST',body:{beisId:'../../bad'}})).status,400);
  assert.equal((await request(admin,'/api/workspaces',{method:'POST',body:{beisId:A}})).status,201);
  assert.equal((await request(admin,'/api/workspaces',{method:'POST',body:{beisId:A}})).status,200);
  assert.equal((await request(secondAdmin,'/api/workspaces',{method:'POST',body:{beisId:A}})).status,403);
  assert.equal((await request(secondAdmin,'/api/workspaces/select',{method:'POST',body:{beisId:A}})).status,403);
  assert.equal((await request(teacher,'/api/workspaces/select',{method:'POST',body:{beisId:A}})).status,403);
  assert.deepEqual((await request(teacher,'/api/workspaces')).body.workspaces,[]);
});
test('a selected school has an empty dashboard with no inherited demo records or fabricated location',async()=>{
  await select(admin,A);
  const me=await request(admin,'/api/auth/me');
  assert.equal(me.body.activeWorkspaceId,A); assert.equal(me.body.school.name,'Camarines Norte NHS-Annex');
  assert.equal(me.body.school.timezone,'Asia/Manila'); assert.equal(me.body.school.lat,null); assert.equal(me.body.school.lng,null);
  const dashboard=await request(admin,'/api/dashboard',{workspace:A});
  assert.equal(dashboard.status,200); assert.equal(dashboard.body.kpis.totalRooms,0); assert.equal(dashboard.body.kpis.activeIncidents,0); assert.equal(dashboard.body.kpis.activeAlertCount,0);
  const map=await request(admin,'/api/map',{workspace:A});
  for(const key of ['buildings','hazards','equipment','assemblyPoints','routes']) assert.deepEqual(map.body[key],[]);
  assert.deepEqual((await request(admin,'/api/alerts',{workspace:A})).body.items,[]);
  assert.equal((await request(admin,'/api/rooms/1',{workspace:A})).status,404);
  const users=await request(admin,'/api/admin/users',{workspace:A}); assert.equal(users.body.users.length,1);
  assert.equal((await request(admin,'/api/admin/audit',{workspace:A})).body.entries[0].action,'workspace.create');
});
test('administrators can add real buildings, floors and rooms with validated input and duplicate protection',async()=>{
  assert.equal((await request(admin,'/api/buildings',{workspace:A,method:'POST',body:{name:'Test',code:'T',lat:'',lng:122}})).status,400);
  const building=await request(admin,'/api/buildings',{workspace:A,method:'POST',body:{name:'Test building A',code:'A',lat:14.12,lng:122.95}});
  assert.equal(building.status,201); const buildingId=building.body.building.id;
  assert.equal((await request(admin,'/api/buildings',{workspace:A,method:'POST',body:{name:'Duplicate',code:'a',lat:14,lng:122}})).status,409);
  const floor=await request(admin,`/api/buildings/${buildingId}/floors`,{workspace:A,method:'POST',body:{name:'Ground',level:1}});
  assert.equal(floor.status,201);
  const room=await request(admin,`/api/floors/${floor.body.floor.id}/rooms`,{workspace:A,method:'POST',body:{name:'Test room A',code:'101',capacity:30}});
  assert.equal(room.status,201);
  const dashboard=await request(admin,'/api/dashboard',{workspace:A});assert.equal(dashboard.body.kpis.totalRooms,1);
  const me=await request(admin,'/api/auth/me');assert.equal(me.body.school.locationVerified,true);assert.equal(me.body.school.lat,14.12);
});
test('switching schools isolates records and rejects stale tab writes and export links',async()=>{
  await request(admin,'/api/workspaces',{method:'POST',body:{beisId:B}});await select(admin,B);
  assert.equal((await request(admin,'/api/dashboard',{workspace:B})).body.kpis.totalRooms,0);
  assert.equal((await request(admin,'/api/buildings/1',{workspace:B})).status,404);
  const stale=await request(admin,'/api/buildings',{workspace:A,method:'POST',body:{name:'Wrong school',code:'BAD',lat:14,lng:122}});assert.equal(stale.status,409);
  assert.equal((await request(admin,'/api/dashboard',{workspace:A})).status,409);
  assert.equal((await request(admin,`/api/analytics/export?dataset=hazards&workspace=${A}`)).status,409);
  assert.equal((await request(admin,'/api/buildings',{method:'POST',body:{name:'No scope',code:'BAD',lat:14,lng:122}})).status,409);
  await select(admin,A);assert.equal((await request(admin,'/api/dashboard',{workspace:A})).body.kpis.totalRooms,1);
  await select(admin,null);assert.ok((await request(admin,'/api/dashboard',{workspace:null})).body.kpis.totalRooms>1);
});
test('parallel sessions stay scoped independently and workspace file access requires ownership',async()=>{
  const cookie2=await login('admin@northridge.edu','Admin#2026');await select(admin,A);await select(cookie2,B);
  const [a,b]=await Promise.all([request(admin,'/api/buildings',{workspace:A}),request(cookie2,'/api/buildings',{workspace:B})]);
  assert.equal(a.body.buildings.length,1);assert.equal(b.body.buildings.length,0);
  const upload=await fetch(BASE+'/api/uploads',{method:'POST',headers:{Cookie:admin,'X-Radar-Workspace':A,'Content-Type':'image/svg+xml'},body:'<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"/>'});
  assert.equal(upload.status,201);const {url}=await upload.json();assert.ok(url.startsWith(`/uploads/workspaces/${A}/`));
  assert.equal((await fetch(BASE+url,{headers:{Cookie:admin}})).status,200);
  assert.equal((await fetch(BASE+url,{headers:{Cookie:teacher}})).status,403);
  assert.equal((await fetch(BASE+url)).status,403);
  const hazard = await request(cookie2,'/api/hazards',{workspace:B,method:'POST',body:{title:'School B finding',severity:'low',locationNote:'Unmapped site'}});
  assert.equal(hazard.status,201);
  assert.equal((await request(cookie2,`/api/hazards/${hazard.body.hazard.id}/evidence`,{workspace:B,method:'POST',body:{url}})).status,400);
  await select(admin,null);
});

test('workspace sessions and saved campus records survive a server restart', async () => {
  await select(admin, A);
  child.kill('SIGTERM');
  await new Promise(resolve => child.once('exit', resolve));
  await startServer();
  const me = await request(admin, '/api/auth/me');
  assert.equal(me.status, 200);
  assert.equal(me.body.activeWorkspaceId, A);
  assert.equal((await request(admin, '/api/dashboard', {workspace:A})).body.kpis.totalRooms, 1);
  await select(admin, null);
});
