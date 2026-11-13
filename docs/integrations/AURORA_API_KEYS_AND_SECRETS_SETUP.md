# AURORA API keys and secrets setup — Stages 1–14

This is the authoritative setup checklist for the main AURORA Assistant. It is based on environment-variable references in the current feature branch, not on assumed integrations.

## Security rules
- Never commit real credentials, send them in chat, put them in screenshots, or add them to an APK.
- Server credentials belong in the AURORA Cloudflare Pages project → Settings → Environment Variables. Redeploy after changing them.
- Only Supabase's anon/publishable key and project URL may be used in the client build (VITE_ variables), and only with correct Supabase Row Level Security (RLS). Never use a Supabase service-role/secret key in AURORA's frontend.
- GitHub Actions secrets belong in GitHub → AURORA repository → Settings → Secrets and variables → Actions.
- VoiceText has its own Vercel project and its own server secrets. Do not mix the two projects' credentials.
- Add values to Production, Preview and Development only where each environment actually needs them.

## 1. Main AURORA Cloudflare Pages project

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
| VITE_SUPABASE_API | Legacy optional client alias | Same Supabase project URL; `VITE_SUPABASE_URL` takes priority |
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
Set these on the main AURORA Cloudflare Pages project:

| Variable | Requirement | Purpose |
|---|---|---|
| VOICETEXT_API_URL | Optional; defaults to canonical VoiceText service | VoiceText service base URL |
| VOICETEXT_PLUGIN_TOKEN | Required for VoiceText bridge | Shared server-to-server bearer secret |
| AURORA_VOICETEXT_API_URL | Legacy server-only endpoint override | Direct VoiceText transcription endpoint used by the older bridge route |
| AURORA_VOICETEXT_TOKEN | Legacy server-only shared token | Must match the VoiceText project's `AURORA_PLUGIN_TOKEN`; never expose to the client |

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

VoiceText provider and feature configuration is separate from main AURORA:

| Variable | Requirement | Purpose |
|---|---|---|
| ASSEMBLYAI_API_KEY | Optional provider | Online transcription, language detection and diarization |
| GROQ_API_KEY | Optional provider | Online transcription fallback |
| OPENAI_API_KEY | Optional provider | Online transcription fallback |
| ELEVENLABS_API_KEY | Optional feature | Voice/speech features where enabled |
| OPENSUBTITLES_API_KEY | Optional feature | Subtitle search/download integration |
| OPENSUBTITLES_TOKEN | Optional feature | Authenticated OpenSubtitles account access where required |
| GOOGLE_CLIENT_ID | Required for VoiceText Google-admin sign-in | Server-side OAuth audience validation |
| VITE_GOOGLE_CLIENT_ID | Client build value; same OAuth Web Client ID | Google Identity Services in the browser |
| BACKUP_BACKEND_URL | Optional | Independent backup Worker endpoint |
| BACKUP_BACKEND_TOKEN | Optional; pair with URL | Server-to-server backup authentication |
| BACKUP_API_TOKEN | Optional; Worker-side | Protects the backup Worker API |
| BACKUP_PUBLIC_FALLBACK | Optional; defaults false | Explicitly enables origin-restricted public fallback when configured |

VoiceText's public build settings may also include VITE_API_BASE_URL, VITE_BACKUP_API_BASE_URL and VITE_VOSK_MODEL_URL. These are endpoint/model URLs, not API secrets. The Vosk model URL must point to a compatible hosted model with browser CORS/worker access.

Only configure provider keys for services that are enabled and referenced by the current VoiceText backend. Never copy its service-role key or private backup tokens into main AURORA.

