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

test('Gemini handles building and room analysis using its own key, native image parts and validated suggestions', async () => {
  const previous = process.env.RADAR_VISION_PROVIDER;
  const previousKey = process.env.RADAR_GEMINI_API_KEY;
  process.env.RADAR_GEMINI_API_KEY = 'gemini-test-private';
  process.env.RADAR_VISION_PROVIDER = 'gemini';
  try {
    const { analyzeVisibleHazards } = await import('../server/integrations.mjs');
    let calls = 0;
    const request = async (url, options) => {
      calls++;
      assert.match(url, /^https:\/\/generativelanguage.googleapis.com\/v1beta\/models\/gemini-/);
      assert.equal(options.headers['x-goog-api-key'], 'gemini-test-private');
      assert.equal(options.headers.Authorization, undefined);
      assert.ok(!url.includes('gemini-test-private'));
      const body = JSON.parse(options.body);
      assert.equal(body.contents[0].parts[1].inlineData.mimeType, 'image/jpeg');
      assert.ok(body.generationConfig.responseJsonSchema);
      const result =
        calls === 1
          ? { candidates: [{ frameIndex: 0, x: 0.4, y: 0.4, description: 'Visible building' }] }
          : {
              findings: [
                {
                  title: 'Visible obstruction',
                  description: 'Review exit area',
                  severity: 'medium',
                  category: 'blocked_exit',
                  confidence: 0.6,
                  imageIndex: null,
                  imagePoint: null,
                },
              ],
            };
      return new Response(
        JSON.stringify({
          candidates: [{ content: { parts: [{ text: JSON.stringify(result) }] } }],
        }),
      );
    };
    const frames = [{ time: 0, image: 'data:image/jpeg;base64,YWJj' }];
    assert.equal((await suggestCampusBuildings(frames, { request }))[0].buildingId, null);
    assert.equal(
      (
        await analyzeVisibleHazards([frames[0].image], { apiKey: 'gemini-test-private', request })
      )[0].category,
      'blocked_exit',
    );
    assert.equal(calls, 2);
    let limited = 0;
    await assert.rejects(
      () =>
        suggestCampusBuildings(frames, {
          apiKey: 'gemini-test-private',
          request: async () => {
            limited++;
            return new Response('{}', { status: 429 });
          },
        }),
      /Gemini.*429/,
    );
    assert.equal(limited, 1, 'quota failure must not trigger OpenAI fallback');
    await assert.rejects(
      () =>
        suggestCampusBuildings(frames, {
          apiKey: 'gemini-test-private',
          request: async () =>
            new Response(JSON.stringify({ promptFeedback: { blockReason: 'SAFETY' } })),
        }),
      /no usable analysis/,
    );
  } finally {
    if (previousKey === undefined) delete process.env.RADAR_GEMINI_API_KEY;
    else process.env.RADAR_GEMINI_API_KEY = previousKey;
    if (previous === undefined) delete process.env.RADAR_VISION_PROVIDER;
    else process.env.RADAR_VISION_PROVIDER = previous;
  }
});
