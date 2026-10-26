import { XMLParser } from 'fast-xml-parser';
import { officialUrl, geoDataset } from './advanced-utils.mjs';
export function parseCap(xml) {
  if (typeof xml !== 'string' || xml.length > 2 * 1024 * 1024 || /<!DOCTYPE|<!ENTITY/i.test(xml))
    throw new Error('Use CAP XML without document types or entity declarations.');
  const root = new XMLParser({
    removeNSPrefix: true,
    processEntities: false,
    parseTagValue: false,
  }).parse(xml).alert;
  if (!root || !root.identifier || !Number.isFinite(Date.parse(root.sent)))
    throw new Error('CAP needs an identifier and source timestamp.');
  const list = (x) => (x == null ? [] : Array.isArray(x) ? x : [x]);
  const info = list(root.info)[0];
  if (!info) throw new Error('CAP message contains no info section.');
  const features = [];
  for (const area of list(info.area))
    for (const polygon of list(area.polygon)) {
      const ring = String(polygon)
        .trim()
        .split(/\s+/)
        .map((pair) => pair.split(',').map(Number).reverse());
      if (ring.length < 4 || ring[0][0] !== ring.at(-1)[0] || ring[0][1] !== ring.at(-1)[1])
        throw new Error('CAP polygon must be closed with at least four vertices.');
      features.push({
        type: 'Feature',
        geometry: { type: 'Polygon', coordinates: [ring] },
        properties: {
          name: info.headline ?? info.event ?? 'Official alert area',
          description: info.description ?? area.areaDesc ?? '',
        },
      });
    }
  if (!features.length)
    throw new Error(
      'This CAP message has no supported polygon. Read its source bulletin; no map area was inferred.',
    );
  return {
    geojson: geoDataset({ type: 'FeatureCollection', features }),
    publishedAt: new Date(root.sent).toISOString(),
    expiresAt: info.expires ? new Date(info.expires).toISOString() : null,
    title: String(info.headline ?? info.event ?? root.identifier).slice(0, 180),
  };
}
export async function fetchOfficial(url, request = fetch) {
  officialUrl(url);
  const response = await request(url, {
    redirect: 'error',
    signal: AbortSignal.timeout(20000),
    headers: {
      Accept: 'application/geo+json, application/json, application/cap+xml, application/xml',
    },
  });
  if (!response.ok) throw new Error(`Official source returned HTTP ${response.status}.`);
  const reader = response.body.getReader();
  const chunks = [];
  let length = 0;
  while (true) {
    const part = await reader.read();
    if (part.done) break;
    length += part.value.length;
    if (length > 2 * 1024 * 1024) {
      await reader.cancel();
      throw new Error('Source exceeds 2 MB; use a regional or simplified official dataset.');
    }
    chunks.push(Buffer.from(part.value));
  }
  const text = Buffer.concat(chunks).toString('utf8');
  if (text.trim().startsWith('<')) return parseCap(text);
  return { geojson: geoDataset(JSON.parse(text)) };
}
