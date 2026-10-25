import { test } from 'node:test';
import assert from 'node:assert/strict';
import { visionModel, visionFailure } from '../server/vision-provider.mjs';
import { suggestCampusBuildings, validateVideoFrames } from '../server/campus-video.mjs';
test('vision model normalizes blank settings and rejects credentials or URLs as model IDs', () => {
  assert.equal(visionModel('  '), 'gpt-4.1-mini');
  assert.equal(visionModel(' gpt-4.1-mini '), 'gpt-4.1-mini');
  for (const value of ['https://api.openai.com', 'sk-private-test', 'sb_publishable_test'])
    assert.throws(() => visionModel(value), /model ID/);
});
test('vision errors explain model access, authentication and billing without echoing provider bodies', async () => {
  for (const [status, code, expected] of [
    [404, 'model_not_found', /cannot access/],
    [401, 'invalid_api_key', /key was rejected/],
    [429, 'insufficient_quota', /insufficient quota/],
  ]) {
    const error = await visionFailure(
      new Response(JSON.stringify({ error: { code, message: 'sensitive-private-fixture' } }), {
        status,
      }),
    );
    assert.match(error.message, expected);
    assert.ok(!error.message.includes('sensitive-private-fixture'));
  }
  assert.match(
    (await visionFailure(new Response('gateway missing', { status: 404 }))).message,
    /restart|Restart/,
  );
});
test('campus requests use explicit high image detail and accept higher-quality frames within the total JSON budget', async () => {
  const image = 'data:image/jpeg;base64,' + 'A'.repeat(290000);
  const frames = validateVideoFrames(Array.from({ length: 6 }, (_, time) => ({ time, image })));
  assert.ok(Buffer.byteLength(JSON.stringify({ frames })) < 2 * 1024 * 1024);
  assert.throws(() => validateVideoFrames([{ time: 0, image: image + 'A'.repeat(20000) }]));
  await assert.rejects(
    () =>
      suggestCampusBuildings(frames, {
        apiKey: 'test-only',
        request: async (_url, options) => {
          const payload = JSON.parse(options.body);
          assert.equal(payload.input[0].content[1].detail, 'high');
          return new Response(JSON.stringify({ error: { code: 'model_not_found' } }), {
            status: 404,
          });
        },
      }),
    /Vision model/,
  );
});
