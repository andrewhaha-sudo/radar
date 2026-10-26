import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  validateCampusFeatures,
  georeferenceDraft,
  generateCampusDraft,
} from '../server/campus-map.mjs';
const feature = {
  frameIndex: 0,
  kind: 'building',
  geometryType: 'Polygon',
  points: [
    [0.2, 0.2],
    [0.6, 0.2],
    [0.6, 0.6],
    [0.2, 0.6],
  ],
  confidence: 0.8,
  label: 'Building candidate 1',
  note: 'Synthetic test only',
};
test('image map drafts validate frame, geometry and score without accepting geographic coordinates', () => {
  assert.equal(validateCampusFeatures([feature], 1)[0].kind, 'building');
  for (const change of [
    { frameIndex: 1 },
    { confidence: NaN },
    { confidence: 2 },
    { kind: 'safe_route' },
    {
      points: [
        [122, 14],
        [123, 14],
        [123, 15],
      ],
    },
    {
      points: [
        [0.1, 0.1],
        [0.1, 0.1],
        [0.1, 0.1],
      ],
    },
    { geometryType: 'LineString' },
  ])
    assert.throws(() => validateCampusFeatures([{ ...feature, ...change }], 1));
  assert.equal(
    validateCampusFeatures(
      [
        {
          ...feature,
          kind: 'walkway',
          geometryType: 'LineString',
          points: [
            [0.1, 0.1],
            [0.3, 0.3],
          ],
        },
      ],
      1,
    ).length,
    1,
  );
  assert.throws(() => validateCampusFeatures(Array(41).fill(feature), 1));
});
test('GIS placement requires three non-collinear known anchors and exports explicitly approximate unverified polygons', () => {
  const anchors = [
    { x: 0.2, y: 0.2, lat: 14.12, lng: 122.95 },
    { x: 0.8, y: 0.2, lat: 14.12, lng: 122.951 },
    { x: 0.2, y: 0.8, lat: 14.119, lng: 122.95 },
  ];
  const geo = georeferenceDraft([feature], 0, anchors);
  assert.deepEqual(geo.features[0].geometry.coordinates[0][0], [122.95, 14.12]);
  assert.deepEqual(
    geo.features[0].geometry.coordinates[0].at(-1),
    geo.features[0].geometry.coordinates[0][0],
  );
  assert.equal(geo.features[0].properties.status, 'unverified_image_draft');
  assert.equal(geo.features[0].properties.georeferencing, 'approximate_three_anchor_affine');
  assert.throws(() => georeferenceDraft([feature], 0, []));
  assert.throws(() =>
    georeferenceDraft(
      [feature],
      0,
      anchors.map((a, i) => ({ ...a, x: i * 0.2, y: i * 0.2 })),
    ),
  );
  assert.throws(() =>
    georeferenceDraft(
      [feature],
      0,
      anchors.map((a) => ({ ...a, lat: 14.12, lng: 122.95 })),
    ),
  );
  assert.throws(() =>
    georeferenceDraft([feature], 0, [anchors[0], { ...anchors[1], lng: 124 }, anchors[2]]),
  );
  assert.deepEqual(georeferenceDraft([feature], 1, anchors).features, []);
});
test('campus generation uses the configured image provider schema; malformed outputs never become saved geography', async () => {
  const frames = [{ time: 0, image: 'data:image/jpeg;base64,AA==', kind: 'photo' }];
  let payload;
  const options = {
    apiKey: 'test-only-not-a-real-key',
    request: async (url, init) => {
      payload = JSON.parse(init.body);
      return {
        ok: true,
        status: 200,
        json: async () => ({
          output_text: JSON.stringify({
            features: [feature],
            uncertainties: ['Synthetic fixture, not real inference.'],
          }),
        }),
      };
    },
  };
  const result = await generateCampusDraft(frames, options);
  assert.equal(result.features.length, 1);
  assert.ok(JSON.stringify(payload).includes('campus_mapping_draft'));
  assert.ok(JSON.stringify(payload).includes('data:image/jpeg;base64,AA=='));
  await assert.rejects(() =>
    generateCampusDraft(frames, {
      ...options,
      request: async () => ({
        ok: true,
        json: async () => ({
          output_text: JSON.stringify({
            features: [
              {
                ...feature,
                points: [
                  [123, 14],
                  [124, 14],
                  [124, 15],
                ],
              },
            ],
            uncertainties: [],
          }),
        }),
      }),
    }),
  );
});
