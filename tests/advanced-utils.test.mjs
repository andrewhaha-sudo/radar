import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  csvRows,
  csvCell,
  projectPoint,
  officialUrl,
  geoDataset,
  relayPacket,
  summarize,
} from '../server/advanced-utils.mjs';
import { parseCap, fetchOfficial } from '../server/official-data.mjs';
test('CSV handles BOM, escaped fields, newline quotes and rejects ambiguous shapes; exported formulas are inert', () => {
  assert.equal(csvRows('\uFEFFname,email\r\n"One, Two",\r\n')[0].name, 'One, Two');
  assert.equal(csvRows('name\n"Two\nLines"')[0].name, 'Two\nLines');
  assert.throws(() => csvRows('name,name\na,b'));
  assert.throws(() => csvRows('name\n"unclosed'));
  assert.ok(csvCell('=IMPORTXML("secret")').startsWith('"\''));
});
test('planar projection needs non-degenerate verified correspondences and rejects out-of-room points', () => {
  const anchors = [
    [0, 0, 0, 0],
    [1, 0, 1, 0],
    [1, 1, 1, 1],
    [0, 1, 0, 1],
  ];
  const point = projectPoint(anchors, 0.3, 0.7);
  assert.ok(Math.abs(point[0] - 0.3) < 1e-8);
  assert.throws(() => projectPoint(Array(4).fill([0, 0, 0, 0]), 0.5, 0.5));
  assert.throws(() => projectPoint(anchors, 2, 2));
});
test('official sources reject private URLs and CAP parsing rejects entity declarations and missing geometry', async () => {
  assert.throws(() => officialUrl('http://localhost/private'));
  assert.throws(() => officialUrl('https://attacker.example/data'));
  assert.throws(() => parseCap('<!DOCTYPE x><alert/>'));
  assert.throws(() =>
    geoDataset({
      type: 'FeatureCollection',
      features: [{ geometry: { type: 'Point', coordinates: [900, 400] } }],
    }),
  );
  const xml =
    '<alert><identifier>fixture</identifier><sent>2026-10-25T00:00:00Z</sent><info><event>Parser test</event><area><polygon>14,122 14,123 15,123 14,122</polygon></area></info></alert>';
  assert.equal(parseCap(xml).geojson.features[0].geometry.coordinates[0][0][0], 122);
  const result = await fetchOfficial(
    'https://www.pagasa.dost.gov.ph/fixture.xml',
    async () => new Response(xml),
  );
  assert.equal(result.geojson.features.length, 1);
});
test('custom reports retain sample counts and relay packets expire without identity claims', () => {
  const rows = summarize(
    [
      {
        severity: 'high',
        createdAt: '2026-01-01T00:00:00Z',
        resolvedAt: '2026-01-01T02:00:00Z',
      },
      { severity: 'high' },
    ],
    { dataset: 'hazards', groupBy: ['severity'] },
  );
  assert.equal(rows[0].count, 2);
  assert.equal(rows[0].averageResolutionHours, 2);
  assert.equal(rows[0].resolutionSamples, 1);
  assert.throws(() =>
    relayPacket({
      version: 1,
      id: 'fixture-token-id',
      school: '309622',
      kind: 'other',
      note: 'fixture',
      expiresAt: '2000-01-01',
    }),
  );
});
