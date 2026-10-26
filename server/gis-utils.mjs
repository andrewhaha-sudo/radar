import { geoDataset } from './advanced-utils.mjs';

function onSegment(p, a, b) {
  const cross = (p[1] - a[1]) * (b[0] - a[0]) - (p[0] - a[0]) * (b[1] - a[1]);
  return (
    Math.abs(cross) < 1e-10 &&
    p[0] >= Math.min(a[0], b[0]) - 1e-10 &&
    p[0] <= Math.max(a[0], b[0]) + 1e-10 &&
    p[1] >= Math.min(a[1], b[1]) - 1e-10 &&
    p[1] <= Math.max(a[1], b[1]) + 1e-10
  );
}
function inRing(point, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[j],
      b = ring[i];
    if (onSegment(point, a, b)) return 2;
    if (
      a[1] > point[1] !== b[1] > point[1] &&
      point[0] < ((b[0] - a[0]) * (point[1] - a[1])) / (b[1] - a[1]) + a[0]
    )
      inside = !inside;
  }
  return inside ? 1 : 0;
}
export function containsPosition(geometry, point) {
  const polygons =
    geometry.type === 'Polygon'
      ? [geometry.coordinates]
      : geometry.type === 'MultiPolygon'
        ? geometry.coordinates
        : [];
  return polygons.some((rings) => {
    const outer = inRing(point, rings[0]);
    if (!outer) return false;
    // Boundaries, including the edge of a hole, count as contact; hole interiors do not.
    for (const hole of rings.slice(1)) {
      const hit = inRing(point, hole);
      if (hit === 2) return true;
      if (hit === 1) return false;
    }
    return true;
  });
}
export const CNN_LABELS = [
  'visible_debris',
  'standing_water',
  'visible_surface_damage',
  'blocked_walkway',
  'other_visible_feature',
];
export function cnnDataset(input) {
  if (JSON.stringify(input ?? {}).length > 1500000)
    throw new Error('CNN GeoJSON must be under 1.5 MB.');
  const geo = geoDataset(input);
  if (!geo.features.length || geo.features.length > 500)
    throw new Error('Import between 1 and 500 CNN polygons.');
  for (const feature of geo.features) {
    if (!['Polygon', 'MultiPolygon'].includes(feature.geometry.type))
      throw new Error('CNN observations must be georeferenced polygons.');
    const { label, confidence } = feature.properties;
    if (!CNN_LABELS.includes(label))
      throw new Error(`Use a visible-feature label: ${CNN_LABELS.join(', ')}.`);
    if (
      typeof confidence !== 'number' ||
      !Number.isFinite(confidence) ||
      confidence < 0 ||
      confidence > 1
    )
      throw new Error('Each CNN polygon needs numeric confidence between 0 and 1.');
    // Strip imported approval/safety claims. Review state belongs to the server record.
    feature.properties = { label, confidence };
  }
  return geo;
}
export function exposureAssessment(buildings, official, models, threshold = 0.5, now = Date.now()) {
  const officialAreas = official.filter(
    (layer) => layer.verified && (!layer.expiresAt || Date.parse(layer.expiresAt) > now),
  );
  const modelAreas = models.filter((layer) => layer.reviewState === 'reviewed');
  return buildings.map((building) => {
    const mapped =
      typeof building.lat === 'number' &&
      typeof building.lng === 'number' &&
      Number.isFinite(building.lat) &&
      Number.isFinite(building.lng);
    const evidence = [];
    if (mapped)
      for (const [sourceType, layers] of [
        ['official_layer', officialAreas],
        ['cnn_suggestion', modelAreas],
      ]) {
        for (const layer of layers)
          for (const feature of layer.geojson.features) {
            if (sourceType === 'cnn_suggestion' && feature.properties.confidence < threshold)
              continue;
            if (!containsPosition(feature.geometry, [building.lng, building.lat])) continue;
            evidence.push({
              sourceType,
              layerId: layer.id,
              title: layer.title,
              featureId: feature.id,
              kind: sourceType === 'cnn_suggestion' ? feature.properties.label : layer.kind,
              confidence: sourceType === 'cnn_suggestion' ? feature.properties.confidence : null,
            });
          }
      }
    return {
      id: building.id,
      name: building.name,
      lat: building.lat,
      lng: building.lng,
      mapped,
      evidence,
      outcome: !mapped
        ? 'location_missing'
        : evidence.length
          ? 'mapped_overlap'
          : 'no_overlap_in_available_layers',
    };
  });
}
