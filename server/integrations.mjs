export async function analyzeVisibleHazards(
  images,
  {
    apiKey = process.env.RADAR_VISION_API_KEY,
    request = fetch,
    model = process.env.RADAR_VISION_MODEL ?? 'gpt-4.1-mini',
  } = {},
) {
  if (!apiKey) throw new Error('The vision provider is not configured.');
  const response = await request('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    signal: AbortSignal.timeout(60000),
    body: JSON.stringify({
      model,
      input: [
        {
          role: 'user',
          content: [
            {
              type: 'input_text',
              text: 'Review these room inspection photos for potentially visible hazards only: blocked exits, exposed wiring, visibly damaged surfaces, slips/clutter, chemical storage, and obstructed safety equipment. Do not claim hidden defects, structural integrity, electrical live status, or a safety certification. Propose findings for a human to confirm or reject. Confidence, when returned, is an uncalibrated model estimate. Return no findings when the images do not support one.',
            },
            ...images.map((image) => ({ type: 'input_image', image_url: image })),
          ],
        },
      ],
      text: {
        format: {
          type: 'json_schema',
          name: 'room_hazard_suggestions',
          strict: true,
          schema: {
            type: 'object',
            additionalProperties: false,
            properties: {
              findings: {
                type: 'array',
                maxItems: 20,
                items: {
                  type: 'object',
                  additionalProperties: false,
                  properties: {
                    title: { type: 'string' },
                    description: { type: 'string' },
                    severity: {
                      type: 'string',
                      enum: ['critical', 'high', 'medium', 'low', 'info'],
                    },
                    confidence: { type: ['number', 'null'] },
                  },
                  required: ['title', 'description', 'severity', 'confidence'],
                },
              },
            },
            required: ['findings'],
          },
        },
      },
    }),
  });
  if (!response.ok)
    throw new Error(`Vision provider returned HTTP ${response.status}. No findings were saved.`);
  const payload = await response.json();
  const text =
    payload.output
      ?.flatMap((x) => x.content ?? [])
      .filter((x) => x.type === 'output_text')
      .map((x) => x.text)
      .join('') ?? payload.output_text;
  let result;
  try {
    result = JSON.parse(text);
  } catch {
    throw new Error(
      'The vision provider returned an unsupported response. No findings were saved.',
    );
  }
  if (!Array.isArray(result.findings) || result.findings.length > 20)
    throw new Error('The vision response did not match the required schema.');
  return result.findings.map((f) => {
    if (
      typeof f.title !== 'string' ||
      !f.title.trim() ||
      typeof f.description !== 'string' ||
      !['critical', 'high', 'medium', 'low', 'info'].includes(f.severity) ||
      !(
        f.confidence == null ||
        (typeof f.confidence === 'number' && f.confidence >= 0 && f.confidence <= 1)
      )
    )
      throw new Error('The vision provider returned invalid finding data.');
    return {
      title: f.title.slice(0, 140),
      description: f.description.slice(0, 3000),
      severity: f.severity,
      confidence: f.confidence ?? null,
    };
  });
}
export function parseUsgs(data, now = Date.now()) {
  if (
    data?.type !== 'FeatureCollection' ||
    !Array.isArray(data.features) ||
    !Number.isFinite(data.metadata?.generated) ||
    Math.abs(now - data.metadata.generated) > 7200000
  )
    throw new Error(
      'The USGS feed is invalid or stale. Its contents were not presented as current.',
    );
  return data.features.flatMap((f) => {
    const c = f.geometry?.coordinates,
      p = f.properties;
    if (
      f.geometry?.type !== 'Point' ||
      !Array.isArray(c) ||
      c.length < 3 ||
      !c.every(Number.isFinite) ||
      !p ||
      !Number.isFinite(p.time) ||
      typeof f.id !== 'string'
    )
      return [];
    if (
      c[0] < 116 ||
      c[0] > 127 ||
      c[1] < 4 ||
      c[1] > 22 ||
      p.time < now - 26 * 3600000 ||
      p.time > now + 300000
    )
      return [];
    return [
      {
        eventId: f.id,
        title: String(p.title ?? 'USGS earthquake report').slice(0, 180),
        publishedAt: new Date(p.time).toISOString(),
        updatedAt: new Date(p.updated ?? p.time).toISOString(),
        lat: c[1],
        lng: c[0],
        depthKm: c[2],
        magnitude: Number.isFinite(p.mag) ? p.mag : null,
        place: String(p.place ?? 'Philippines region'),
        sourceUrl: `https://earthquake.usgs.gov/earthquakes/eventpage/${encodeURIComponent(f.id)}`,
      },
    ];
  });
}
let feedCache;
export async function fetchUsgs(request = fetch) {
  if (request === fetch && feedCache && Date.now() - feedCache.time < 300000) return feedCache.data;
  const response = await request(
    'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_day.geojson',
    { signal: AbortSignal.timeout(20000) },
  );
  if (!response.ok) throw new Error(`USGS feed returned HTTP ${response.status}.`);
  const data = await response.json();
  parseUsgs(data);
  if (request === fetch) feedCache = { time: Date.now(), data };
  return data;
}
