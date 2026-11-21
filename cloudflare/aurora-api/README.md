# AURORA Cloudflare API

This directory contains the Cloudflare Workers full-stack host: it serves the
built Vite/React AURORA application as static assets and handles `/api/*` plus
`/health` through the same Worker origin. The migration is deliberately staged:
the Worker can serve migrated routes while forwarding other `/api/*` requests
to the existing HTTPS legacy API.

## Current migration state

Stages 1–6 are implemented at code/configuration level. Stage 7 validates the
frontend, Android feature-parity contracts, the complete AURORA core regression
suite, Worker route contracts, and the Wrangler bundle. These checks do **not**
mean the production API has moved. The Worker has not been deployed. The
intended web deployment serves both the frontend and API from one Cloudflare
origin; Android remains on its current backend until the Worker is deployed and
verified.

Implemented route groups:

- `GET /health` and `GET /`: Worker health and migration metadata.
- Compatibility aliases `/api/health`, `/api/public-config`, and `/api/models`: preserve the existing Vercel rewrite paths while dispatching to the Worker's metadata handlers.
- `GET /api/meta?handler=health|public-config|models`: safe integration metadata, public Supabase sign-in configuration, and optional Gemini model listing.
- `GET|POST /api/search` and `GET|POST /api/research`: Exa MCP search, DuckDuckGo fallback, and optional Cloudflare Browser Run page reading.
- `GET /api/admin`: verifies the signed-in administrator against `ADMIN_EMAIL_ALLOWLIST` and reports configured provider presence without exposing secrets.
- `POST /api/admin-execute`: administrator-only live provider diagnostics for Groq, OpenRouter, and Gemini; responses redact likely credentials and provider URLs.
- `POST /api/v1/chat`: authenticated versioned chat alias with the legacy 1–20 message and 6,000-character validation contract, routed to the Worker chat engine.
- `POST /api/chat`: text chat with Groq → OpenRouter → Gemini fallback, including validated PDF/image/audio-video attachments, adaptive voice-intelligence instructions, turn-taking guidance, teaching modes, and Core task planning.
- `GET|POST /api/voicetext`: compatibility alias for persistent VoiceText job creation, section processing, and status retrieval. It uses the same Supabase caller verification and server-only VoiceText token as `/api/voicetext-transcribe`.
- `GET /api/auth/user`: verifies the caller's Supabase bearer token.
- `GET|POST|PATCH|DELETE /api/data/{table}`: caller-token PostgREST proxy. Supabase Row Level Security remains the authorization boundary; no service-role key is used.
- `POST /api/admin-code` and `POST /api/admin?handler=code`: administrator-only Worker code editor. It restricts edits to three allowlisted source files, checks exact unique patch targets against full file contents, creates an isolated `aurora-executor/*` branch, and opens a review PR. It never merges or deploys.
- Routes with explicit credential-readiness fallback may still use `LEGACY_API_ORIGIN` until their required Worker secrets are configured. Unknown `/api/*` paths also use the fixed-origin HTTPS fallback.

## Local development and validation

Requires Node.js 22.

```sh
# From the repository root
npm install
npm run typecheck
npm run build
npm run android:check
npm run test:core

# Then from cloudflare/aurora-api
npm install
npm run typecheck
npm run test:contracts
npm run test:smoke-contracts
npm run test:preflight
npx wrangler deploy --dry-run
```

The CI workflow runs the complete frontend typecheck/build, Android feature
parity contract, AURORA core regression suite, Worker typecheck and endpoint
contracts, deployed-smoke input contracts, static release preflight, and
Wrangler dry-run. It does not deploy.

The static deployment preflight checks the Worker config, required source files,
validation commands, and release-safety documentation. It does not inspect
remote Cloudflare secrets, authenticate, deploy, or authorize client switching.

The Worker publishes `../../dist` through Cloudflare Workers Static Assets.
The `/` page and SPA navigation fallback are served from Cloudflare, while
`/api/*` and `/health` execute in the Worker. Same-origin browser API calls
are explicitly allowed.

A successful local test and dry-run demonstrate local route behavior and bundle
validity only. They do not prove live Supabase RLS policy correctness, external
provider availability, full Vercel response parity, DNS-level SSRF protection,
production monitoring, or production traffic behavior.

## Deployed Worker smoke check

After deployment, run this read-only check from the Worker directory:

```sh
AURORA_WORKER_URL=https://aurora-api.<your-workers-subdomain>.workers.dev npm run test:deployed
```

Optionally set `AURORA_SMOKE_ORIGIN` to the exact web origin whose CORS access
should be checked. The script verifies the hosted SPA shell, built JavaScript
asset, SPA navigation fallback, health and metadata aliases, and preflight
responses for Admin code editing, VoiceText, and versioned chat. It keeps
client switching blocked and does not mark RLS, legacy parity, or rollback as
verified. It never sends provider credentials or user data.

## Worker configuration

Configure Worker variables/secrets only in the Cloudflare dashboard or with
Wrangler secrets. Never commit secret values. Existing GitHub Actions secrets
are consumed by the manual deployment workflow; runtime application secrets
must also exist in the Cloudflare Worker environment.

Required Worker runtime configuration:

