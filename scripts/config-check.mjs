import {
  selectedVisionModel,
  visionFailure,
  visionProvider,
  listGeminiModels,
} from '../server/vision-provider.mjs';
const groups = {
  Supabase: [
    'SUPABASE_URL',
    'SUPABASE_PUBLISHABLE_KEY',
    'SUPABASE_DB_URL',
    'SUPABASE_SERVICE_ROLE_KEY',
    'RADAR_ADMIN_EMAIL',
  ],
  Vision: [visionProvider() === 'gemini' ? 'RADAR_GEMINI_API_KEY' : 'RADAR_VISION_API_KEY'],
  Push: ['RADAR_VAPID_PUBLIC_KEY', 'RADAR_VAPID_PRIVATE_KEY', 'RADAR_VAPID_SUBJECT'],
  SMS: ['RADAR_TWILIO_SID', 'RADAR_TWILIO_TOKEN', 'RADAR_TWILIO_FROM'],
  Scheduler: ['CRON_SECRET', 'RADAR_PUBLIC_URL'],
};
console.log('Configuration presence report (secret values are never printed).');
console.log(`Selected vision provider: ${visionProvider()}; model: ${selectedVisionModel()}`);
if (process.argv.includes('--list-models')) {
  try {
    const models = await listGeminiModels();
    console.log(
      'Models available to this API key with generateContent support (not a guarantee of image/schema support or free quota):',
    );
    for (const model of models) console.log(model);
    if (!models.length) process.exitCode = 1;
  } catch (error) {
    console.log(error.message);
    process.exitCode = 1;
  }
} else {
  for (const [group, names] of Object.entries(groups).filter(
    ([name]) => !process.argv.includes('--vision') || name === 'Vision',
  ))
    console.log(
      `${group}: ${names.filter((name) => !process.env[name]).length ? 'missing ' + names.filter((name) => !process.env[name]).join(', ') : 'settings present; live verification still required'}`,
    );
  if (process.argv.includes('--live')) {
    let blocked = false;
    for (const [name, key, url, headers] of [
      [
        'Vision',
        visionProvider() === 'gemini' ? 'RADAR_GEMINI_API_KEY' : 'RADAR_VISION_API_KEY',
        visionProvider() === 'gemini'
          ? `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(selectedVisionModel())}`
          : `https://api.openai.com/v1/models/${encodeURIComponent(selectedVisionModel())}`,
        () =>
          visionProvider() === 'gemini'
            ? { 'x-goog-api-key': process.env.RADAR_GEMINI_API_KEY }
            : { Authorization: `Bearer ${process.env.RADAR_VISION_API_KEY}` },
      ],
      [
        'SMS',
        'RADAR_TWILIO_TOKEN',
        `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(process.env.RADAR_TWILIO_SID ?? '')}.json`,
        () => ({
          Authorization: `Basic ${Buffer.from(`${process.env.RADAR_TWILIO_SID}:${process.env.RADAR_TWILIO_TOKEN}`).toString('base64')}`,
        }),
      ],
    ]) {
      if (process.argv.includes('--vision') && name !== 'Vision') continue;
      if (!process.env[key]) {
        console.log(`${name}: live check BLOCKED (missing configuration)`);
        blocked = true;
        continue;
      }
      try {
        const response = await fetch(url, {
          headers: headers(),
          signal: AbortSignal.timeout(15000),
          redirect: 'error',
        });
        console.log(
          `${name}: read-only provider check HTTP ${response.status}; this is not message delivery or photo analysis.`,
        );
        if (name === 'Vision' && response.ok && visionProvider() === 'gemini') {
          const metadata = await response.json();
          if (!Array.isArray(metadata.supportedGenerationMethods) || !metadata.supportedGenerationMethods.includes('generateContent')) {
            console.log(
              'FAIL: model metadata is accessible, but generateContent is not supported. Run npm run list:vision-models and select a supported image-capable model.',
            );
            blocked = true;
          } else
            console.log(
              'Model advertises generateContent support. This still does not prove image analysis; compare this model with the running app’s provider/model and restart old servers.',
            );
        }
        if (!response.ok) {
          if (name === 'Vision') console.log((await visionFailure(response)).message);
          blocked = true;
        }
      } catch {
        console.log(
          `${name}: live connection failed; no credentials or provider response body logged.`,
        );
        blocked = true;
      }
    }
    if (blocked) process.exitCode = 1;
  }
}
