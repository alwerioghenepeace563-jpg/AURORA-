interface VoiceTextEnv {
  [key: string]: any;
  SUPABASE_URL?: string;
  SUPABASE_ANON_KEY?: string;
  VITE_SUPABASE_URL?: string;
  VITE_SUPABASE_API?: string;
  VITE_SUPABASE_ANON_KEY?: string;
  VOICETEXT_API_URL?: string;
  VOICETEXT_PLUGIN_TOKEN?: string;
  AURORA_ALLOWED_ORIGIN?: string;
}

const DEFAULT_LANGUAGE = "Nigerian English and Nigerian Pidgin; preserve the language actually spoken";
const AUDIO_TYPES = new Set(["audio/wav", "audio/x-wav", "audio/mpeg", "audio/mp3", "audio/ogg", "audio/mp4", "audio/aac", "audio/webm"]);
const UUID = /^[0-9a-f-]{36}$/i;
const safeText = (value: unknown, max = 420): string => typeof value === "string" ? value.slice(0, max) : "";

function headersFor(request: Request, env: VoiceTextEnv): Headers {
  const origin = request.headers.get("Origin") || "";
  const allowed = new Set([
    new URL(request.url).origin,
    "https://localhost", "http://localhost", "capacitor://localhost",
    "ionic://localhost", "https://aurora-ten-gold.vercel.app",
    ...(env.AURORA_ALLOWED_ORIGIN || "").split(",").map((value: string) => value.trim().replace(/\/+$/, "")).filter(Boolean)
  ]);
  let preview = false;
  try {
    const parsed = new URL(origin);
    preview = parsed.protocol === "https:" && /^aurora-[a-z0-9-]+-smart-bm\.vercel\.app$/i.test(parsed.hostname);
  } catch {}
  const headers = new Headers({
    "Vary": "Origin",
    "Cache-Control": "no-store",
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, apikey, x-client-info",
    "Access-Control-Max-Age": "86400"
  });
  if (origin && (allowed.has(origin) || preview)) headers.set("Access-Control-Allow-Origin", origin);
  return headers;
}

function json(body: unknown, headers: Headers, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers });
}

function supabaseBase(env: VoiceTextEnv): string {
  return (env.SUPABASE_URL || env.VITE_SUPABASE_URL || env.VITE_SUPABASE_API || "")
    .trim().replace(/\/$/, "").replace(/\/(?:rest\/v1|auth\/v1)$/i, "");
}

function upstreamEndpoint(env: VoiceTextEnv): URL | null {
  try {
    const target = new URL(env.VOICETEXT_API_URL || "https://aurora-voicetext-qk8s.vercel.app/api/aurora-transcribe");
    if (target.protocol !== "https:" || target.username || target.password ||
        !/^\/api\/aurora-transcribe\/?$/.test(target.pathname) || target.search || target.hash) return null;
    return target;
  } catch { return null; }
}

