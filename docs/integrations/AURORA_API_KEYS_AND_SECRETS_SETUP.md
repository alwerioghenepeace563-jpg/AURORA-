# AURORA API keys and secrets setup — Stages 1–14

This is the authoritative setup checklist for the main AURORA Assistant. It is based on environment-variable references in the current feature branch, not on assumed integrations.

## Security rules
- Never commit real credentials, send them in chat, put them in screenshots, or add them to an APK.
- Server credentials belong in the AURORA Vercel project → Settings → Environment Variables. Redeploy after changing them.
- Only Supabase's anon/publishable key and project URL may be used in the client build (VITE_ variables), and only with correct Supabase Row Level Security (RLS). Never use a Supabase service-role/secret key in AURORA's frontend.
- GitHub Actions secrets belong in GitHub → AURORA repository → Settings → Secrets and variables → Actions.
- VoiceText has its own Vercel project and its own server secrets. Do not mix the two projects' credentials.
- Add values to Production, Preview and Development only where each environment actually needs them.

## 1. Main AURORA Vercel project

### A. Text AI — core chat and provider fallback
At least one provider key is required for cloud AI chat. For resilience, configure all three:

| Variable | Requirement | Purpose |
|---|---|---|
| GROQ_API_KEY | One of the provider keys | Groq chat provider |
| OPENROUTER_API_KEY | One of the provider keys | OpenRouter fallback |
| GEMINI_API_KEY | One of the provider keys; also needed for Gemini image generation | Gemini fallback, image/PDF capabilities |
| GROQ_MODEL | Optional | Defaults to openai/gpt-oss-20b |
| GROQ_VISION_MODEL | Optional | Vision model override where supported |
| OPENROUTER_MODEL | Optional | Admin diagnostics model; defaults to openrouter/free |
| GEMINI_MODEL | Optional | Defaults to gemini-2.5-flash |

### B. Sign-in, user-scoped data and authenticated routes
| Variable | Requirement | Purpose |
|---|---|---|
| VITE_SUPABASE_URL | Required for client sign-in | Supabase URL compiled into web/Android client |
| VITE_SUPABASE_ANON_KEY | Required for client sign-in | Supabase anon/publishable key |
| SUPABASE_URL | Required for authenticated server routes | Server-side Supabase URL |
| SUPABASE_ANON_KEY | Required for authenticated server routes | Server-side copy of the same anon/publishable key |

Use the same project URL and anon/publishable key in both pairs. Do not use a service-role key here. Cloud memory sync also requires the aurora_memories table and owner-scoped RLS policies; environment variables alone do not create the schema or policies.

### C. Voice output
| Variable | Requirement | Purpose |
|---|---|---|
| ELEVENLABS_API_KEY | Optional | ElevenLabs text-to-speech and voice list |
| ELEVENLABS_VOICE_ID | Optional; needed for selected voice | Default voice ID |
| ELEVENLABS_JESSICA_VOICE_ID | Optional | Named voice override |
| ELEVENLABS_BELLA_VOICE_ID | Optional | Named voice override |
| ELEVENLABS_LAURA_VOICE_ID | Optional | Named voice override |
| ELEVENLABS_LUCIAN_VOICE_ID | Optional | Named voice override |
| ELEVENLABS_MODEL_ID | Optional | Defaults to eleven_multilingual_v2 |

The code also accepts the legacy typo ELEVENLAB_API_KEY; use ELEVENLABS_API_KEY for new setup. Browser speech fallback does not require ElevenLabs.

### D. AURORA ↔ VoiceText private bridge
Set these on the main AURORA Vercel project:

| Variable | Requirement | Purpose |
|---|---|---|
| VOICETEXT_API_URL | Optional; defaults to canonical VoiceText service | VoiceText service base URL |
| VOICETEXT_PLUGIN_TOKEN | Required for VoiceText bridge | Shared server-to-server bearer secret |

The token must exactly match AURORA_PLUGIN_TOKEN on the VoiceText service. Generate it privately with a password manager or secure random generator. Never use a VITE_ prefix.

### E. Optional shared provider preference
| Variable | Requirement | Purpose |
|---|---|---|
| UPSTASH_REDIS_REST_URL | Optional; pair with token | Shared provider preference across serverless instances |
| UPSTASH_REDIS_REST_TOKEN | Optional; pair with URL | Upstash REST token |

AURORA works without Redis; provider preference then uses browser and best-effort server-instance state.

### F. Admin-only capabilities
| Variable | Requirement | Purpose |
|---|---|---|
| ADMIN_EMAIL_ALLOWLIST | Optional | Comma-separated emails permitted to access Admin; code has a default allowlist |
| AURORA_GITHUB_TOKEN | Required only for Admin code editing | Fine-grained GitHub token with least-privilege access to AURORA repository Contents and Pull Requests |
| AURORA_GITHUB_REPO | Optional | Defaults to alwerioghenepeace563-jpg/AURORA- |
| AURORA_GITHUB_BASE_BRANCH | Optional | Defaults to main |
| AURORA_ALLOWED_ORIGIN | Recommended | Exact production site origin for CORS policy |

