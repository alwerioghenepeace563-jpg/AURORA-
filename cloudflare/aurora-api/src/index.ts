import { handleChat } from './chat';
import { getMcpStatus } from './mcp';
import { researchMemoryConfigured } from './research-memory';
import { handleCalling } from './calling';
import { handleResearch } from './research';
import { handleData } from './data';
import { handleVoice } from './voice';
import { handleMediaGenerate } from './media';
import { handleVoices } from './voices';
import { handleWeather } from './weather';
import { handleVoiceText } from './voicetext';
import { handleMediaSearch } from './media-search';
import { handleAdmin, handleAdminCode, handleVersionedChat } from './admin';
interface Env {
  [key: string]: any;
  LEGACY_API_ORIGIN?: string;
  AURORA_BACKEND_STAGE?: string;
  ASSETS: { fetch(request: Request): Promise<Response> };
}

const JSON_HEADERS = {
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store"
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: JSON_HEADERS
  });
}

function normalizedOrigin(value: string): URL | null {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password || url.pathname !== "/" || url.search || url.hash) return null;
    return url;
  } catch {
    return null;
  }
}

function workerRouteOriginAllowed(request: Request, env: Env): boolean {
  const origin = request.headers.get("Origin") || "";
  if (!origin) return true;
  if (origin === new URL(request.url).origin) return true;
  const configured = (env.AURORA_ALLOWED_ORIGIN || "").split(",").map((value: string) => value.trim().replace(/\/+$/, "")).filter(Boolean);
  const native = new Set(["https://localhost", "http://localhost", "capacitor://localhost", "ionic://localhost", "https://aurora-ten-gold.vercel.app", ...configured]);
  if (native.has(origin)) return true;
  try {
    const parsed = new URL(origin);
    return parsed.protocol === "https:" && /^aurora-[a-z0-9-]+-smart-bm\.vercel\.app$/i.test(parsed.hostname);
  } catch { return false; }
}

function corsHeaders(request: Request, env: Env, methods: string): Headers {
  const origin = request.headers.get("Origin") || "";
  const configured = (env.AURORA_ALLOWED_ORIGIN || "").split(",").map((value: string) => value.trim().replace(/\/+$/, "")).filter(Boolean);
  const native = new Set(["https://localhost", "http://localhost", "capacitor://localhost", "ionic://localhost", "https://aurora-ten-gold.vercel.app", ...configured]);
  let preview = false;
  try {
    const parsed = new URL(origin);
    preview = parsed.protocol === "https:" && /^aurora-[a-z0-9-]+-smart-bm\.vercel\.app$/i.test(parsed.hostname);
  } catch {}
  const headers = new Headers({
    "Vary": "Origin",
    "Access-Control-Allow-Methods": methods,
    "Access-Control-Allow-Headers": "Content-Type, Authorization, apikey, x-client-info",
    "Access-Control-Max-Age": "86400",
    "Cache-Control": "no-store"
  });
  const sameOrigin = origin === new URL(request.url).origin;
  if (origin && (sameOrigin || native.has(origin) || preview)) headers.set("Access-Control-Allow-Origin", origin);
  return headers;
}

function jsonWithHeaders(body: unknown, headers: Headers, status = 200): Response {
  headers.set("Content-Type", "application/json; charset=utf-8");
  return new Response(JSON.stringify(body), { status, headers });
}

function configuredProviderNames(env: Env): string[] {
  return [env.GROQ_API_KEY ? "groq" : null, env.OPENROUTER_API_KEY ? "openrouter" : null, env.GEMINI_API_KEY ? "gemini" : null]
    .filter((value): value is string => Boolean(value));
}

