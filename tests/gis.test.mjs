import { test } from 'node:test';
import assert from 'node:assert/strict';
import { containsPosition, cnnDataset, exposureAssessment } from '../server/gis-utils.mjs';
const ring = (lo, hi) => [
  [lo, lo],
  [hi, lo],
  [hi, hi],
  [lo, hi],
  [lo, lo],
];
const polygon = { type: 'Polygon', coordinates: [ring(0, 10), ring(3, 7)] };
const feature = {
  type: 'Feature',
  geometry: { type: 'Polygon', coordinates: [ring(0, 10)] },
  properties: { label: 'visible_debris', confidence: 0.8, verified: true },
};
const geo = { type: 'FeatureCollection', features: [feature] };
test('GIS polygon contact includes boundaries, excludes hole interiors and handles multipolygons', () => {
  assert.equal(containsPosition(polygon, [1, 1]), true);
  assert.equal(containsPosition(polygon, [5, 5]), false);
  assert.equal(containsPosition(polygon, [3, 5]), true);
  assert.equal(containsPosition(polygon, [0, 5]), true);
  assert.equal(containsPosition(polygon, [12, 5]), false);
  assert.equal(
    containsPosition(
      { type: 'MultiPolygon', coordinates: [polygon.coordinates, [ring(20, 30)]] },
      [25, 25],
    ),
    true,
  );
  assert.equal(containsPosition({ type: 'LineString', coordinates: ring(0, 10) }, [0, 0]), false);
});
test('CNN import requires polygons, supported visible classes and finite confidence; imported approvals are stripped', () => {
  assert.deepEqual(cnnDataset(geo).features[0].properties, {
    label: 'visible_debris',
    confidence: 0.8,
  });
  for (const confidence of [NaN, Infinity, -0.1, 1.1, '0.8', null])
    assert.throws(() =>
      cnnDataset({
        ...geo,
        features: [{ ...feature, properties: { label: 'visible_debris', confidence } }],
      }),
    );
  assert.throws(() =>
    cnnDataset({
      ...geo,
      features: [{ ...feature, properties: { label: 'earthquake_prediction', confidence: 0.9 } }],
    }),
  );
  assert.throws(() =>
    cnnDataset({
      ...geo,
      features: [{ ...feature, geometry: { type: 'Point', coordinates: [1, 1] } }],
    }),
  );
  assert.throws(() => cnnDataset({ ...geo, features: [] }));
  assert.throws(() =>
    cnnDataset({
      ...geo,
      features: [
        {
          ...feature,
          geometry: {
            type: 'Polygon',
            coordinates: [
              [
                [0, 0],
                [1, 0],
                [1, 1],
                [0, 2],
              ],
            ],
          },
        },
      ],
    }),
  );
});
test('GIS assessment excludes pending/rejected models, low scores and expired/unreviewed official layers', () => {
  const buildings = [
    { id: 1, name: 'Mapped', lat: 1, lng: 1 },
    { id: 2, name: 'Missing', lat: null, lng: null },
    { id: 3, name: 'Outside', lat: 20, lng: 20 },
  ];
  const official = [
    { id: 1, title: 'Current source', kind: 'flood', verified: 1, geojson: geo },
    { id: 2, title: 'Expired', kind: 'flood', verified: 1, expiresAt: '2020-01-01', geojson: geo },
    { id: 3, title: 'Unverified', verified: 0, geojson: geo },
  ];
  const models = ['pending', 'reviewed', 'rejected'].map((reviewState, id) => ({
    id,
    title: reviewState,
    reviewState,
    geojson: geo,
  }));
  const output = exposureAssessment(buildings, official, models, 0.5);
  assert.deepEqual(
    output[0].evidence.map((e) => e.sourceType),
    ['official_layer', 'cnn_suggestion'],
  );
  assert.equal(output[0].outcome, 'mapped_overlap');
  assert.equal(output[1].outcome, 'location_missing');
  assert.equal(output[2].outcome, 'no_overlap_in_available_layers');
  assert.equal(exposureAssessment(buildings, official, models, 0.9)[0].evidence.length, 1);
  assert.equal(exposureAssessment(buildings, [], [])[0].outcome, 'no_overlap_in_available_layers');
});
