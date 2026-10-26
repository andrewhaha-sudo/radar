import { db, nowIso } from './db.mjs';
import { audit } from './auth.mjs';
async function once(key, callback) {
  const result = await db
    .prepare(
      'INSERT INTO school_settings(key,value,updated_at) VALUES (?,?,?) ON CONFLICT(key) DO NOTHING',
    )
    .run(key, '{}', nowIso());
  if (!result.changes) return 0;
  try {
    await callback();
    return 1;
  } catch (error) {
    await db.prepare('DELETE FROM school_settings WHERE key=?').run(key);
    throw error;
  }
}
async function notify(ids, title, body, href) {
  for (const id of new Set(ids))
    await db
      .prepare(
        'INSERT INTO notifications(user_id,type,title,body,href,created_at) VALUES (?,?,?,?,?,?)',
      )
      .run(id, 'warning', title, body, href, nowIso());
}
export async function inspectionReminders() {
  await db
    .prepare(
      "DELETE FROM location_reports WHERE expires_at<=? OR incident_id IN (SELECT id FROM incidents WHERE status='closed')",
    )
    .run(nowIso());
  await db.prepare("DELETE FROM foreground_sessions WHERE ends_at<=? OR incident_id IN (SELECT id FROM incidents WHERE status='closed')").run(nowIso());
  await db.prepare('DELETE FROM room_counts WHERE observed_at<?').run(new Date(Date.now()-30*86400000).toISOString());
  let sent = 0;
  const reviewers = (
    await db.prepare("SELECT id FROM users WHERE role IN ('admin','inspector')").all()
  ).map((u) => u.id);
  const due = await db
    .prepare(
      'SELECT s.*,r.name,r.code FROM inspection_schedules s JOIN rooms r ON r.id=s.room_id WHERE s.next_due_at <= ?',
    )
    .all(nowIso());
  for (const row of due)
    sent += await once(`reminder:inspection:${row.id}:${row.next_due_at}`, () =>
      notify(
        row.reviewer_id ? [row.reviewer_id] : reviewers,
        'Room inspection overdue',
        `${row.code} ${row.name} was scheduled for ${row.next_due_at}. Review the inspection plan.`,
        `/operations?tab=rooms&roomId=${row.room_id}`,
      ),
    );
  const resources = await db
    .prepare(
      'SELECT * FROM safety_equipment WHERE quantity <= low_stock_threshold OR status != ? OR (expires_at IS NOT NULL AND expires_at <= ?)',
    )
    .all('ok', nowIso());
  for (const row of resources)
    sent += await once(
      `reminder:resource:${row.id}:${row.quantity}:${row.status}:${row.expires_at ?? ''}`,
      () =>
        notify(
          reviewers,
          'Resource needs attention',
          `${row.label}: stock ${row.quantity}, status ${row.status}. Check the equipment register.`,
          '/resources',
        ),
    );
  const people = await db
    .prepare(
      "SELECT p.*,c.teacher_id FROM rollcall_people p JOIN rollcall_classes c ON c.id=p.class_id WHERE p.status IN ('not_checked','unaccounted')",
    )
    .all();
  const config = await db
    .prepare("SELECT value FROM school_settings WHERE key='rollcall_followup_minutes'")
    .get();
  const minutes = config ? JSON.parse(config.value) : 30;
  for (const row of people)
    if (Date.now() - Date.parse(row.updated_at) >= minutes * 60000)
      sent += await once(`reminder:attendance:${row.id}:${row.updated_at}`, () =>
        notify(
          row.teacher_id ? [row.teacher_id] : reviewers,
          'Check-in follow-up needed',
          'A student in an assigned class has not been accounted for. Follow up; this does not establish that the student is trapped.',
          '/operations?tab=rollcall',
        ),
      );
  const repairs = await db
    .prepare(
      "SELECT * FROM corrective_actions WHERE status!='done' AND due_at IS NOT NULL AND due_at < ?",
    )
    .all(nowIso());
  for (const row of repairs)
    sent += await once(`reminder:repair:${row.id}:${row.due_at}`, () =>
      notify(
        row.owner_id ? [row.owner_id] : reviewers,
        'Corrective action overdue',
        'A recorded hazard correction deadline has passed. Review the assigned task.',
        `/hazards?open=${row.hazard_id}`,
      ),
    );
  if (sent) await audit(null, 'reminders.run', 'school', 1, { sent });
  return sent;
}