async function handleMetadata(request: Request, env: Env, route: string): Promise<Response> {
  const headers = corsHeaders(request, env, "GET, OPTIONS");
  const origin = request.headers.get("Origin") || "";
  if (origin && !headers.has("Access-Control-Allow-Origin")) return jsonWithHeaders({ error: "Origin not allowed." }, headers, 403);
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers });
  if (request.method !== "GET") {
    headers.set("Allow", "GET");
    return jsonWithHeaders({ error: "Use GET." }, headers, 405);
  }

  if (route === "health") {
    const providers = configuredProviderNames(env);
    const voiceKey = Boolean(env.ELEVENLABS_API_KEY || env.ELEVENLAB_API_KEY);
    const voiceId = Boolean(env.ELEVENLABS_VOICE_ID || env.ELEVENLAB_VOICE_ID ||
      env.ELEVENLABS_JESSICA_VOICE_ID || env.ELEVENLABS_BELLA_VOICE_ID ||
      env.ELEVENLABS_LAURA_VOICE_ID || env.ELEVENLABS_LUCIAN_VOICE_ID || env.ELEVENLAB_LUCIAN_VOICE_ID);
    const supabase = Boolean((env.SUPABASE_URL || env.VITE_SUPABASE_URL || env.VITE_SUPABASE_API) &&
      (env.SUPABASE_ANON_KEY || env.VITE_SUPABASE_ANON_KEY));
    const voiceText = Boolean(env.VOICETEXT_PLUGIN_TOKEN && supabase);
    const sharedState = Boolean((env.UPSTASH_REDIS_REST_URL || env.KV_REST_API_URL) &&
      (env.UPSTASH_REDIS_REST_TOKEN || env.KV_REST_API_TOKEN));
    const githubCodeEdit = Boolean((env.AURORA_GITHUB_TOKEN || env.GITHUB_TOKEN) &&
      (env.GROQ_API_KEY || env.OPENROUTER_API_KEY) && supabase);
    return jsonWithHeaders({
      ok: true, service: "AURORA API", method: request.method,
      configuredProviders: providers,
      providerOrder: ["groq", "openrouter", "gemini"].filter(provider => providers.includes(provider)),
      providerState: sharedState ? "shared-kv-and-client-sticky" : "client-sticky-plus-instance-fallback",
      integrations: {
        supabaseAuth: supabase, userScopedData: supabase, imageGeneration: Boolean(env.GEMINI_API_KEY),
        voiceKey, voiceId, voice: voiceKey && voiceId, voiceTextBridge: voiceText,
        sharedProviderState: sharedState, adminCodeEditing: githubCodeEdit,
        remoteMcp: getMcpStatus(env),
        researchMemory: { configured: researchMemoryConfigured(env) && Boolean(env.SUPABASE_URL || env.VITE_SUPABASE_URL || env.VITE_SUPABASE_API) && Boolean(env.SUPABASE_ANON_KEY || env.VITE_SUPABASE_ANON_KEY) }
      }
    }, headers);
  }

  if (route === "public-config") {
    const supabaseUrl = (env.SUPABASE_URL || env.VITE_SUPABASE_URL || env.VITE_SUPABASE_API || "")
      .trim().replace(/\/$/, "").replace(/\/(?:rest\/v1|auth\/v1)$/i, "");
    const supabaseAnonKey = env.SUPABASE_ANON_KEY || env.VITE_SUPABASE_ANON_KEY || "";
    if (!supabaseUrl || !supabaseAnonKey) return jsonWithHeaders({ error: "Public sign-in configuration is not available on the server." }, headers, 503);
    return jsonWithHeaders({ supabaseUrl, supabaseAnonKey }, headers);
  }

  if (route === "models") {
    if (!env.GEMINI_API_KEY) return jsonWithHeaders({ error: "GEMINI_API_KEY is not configured on the server." }, headers, 503);
    try {
      const upstream = await fetch("https://generativelanguage.googleapis.com/v1beta/models?pageSize=100", {
        headers: { "x-goog-api-key": env.GEMINI_API_KEY },
        signal: AbortSignal.timeout(12000)
      });
      const data: any = await upstream.json().catch(() => ({}));
      if (!upstream.ok) {
        const message = typeof data?.error?.message === "string" ? data.error.message : "Could not list Gemini models.";
        return jsonWithHeaders({ error: "Gemini model listing failed.", diagnostic: { providerStatus: upstream.status, providerMessage: message.slice(0, 240) } }, headers, 502);
      }
      const models = (Array.isArray(data.models) ? data.models : [])
        .filter((model: any) => Array.isArray(model.supportedGenerationMethods) && model.supportedGenerationMethods.includes("generateContent"))
        .map((model: any) => ({
          name: typeof model.baseModelId === "string" ? model.baseModelId : String(model.name || "").replace(/^models\//, ""),
          displayName: model.displayName || ""
        }))
        .filter((model: any) => model.name);
      return jsonWithHeaders({ count: models.length, models }, headers);
    } catch {
      return jsonWithHeaders({ error: "Could not reach Gemini to list models." }, headers, 502);
    }
  }

  return jsonWithHeaders({ error: "Unknown AURORA metadata route." }, headers, 404);
}

