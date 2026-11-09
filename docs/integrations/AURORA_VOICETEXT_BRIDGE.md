# AURORA ↔ AURORA VoiceText integration

## Ownership

AURORA VoiceText is the transcription service. The main AURORA Assistant sends a user-selected audio recording to its own server-side proxy; that proxy authenticates to VoiceText. Provider credentials and the shared integration token never enter browser JavaScript or the Android package.

## Request flow

1. The user selects an audio file in AURORA and explicitly presses **Transcribe with VoiceText**.
2. AURORA plays the local file through a browser media pipeline and captures independent 20-second audio sections.
3. Each section is sent sequentially as bounded base64 JSON to `/api/voicetext-transcribe`; the entire recording is never encoded into one serverless request.
4. The AURORA server forwards each section to VoiceText `/api/aurora-transcribe` using a server-only bearer token.
5. The main AURORA server verifies the signed-in user against Supabase Auth and forwards only the verified account ID to VoiceText. VoiceText scopes job reads and updates to that account ID.\n6. VoiceText calls its existing `transcribeWithFallback` provider chain, stores each accepted audio section in a private Supabase Storage bucket, and checkpoints cumulative transcript/progress in `voicetext_recordings`.
7. AURORA offsets timestamps to the original recording timeline, displays the saved cumulative transcript, and preserves the job ID locally so the user can reselect the same source file and resume after an app restart. Saving to a project remains a separate explicit action.

## Required server environment

Configure these on the **AURORA VoiceText Vercel project**:

- `SUPABASE_URL` — the existing Supabase project URL.
- `SUPABASE_SERVICE_ROLE_KEY` — server-only service-role key; never expose it to the client.
- `SUPABASE_RECORDINGS_BUCKET=voicetext-recordings` (optional; this is the default).
- `AURORA_PLUGIN_TOKEN` — a strong random secret.

Configure these on the **main AURORA Vercel project**:

- `SUPABASE_URL` and `SUPABASE_ANON_KEY` — used by the server proxy to verify the current AURORA account. Existing `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` values are also accepted.
- `VOICETEXT_API_URL=https://aurora-voicetext-qk8s.vercel.app`
- `VOICETEXT_PLUGIN_TOKEN` — exactly the same secret value as VoiceText's `AURORA_PLUGIN_TOKEN`.

Generate the secret privately (for example with a password manager). Do not send it in chat, commit it, place it in a `VITE_` variable, or put it in the Android app. Redeploy both Vercel projects after setting the server environment variables.

## Current integration boundary

- Audio formats: MP3, M4A/MP4 audio, WAV, WebM, OGG and AAC (subject to provider support).
- AURORA no longer applies a whole-file size cap in the Creative Studio picker. It sends sequential 20-second audio sections instead of a single large upload.
- Each individual VoiceText endpoint request remains bounded at 4,000,000 encoded characters (approximately 3 MB of source audio); normal 20-second WebM/Opus sections are much smaller.
- The bridge returns transcript text, provider, language and available timestamp/speaker segments.
- VoiceText stores accepted audio sections in a private Supabase Storage bucket and stores job progress/transcript in `voicetext_recordings`; the service-role key is used only on the VoiceText server.
- Job creation, processing and status retrieval require a valid AURORA access token. The main server verifies it with Supabase Auth, then scopes every VoiceText job read/write to the verified user ID.
- The browser stores only the job ID keyed to the original file name, size and last-modified time. After an app restart, the user must reselect the same original file to resume from the last completed section. Completed audio sections and transcript checkpoints remain in private cloud storage.
- This is durable resumability, not unattended background execution: the app must remain active while it sends the remaining sections. A true worker that continues after the app closes is a separate deployment step.
- Video files, background worker execution, transcript polishing/summary handoff and device-level end-to-end validation are not included. Convert video to an audio file before using this workflow.
- Provider quota, language coverage and diarization availability depend on VoiceText's configured providers.

## Verification

Run `npm run test:aurora-voicetext-bridge` in the main AURORA repository and `npm test` in VoiceText. A successful static contract test does not replace a live provider test with both Vercel secrets configured.


### Stage 11 wave 19 — durable, account-scoped transcription recovery
- Reused VoiceText's existing Supabase-backed `voicetext_recordings` table and private `voicetext-recordings` bucket; no duplicate Main AURORA media table or bucket is introduced.
- VoiceText now stores an owner account ID on each job and scopes job status reads and checkpoint updates to that owner.
- The Main AURORA server validates the caller's Supabase access token against Supabase Auth before proxying job creation, processing or status requests. The owner ID is derived from the verified Supabase response, never trusted from browser input.
- Creative Studio now sends the signed-in session to the Main AURORA proxy. The existing local job-ID key enables recovery after an app restart when the user reselects the same original file.
- Every accepted audio section and cumulative transcript remain stored in the private VoiceText Supabase job store. This is durable checkpointing and manual resume, not an unattended worker: the app must remain active while it sends further sections.
- Added account-ownership contract tests and updated setup documentation. Live Supabase migration, service-role configuration, CI and device behaviour still require verification.