export async function handleVoiceText(request: Request, env: VoiceTextEnv): Promise<Response> {
  const headers = headersFor(request, env);
  const origin = request.headers.get("Origin") || "";
  if (origin && !headers.has("Access-Control-Allow-Origin")) return json({ error: "Origin not allowed." }, headers, 403);
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers });
  if (!["GET", "POST"].includes(request.method)) {
    headers.set("Allow", "GET, POST, OPTIONS");
    return json({ error: "Use GET or POST." }, headers, 405);
  }

  const supabaseUrl = supabaseBase(env);
  const anonKey = env.SUPABASE_ANON_KEY || env.VITE_SUPABASE_ANON_KEY || "";
  const accessToken = (request.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "").trim();
  if (!supabaseUrl || !anonKey || !accessToken) {
    return json({ error: "Sign in to AURORA before using persistent VoiceText jobs." }, headers, 401);
  }

  let owner: any;
  try {
    const identity = await fetch(supabaseUrl + "/auth/v1/user", {
      headers: { apikey: anonKey, Authorization: "Bearer " + accessToken },
      signal: AbortSignal.timeout(8000)
    });
    if (!identity.ok) return json({ error: "Your AURORA session is invalid or expired. Sign in again." }, headers, 401);
    owner = await identity.json();
  } catch {
    return json({ error: "AURORA could not verify your sign-in session." }, headers, 503);
  }
  if (typeof owner?.id !== "string" || !UUID.test(owner.id)) {
    return json({ error: "A verified AURORA account is required." }, headers, 401);
  }

  const pluginToken = env.VOICETEXT_PLUGIN_TOKEN || "";
  if (!pluginToken) return json({ error: "The VoiceText integration is not configured on the AURORA server." }, headers, 503);
  const target = upstreamEndpoint(env);
  if (!target) return json({ error: "A secure VoiceText transcription endpoint must be configured." }, headers, 503);

  let body: any = {};
  if (request.method === "POST") {
    const declaredLength = Number(request.headers.get("Content-Length") || 0);
    if (declaredLength > 4_500_000) return json({ error: "Request body is too large. Send smaller audio sections." }, headers, 413);
    try {
      const raw = await request.text();
      if (raw.length > 4_500_000) return json({ error: "Request body is too large. Send smaller audio sections." }, headers, 413);
      body = raw ? JSON.parse(raw) : {};
      if (!body || typeof body !== "object" || Array.isArray(body)) body = {};
    } catch { return json({ error: "A valid JSON request body is required." }, headers, 400); }
  }

  const action = request.method === "GET" ? "status" : (body.action || "transcribe");
  const url = new URL(request.url);
  const requestId = safeText(url.searchParams.get("requestId") || body.requestId, 80);
  let upstreamUrl = target.toString();
  let upstreamMethod = "POST";
  let upstreamBody: Record<string, unknown> | null = null;

  if (action === "status") {
    if (!UUID.test(requestId)) return json({ error: "A valid transcription requestId is required." }, headers, 400);
    const statusUrl = new URL(target);
    statusUrl.searchParams.set("requestId", requestId);
    upstreamUrl = statusUrl.toString();
    upstreamMethod = "GET";
  } else if (action === "create") {
    const totalChunks = Number(body.totalChunks);
    const sizeBytes = Number(body.sizeBytes);
    if (!Number.isInteger(totalChunks) || totalChunks < 1 || totalChunks > 2000 ||
        !Number.isSafeInteger(sizeBytes) || sizeBytes < 0) {
      return json({ error: "A valid recording size and section count are required." }, headers, 400);
    }
    const mimeType = safeText(body.mimeType, 100).toLowerCase();
    if (!/^audio\/[a-z0-9.+-]+$/.test(mimeType)) return json({ error: "A supported audio MIME type is required." }, headers, 415);
    upstreamBody = {
      action: "create",
      filename: safeText(body.filename || "recording", 180).split(/[\\/]/).pop(),
      mimeType, sizeBytes, totalChunks,
      durationSeconds: Number.isFinite(Number(body.durationSeconds)) ? Math.max(0, Number(body.durationSeconds)) : undefined,
      requestId: UUID.test(body.requestId || "") ? body.requestId : undefined
    };
  } else if (action === "process") {
    const audioBase64 = typeof body.audioBase64 === "string" ? body.audioBase64 : "";
    const mimeType = safeText(body.mimeType, 100).toLowerCase();
    const chunkNumber = Number(body.chunkNumber);
    const totalChunks = Number(body.totalChunks);
    if (!UUID.test(requestId) || !Number.isInteger(chunkNumber) ||
        !Number.isInteger(totalChunks) || totalChunks < 1 || totalChunks > 2000 ||
        chunkNumber < 1 || chunkNumber > totalChunks || !audioBase64 ||
        audioBase64.length > 4_000_000 || !/^[A-Za-z0-9+/]+={0,2}$/.test(audioBase64) || audioBase64.length % 4 !== 0) {
      return json({ error: "A valid job ID, section number within the job, and audio section are required." }, headers, 400);
    }
    if (!AUDIO_TYPES.has(mimeType)) return json({ error: "Unsupported audio section format." }, headers, 415);
    upstreamBody = {
      action: "process", requestId, chunkNumber, totalChunks, audioBase64, mimeType,
      languageHint: safeText(body.languageHint || DEFAULT_LANGUAGE, 120)
    };
  } else if (action === "transcribe") {
    const audioBase64 = typeof body.audioBase64 === "string" ? body.audioBase64 : "";
    const mimeType = safeText(body.mimeType, 100).toLowerCase();
    if (!audioBase64 || audioBase64.length > 4_000_000 ||
        !/^[A-Za-z0-9+/]+={0,2}$/.test(audioBase64) || audioBase64.length % 4 !== 0) {
      return json({ error: "Choose a valid audio file up to approximately 3 MB. Use persistent jobs for longer recordings." }, headers, audioBase64.length > 4_000_000 ? 413 : 400);
    }
    if (!AUDIO_TYPES.has(mimeType)) return json({ error: "VoiceText currently accepts audio files only. Select an audio recording rather than a video." }, headers, 415);
    upstreamBody = {
      audioBase64, mimeType,
      languageHint: safeText(body.languageHint || DEFAULT_LANGUAGE, 120),
      requestId: safeText(body.requestId, 80) || undefined
    };
  } else {
    return json({ error: "Unknown action. Use create, process, or status." }, headers, 400);
  }

  try {
    const upstream = await fetch(upstreamUrl, {
      method: upstreamMethod,
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + pluginToken,
        "X-AURORA-USER-TOKEN": accessToken
      },
      ...(upstreamBody ? { body: JSON.stringify(upstreamBody) } : {}),
      redirect: "manual",
      signal: AbortSignal.timeout(55_000)
    });
    if (upstream.status >= 300 && upstream.status < 400) {
      return json({ error: "VoiceText endpoint redirects are not allowed." }, headers, 502);
    }
    const payload: any = await upstream.json().catch(() => ({}));
    if (!upstream.ok) {
      return json({
        error: safeText(payload.error) || "VoiceText could not complete this request.",
        retryable: payload.retryable === true,
        ...(payload.requestId ? { requestId: payload.requestId } : {}),
        ...(Number.isInteger(payload.completedChunks) ? { completedChunks: payload.completedChunks } : {}),
        ...(Number.isInteger(payload.totalChunks) ? { totalChunks: payload.totalChunks } : {})
      }, headers, upstream.status === 401 ? 502 : upstream.status);
    }

    if (action === "transcribe") {
      const transcript = typeof payload.text === "string" ? payload.text.trim() : "";
      if (!transcript) return json({ error: "VoiceText returned an empty transcript." }, headers, 502);
      const segments = Array.isArray(payload.segments) ? payload.segments.slice(0, 5000).filter((item: any) =>
        item && Number.isFinite(item.start) && Number.isFinite(item.end) && typeof item.text === "string"
      ).map((item: any) => ({
        start: Math.max(0, Number(item.start)), end: Math.max(0, Number(item.end)),
        text: item.text.slice(0, 2000),
        ...(typeof item.speaker === "string" ? { speaker: item.speaker.slice(0, 80) } : {})
      })) : [];
      return json({
        text: transcript,
        language: typeof payload.language === "string" ? payload.language : null,
        segments,
        provider: safeText(payload.provider, 80) || "aurora-voicetext",
        completedAt: payload.completedAt || new Date().toISOString(),
        source: "AURORA VoiceText"
      }, headers);
    }
    return json({ ...payload, source: "AURORA VoiceText" }, headers, action === "create" ? 201 : 200);
  } catch (error: any) {
    const timeout = error?.name === "TimeoutError" || error?.name === "AbortError";
    return json({
      error: timeout ? "VoiceText took too long to respond. Resume from the last saved section." : "AURORA could not reach VoiceText. Check the integration configuration and try again.",
      retryable: true
    }, headers, timeout ? 504 : 502);
  }
}
