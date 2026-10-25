import { channelStatus, validPush } from './delivery-utils.mjs';
export { channelStatus, validPush, verifySmsSignature } from './delivery-utils.mjs';
import webpush from 'web-push';
import { db, currentDatabaseContext, nowIso } from './db.mjs';
async function record(channel, userId, alertId, state, detail) {
  await db
    .prepare(
      'INSERT INTO outbound_deliveries(channel,user_id,alert_id,state,detail,created_at) VALUES (?,?,?,?,?,?)',
    )
    .run(channel, userId, alertId, state, String(detail).slice(0, 500), nowIso());
}
export async function deliverAlert(alert, recipient) {
  if ((await db.prepare('SELECT active FROM users WHERE id=?').get(recipient.id))?.active === 0)
    return;
  const config = channelStatus();
  if (alert.send_push) {
    const subscriptions = await db
      .prepare('SELECT * FROM push_subscriptions WHERE user_id=?')
      .all(recipient.id);
    if (!config.push.configured)
      await record('push', recipient.id, alert.id, 'not_configured', 'VAPID settings are missing.');
    else
      for (const row of subscriptions) {
        try {
          const subscription = JSON.parse(row.subscription);
          if (!validPush(subscription)) throw new Error('Unsupported push destination.');
          webpush.setVapidDetails(
            process.env.RADAR_VAPID_SUBJECT,
            process.env.RADAR_VAPID_PUBLIC_KEY,
            process.env.RADAR_VAPID_PRIVATE_KEY,
          );
          const result = await webpush.sendNotification(
            subscription,
            JSON.stringify({
              title: 'RADAR school announcement',
              body: 'Open RADAR and select your school to read its announcement.',
              url: '/alerts',
              tag: `radar-${currentDatabaseContext()?.workspaceId ?? 'original'}-${alert.id}`,
            }),
            { TTL: 3600, timeout: 15000 },
          );
          await record(
            'push',
            recipient.id,
            alert.id,
            'accepted',
            `Push service accepted HTTP ${result.statusCode}; display/read is not confirmed.`,
          );
        } catch (error) {
          if ([404, 410].includes(error.statusCode))
            await db.prepare('DELETE FROM push_subscriptions WHERE id=?').run(row.id);
          await record(
            'push',
            recipient.id,
            alert.id,
            'failed',
            error.statusCode ? `Push service HTTP ${error.statusCode}` : 'Push request failed.',
          );
        }
      }
  }
  if (alert.send_sms) {
    const user = await db
      .prepare('SELECT phone,sms_consent FROM users WHERE id=?')
      .get(recipient.id);
    if (!user?.sms_consent) return;
    if (!config.sms.configured) {
      await record(
        'sms',
        recipient.id,
        alert.id,
        'not_configured',
        'SMS provider settings are missing.',
      );
      return;
    }
    if (!/^\+[1-9]\d{7,14}$/.test(user.phone ?? '')) {
      await record(
        'sms',
        recipient.id,
        alert.id,
        'failed',
        'A valid consented E.164 phone number is required.',
      );
      return;
    }
    try {
      const form = new URLSearchParams({
        To: user.phone,
        From: process.env.RADAR_TWILIO_FROM,
        Body: `RADAR: ${alert.title}. Open your school workspace for the official announcement. In immediate danger contact local emergency services.`,
      });
      if (process.env.RADAR_PUBLIC_URL?.startsWith('https://'))
        form.set(
          'StatusCallback',
          `${process.env.RADAR_PUBLIC_URL.replace(/\/$/, '')}/api/notifications/sms-status?scope=${currentDatabaseContext()?.workspaceId ?? ''}`,
        );
      const response = await fetch(
        `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(process.env.RADAR_TWILIO_SID)}/Messages.json`,
        {
          method: 'POST',
          headers: {
            Authorization: `Basic ${Buffer.from(`${process.env.RADAR_TWILIO_SID}:${process.env.RADAR_TWILIO_TOKEN}`).toString('base64')}`,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: form,
          signal: AbortSignal.timeout(15000),
        },
      );
      if (!response.ok) throw new Error(`SMS service HTTP ${response.status}`);
      const result = await response.json();
      await record(
        'sms',
        recipient.id,
        alert.id,
        'accepted',
        `sid:${result.sid}; provider ${result.status ?? 'accepted'}; device delivery is not yet confirmed.`,
      );
    } catch {
      await record(
        'sms',
        recipient.id,
        alert.id,
        'failed',
        'SMS service did not confirm acceptance. Use your school emergency contact procedure.',
      );
    }
  }
}

export async function queueAlertDelivery(alert, userId) {
  if (!alert.send_push && !alert.send_sms) return;
  await db
    .prepare(
      "INSERT INTO delivery_jobs(alert_id,user_id,state,updated_at) VALUES (?,?,'pending',?) ON CONFLICT(alert_id,user_id) DO NOTHING",
    )
    .run(alert.id, userId, nowIso());
}
export async function drainDeliveryJobs() {
  let processed = 0;
  const jobs = await db
    .prepare("SELECT * FROM delivery_jobs WHERE state='pending' ORDER BY id LIMIT 10")
    .all();
  for (const job of jobs) {
    const claimed = await db
      .prepare(
        "UPDATE delivery_jobs SET state='processing',updated_at=? WHERE id=? AND state='pending' RETURNING id",
      )
      .get(nowIso(), job.id);
    if (!claimed) continue;
    try {
      const alert = await db.prepare('SELECT * FROM alerts WHERE id=?').get(job.alert_id);
      if (alert) {
        const prior = await db
          .prepare(
            "SELECT channel FROM outbound_deliveries WHERE alert_id=? AND user_id=? AND state IN ('accepted','sent','delivered')",
          )
          .all(alert.id, job.user_id);
        if (prior.some((p) => p.channel === 'sms')) alert.send_sms = 0;
        if (prior.some((p) => p.channel === 'push')) alert.send_push = 0;
        await deliverAlert(alert, { id: job.user_id });
      }
      await db
        .prepare("UPDATE delivery_jobs SET state='processed',updated_at=? WHERE id=?")
        .run(nowIso(), job.id);
      processed++;
    } catch {
      await db
        .prepare("UPDATE delivery_jobs SET state='failed',updated_at=? WHERE id=?")
        .run(nowIso(), job.id);
    }
  }
  return processed;
}