async function proxyToLegacy(request: Request, env: Env): Promise<Response> {
  const configured = normalizedOrigin(env.LEGACY_API_ORIGIN || "");
  if (!configured) {
    return json({
      ok: false,
      service: "AURORA Cloudflare API",
      error: "Legacy API fallback is not configured yet.",
      stage: env.AURORA_BACKEND_STAGE || "edge-gateway"
    }, 503);
  }

  const incoming = new URL(request.url);
  const target = new URL(incoming.pathname + incoming.search, configured);
  const headers = new Headers(request.headers);
  headers.delete("host");
  headers.set("X-Forwarded-Host", incoming.host);
  headers.set("X-Forwarded-Proto", incoming.protocol.replace(":", ""));

  const upstreamRequest = new Request(target, {
    method: request.method,
    headers,
    body: ["GET", "HEAD"].includes(request.method) ? undefined : request.body,
    redirect: "manual"
  });

  try {
    const upstream = await fetch(upstreamRequest);
    const responseHeaders = new Headers(upstream.headers);
    responseHeaders.set("Cache-Control", "no-store");
    responseHeaders.set("X-AURORA-Backend", "cloudflare-edge-legacy-fallback");
    return new Response(upstream.body, {
      status: upstream.status,
      statusText: upstream.statusText,
      headers: responseHeaders
    });
  } catch {
    return json({
      ok: false,
      service: "AURORA Cloudflare API",
      error: "The legacy API is temporarily unreachable.",
      stage: env.AURORA_BACKEND_STAGE || "edge-gateway"
    }, 502);
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/health") {
      return json({
        ok: true,
        service: "AURORA Cloudflare API",
        platform: "cloudflare-workers",
        stage: env.AURORA_BACKEND_STAGE || "stage-7-release-validation",
        legacyFallbackConfigured: Boolean(normalizedOrigin(env.LEGACY_API_ORIGIN || "")),
        safeToSwitchClients: false,
        releaseGates: {
          workerDeployed: false,
          legacyFallbackConfigured: Boolean(normalizedOrigin(env.LEGACY_API_ORIGIN || "")),
          chatProviderConfigured: configuredProviderNames(env).length > 0,
          supabaseBridgeConfigured: Boolean(
            (env.SUPABASE_URL || env.VITE_SUPABASE_URL || env.VITE_SUPABASE_API) &&
            (env.SUPABASE_ANON_KEY || env.VITE_SUPABASE_ANON_KEY)
          ),
          rowLevelSecurityVerified: false,
          legacyParityVerified: false,
          rollbackVerified: false
        },
        migration: {
          frontendMoved: false,
          frontendHostingConfigured: true,
          healthMetadataMoved: true,
          researchMoved: true,
          chatMoved: true,
          chatAttachmentsMoved: true,
          chatVoiceIntelligenceMoved: true,
          providerRoutingMoved: true,
          dataLayerMoved: true,
          authVerificationMoved: true,
          voiceSynthesisMoved: true,
          voiceCatalogueMoved: true,
          imageGenerationMoved: true,
          weatherMoved: true,
          voiceTextTranscriptionMoved: true,
          voiceTextPersistentJobsAliasMoved: true,
          metadataCompatibilityAliasesMoved: true,
          mediaSearchMoved: true,
          adminAccessMoved: true,
          adminProviderDiagnosticsMoved: true,
          versionedChatMoved: true,
          adminCodeEditingMoved: true,
          mcpResearchMoved: true,
          rowLevelSecurityMode: "supabase-caller-jwt-forwarding",
          rowLevelSecurityVerified: false
        }
      });
    }

    if (url.pathname === "/api/meta") {
      return handleMetadata(request, env, url.searchParams.get("handler") || "");
    }

    // Preserve Vercel rewrite aliases so existing clients can move to the
    // Cloudflare origin without changing their endpoint paths.
    if (url.pathname === "/api/health") return handleMetadata(request, env, "health");
    if (url.pathname === "/api/public-config") return handleMetadata(request, env, "public-config");
    if (url.pathname === "/api/models") return handleMetadata(request, env, "models");

    if (url.pathname.startsWith("/api/calls")) {
      return handleCalling(request, env);
    }

    if (url.pathname === "/api/search" || url.pathname === "/api/research") {
      return handleResearch(request, env);
    }

    if (url.pathname === "/api/auth/user" || url.pathname.startsWith("/api/data/")) {
      return handleData(request, env);
    }

    if (url.pathname === "/api/voicetext-transcribe" || url.pathname === "/api/voicetext") {
      return handleVoiceText(request, env);
    }

    if (url.pathname === "/api/media-search") {
      return handleMediaSearch(request, env);
    }

    if (url.pathname === "/api/weather") {
      return handleWeather(request, { AURORA_ALLOWED_ORIGIN: env.AURORA_ALLOWED_ORIGIN });
    }

    if (url.pathname === "/api/voices") {
      const voicesConfigured = Boolean(env.ELEVENLABS_API_KEY || env.ELEVENLAB_API_KEY);
      if (request.method !== "GET" || !workerRouteOriginAllowed(request, env) || voicesConfigured) return handleVoices(request, env);
      return proxyToLegacy(request, env);
    }

    if (url.pathname === "/api/voice") {
      const voiceConfigured = Boolean((env.SUPABASE_URL || env.VITE_SUPABASE_URL || env.VITE_SUPABASE_API) && (env.SUPABASE_ANON_KEY || env.VITE_SUPABASE_ANON_KEY) && (env.ELEVENLABS_API_KEY || env.ELEVENLAB_API_KEY));
      if (request.method !== "POST" || !workerRouteOriginAllowed(request, env) || voiceConfigured) return handleVoice(request, env);
      return proxyToLegacy(request, env);
    }

    if (url.pathname === "/api/media-generate") {
      const mediaConfigured = Boolean((env.SUPABASE_URL || env.VITE_SUPABASE_URL || env.VITE_SUPABASE_API) && (env.SUPABASE_ANON_KEY || env.VITE_SUPABASE_ANON_KEY) && env.GEMINI_API_KEY);
      if (request.method !== "POST" || !workerRouteOriginAllowed(request, env) || mediaConfigured) return handleMediaGenerate(request, env);
      return proxyToLegacy(request, env);
    }

    if (url.pathname === "/api/admin") {
      const action = url.searchParams.get('handler') || 'status';
      if (action === 'code') return handleAdminCode(request, env);
      return handleAdmin(request, env, action === 'execute' ? 'execute' : 'status');
    }

    if (url.pathname === "/api/admin-code") {
      return handleAdminCode(request, env);
    }

    if (url.pathname === "/api/admin-execute") {
      return handleAdmin(request, env, 'execute');
    }

    if (url.pathname === "/api/v1/chat") {
      return handleVersionedChat(request, env);
    }

    if (url.pathname === "/api/chat") {
      return handleChat(request, env);
    }

    if (!url.pathname.startsWith("/api/")) {
      const isFileLikePath = /\.[^/]+$/.test(url.pathname);

      // Resolve browser navigation routes directly to the SPA shell. Do not
      // ask the static asset layer to resolve extensionless paths: Cloudflare
      // may issue a 307 normalization redirect before the SPA fallback can
      // run, even when the Worker is configured to run first.
      if (!isFileLikePath && ["GET", "HEAD"].includes(request.method)) {
        const shellUrl = new URL("/", request.url);
        const shell = await env.ASSETS.fetch(new Request(shellUrl, request));
        const headers = new Headers(shell.headers);
        headers.set("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0");
        headers.set("Pragma", "no-cache");
        return new Response(shell.body, {
          status: shell.status,
          statusText: shell.statusText,
          headers
        });
      }

      // File-like requests must resolve to their exact static asset. Strip
      // query parameters so cache-busting probes cannot turn valid assets
      // into misses; missing files remain 404s instead of receiving HTML.
      const assetUrl = new URL(request.url);
      assetUrl.search = "";
      assetUrl.hash = "";
      const assetRequest = new Request(assetUrl.toString(), request);
      const assetResponse = await env.ASSETS.fetch(assetRequest);
      if (url.pathname === "/index.html") {
        const headers = new Headers(assetResponse.headers);
        headers.set("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0");
        headers.set("Pragma", "no-cache");
        return new Response(assetResponse.body, {
          status: assetResponse.status,
          statusText: assetResponse.statusText,
          headers
        });
      }
      return assetResponse;
    }

    // Stage 1 keeps existing API contracts intact. Individual routes will be
    // moved into this Worker only after their request/response contracts have
    // parity tests. All other routes temporarily use the fixed legacy origin.
    return proxyToLegacy(request, env);
  }
};
