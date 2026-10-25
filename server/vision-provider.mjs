export const DEFAULT_VISION_MODEL = 'gpt-4.1-mini';
export function visionModel(value = process.env.RADAR_VISION_MODEL) {
  const model = String(value ?? '').trim() || DEFAULT_VISION_MODEL;
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,99}$/.test(model) || /^(sk-|sb_|https?:)/i.test(model))
    throw new Error(
      'Vision model must be a model ID such as gpt-4.1-mini, not an API key or URL. Run npm run setup:integrations, correct Vision model, then restart/redeploy.',
    );
  return model;
}
export async function visionFailure(response) {
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
