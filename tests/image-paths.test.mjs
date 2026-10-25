import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateImagePaths, suggestImagePaths } from '../server/image-paths.mjs';
test('path sketches reject GPS coordinates, repeated points, oversized geometry and unnamed routes', () => {
  const path = {
    name: 'Visible walkway',
    points: [
      [0.1, 0.1],
      [0.6, 0.7],
    ],
  };
  assert.equal(validateImagePaths([path])[0].points.length, 2);
  for (const candidate of [
    {
      ...path,
      points: [
        [14, 122],
        [15, 123],
      ],
    },
    {
      ...path,
      points: [
        [0.4, 0.4],
        [0.4, 0.4],
      ],
    },
    { ...path, name: '' },
    { ...path, points: Array(31).fill([0.5, 0.5]) },
  ])
    assert.throws(() => validateImagePaths([candidate]));
  assert.throws(() => validateImagePaths(Array(4).fill(path)));
});
test('image assistance accepts an empty result and rejects fabricated positions outside the view', async () => {
  const image = 'data:image/jpeg;base64,YWJj';
  const requestFor = (result) => async () =>
    new Response(JSON.stringify({ output_text: JSON.stringify(result) }));
  const empty = await suggestImagePaths(image, {
    apiKey: 'test-only',
    request: requestFor({ paths: [], uncertainties: ['Gate status is not visible'] }),
  });
  assert.deepEqual(empty.paths, []);
  const result = await suggestImagePaths(image, {
    apiKey: 'test-only',
    request: requestFor({
      paths: [
        {
          name: 'Segment',
          description: 'Visible only',
          points: [
            [0.1, 0.2],
            [0.6, 0.8],
          ],
        },
      ],
      uncertainties: [],
    }),
  });
  assert.equal(result.paths[0].points.length, 2);
  assert.equal(result.routes, undefined);
  await assert.rejects(
    () =>
      suggestImagePaths(image, {
        apiKey: 'test-only',
        request: requestFor({
          paths: [
            {
              name: 'Invented GPS',
              points: [
                [14, 122],
                [15, 123],
              ],
            },
          ],
          uncertainties: [],
        }),
      }),
    /image coordinates/,
  );
});
