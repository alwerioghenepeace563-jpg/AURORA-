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

## Vercel environment variables

- `GROQ_API_KEY` — Groq API key.
- `GROQ_MODEL` — optional; defaults to `openai/gpt-oss-20b`.
- `OPENROUTER_API_KEY` — OpenRouter API key for the free-model fallback.
- `GEMINI_API_KEY` — Gemini API key, including image/PDF requests and final text fallback.
- `GEMINI_MODEL` — optional; defaults to `gemini-2.5-flash`.
- `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` — optional shared provider state across serverless instances.
- `ELEVENLABS_API_KEY` — ElevenLabs API key for voice output.
- `ELEVENLABS_VOICE_ID` and `ELEVENLABS_MODEL_ID` — optional voice configuration.
- `AURORA_ALLOWED_ORIGIN` — optional exact site origin.

Never commit real keys or put them in frontend variables. Add them in Vercel Project Settings → Environment Variables, then redeploy.

## Health check

The `/api/health` route reports which providers are configured and whether shared provider-state storage is configured. It does not reveal API keys.

## Security note

Origin checks are not authentication or rate limiting. Before sharing the app publicly, add user authentication, request limits, and abuse monitoring to protect API usage.


## Image Studio provider

AURORA Image Studio uses the server-side Black Forest Labs FLUX.2 Klein 4B API through `/api/image-generate`.

- Add `BFL_API_KEY` as a **server-side Vercel environment variable** for Preview and Production as appropriate. Never use a `VITE_*` variable for this secret.
- Hosted image generation may incur provider charges. Check Black Forest Labs' current pricing and account credits before enabling live generation.
- Image results currently use temporary provider URLs. Save generated images promptly; persistent project storage is a follow-up item.
- The UI offers create/edit mode, style presets, aspect ratios, and draft/standard/high sizes. The provider key is never sent to the browser.
