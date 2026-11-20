interface MediaEnv {
  [key: string]: string | undefined;
  SUPABASE_URL?: string; VITE_SUPABASE_URL?: string; VITE_SUPABASE_API?: string;
  SUPABASE_ANON_KEY?: string; VITE_SUPABASE_ANON_KEY?: string;
  GEMINI_API_KEY?: string; AURORA_ALLOWED_ORIGIN?: string;
}
const ASPECT_RATIOS = new Set(['1:1', '16:9', '9:16', '4:3', '3:4']);
const MAX_PROMPT = 1800;
const MAX_IMAGE_BASE64 = 14_000_000;
function cors(request: Request, env: MediaEnv): Headers {
  const origin = request.headers.get('Origin') || '';
  const configured = (env.AURORA_ALLOWED_ORIGIN || '').split(',').map(v => v.trim().replace(/\/+$/, '')).filter(Boolean);
  const allowed = new Set(['https://localhost', 'http://localhost', 'capacitor://localhost', 'ionic://localhost', 'https://aurora-ten-gold.vercel.app', ...configured]);
  let preview = false;
  try { const u = new URL(origin); preview = u.protocol === 'https:' && /^aurora-[a-z0-9-]+-smart-bm\.vercel\.app$/i.test(u.hostname); } catch {}
  const headers = new Headers({ 'Vary': 'Origin', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, Authorization, apikey, x-client-info', 'Access-Control-Max-Age': '86400', 'Cache-Control': 'no-store' });
  if (origin && (origin === new URL(request.url).origin || allowed.has(origin) || preview)) headers.set('Access-Control-Allow-Origin', origin);
  return headers;
}
function json(body: unknown, headers: Headers, status = 200): Response {
  headers.set('Content-Type', 'application/json; charset=utf-8');
  return new Response(JSON.stringify(body), { status, headers });
}
function supabaseConfig(env: MediaEnv): { url: string; anon: string } {
  const url = String(env.SUPABASE_URL || env.VITE_SUPABASE_URL || env.VITE_SUPABASE_API || '').trim().replace(/\/$/, '').replace(/\/(?:rest\/v1|auth\/v1)$/i, '');
  return { url, anon: env.SUPABASE_ANON_KEY || env.VITE_SUPABASE_ANON_KEY || '' };
}
export async function handleMediaGenerate(request: Request, env: MediaEnv): Promise<Response> {
  const headers = cors(request, env), origin = request.headers.get('Origin') || '';
  if (origin && !headers.has('Access-Control-Allow-Origin')) return json({ error: 'Origin not allowed.' }, headers, 403);
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
  if (request.method !== 'POST') { headers.set('Allow', 'POST, OPTIONS'); return json({ error: 'Use POST.' }, headers, 405); }
  const { url, anon } = supabaseConfig(env);
  if (!url || !anon) return json({ error: 'Supabase sign-in is not configured on the AURORA Worker.' }, headers, 503);
  const token = (request.headers.get('Authorization') || '').match(/^Bearer\s+([^\s]+)$/i)?.[1] || '';
  if (!token) return json({ error: 'Sign in to generate images.', code: 'AUTH_REQUIRED' }, headers, 401);
  try {
    const verified = await fetch(url + '/auth/v1/user', { headers: { apikey: anon, Authorization: 'Bearer ' + token }, signal: AbortSignal.timeout(9000) });
    if (!verified.ok) return json({ error: 'Your sign-in session is invalid or expired. Please sign in again.', code: 'AUTH_REQUIRED' }, headers, 401);
  } catch { return json({ error: 'AURORA could not reach the sign-in service.', code: 'AUTH_UNAVAILABLE' }, headers, 502); }
  if (!env.GEMINI_API_KEY) return json({ error: 'Image generation is not configured. Add the Gemini API key as a Worker secret.' }, headers, 503);
  const contentLength = Number(request.headers.get('Content-Length') || 0);
  if (contentLength > 16000) return json({ error: 'Image prompt request is too large.' }, headers, 413);
  let body: any;
  try { body = await request.json(); } catch { return json({ error: 'Send a valid JSON image request.' }, headers, 400); }
  const prompt = typeof body?.prompt === 'string' ? body.prompt.trim() : '';
  const aspectRatio = ASPECT_RATIOS.has(body?.aspectRatio) ? body.aspectRatio : '1:1';
  if (prompt.length < 8 || prompt.length > MAX_PROMPT) return json({ error: 'Describe the image in 8 to 1800 characters.' }, headers, 400);
  try {
    const upstream = await fetch('https://generativelanguage.googleapis.com/v1beta/interactions', {
      method: 'POST',
      headers: { 'x-goog-api-key': env.GEMINI_API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'gemini-3.1-flash-image', input: prompt, response_format: { type: 'image', mime_type: 'image/png', aspect_ratio: aspectRatio, image_size: '1K' } }),
      signal: AbortSignal.timeout(90000)
    });
    const result: any = await upstream.json().catch(() => ({}));
    if (!upstream.ok) return json({ error: upstream.status === 429 ? 'The image provider is busy or its quota is unavailable. Try again later.' : 'The image provider could not complete this request. Check Gemini access, model availability and quota.', code: upstream.status === 429 ? 'PROVIDER_RATE_LIMITED' : 'IMAGE_PROVIDER_ERROR' }, headers, upstream.status === 429 ? 429 : 502);
    let image = result?.output_image;
    if (!image?.data && Array.isArray(result?.steps)) {
      for (const step of result.steps) {
        const block = (step?.content || []).find((item: any) => item?.type === 'image' && typeof item.data === 'string');
        if (block) { image = { data: block.data, mime_type: block.mime_type }; break; }
      }
    }
    const data = typeof image?.data === 'string' ? image.data : '';
    const mimeType = typeof image?.mime_type === 'string' ? image.mime_type : 'image/png';
    if (!data || data.length > MAX_IMAGE_BASE64 || !/^[A-Za-z0-9+/=]+$/.test(data) || !['image/png', 'image/jpeg', 'image/webp'].includes(mimeType)) return json({ error: 'The provider returned no supported image or the image exceeded the response limit.' }, headers, 502);
    return json({ image: { data, mimeType }, model: 'gemini-3.1-flash-image', aspectRatio, saved: false }, headers);
  } catch (error: any) {
    const timedOut = error?.name === 'TimeoutError' || error?.name === 'AbortError';
    return json({ error: timedOut ? 'Image generation took too long. Try a shorter prompt or try again later.' : 'Image generation failed. Check the server connection and Gemini configuration.', code: timedOut ? 'IMAGE_GENERATION_TIMEOUT' : 'IMAGE_GENERATION_FAILED' }, headers, timedOut ? 504 : 502);
  }
}
