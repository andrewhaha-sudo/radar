export function visionProvider(value = process.env.RADAR_VISION_PROVIDER) {
  const provider = String(value || 'openai')
    .trim()
    .toLowerCase();
  if (!['openai', 'gemini'].includes(provider))
    throw new Error('Vision provider must be openai or gemini.');
  return provider;
}
export function visionApiKey() {
  return visionProvider() === 'gemini'
    ? process.env.RADAR_GEMINI_API_KEY
    : process.env.RADAR_VISION_API_KEY;
}
export function selectedVisionModel() {
  return visionProvider() === 'gemini'
    ? visionModel(String(process.env.RADAR_GEMINI_MODEL || '').trim() || 'gemini-2.5-flash')
    : visionModel();
}
export async function requestVision(payload, { apiKey = visionApiKey(), request = fetch } = {}) {
  if (process.env.RADAR_TEST_LAB === '1') throw new Error('External AI is disabled in training.');
  if (!apiKey) throw new Error('Configure the selected vision provider API key.');
  if (visionProvider() === 'openai')
    return request('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(60000),
      body: JSON.stringify(payload),
    });
  const parts = payload.input
    .flatMap((message) => message.content)
    .map((part) => {
      if (part.type === 'input_text') return { text: part.text };
      const match = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(
        part.image_url || '',
      );
      if (!match) throw new Error('Gemini analysis requires uploaded JPEG, PNG or WebP images.');
      return { inlineData: { mimeType: match[1], data: match[2] } };
    });
  const model = selectedVisionModel();
  const response = await request(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
    {
      method: 'POST',
      headers: { 'x-goog-api-key': apiKey, 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(60000),
      body: JSON.stringify({
        contents: [{ role: 'user', parts }],
        generationConfig: {
          responseMimeType: 'application/json',
          responseJsonSchema: payload.text.format.schema,
        },
      }),
    },
  );
  if (!response.ok) return response;
  const data = await response.json();
  const text = data.candidates?.[0]?.content?.parts
    ?.filter((part) => !part.thought && typeof part.text === 'string')
    .map((part) => part.text)
    .join('');
  if (!text)
    throw new Error(
      'Gemini returned no usable analysis. The request may have been blocked or interrupted. No findings were saved.',
    );
  return { ok: true, status: response.status, json: async () => ({ output_text: text }) };
}
export const DEFAULT_VISION_MODEL = 'gpt-4.1-mini';
export function visionModel(value = process.env.RADAR_VISION_MODEL) {
  const model = String(value ?? '').trim() || DEFAULT_VISION_MODEL;
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,99}$/.test(model) || /^(sk-|sb_|AIza|https?:)/i.test(model))
    throw new Error(
      'Vision model must be a model ID such as gpt-4.1-mini, not an API key or URL. Run npm run setup:integrations, correct Vision model, then restart/redeploy.',
    );
  return model;
}
export async function visionFailure(response) {
  if (visionProvider() === 'gemini') {
    const prefix = `Gemini vision returned HTTP ${response.status}. `;
    const detail =
      response.status === 429
        ? 'The Gemini rate limit or quota was reached. Free-tier availability and limits vary by account, region and model; check Google AI Studio and retry later.'
        : response.status === 404
          ? 'The configured Gemini model is unavailable. Check RADAR_GEMINI_MODEL and model access in Google AI Studio.'
          : [401, 403].includes(response.status)
            ? 'Check RADAR_GEMINI_API_KEY, key restrictions and Gemini API access in Google AI Studio.'
            : 'The provider rejected or could not complete the analysis. Check model support and provider availability.';
    return new Error(prefix + detail);
  }
  let code;
  try {
    code = (await response.json())?.error?.code;
  } catch {
    /* Non-JSON proxy errors also need an actionable diagnostic. */
  }
  const prefix = `Vision provider returned HTTP ${response.status}. `;
  if (response.status === 404 || code === 'model_not_found')
    return new Error(
      prefix +
        'OpenAI could not find the configured model, or your API project cannot access it. Run npm run setup:integrations and set Vision model to gpt-4.1-mini, or another image-capable Responses API model available to your project. Restart npm run dev afterward; on Vercel update RADAR_VISION_MODEL and redeploy.',
    );
  if (response.status === 401)
    return new Error(
      prefix +
        'The OpenAI API key was rejected. Correct RADAR_VISION_API_KEY on the server and restart/redeploy. Do not use Supabase, VAPID or Twilio credentials.',
    );
  if (response.status === 403)
    return new Error(
      prefix +
        'Your OpenAI project or API key lacks permission for this request. Check project/model access and key permissions.',
    );
  if (response.status === 429)
    return new Error(
      prefix +
        (code === 'insufficient_quota'
          ? 'Your OpenAI API project has insufficient quota. Check API billing and project limits before retrying.'
          : 'The provider rate limit or quota was reached. Check project limits and retry later.'),
    );
  if (response.status === 400)
    return new Error(
      prefix +
        'The provider rejected the analysis request. Use a model supporting image input and structured output through the OpenAI Responses API.',
    );
  return new Error(
    prefix +
      'Analysis was not completed. Check provider availability and your server configuration before retrying.',
  );
}
