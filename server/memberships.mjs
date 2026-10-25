import { db, coreDb } from './db.mjs';
export async function grantSchoolMembership(scope, target, role) {
  await db
    .prepare(
      'INSERT INTO users(id,email,password_hash,name,role,title,phone,school_id,grade,section) VALUES (?,?,?,?,?,?,?,1,?,?) ON CONFLICT(id) DO UPDATE SET role=excluded.role,active=1,name=excluded.name,email=excluded.email',
    )
    .run(
      target.id,
      target.email,
      target.password_hash,
      target.name,
      role,
      target.title,
      target.phone,
      target.grade,
      target.section,
    );
  await coreDb
    .prepare(
      'INSERT INTO workspace_members(workspace_id,user_id,role,active) VALUES (?,?,?,1) ON CONFLICT(workspace_id,user_id) DO UPDATE SET role=excluded.role,active=1',
    )
    .run(scope, target.id, role);
}