## 3. Cloudflare Pages build/runtime configuration\n\nFor the main AURORA project, configure the following in Cloudflare Pages:\n\n- Build command: `npm install --no-audit --no-fund && npm run build`\n- Output directory: `dist`\n- Production branch: `main`\n- Build variables: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_GOOGLE_CLIENT_ID`, `VITE_AURORA_VERSION_CODE`, `VITE_AURORA_VERSION_NAME` where needed. These are client/build values; only the Supabase anon/publishable key belongs in the client.\n- Runtime secrets: provider keys, ElevenLabs credentials, Supabase server URL/anon key, VoiceText bridge token, Admin GitHub token and allowlist. Use Secret type for credentials.\n- Set `AURORA_ALLOWED_ORIGIN` to `https://aurora-assistant.pages.dev` (or the exact custom-domain origin after attaching it).\n\nFor the manual Cloudflare deployment workflow, add GitHub Actions secrets `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`. The token should be scoped to the intended Cloudflare account and Pages deployment.\n\n## 4. GitHub Actions secrets for Android release workflow
These are not Vercel variables. Add them only in the AURORA GitHub repository's Actions secrets:

| Secret | Requirement | Purpose |
|---|---|---|
| VITE_SUPABASE_URL | Required when building a signed-in APK | Build-time public Supabase URL |
| VITE_SUPABASE_ANON_KEY | Required when building a signed-in APK | Build-time public anon/publishable key |
| AURORA_DEBUG_KEYSTORE_BASE64 | Required to preserve established Android signing identity | Base64-encoded existing keystore; must match the certificate expected by workflow |
| AURORA_LIVELY_PUBLISHER | Required only to publish OTA/update artifact | Least-privilege token for Lively Updates repository |

The APK workflow is manual-only and release-oriented. Do not create a new signing key to replace the established one: a different certificate prevents updates from installing over the existing app. The workflow verifies the signing certificate before publishing.

VITE_AURORA_VERSION_CODE and VITE_AURORA_VERSION_NAME are generated automatically by the build workflow; they are not secrets.

### Compatibility aliases and build-only variables
The following names are supported only as backward-compatibility fallbacks or local build controls. Do not add duplicate credentials unless an older deployment still depends on them:
- `ELEVENLAB_API_KEY`, `ELEVENLAB_VOICE_ID`, `ELEVENLAB_LUCIAN_VOICE_ID`: legacy ElevenLabs spellings; prefer the canonical `ELEVENLABS_*` names above.
- `VITE_SUPABASE_API`: legacy public Supabase URL alias; prefer `VITE_SUPABASE_URL`.
- `GITHUB_TOKEN`: legacy fallback for `AURORA_GITHUB_TOKEN`; prefer a repository-scoped token under the AURORA-specific name.
- `KV_REST_API_URL` and `KV_REST_API_TOKEN`: legacy Redis/KV compatibility fallbacks; prefer the explicit `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` pair.
- `VITE_AURORA_VERSION_CODE` and `VITE_AURORA_VERSION_NAME`: public build metadata, not secrets.
- `AURORA_REDUCED_PERMISSION_TEST`: local/CI-only Android permission-parity test switch; never enable it in a production build.

## 5. Stage-by-stage key requirements (1–14)

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

## 6. Recommended setup order
1. Confirm the correct AURORA Cloudflare Pages project is selected.
2. Add Supabase URL and anon/publishable key to both server and client variable names.
3. Add at least one AI provider key; ideally add Groq, OpenRouter and Gemini for fallback.
4. Add ElevenLabs only if premium voice output is wanted.
5. Add the VoiceText shared token to both Cloudflare Pages and VoiceText projects, using the same value on each side.
6. Add Upstash only if shared provider preference is wanted.
7. Add the Admin GitHub token only if Admin code editing will be used.
8. Add GitHub Actions secrets only when preparing an Android release.
9. Redeploy the relevant Cloudflare Pages and VoiceText projects after environment changes.
10. Check /api/health for configured provider/voice status. Use the authenticated Admin provider test for actual live provider checks; a configured flag alone does not prove a key is valid.

## 7. What checks can and cannot prove
A configured status means a variable exists, not that the provider accepts it, has quota, or supports a requested model. Use a live provider test for AI keys. VoiceText requires an authenticated transcription round-trip. Supabase cloud memory requires a signed-in test account and RLS verification. Android signing requires a certificate match and release build.

Never mark Stages 1–14 as fully configured merely because environment variables have been entered. Stage 13 provider adapters and release/device certification remain separate work.
