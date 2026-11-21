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


## AURORA internal calling

The internal calling API is account-scoped and runs through a Cloudflare Durable Object:

- `POST /api/calls/devices` registers a signed-in user's AURORA device (`deviceId`, optional push token, and platform).
- `DELETE /api/calls/devices/:deviceId` unregisters a device.
- `POST /api/calls/schedules` creates a reminder-backed AURORA call (ID, title, message, and Unix-millisecond `scheduledAt`).
- `GET /api/calls/schedules` lists scheduled calls; `DELETE /api/calls/schedules/:id` cancels one.
- `GET /api/calls/inbox?deviceId=...` updates the device heartbeat and returns ringing calls. A due call stays **pending** while no registered device has checked in during the previous 60 seconds; it becomes ringing when a device reconnects.
- `POST /api/calls/:callId/answer`, `/decline`, and `/end` update call state.
- `POST /api/calls/signals` and `GET /api/calls/signals?deviceId=...` exchange bounded, account-local offer/answer/ICE/hangup signaling payloads for future peer-to-peer audio sessions.

All routes verify the bearer token against Supabase Auth `/auth/v1/user` before selecting a per-user Durable Object. The DO keeps schedules, registered devices, active calls, and short-lived signaling data isolated by verified account ID. It caps each account at 10 registered devices and 100 scheduled calls; signaling payloads are capped at 48 KB. A call is not a SIM/PSTN call.

### Delivery and deployment requirements

The Worker needs the `AURORA_CALLS` Durable Object binding and `v1-aurora-calls` SQLite-class migration declared in `wrangler.jsonc`. Supabase URL and anon key must be present as Worker runtime configuration so the user can be verified.

Background push delivery is intentionally adapter-based. Configure `AURORA_PUSH_GATEWAY_URL` as an HTTPS endpoint and `AURORA_PUSH_GATEWAY_TOKEN` as a Worker secret. The gateway receives a POST with registered device tokens and an event payload (for example `incoming_call` or `call_signal`). It must deliver through the app's chosen push provider and must never expose its credentials to clients. The app currently polls its authenticated inbox while open, so a due call remains pending while all devices are offline and is surfaced on reconnect. A real background incoming-call screen while the app is closed still requires a push provider SDK/configuration and a native Android push receiver; those provider credentials and delivery round-trips are not included or claimed by this code change.

The Activities page exposes an AURORA Calls workspace for scheduling, answering/declining, and sending a spoken or typed response into the existing AURORA assistant conversation. Voice reply uses browser speech recognition where supported and falls back to typing. Actual full-duplex WebRTC audio calling is not yet certified; the signaling endpoints are the foundation and require a native/browser media-session adapter before claiming live two-way audio.

The calling architecture regression checks run as part of `npm run test:contracts` in this directory. Live push, WebRTC media, Android background delivery, and production Durable Object deployment must be verified separately before release.
