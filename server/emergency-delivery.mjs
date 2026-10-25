import { db, nowIso } from './db.mjs';
import { sendConsentSms } from './delivery.mjs';
export async function queueSosSms(incidentId) {
  const row = await db
    .prepare("SELECT value FROM school_settings WHERE key='delivery_policy'")
    .get();
  if (!row || !JSON.parse(row.value).sosSms || process.env.RADAR_TEST_LAB === '1') return;
  const users = await db
    .prepare(
      "SELECT id FROM users WHERE active=1 AND role IN ('admin','responder') AND sms_consent=1",
    )
    .all();
  for (const user of users)
    await db
      .prepare(
        "INSERT INTO emergency_sms_jobs(incident_id,user_id,state,updated_at) VALUES (?,?,'pending',?) ON CONFLICT(incident_id,user_id) DO NOTHING",
      )
      .run(incidentId, user.id, nowIso());
}
export async function drainSosSms() {
  if (process.env.RADAR_TEST_LAB === '1') return;
  const policy = await db
    .prepare("SELECT value FROM school_settings WHERE key='delivery_policy'")
    .get();
  if (!policy || !JSON.parse(policy.value).sosSms) {
    await db
      .prepare("UPDATE emergency_sms_jobs SET state='cancelled',updated_at=? WHERE state='pending'")
      .run(nowIso());
    return;
  }
  const jobs = await db
    .prepare("SELECT * FROM emergency_sms_jobs WHERE state='pending' ORDER BY id LIMIT 5")
    .all();
  for (const job of jobs) {
    const claimed = await db
      .prepare(
        "UPDATE emergency_sms_jobs SET state='processing',updated_at=? WHERE id=? AND state='pending' RETURNING id",
      )
      .get(nowIso(), job.id);
    if (!claimed) continue;
    const recipient = await db
      .prepare('SELECT active,role,sms_consent FROM users WHERE id=?')
      .get(job.user_id);
    if (
      !recipient?.active ||
      !recipient.sms_consent ||
      !['admin', 'responder'].includes(recipient.role)
    ) {
      await db
        .prepare("UPDATE emergency_sms_jobs SET state='cancelled',updated_at=? WHERE id=?")
        .run(nowIso(), job.id);
      continue;
    }
    const incident = await db
      .prepare('SELECT ref,status FROM incidents WHERE id=?')
      .get(job.incident_id);
    try {
      if (incident && incident.status !== 'closed')
        await sendConsentSms(
          job.user_id,
          `RADAR school SOS ${incident.ref}. Open your authorized school response workspace. Sender location and conditions require verification.`,
          null,
        );
      await db
        .prepare("UPDATE emergency_sms_jobs SET state='processed',updated_at=? WHERE id=?")
        .run(nowIso(), job.id);
    } catch {
      await db
        .prepare("UPDATE emergency_sms_jobs SET state='failed',updated_at=? WHERE id=?")
        .run(nowIso(), job.id);
    }
  }
}
