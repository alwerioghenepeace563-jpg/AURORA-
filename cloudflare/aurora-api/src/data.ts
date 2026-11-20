interface DataEnv {
  [key: string]: string | undefined;
  SUPABASE_URL?: string; VITE_SUPABASE_URL?: string; VITE_SUPABASE_API?: string;
  SUPABASE_ANON_KEY?: string; VITE_SUPABASE_ANON_KEY?: string;
  AURORA_ALLOWED_ORIGIN?: string;
}
const MAX_BODY = 1024 * 1024;
function config(env: DataEnv): { url: string; key: string } {
  const url = String(env.SUPABASE_URL || env.VITE_SUPABASE_URL || env.VITE_SUPABASE_API || '')
    .trim().replace(/\/$/, '').replace(/\/(?:rest\/v1|auth\/v1)$/i, '');
  return { url, key: env.SUPABASE_ANON_KEY || env.VITE_SUPABASE_ANON_KEY || '' };
}
function cors(request: Request, env: DataEnv): Headers {
  const origin = request.headers.get('Origin') || '';
  const configured = (env.AURORA_ALLOWED_ORIGIN || '').split(',').map(v => v.trim().replace(/\/+$/, '')).filter(Boolean);
  const allowed = new Set(['https://localhost', 'http://localhost', 'capacitor://localhost', 'ionic://localhost', 'https://aurora-ten-gold.vercel.app', ...configured]);
  let preview = false;
  try { const u = new URL(origin); preview = u.protocol === 'https:' && /^aurora-[a-z0-9-]+-smart-bm\.vercel\.app$/i.test(u.hostname); } catch {}
  const headers = new Headers({
    'Vary': 'Origin', 'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, apikey, x-client-info, Prefer, Range',
    'Access-Control-Expose-Headers': 'Content-Range, Preference-Applied',
    'Access-Control-Max-Age': '86400', 'Cache-Control': 'no-store'
  });
  if (origin && (allowed.has(origin) || preview)) headers.set('Access-Control-Allow-Origin', origin);
  return headers;
}
function json(body: unknown, headers: Headers, status = 200): Response {
  headers.set('Content-Type', 'application/json; charset=utf-8');
  return new Response(JSON.stringify(body), { status, headers });
}
async function verifyUser(base: string, key: string, token: string): Promise<Response> {
  return fetch(base + '/auth/v1/user', {
    headers: { apikey: key, Authorization: 'Bearer ' + token },
    signal: AbortSignal.timeout(9000)
  });
}
function bearer(request: Request): string {
  const value = request.headers.get('Authorization') || '';
  const match = value.match(/^Bearer\s+([^\s]+)$/i);
  return match?.[1] || '';
}
export async function handleData(request: Request, env: DataEnv): Promise<Response> {
  const headers = cors(request, env), origin = request.headers.get('Origin') || '';
  if (origin && !headers.has('Access-Control-Allow-Origin')) return json({ error: 'Origin not allowed.' }, headers, 403);
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
  const { url, key } = config(env);
  if (!url || !key) return json({ error: 'Supabase is not configured on the AURORA Worker.' }, headers, 503);
  const token = bearer(request);
  if (!token) return json({ error: 'Sign in to use AURORA data services.' }, headers, 401);
  let verified: Response;
  try { verified = await verifyUser(url, key, token); }
  catch { return json({ error: 'AURORA could not reach the sign-in service.' }, headers, 502); }
  if (!verified.ok) return json({ error: 'Your sign-in session is invalid or expired. Please sign in again.' }, headers, 401);
  const pathname = new URL(request.url).pathname;
  if (pathname === '/api/auth/user') {
    if (request.method !== 'GET') { headers.set('Allow', 'GET, OPTIONS'); return json({ error: 'Use GET.' }, headers, 405); }
    const user: any = await verified.json().catch(() => null);
    if (!user || typeof user.id !== 'string') return json({ error: 'AURORA could not verify your account.' }, headers, 401);
    return json({ user: { id: user.id, email: typeof user.email === 'string' ? user.email : '' } }, headers);
  }
  const match = pathname.match(/^\/api\/data\/([A-Za-z_][A-Za-z0-9_]*)$/);
  if (!match) return json({ error: 'Use /api/data/{table}. Only a single table or view name is supported.' }, headers, 404);
  if (!['GET', 'POST', 'PATCH', 'DELETE'].includes(request.method)) {
    headers.set('Allow', 'GET, POST, PATCH, DELETE, OPTIONS');
    return json({ error: 'Unsupported data method.' }, headers, 405);
  }
  const length = Number(request.headers.get('Content-Length') || 0);
  if (length > MAX_BODY) return json({ error: 'Data request exceeds the 1 MB limit.' }, headers, 413);
  let body: string | undefined;
  if (!['GET', 'HEAD'].includes(request.method)) {
    body = await request.text();
    if (body.length > MAX_BODY) return json({ error: 'Data request exceeds the 1 MB limit.' }, headers, 413);
  }
  const incoming = new URL(request.url);
  const target = url + '/rest/v1/' + match[1] + incoming.search;
  const upstreamHeaders = new Headers({ apikey: key, Authorization: 'Bearer ' + token, Accept: 'application/json' });
  const contentType = request.headers.get('Content-Type');
  if (contentType && /^(application\/json|application\/merge-patch\+json)(?:\s*;|$)/i.test(contentType)) upstreamHeaders.set('Content-Type', contentType);
  const prefer = request.headers.get('Prefer') || '';
  if (prefer && /^[A-Za-z0-9=, ._-]{1,180}$/.test(prefer)) upstreamHeaders.set('Prefer', prefer);
  const range = request.headers.get('Range');
  if (range && /^\d+-\d*$/.test(range)) upstreamHeaders.set('Range', range);
  try {
    const upstream = await fetch(target, {
      method: request.method, headers: upstreamHeaders, body,
      signal: AbortSignal.timeout(15000)
    });
    const responseHeaders = new Headers(headers);
    for (const name of ['Content-Range', 'Preference-Applied', 'Content-Type']) {
      const value = upstream.headers.get(name);
      if (value) responseHeaders.set(name, value);
    }
    return new Response(upstream.body, { status: upstream.status, headers: responseHeaders });
  } catch {
    return json({ error: 'The AURORA data service is temporarily unavailable.' }, headers, 502);
  }
}
