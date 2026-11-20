interface VoiceEnv {
  [key: string]: string | undefined;
  SUPABASE_URL?: string; VITE_SUPABASE_URL?: string; VITE_SUPABASE_API?: string;
  SUPABASE_ANON_KEY?: string; VITE_SUPABASE_ANON_KEY?: string;
  ELEVENLABS_API_KEY?: string; ELEVENLAB_API_KEY?: string;
  ELEVENLABS_VOICE_ID?: string; ELEVENLAB_VOICE_ID?: string;
  ELEVENLABS_JESSICA_VOICE_ID?: string; ELEVENLABS_BELLA_VOICE_ID?: string;
  ELEVENLABS_LAURA_VOICE_ID?: string; ELEVENLABS_LUCIAN_VOICE_ID?: string;
  ELEVENLAB_LUCIAN_VOICE_ID?: string; ELEVENLABS_MODEL_ID?: string;
  AURORA_ALLOWED_ORIGIN?: string;
}
const presets: Record<string, { stability: number; style: number; speed: number }> = {
  calm: { stability: 0.58, style: 0.22, speed: 0.96 },
  curious: { stability: 0.48, style: 0.43, speed: 0.97 },
  excited: { stability: 0.38, style: 0.62, speed: 1.02 },
  reassuring: { stability: 0.68, style: 0.25, speed: 0.91 },
  serious: { stability: 0.72, style: 0.18, speed: 0.94 },
  teaching: { stability: 0.64, style: 0.30, speed: 0.91 }
};
function cors(request: Request, env: VoiceEnv): Headers {
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
export async function handleVoice(request: Request, env: VoiceEnv): Promise<Response> {
  const headers = cors(request, env);
  const origin = request.headers.get('Origin') || '';
  if (origin && !headers.has('Access-Control-Allow-Origin')) return json({ error: 'Origin not allowed.' }, headers, 403);
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
  if (request.method !== 'POST') { headers.set('Allow', 'POST, OPTIONS'); return json({ error: 'Use POST.' }, headers, 405); }
  const base = String(env.SUPABASE_URL || env.VITE_SUPABASE_URL || env.VITE_SUPABASE_API || '').trim().replace(/\/$/, '').replace(/\/(?:rest\/v1|auth\/v1)$/i, '');
  const anon = env.SUPABASE_ANON_KEY || env.VITE_SUPABASE_ANON_KEY || '';
  const key = env.ELEVENLABS_API_KEY || env.ELEVENLAB_API_KEY || '';
  if (!base || !anon) return json({ error: 'Supabase sign-in is not configured on the AURORA Worker.' }, headers, 503);
  if (!key) return json({ error: 'Voice service is not configured.', code: 'VOICE_KEY_MISSING' }, headers, 503);
  const auth = request.headers.get('Authorization') || '';
  const token = auth.match(/^Bearer\s+([^\s]+)$/i)?.[1] || '';
  if (!token) return json({ error: 'Sign in to use AURORA voice.', code: 'AUTH_REQUIRED' }, headers, 401);
  try {
    const verified = await fetch(base + '/auth/v1/user', { headers: { apikey: anon, Authorization: 'Bearer ' + token }, signal: AbortSignal.timeout(9000) });
    if (!verified.ok) return json({ error: 'Your sign-in session is invalid or expired. Please sign in again.', code: 'AUTH_REQUIRED' }, headers, 401);
  } catch { return json({ error: 'AURORA could not reach the sign-in service.', code: 'AUTH_UNAVAILABLE' }, headers, 502); }
  const length = Number(request.headers.get('Content-Length') || 0);
  if (length > 14000) return json({ error: 'Voice request exceeds the allowed size.' }, headers, 413);
  let body: any;
  try { body = await request.json(); } catch { return json({ error: 'Send a valid JSON voice request.' }, headers, 400); }
  const text = body?.text;
  if (typeof text !== 'string' || !text.trim() || text.length > 2500) return json({ error: 'Text must be between 1 and 2500 characters.', code: 'INVALID_TEXT' }, headers, 400);
  const requestedVoiceId = typeof body.voiceId === 'string' ? body.voiceId.trim() : '';
  const voiceName = typeof body.voice === 'string' ? body.voice.toLowerCase() : 'jessica';
  const named: Record<string, string | undefined> = {
    jessica: env.ELEVENLABS_JESSICA_VOICE_ID || env.ELEVENLABS_VOICE_ID || env.ELEVENLAB_VOICE_ID,
    bella: env.ELEVENLABS_BELLA_VOICE_ID || env.ELEVENLABS_VOICE_ID || env.ELEVENLAB_VOICE_ID,
    laura: env.ELEVENLABS_LAURA_VOICE_ID || env.ELEVENLABS_VOICE_ID || env.ELEVENLAB_VOICE_ID,
    lucian: env.ELEVENLABS_LUCIAN_VOICE_ID || env.ELEVENLAB_LUCIAN_VOICE_ID || env.ELEVENLABS_VOICE_ID || env.ELEVENLAB_VOICE_ID
  };
  const voiceId = requestedVoiceId || named[voiceName];
  if (!voiceId || voiceId.length > 160 || !/^[A-Za-z0-9_-]+$/.test(voiceId)) return json({ error: 'Choose a voice available to your connected ElevenLabs account.', code: 'INVALID_VOICE_ID' }, headers, 400);
  const deliveryName = typeof body.delivery === 'string' && presets[body.delivery] ? body.delivery : 'calm';
  const requestedSpeed = Number(body.speechRate);
  const delivery = { ...presets[deliveryName], speed: Number.isFinite(requestedSpeed) ? Math.max(0.78, Math.min(1.12, requestedSpeed)) : presets[deliveryName].speed };
  try {
    const upstream = await fetch('https://api.elevenlabs.io/v1/text-to-speech/' + encodeURIComponent(voiceId), {
      method: 'POST',
      headers: { 'xi-api-key': key, 'Content-Type': 'application/json', Accept: 'audio/mpeg' },
      body: JSON.stringify({ text: text.trim(), model_id: env.ELEVENLABS_MODEL_ID || 'eleven_multilingual_v2', voice_settings: { stability: delivery.stability, similarity_boost: 0.78, style: delivery.style, speed: delivery.speed, use_speaker_boost: true } }),
      signal: AbortSignal.timeout(18000)
    });
    if (!upstream.ok) {
      const status = upstream.status;
      const message = status === 401 ? 'ElevenLabs rejected the configured API key.' : status === 402 ? 'ElevenLabs returned a payment or account restriction response.' : status === 403 ? 'The selected voice or service is not permitted for this key.' : status === 404 ? 'The selected voice was not found.' : status === 429 ? 'Voice usage limit reached. Try again later.' : 'Voice service could not generate audio.';
      return json({ error: message, code: 'ELEVENLABS_HTTP_ERROR', providerStatus: status }, headers, status === 429 ? 429 : 502);
    }
    const audio = await upstream.arrayBuffer();
    if (!audio.byteLength || audio.byteLength > 10 * 1024 * 1024) return json({ error: 'Voice provider returned an empty or oversized audio response.', code: 'INVALID_AUDIO_RESPONSE' }, headers, 502);
    headers.set('Content-Type', 'audio/mpeg');
    headers.set('Content-Length', String(audio.byteLength));
    headers.set('X-AURORA-VOICE-PROVIDER', 'elevenlabs');
    headers.set('X-AURORA-VOICE', voiceName);
    return new Response(audio, { status: 200, headers });
  } catch (error: any) {
    return json({ error: error?.name === 'TimeoutError' ? 'ElevenLabs timed out before returning audio.' : 'AURORA could not reach the voice service.', code: error?.name === 'TimeoutError' ? 'ELEVENLABS_TIMEOUT' : 'VOICE_NETWORK_ERROR' }, headers, 502);
  }
}
