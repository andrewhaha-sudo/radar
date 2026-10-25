import crypto from 'node:crypto';
const count = Number(process.argv[2]);
if (!Number.isInteger(count) || count < 0 || count > 100000)
  throw new Error('Usage: npm run device:send -- <aggregate-count> [--dry-run]');
const base = new URL(process.env.RADAR_PUBLIC_URL ?? 'http://localhost:8799');
if (base.protocol !== 'https:' && !['localhost', '127.0.0.1', '[::1]'].includes(base.hostname))
  throw new Error('Use HTTPS for a deployed device endpoint.');
const id = Number(process.env.RADAR_DEVICE_ID);
if (!Number.isInteger(id) || id < 1)
  throw new Error('Set RADAR_DEVICE_ID for the registered device.');
const body = {
  deviceId: id,
  count,
  observedAt: new Date().toISOString(),
  nonce: crypto.randomUUID(),
};
if (process.argv.includes('--dry-run'))
  console.log('Dry run only: payload validated; no reading sent.');
else {
  if (!process.env.RADAR_DEVICE_TOKEN)
    throw new Error(
      'Set the private device-only RADAR_DEVICE_TOKEN. Never put it in the command line or chat.',
    );
  const response = await fetch(new URL('/api/device/occupancy', base), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.RADAR_DEVICE_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15000),
    redirect: 'error',
  });
  if (!response.ok)
    throw new Error(
      `Count upload returned HTTP ${response.status}; inspect authorization, timestamp, nonce and device state.`,
    );
  console.log(
    'Count received by RADAR. Physical sensor accuracy still requires on-site verification.',
  );
}
