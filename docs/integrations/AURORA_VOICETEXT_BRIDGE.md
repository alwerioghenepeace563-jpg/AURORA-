# AURORA ↔ AURORA VoiceText integration

## Ownership

AURORA VoiceText is the transcription service. The main AURORA Assistant sends a user-selected audio recording to its own server-side proxy; that proxy authenticates to VoiceText. Provider credentials and the shared integration token never enter browser JavaScript or the Android package.

## Request flow

1. The user selects an audio file in AURORA and explicitly presses **Transcribe with VoiceText**.
2. AURORA plays the local file through a browser media pipeline and captures independent 20-second audio sections.
3. Each section is sent sequentially as bounded base64 JSON to `/api/voicetext-transcribe`; the entire recording is never encoded into one serverless request.
4. The AURORA server forwards each section to VoiceText `/api/aurora-transcribe` using a server-only bearer token.
5. VoiceText calls its existing `transcribeWithFallback` provider chain and returns transcript text, detected language, available timestamp/speaker segments and provider label.
6. AURORA offsets timestamps to the original recording timeline, appends each completed section, and preserves the last completed offset so the user can resume after a section failure. Saving to a project remains a separate explicit action.

## Required server environment

Configure these on the **AURORA VoiceText Vercel project**:

- `AURORA_PLUGIN_TOKEN` — a strong random secret.

Configure these on the **main AURORA Vercel project**:

- `VOICETEXT_API_URL=https://aurora-voicetext-qk8s.vercel.app`
- `VOICETEXT_PLUGIN_TOKEN` — exactly the same secret value as VoiceText's `AURORA_PLUGIN_TOKEN`.

Generate the secret privately (for example with a password manager). Do not send it in chat, commit it, place it in a `VITE_` variable, or put it in the Android app. Redeploy both Vercel projects after setting the server environment variables.

## Current integration boundary

- Audio formats: MP3, M4A/MP4 audio, WAV, WebM, OGG and AAC (subject to provider support).
- AURORA no longer applies a whole-file size cap in the Creative Studio picker. It sends sequential 20-second audio sections instead of a single large upload.
- Each individual VoiceText endpoint request remains bounded at 4,000,000 encoded characters (approximately 3 MB of source audio); normal 20-second WebM/Opus sections are much smaller.
- The bridge returns transcript text, provider, language and available timestamp/speaker segments.
- VoiceText's provider keys remain server-side. The integration endpoint does not persist uploaded audio or transcript records.
- Long audio is segmented in-session and can resume from the last completed section after a failed request. Resume state and partial transcript are held in memory only; closing/reloading the app loses that progress. This is not durable cloud upload storage or background job processing.
- Video files, cross-session cloud resume, async job polling, transcript polishing/summary handoff and device-level end-to-end validation are not included. Convert video to an audio file before using this workflow.
- Provider quota, language coverage and diarization availability depend on VoiceText's configured providers.

## Verification

Run `npm run test:aurora-voicetext-bridge` in the main AURORA repository and `npm test` in VoiceText. A successful static contract test does not replace a live provider test with both Vercel secrets configured.