The Admin code-edit route also needs Supabase authentication and either GROQ_API_KEY or OPENROUTER_API_KEY. Do not give a GitHub token broad account-wide permissions.

## 2. Separate AURORA VoiceText Vercel project
These values belong in the AURORA VoiceText project's Vercel environment settings, not the main AURORA project:

| Variable | Requirement | Purpose |
|---|---|---|
| SUPABASE_URL | Required for persistent transcription jobs | Supabase URL |
| SUPABASE_SERVICE_ROLE_KEY | Required for server-side storage/job persistence | Privileged server-only Supabase key; never expose to browser or Android |
| AURORA_PLUGIN_TOKEN | Required | Shared secret accepted from main AURORA's VOICETEXT_PLUGIN_TOKEN |
| SUPABASE_RECORDINGS_BUCKET | Optional | Defaults to voicetext-recordings |

VoiceText also needs its own transcription-provider configuration as documented in that repository. Configure only provider keys referenced by its current backend and selected fallback chain. Never copy its service-role key into main AURORA.

## 3. GitHub Actions secrets for Android release workflow
These are not Vercel variables. Add them only in the AURORA GitHub repository's Actions secrets:

| Secret | Requirement | Purpose |
|---|---|---|
| VITE_SUPABASE_URL | Required when building a signed-in APK | Build-time public Supabase URL |
| VITE_SUPABASE_ANON_KEY | Required when building a signed-in APK | Build-time public anon/publishable key |
| AURORA_DEBUG_KEYSTORE_BASE64 | Required to preserve established Android signing identity | Base64-encoded existing keystore; must match the certificate expected by workflow |
| AURORA_LIVELY_PUBLISHER | Required only to publish OTA/update artifact | Least-privilege token for Lively Updates repository |

The APK workflow is manual-only and release-oriented. Do not create a new signing key to replace the established one: a different certificate prevents updates from installing over the existing app. The workflow verifies the signing certificate before publishing.

VITE_AURORA_VERSION_CODE and VITE_AURORA_VERSION_NAME are generated automatically by the build workflow; they are not secrets.

## 4. Stage-by-stage key requirements (1–14)

| Stage | Capability area | Credential position today |
|---|---|---|
| 1 | Whole-system baseline | No API key |
| 2 | Shared contracts and enforcement | No API key |
| 3 | Secure state and context | Supabase URL + anon/publishable key only when cloud sync/sign-in is enabled |
| 4 | Reliability and recovery | No API key |
| 5 | Capability adapter expansion | No provider key for local Android adapters; cloud AI uses central provider keys |
| 6 | Specialist intelligence | Uses configured central AI provider keys; no separate specialist key |
| 7 | Workflow/observability checkpoint | No separate key |
| 8 | Workflow and task intelligence | No separate key |
| 9 | Personal Knowledge Universe | Supabase URL + anon/publishable key for sign-in and optional user-scoped cloud memory; local knowledge features need no API key |
| 10 | Universal Android and communication | Android permissions and user-granted access, not API keys; optional cloud AI uses central provider keys |
| 11 | Creative and learning universe | Gemini key for image generation; ElevenLabs key for premium voice; Supabase + VoiceText shared token for persistent transcription |
| 12 | Predictive and sensor intelligence | No API key; sensors use device permissions and explicit user consent |
| 13 | Connected ecosystem | Provider OAuth/API credentials are not yet implemented or activated. Do not invent Google/Microsoft/cloud connector secrets until each adapter, scopes, callback URLs and live tests are ready |
| 14 | Experimental intelligence and certification | No separate API key; release evidence and human approvals are required |

### Current keyless integrations
- Weather uses Open-Meteo geocoding and forecast endpoints.
- Web search uses keyless search endpoints.
- Media discovery uses Wikimedia Commons and Internet Archive.
- Local calculators, unit conversions, Android sensors, reminders, task planning, routine insights, experiment sandbox and certification ledger do not require provider API keys.

These services still have usage policies, availability limits and network requirements.

## 5. Recommended setup order
1. Confirm the correct AURORA Vercel project is selected.
2. Add Supabase URL and anon/publishable key to both server and client variable names.
3. Add at least one AI provider key; ideally add Groq, OpenRouter and Gemini for fallback.
4. Add ElevenLabs only if premium voice output is wanted.
5. Add the VoiceText shared token to both Vercel projects, using the same value on each side.
6. Add Upstash only if shared provider preference is wanted.
7. Add the Admin GitHub token only if Admin code editing will be used.
8. Add GitHub Actions secrets only when preparing an Android release.
9. Redeploy the relevant Vercel projects after environment changes.
10. Check /api/health for configured provider/voice status. Use the authenticated Admin provider test for actual live provider checks; a configured flag alone does not prove a key is valid.

## 6. What checks can and cannot prove
A configured status means a variable exists, not that the provider accepts it, has quota, or supports a requested model. Use a live provider test for AI keys. VoiceText requires an authenticated transcription round-trip. Supabase cloud memory requires a signed-in test account and RLS verification. Android signing requires a certificate match and release build.

Never mark Stages 1–14 as fully configured merely because environment variables have been entered. Stage 13 provider adapters and release/device certification remain separate work.
