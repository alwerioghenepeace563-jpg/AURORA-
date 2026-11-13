# AURORA Cloudflare migration

AURORA is configured as a Cloudflare Pages application with Pages Functions for the existing `/api/*` endpoints.

## Cloudflare Pages settings

- Project name: `aurora-assistant`
- Production branch: `main`
- Build command: `npm ci && npm run build`
- Build output directory: `dist`
- Root directory: repository root
- Functions directory: `functions/`

The Pages catch-all Function adapts the existing Vercel-style API handlers to the Cloudflare Pages Request/Response runtime. Existing API URLs and legacy rewrites are retained.

## Required Cloudflare secrets

Add these in Workers & Pages → aurora-assistant → Settings → Variables and Secrets. Use Secret type for credentials:

- `GROQ_API_KEY`
- `OPENROUTER_API_KEY`
- `GEMINI_API_KEY`
- `ELEVENLABS_API_KEY` (or the existing supported alias)
- `ELEVENLABS_VOICE_ID` (or the existing supported voice-ID alias)
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `ADMIN_EMAIL_ALLOWLIST`
- `AURORA_ALLOWED_ORIGIN` (set to the production Pages origin; add custom domain origin if one is attached)
- Any other provider/plugin secrets currently configured in the old hosting environment.

Do not put secrets in `wrangler.toml`, GitHub commits, or frontend `VITE_*` variables.

## Deploy

Connect this repository to Cloudflare Pages with the settings above, or deploy from a trusted CI runner using Wrangler after configuring `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` as GitHub Actions secrets.

Keep the existing Vercel deployment available until the Cloudflare production URL passes the API smoke tests and the Android/PWA clients have been checked against it. Then update the production API base URL and custom domain/DNS as a separate cutover.

## Validation still required

- Build and Pages Functions bundle compilation
- API smoke tests for chat, search/images, voice, public config, weather and media
- Admin authorization and CORS checks
- Supabase auth and storage flows
- Physical Android/Pulse overlay testing

A successful static build alone does not prove that all API integrations work in the Workers runtime.
