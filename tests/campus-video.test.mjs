import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateVideoFrames, suggestCampusBuildings } from '../server/campus-video.mjs';
const frames = [{ time: 2, image: 'data:image/jpeg;base64,YWJj' }];
test('video frames are bounded and AI building candidates have valid image positions, without claimed identities', async () => {
  assert.throws(() => validateVideoFrames(Array(7).fill(frames[0])));
  assert.throws(() => validateVideoFrames([{ time: 2, image: 'https://private.example/image' }]));
  assert.throws(() => validateVideoFrames([{ ...frames[0], time: NaN }]));
  const request = async () =>
    new Response(
      JSON.stringify({
        output_text: JSON.stringify({
          candidates: [{ frameIndex: 0, x: 0.5, y: 0.5, description: 'Visible roof' }],
        }),
      }),
    );
  const result = await suggestCampusBuildings(validateVideoFrames(frames), {
    apiKey: 'test-only',
    request,
  });
  assert.equal(result[0].buildingId, null);
  assert.equal(result[0].label, 'Candidate 1');
  await assert.rejects(
    () =>
      suggestCampusBuildings(frames, {
        apiKey: 'test-only',
        request: async () =>
          new Response(
            JSON.stringify({
              output_text: JSON.stringify({
                candidates: [{ frameIndex: 5, x: 0.5, y: 0.5, description: 'Invalid' }],
              }),
            }),
          ),
      }),
    /coordinates/,
  );
});
