import { handleChat } from './chat';

interface AdminEnv {
  [key: string]: any;
  SUPABASE_URL?: string; VITE_SUPABASE_URL?: string; VITE_SUPABASE_API?: string;
  SUPABASE_ANON_KEY?: string; VITE_SUPABASE_ANON_KEY?: string;
  ADMIN_EMAIL_ALLOWLIST?: string; AURORA_ALLOWED_ORIGIN?: string;
}
const PROVIDERS = {
  groq: { key: 'GROQ_API_KEY', url: 'https://api.groq.com/openai/v1/chat/completions', model: (env: AdminEnv) => env.GROQ_MODEL || 'openai/gpt-oss-20b' },
  openrouter: { key: 'OPENROUTER_API_KEY', url: 'https://openrouter.ai/api/v1/chat/completions', model: (env: AdminEnv) => env.OPENROUTER_MODEL || 'openrouter/free' },
  gemini: { key: 'GEMINI_API_KEY', url: 'https://generativelanguage.googleapis.com/v1beta/models/', model: (env: AdminEnv) => (env.GEMINI_MODEL || 'gemini-2.5-flash').replace(/^models\//, '') }
};
function baseUrl(env: AdminEnv): string {
  return String(env.SUPABASE_URL || env.VITE_SUPABASE_URL || env.VITE_SUPABASE_API || '').trim().replace(/\/$/, '').replace(/\/(?:rest\/v1|auth\/v1)$/i, '');
}
function headers(request: Request, env: AdminEnv, methods: string): Headers {
  const origin = request.headers.get('Origin') || '';
  const configured = String(env.AURORA_ALLOWED_ORIGIN || '').split(',').map(v => v.trim().replace(/\/+$/, '')).filter(Boolean);
  const allowed = new Set([new URL(request.url).origin, 'https://localhost', 'http://localhost', 'capacitor://localhost', 'ionic://localhost', 'https://aurora-ten-gold.vercel.app', ...configured]);
  let preview = false;
  try { const u = new URL(origin); preview = u.protocol === 'https:' && /^aurora-[a-z0-9-]+-smart-bm\.vercel\.app$/i.test(u.hostname); } catch {}
  const h = new Headers({ 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'Vary': 'Origin, Authorization', 'Access-Control-Allow-Methods': methods, 'Access-Control-Allow-Headers': 'Content-Type, Authorization, apikey, x-client-info', 'Access-Control-Max-Age': '86400' });
  if (origin && (allowed.has(origin) || preview)) h.set('Access-Control-Allow-Origin', origin);
  return h;
}
function json(body: unknown, h: Headers, status = 200): Response { return new Response(JSON.stringify(body), { status, headers: h }); }
async function verifyAdmin(request: Request, env: AdminEnv): Promise<{ email: string } | { error: string; status: number }> {
  const token = (request.headers.get('Authorization') || '').match(/^Bearer\s+([^\s]+)$/i)?.[1];
  if (!token) return { error: 'Sign in with the administrator account first.', status: 401 };
  const url = baseUrl(env), key = env.SUPABASE_ANON_KEY || env.VITE_SUPABASE_ANON_KEY || '';
  if (!url || !key) return { error: 'Authentication service is not configured on the server.', status: 503 };
  try {
    const response = await fetch(url + '/auth/v1/user', { headers: { apikey: key, Authorization: 'Bearer ' + token }, signal: AbortSignal.timeout(9000) });
    const user: any = await response.json().catch(() => ({}));
    if (!response.ok || typeof user.email !== 'string') return { error: 'Your sign-in session could not be verified. Please sign in again.', status: 401 };
    const allowlist = String(env.ADMIN_EMAIL_ALLOWLIST || 'alwerioghenepeace563@gmail.com').split(',').map(v => v.trim().toLowerCase()).filter(Boolean);
    const email = user.email.trim().toLowerCase();
    if (!allowlist.includes(email)) return { error: 'This account is not authorised to access AURORA Admin.', status: 403 };
    return { email };
  } catch { return { error: 'Could not verify administrator access right now.', status: 502 }; }
}
async function testProvider(name: keyof typeof PROVIDERS, env: AdminEnv): Promise<Record<string, unknown>> {
  const config = PROVIDERS[name], key = env[config.key];
  if (!key) return { configured: false, status: 'missing', latencyMs: null, message: 'Server credential is not configured.' };
  const started = Date.now();
  try {
    const gemini = name === 'gemini';
    const url = gemini ? config.url + encodeURIComponent(config.model(env)) + ':generateContent?key=' + encodeURIComponent(key) : config.url;
    const payload = gemini
      ? { contents: [{ parts: [{ text: 'Reply with OK.' }] }], generationConfig: { maxOutputTokens: 4, temperature: 0 } }
      : { model: config.model(env), messages: [{ role: 'user', content: 'Reply with OK.' }], max_tokens: 3, temperature: 0 };
    const response = await fetch(url, { method: 'POST', headers: gemini ? { 'Content-Type': 'application/json' } : { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' }, body: JSON.stringify(payload), signal: AbortSignal.timeout(12000) });
    const data: any = await response.json().catch(() => ({})), latencyMs = Date.now() - started;
    if (!response.ok) {
      const raw = String(data?.error?.message || data?.message || 'Provider returned HTTP ' + response.status + '.');
      const safe = raw.replace(/https?:\/\/\S+/g, '[provider link]').replace(/\b[A-Za-z0-9_-]{24,}\b/g, '[redacted]').slice(0, 180);
      return { configured: true, status: 'error', latencyMs, httpStatus: response.status, message: safe };
    }
    const online = gemini ? Boolean(data?.candidates?.[0]?.content?.parts?.length) : Boolean(data?.choices?.length);
    return { configured: true, status: online ? 'online' : 'no_response', latencyMs, httpStatus: response.status, message: online ? 'Live test succeeded.' : 'Provider responded without a text candidate.' };
  } catch (error: any) {
    return { configured: true, status: 'error', latencyMs: Date.now() - started, message: error?.name === 'TimeoutError' ? 'Provider test timed out.' : 'Could not connect to provider endpoint.' };
  }
}
export async function handleAdmin(request: Request, env: AdminEnv, action: 'status' | 'execute'): Promise<Response> {
  const h = headers(request, env, 'GET, POST, OPTIONS'), origin = request.headers.get('Origin') || '';
  if (origin && !h.has('Access-Control-Allow-Origin')) return json({ error: 'Origin not allowed.' }, h, 403);
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: h });
  const expected = action === 'status' ? 'GET' : 'POST';
  if (request.method !== expected) { h.set('Allow', expected + ', OPTIONS'); return json({ error: 'Use ' + expected + '.' }, h, 405); }
  let body: any = {};
  if (action === 'execute') {
    try { body = await request.json(); } catch { return json({ error: 'Send a valid JSON body.' }, h, 400); }
    if (body?.action !== 'test_providers') return json({ error: 'Unsupported action. Allowed action: test_providers.' }, h, 400);
  }
  const auth = await verifyAdmin(request, env);
  if ('error' in auth) return json({ error: auth.error }, h, auth.status);
  if (action === 'status') {
    return json({ authorized: true, adminEmail: auth.email, providers: { groq: Boolean(env.GROQ_API_KEY), openrouter: Boolean(env.OPENROUTER_API_KEY), gemini: Boolean(env.GEMINI_API_KEY) }, checkedAt: new Date().toISOString() }, h);
  }
  const names = Object.keys(PROVIDERS) as (keyof typeof PROVIDERS)[];
  const entries = await Promise.all(names.map(async name => [name, await testProvider(name, env)] as const));
  const providers = Object.fromEntries(entries);
  return json({ authorized: true, action: 'test_providers', executedAt: new Date().toISOString(), executedBy: auth.email, providers, summary: { total: names.length, online: Object.values(providers).filter((v: any) => v.status === 'online').length, configured: Object.values(providers).filter((v: any) => v.configured).length } }, h);
}
export async function handleVersionedChat(request: Request, env: AdminEnv): Promise<Response> {
  const h = headers(request, env, 'POST, OPTIONS'), origin = request.headers.get('Origin') || '';
  if (origin && !h.has('Access-Control-Allow-Origin')) return json({ error: 'Origin not allowed.' }, h, 403);
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: h });
  if (request.method !== 'POST') { h.set('Allow', 'POST, OPTIONS'); return json({ error: 'Use POST.' }, h, 405); }
  const token = (request.headers.get('Authorization') || '').match(/^Bearer\s+([^\s]+)$/i)?.[1];
  if (!token) return json({ error: 'Sign in to use AURORA Core.', code: 'AUTH_REQUIRED' }, h, 401);
  const url = baseUrl(env), key = env.SUPABASE_ANON_KEY || env.VITE_SUPABASE_ANON_KEY || '';
  if (!url || !key) return json({ error: 'Authentication service is not configured on the server.' }, h, 503);
  try {
    const auth = await fetch(url + '/auth/v1/user', { headers: { apikey: key, Authorization: 'Bearer ' + token }, signal: AbortSignal.timeout(9000) });
    if (!auth.ok) return json({ error: 'Your sign-in session is invalid or expired. Please sign in again.', code: 'AUTH_REQUIRED' }, h, 401);
  } catch { return json({ error: 'AURORA could not reach the sign-in service.' }, h, 502); }
  let body: any;
  try { body = await request.clone().json(); } catch { return json({ error: 'Send a valid JSON body.' }, h, 400); }
  if (!body || !Array.isArray(body.messages) || body.messages.length < 1 || body.messages.length > 20) return json({ error: 'Send between 1 and 20 messages.' }, h, 400);
  for (const message of body.messages) {
    if (!message || !['user', 'assistant'].includes(message.role) || typeof message.content !== 'string' || !message.content.trim() || message.content.length > 6000) return json({ error: 'Each message needs a valid role and text up to 6000 characters.' }, h, 400);
  }
  return handleChat(request, env as any);
}


/**
 * AURORA Admin Code Editor: prepares a narrowly-scoped patch and opens a PR.
 * It never writes to the base branch and never merges or deploys.
 */
export async function handleAdminCode(request: Request, env: AdminEnv): Promise<Response> {
  const h = headers(request, env, 'POST, OPTIONS'), origin = request.headers.get('Origin') || '';
  if (origin && !h.has('Access-Control-Allow-Origin')) return json({ error: 'Origin not allowed.' }, h, 403);
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: h });
  if (request.method !== 'POST') { h.set('Allow', 'POST, OPTIONS'); return json({ error: 'Use POST.' }, h, 405); }

  let body: any;
  try { body = await request.json(); } catch { return json({ error: 'Send a valid JSON body.' }, h, 400); }
  const prompt = typeof body?.prompt === 'string' ? body.prompt.trim() : '';
  if (body?.action !== 'edit_code' || !prompt || prompt.length > 2500) {
    return json({ error: 'Provide action=edit_code and a prompt under 2500 characters.' }, h, 400);
  }

  const auth = await verifyAdmin(request, env);
  if ('error' in auth) return json({ error: auth.error }, h, auth.status);

  const githubToken = env.AURORA_GITHUB_TOKEN || env.GITHUB_TOKEN;
  const provider = env.GROQ_API_KEY
    ? { key: env.GROQ_API_KEY, url: 'https://api.groq.com/openai/v1/chat/completions', model: env.GROQ_MODEL || 'openai/gpt-oss-20b' }
    : env.OPENROUTER_API_KEY
      ? { key: env.OPENROUTER_API_KEY, url: 'https://openrouter.ai/api/v1/chat/completions', model: env.OPENROUTER_MODEL || 'openrouter/free' }
      : null;
  if (!githubToken) return json({ error: 'Code editing is not configured: add AURORA_GITHUB_TOKEN to the Cloudflare Worker secrets.' }, h, 503);
  if (!provider) return json({ error: 'Configure GROQ_API_KEY or OPENROUTER_API_KEY before using code editing.' }, h, 503);

  const repo = String(env.AURORA_GITHUB_REPO || 'alwerioghenepeace563-jpg/AURORA-');
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repo)) return json({ error: 'AURORA_GITHUB_REPO is invalid.' }, h, 503);
  const base = String(env.AURORA_GITHUB_BASE_BRANCH || 'main');
  const allowedPaths = ['src/App.jsx', 'src/styles.css', 'api/chat.js'];
  const requestedPaths = ['src/App.jsx', 'src/styles.css'];
  if (/\b(api|provider|fallback|quota|chat|voice|speech|response|model|endpoint|gemini|groq|openrouter|brain)\b/i.test(prompt)) requestedPaths.push('api/chat.js');

  const gh = async (path: string, init: RequestInit = {}): Promise<any> => {
    const response = await fetch('https://api.github.com/repos/' + repo + path, {
      ...init, signal: AbortSignal.timeout(12000),
      headers: { Accept: 'application/vnd.github+json', Authorization: 'Bearer ' + githubToken,
        'X-GitHub-Api-Version': '2022-11-28', ...(init.body ? { 'Content-Type': 'application/json' } : {}) }
    });
    const data: any = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error('GitHub request failed with HTTP ' + response.status + '.');
    return data;
  };

  try {
    const ref = await gh('/git/ref/heads/' + encodeURIComponent(base));
    const files: Array<{path:string; sha:string; content:string}> = [];
    for (const path of requestedPaths) {
      const file = await gh('/contents/' + path + '?ref=' + encodeURIComponent(base));
      if (typeof file.content !== 'string' || !file.sha) throw new Error('Could not read an allowed source file.');
      const binary = atob(file.content.replace(/\s/g, ''));
      const bytes = Uint8Array.from(binary, (char: string) => char.charCodeAt(0));
      files.push({ path, sha: file.sha, content: new TextDecoder().decode(bytes) });
    }

    const system = 'You are the AURORA code editor. Return ONLY JSON with shape {"summary":string,"changes":[{"path":string,"find":string,"replace":string}],"checks":string[]}. Make small exact search/replace patches only. Allowed paths: ' + allowedPaths.join(', ') + '. Never edit authentication, secrets, deployment workflows, package manifests, or security controls. Max 6 changes. Each find must be an exact unique substring in its complete file. If the supplied excerpt is insufficient, return an empty changes array.';
    const context = files.map(file => '--- ' + file.path + ' (excerpt; complete file is checked server-side) ---\n' + file.content.slice(0, 12000)).join('\n');
    const ai = await fetch(provider.url, { method: 'POST',
      headers: { Authorization: 'Bearer ' + provider.key, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: provider.model, messages: [
        { role: 'system', content: system },
        { role: 'user', content: 'Requested change: ' + prompt + '\n\nCurrent source excerpts:\n' + context }
      ], temperature: 0.1, max_tokens: 2400 }), signal: AbortSignal.timeout(20000) });
    const aiData: any = await ai.json().catch(() => ({}));
    if (!ai.ok) return json({ error: 'The code-editing AI provider returned HTTP ' + ai.status + '.' }, h, 502);
    const raw = String(aiData?.choices?.[0]?.message?.content || '').trim().replace(/^\`\`\`(?:json)?\s*/i, '').replace(/\s*\`\`\`$/, '');
    const start = raw.indexOf('{'), end = raw.lastIndexOf('}');
    if (start < 0 || end <= start) return json({ error: 'The code-editing provider did not return a valid patch.' }, h, 422);
    let patch: any;
    try { patch = JSON.parse(raw.slice(start, end + 1)); } catch { return json({ error: 'The code-editing provider returned invalid JSON.' }, h, 422); }
    if (!Array.isArray(patch?.changes) || patch.changes.length < 1 || patch.changes.length > 6) {
      return json({ error: String(patch?.summary || 'No safe code changes were prepared.').slice(0, 240) }, h, 422);
    }

    const changed = new Set<string>();
    for (const change of patch.changes) {
      const file = files.find(item => item.path === change?.path);
      if (!file || !allowedPaths.includes(change.path) || typeof change.find !== 'string' || !change.find ||
          typeof change.replace !== 'string' || change.replace.length > 20000 || changed.size > 6) {
        return json({ error: 'The generated patch failed path or size validation. No repository files were changed.' }, h, 422);
      }
      const at = file.content.indexOf(change.find);
      if (at < 0 || file.content.indexOf(change.find, at + 1) >= 0) {
        return json({ error: 'The exact patch target was missing or ambiguous in ' + file.path + '. No repository files were changed.' }, h, 422);
      }
      file.content = file.content.slice(0, at) + change.replace + file.content.slice(at + change.find.length);
      if (file.content.length > 350000) return json({ error: 'The resulting file exceeds the safe size limit.' }, h, 422);
      changed.add(file.path);
    }

    const safeSummary = String(patch.summary || 'Code update').replace(/[\r\n]+/g, ' ').slice(0, 100);
    const branch = 'aurora-executor/' + crypto.randomUUID().slice(0, 12);
    await gh('/git/refs', { method: 'POST', body: JSON.stringify({ ref: 'refs/heads/' + branch, sha: ref?.object?.sha }) });
    for (const path of changed) {
      const file = files.find(item => item.path === path)!;
      const encoded = btoa(Array.from(new TextEncoder().encode(file.content), byte => String.fromCharCode(byte)).join(''));
      await gh('/contents/' + path, { method: 'PUT', body: JSON.stringify({
        message: 'AURORA Executor: ' + safeSummary, content: encoded, branch, sha: file.sha
      }) });
    }
    const pr = await gh('/pulls', { method: 'POST', body: JSON.stringify({
      title: 'AURORA Executor: ' + safeSummary, head: branch, base,
      body: 'Requested change: ' + prompt + '\n\nSummary: ' + safeSummary +
        '\n\nFiles changed: ' + [...changed].join(', ') +
        '\n\nPrepared by AURORA Admin Code Editor for review. No merge or deployment was performed. Run the project checks and review the diff before merging.'
    }) });
    return json({ ok: true, summary: safeSummary, filesChanged: [...changed],
      pullRequest: { number: pr.number, url: pr.html_url, title: pr.title },
      checks: Array.isArray(patch.checks) ? patch.checks.slice(0, 8) : [],
      message: 'Changes were prepared in a review pull request. Nothing was merged or deployed.' }, h);
  } catch (error: any) {
    return json({ error: String(error?.message || 'Code editing failed').slice(0, 240) }, h, 502);
  }
}
