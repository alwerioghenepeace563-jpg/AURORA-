# AURORA

AURORA is a personal AI assistant with a luminous animated energy orb, chat and voice controls, daily activity shortcuts, and a responsive dark sci-fi interface.

## Stack

- React + Vite
- Framer Motion for interface motion
- Lucide React icons
- Vercel serverless routes for AI chat and ElevenLabs voice

## Local development

1. Install Node.js 20 or newer.
2. Run `npm install`.
3. Copy `.env.example` to `.env` and add provider keys for local API testing.
4. Run `npm run dev`.
5. Run `npm run build` to verify the production frontend build.

## AI provider fallback

All text-based assistant tools use the central `/api/chat` route. It tries the currently preferred configured provider first and automatically moves to the next available provider when a request fails:

1. Groq
2. OpenRouter's free-model router
3. Gemini

When a provider succeeds, AURORA remembers it in the browser and uses it first on subsequent requests, so the same active provider is shared by all text-based assistant tools on that device. Image requests can use configured vision-capable providers; PDF requests use providers that support PDF/file input (currently OpenRouter or Gemini). Capability and quota vary by provider. ElevenLabs speech generation is separate from text AI. The Tools workspace also includes a local calculator, common unit conversions, and a weather lookup using Open-Meteo.

For provider preference shared across different devices and Vercel serverless instances, configure both `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` in Vercel. Without shared Redis, each browser keeps its own preference, while server-side memory is best-effort across serverless instances.

## Optional remote MCP research connectors

AURORA can enrich explicit live-research requests through optional server-side MCP
connectors. The existing search and AI-provider fallback remain available if an
MCP server is missing, rate-limited, or unavailable.

- **Exa (default free research connector):** hosted Streamable HTTP endpoint
  `https://mcp.exa.ai/mcp`. It supports keyless, rate-limited use, so AURORA
  can search and fetch pages without adding a billing method or API key.
- **Firecrawl (optional):** hosted Streamable HTTP endpoint
  `https://mcp.firecrawl.dev/v2/mcp`. The current hosted service requires an
  API key or OAuth access token; it stays disabled by default. Do not configure
  it unless a genuinely free allowance is available and no billing is enabled.
- **Perplexity:** not enabled in this $0 configuration because its MCP requires
  a separate API key and usage may be billed. AURORA uses Exa instead.
- **Cloudflare Browser Run + Playwright MCP (free tier):** a deployable Worker
  scaffold is included in `cloudflare/aurora-browser-mcp`. It uses Cloudflare's
  official `@cloudflare/playwright-mcp` package and exposes Streamable HTTP at
  `/mcp`, protected by a shared bearer secret. Deploy it on the Cloudflare
  Workers Free plan, then set `AURORA_PLAYWRIGHT_MCP_URL` to its `/mcp` URL
  and `AURORA_PLAYWRIGHT_MCP_TOKEN` to the same secret in Vercel. Free-plan
  Browser Run allowance is 10 browser minutes/day, max 3 concurrent sessions,
  and 60 seconds per browser timeout. Keep usage within that allowance and
  do not upgrade or enable billing. See the worker README for deployment steps.
  The normal local stdio Playwright MCP cannot be reached by Vercel functions.
- **Glyph:** set the custom endpoint only after identifying the exact Glyph MCP
  implementation shown in the reference; the name alone is ambiguous.

All MCP credentials are server-only environment variables. Do not put them in
`VITE_*` variables, the APK, chat messages, or committed files. MCP output is
treated as untrusted source material, not instructions. Automatic use is
restricted to read-oriented tools; actions that change external state require a
separate approval-aware capability.

## Vercel environment variables

- `GROQ_API_KEY` — Groq API key.
- `GROQ_MODEL` — optional; defaults to `openai/gpt-oss-20b`.
- `OPENROUTER_API_KEY` — OpenRouter API key for the free-model fallback.
- `GEMINI_API_KEY` — Gemini API key, including image/PDF requests and final text fallback.
- `GEMINI_MODEL` — optional; defaults to `gemini-2.5-flash`.
- `AURORA_EXA_ENABLED` / `AURORA_EXA_MCP_URL` — free keyless Exa research connector (rate-limited).
- `AURORA_PLAYWRIGHT_MCP_URL` / `AURORA_PLAYWRIGHT_MCP_TOKEN` — optional Cloudflare Browser Run Worker endpoint and shared secret.
- `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` — optional shared provider state across serverless instances.
- `ELEVENLABS_API_KEY` — ElevenLabs API key for voice output.
- `ELEVENLABS_VOICE_ID` and `ELEVENLABS_MODEL_ID` — optional voice configuration.
- `AURORA_ALLOWED_ORIGIN` — optional exact site origin.

Never commit real keys or put them in frontend variables. Add them in Vercel Project Settings → Environment Variables, then redeploy.

## Health check

The `/api/health` route reports which providers are configured and whether shared provider-state storage is configured. It does not reveal API keys.

## Deployment verification

Every new commit pushed to the connected Git branch should trigger a new Vercel deployment. Check the deployment status before treating changes as live.

## Security note

Origin checks are not authentication or rate limiting. Before sharing the app publicly, add user authentication, request limits, and abuse monitoring to protect API usage.

## API keys and secret setup

The complete stage-by-stage credential inventory, secure storage locations, VoiceText bridge configuration, optional integrations, and Android release secrets are documented in [AURORA API Keys and Secrets Setup](docs/integrations/AURORA_API_KEYS_AND_SECRETS_SETUP.md). Start from `.env.example`; it contains placeholders only. Never commit real keys or expose server secrets through `VITE_` variables.
