import crypto from 'node:crypto';
export function channelStatus() {
  return {
    push: {
      configured: Boolean(
        process.env.RADAR_VAPID_PUBLIC_KEY &&
          process.env.RADAR_VAPID_PRIVATE_KEY &&
          process.env.RADAR_VAPID_SUBJECT,
      ),
      publicKey: process.env.RADAR_VAPID_PUBLIC_KEY ?? null,
    },
    sms: {
      configured: Boolean(
        process.env.RADAR_TWILIO_SID &&
          process.env.RADAR_TWILIO_TOKEN &&
          process.env.RADAR_TWILIO_FROM,
      ),
    },
    note: 'Configured is not proof of delivery. Accepted or queued messages are distinct from provider-confirmed delivery.',
  };
}
export function validPush(subscription) {
  try {
    const url = new URL(subscription.endpoint);
    const host = url.hostname;
    return (
      url.protocol === 'https:' &&
      !url.username &&
      !url.password &&
      !url.port &&
      (host === 'fcm.googleapis.com' ||
        host.endsWith('.push.services.mozilla.com') ||
        host === 'updates.push.services.mozilla.com' ||
        host.endsWith('.push.apple.com') ||
        host.endsWith('.notify.windows.com')) &&
      Buffer.from(subscription.keys?.auth ?? '', 'base64url').length === 16 &&
      Buffer.from(subscription.keys?.p256dh ?? '', 'base64url').length === 65
    );
  } catch {
    return false;
  }
}
export function verifySmsSignature(url, params, signature, token = process.env.RADAR_TWILIO_TOKEN) {
  if (!token || !signature) return false;
  const text =
    url +
    [...params.keys()]
      .sort()
      .map((key) => key + params.get(key))
      .join('');
  const expected = crypto.createHmac('sha1', token).update(text).digest('base64');
  const a = Buffer.from(expected),
    b = Buffer.from(signature);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