- `LEGACY_API_ORIGIN`: bare HTTPS origin for the current legacy API.
- `SUPABASE_URL` and `SUPABASE_ANON_KEY` (or supported compatibility variables).
- At least one of `GROQ_API_KEY`, `OPENROUTER_API_KEY`, or `GEMINI_API_KEY` for chat.
- `AURORA_ALLOWED_ORIGIN`: exact additional web origins when required.

Optional integrations include Upstash, Exa MCP, Cloudflare Browser Run,
ElevenLabs, and the repository-scoped GitHub token used by the Admin code
editor. Do not add a Supabase service-role key to this Worker data bridge.
Requests must carry the signed-in user's bearer token so Supabase RLS applies.

## Release gates — not yet completed

1. Run the manual Cloudflare deployment workflow only after review and explicit
   deployment approval.
2. Confirm the deployed health and metadata endpoints and exercise each route
   using non-sensitive test accounts and records.
3. Verify actual Supabase tables, grants, and RLS policies in the Supabase
   project. This repository does not create or modify the schema or policies.
4. Compare representative legacy and Worker request/response behavior,
   including attachments, voice, provider failures, and un-migrated routes.
5. Test rollback to the existing Vercel API and observe error rates before
   increasing traffic.
6. Only after these checks, set `VITE_AURORA_API_BASE_URL` to the bare HTTPS
   Worker origin for Android builds via the GitHub Actions repository variable.

Keep `VITE_AURORA_API_BASE_URL` blank for Android until the Worker is deployed
and verified. Do not retire the Vercel API as part of this draft migration.

## Health endpoint release gates

The Worker health response deliberately reports `safeToSwitchClients: false`.
It exposes whether the legacy fallback, chat provider, and Supabase bridge are
configured, but keeps live verification gates false until proven against the
deployed services: `rowLevelSecurityVerified`, `legacyParityVerified`, and
`rollbackVerified`. Forwarding a caller's Supabase JWT is the intended
RLS-preserving design; it is not proof that every real table has RLS enabled
and correctly configured.

Research URL validation rejects common private/reserved IP literals and
localhost-style names. It does not perform DNS resolution or guarantee that a
public hostname cannot resolve to a private address or redirect there. Treat
the page-reader as a constrained optional integration, not a complete SSRF
security boundary; do not enable it for production until Cloudflare egress and
redirect protections have been independently verified.

## Protected GitHub Actions deployment

After this migration branch has been reviewed and merged into the default
branch, the **Deploy AURORA to Cloudflare** workflow can be started manually.
It requires the operator to select `DEPLOY` and provide the exact HTTPS
`workers.dev` origin for the post-deployment smoke test. Selecting `NO`
performs no deployment.

The workflow uses the existing GitHub Actions repository secrets
`CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`. The Cloudflare API token
should be scoped to the least-privilege Workers Scripts Edit permission. It builds the frontend,
runs the static preflight, deploys the combined static-assets and Worker
bundle, then checks the supplied live origin. It does not set Worker runtime
secrets, change Android's API origin, switch production DNS, merge pull
requests, or retire the existing Vercel fallback. Configure required Worker
runtime variables/secrets in Cloudflare before expecting chat, Supabase, or
legacy-proxy routes to work.

The workflow is manual-only and is not a production deployment authorization
by itself. Run it only after the migration PR is reviewed and the Cloudflare
runtime configuration is ready.

## Migrated authenticated voice endpoint

The `POST /api/voice` route runs in the Cloudflare Worker. It preserves the
legacy request fields, verifies the caller's Supabase access token before
contacting ElevenLabs, and returns MPEG audio on success. Configure the
Supabase URL, anon key, and ElevenLabs API key as Worker runtime secrets.

## Migrated authenticated image-generation endpoint

The `POST /api/media-generate` route runs in the Cloudflare Worker when the
Supabase URL, anon key, and Gemini key are configured. It verifies the caller
before contacting the provider and returns generated image data to the
authenticated client. Keep provider credentials in Worker secrets only.


## AURORA Connect — early WebRTC calling

AURORA Connect is an authenticated, two-person internet voice calling prototype. The Worker verifies a Supabase access token at `/api/connect/ticket`, then returns a one-use ticket with a 90-second lifetime. The ticket is consumed by the room Durable Object during WebSocket upgrade; the Supabase bearer token is not placed in the WebSocket URL. Room codes are short-lived invitation identifiers, not user identities or access credentials by themselves.

The Durable Object relays only WebRTC offer, answer, ICE-candidate, and hangup signaling. It limits rooms to two connected participants and rejects oversized or unsupported signaling messages. Voice media is not proxied through the Worker; WebRTC negotiates a direct encrypted peer connection.

**Important limitations:** a public STUN service is configured for initial connectivity, but no TURN relay is configured. Some carrier networks, strict NATs, or firewalls will therefore prevent calls from connecting. A production-ready calling service needs a trusted TURN provider or self-hosted TURN infrastructure, abuse controls, call invitations/consent UX, rate limits, and real-device/network testing. This does not call ordinary mobile or landline numbers. The Worker and Durable Object must be deployed before the feature can connect; repository changes alone do not activate it.
