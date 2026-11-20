interface VoicesEnv {
  [key: string]: string | undefined;
  ELEVENLABS_API_KEY?: string;
  ELEVENLAB_API_KEY?: string;
  AURORA_ALLOWED_ORIGIN?: string;
}

function cors(request: Request, env: VoicesEnv): Headers {
  const origin = request.headers.get("Origin") || "";
  const configured = (env.AURORA_ALLOWED_ORIGIN || "").split(",").map(value => value.trim().replace(/\/+$/, "")).filter(Boolean);
  const allowed = new Set([
    "https://localhost",
    "http://localhost",
    "capacitor://localhost",
    "ionic://localhost",
    "https://aurora-ten-gold.vercel.app",
    ...configured
  ]);
  let preview = false;
  try {
    const parsed = new URL(origin);
    preview = parsed.protocol === "https:" && /^aurora-[a-z0-9-]+-smart-bm\.vercel\.app$/i.test(parsed.hostname);
  } catch {}
  const headers = new Headers({
    "Vary": "Origin",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, apikey, x-client-info",
    "Access-Control-Max-Age": "86400",
    "Cache-Control": "no-store"
  });
  if (origin && (origin === new URL(request.url).origin || allowed.has(origin) || preview)) {
    headers.set("Access-Control-Allow-Origin", origin);
  }
  return headers;
}

function json(body: unknown, headers: Headers, status = 200): Response {
  headers.set("Content-Type", "application/json; charset=utf-8");
  return new Response(JSON.stringify(body), { status, headers });
}

export async function handleVoices(request: Request, env: VoicesEnv): Promise<Response> {
  const headers = cors(request, env);
  const origin = request.headers.get("Origin") || "";
  if (origin && !headers.has("Access-Control-Allow-Origin")) {
    return json({ error: "Origin not allowed." }, headers, 403);
  }
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers });
  if (request.method !== "GET") {
    headers.set("Allow", "GET, OPTIONS");
    return json({ error: "Use GET." }, headers, 405);
  }

  const key = env.ELEVENLABS_API_KEY || env.ELEVENLAB_API_KEY || "";
  if (!key) {
    return json({ error: "Voice service is not configured.", code: "VOICE_KEY_MISSING" }, headers, 503);
  }

  const incoming = new URL(request.url);
  const pageSizeValue = Number(incoming.searchParams.get("page_size") || 100);
  const pageSize = Number.isInteger(pageSizeValue) ? Math.max(1, Math.min(100, pageSizeValue)) : 100;
  const pageToken = incoming.searchParams.get("next_page_token") || "";
  if (pageToken.length > 500) return json({ error: "Invalid voice catalogue page token." }, headers, 400);

  const upstreamUrl = new URL("https://api.elevenlabs.io/v2/voices");
  upstreamUrl.searchParams.set("page_size", String(pageSize));
  upstreamUrl.searchParams.set("include_total_count", "false");
  if (pageToken) upstreamUrl.searchParams.set("next_page_token", pageToken);

  try {
    const upstream = await fetch(upstreamUrl, {
      method: "GET",
      headers: { "xi-api-key": key, Accept: "application/json" },
      signal: AbortSignal.timeout(12000)
    });
    const payload: any = await upstream.json().catch(() => ({}));
    if (!upstream.ok) {
      const detail = payload?.detail;
      const providerErrorType = typeof detail?.type === "string" ? detail.type : undefined;
      const providerErrorCode = typeof detail?.code === "string" ? detail.code : undefined;
      return json({
        error: "AURORA could not load voices from the connected ElevenLabs account.",
        code: "VOICE_LIST_PROVIDER_ERROR",
        providerStatus: upstream.status,
        ...(providerErrorType ? { providerErrorType } : {}),
        ...(providerErrorCode ? { providerErrorCode } : {})
      }, headers, upstream.status === 429 ? 429 : 502);
    }

    const voices = (Array.isArray(payload?.voices) ? payload.voices : [])
      .filter((voice: any) => voice && typeof voice.voice_id === "string" && typeof voice.name === "string")
      .map((voice: any) => ({
        voice_id: voice.voice_id,
        name: voice.name,
        category: typeof voice.category === "string" ? voice.category : "",
        labels: voice.labels && typeof voice.labels === "object" && !Array.isArray(voice.labels) ? voice.labels : {},
        description: typeof voice.description === "string" ? voice.description.slice(0, 240) : "",
        preview_url: typeof voice.preview_url === "string" && /^https:\/\//i.test(voice.preview_url) ? voice.preview_url : ""
      }));

    return json({
      voices,
      hasMore: Boolean(payload?.has_more),
      nextPageToken: typeof payload?.next_page_token === "string" ? payload.next_page_token : null
    }, headers);
  } catch (error: any) {
    const timedOut = error?.name === "TimeoutError" || error?.name === "AbortError";
    return json({
      error: timedOut ? "Loading voices from ElevenLabs timed out." : "AURORA could not reach ElevenLabs to load voices.",
      code: timedOut ? "VOICE_LIST_TIMEOUT" : "VOICE_LIST_NETWORK_ERROR"
    }, headers, 502);
  }
}
