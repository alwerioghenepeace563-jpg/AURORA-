# AURORA ↔ AURORA VoiceText integration

## Ownership

AURORA VoiceText is the transcription service. The main AURORA Assistant sends a user-selected audio recording to its own server-side proxy; that proxy authenticates to VoiceText. Provider credentials and the shared integration token never enter browser JavaScript or the Android package.

## Request flow

1. The user selects an audio file in AURORA and explicitly presses **Transcribe with VoiceText**.
2. AURORA posts the selected audio as bounded base64 JSON to `/api/voicetext-transcribe`.
3. The AURORA server forwards it to VoiceText `/api/aurora-transcribe` using a server-only bearer token.
4. VoiceText calls its existing `transcribeWithFallback` provider chain and returns transcript text, detected language, available timestamp/speaker segments and provider label.
5. AURORA displays the result for review. Saving to a project remains a separate explicit action.

## Required server environment

Configure these on the **AURORA VoiceText Vercel project**:

- `AURORA_PLUGIN_TOKEN` — a strong random secret.

Configure these on the **main AURORA Vercel project**:

- `VOICETEXT_API_URL=https://aurora-voicetext-qk8s.vercel.app`
- `VOICETEXT_PLUGIN_TOKEN` — exactly the same secret value as VoiceText's `AURORA_PLUGIN_TOKEN`.

Generate the secret privately (for example with a password manager). Do not send it in chat, commit it, place it in a `VITE_` variable, or put it in the Android app. Redeploy both Vercel projects after setting the server environment variables.

## Current integration boundary

- Audio formats: MP3, M4A/MP4 audio, WAV, WebM, OGG and AAC (subject to provider support).
- AURORA UI upload limit: 1.2 MB per selected file. This keeps the encoded JSON within serverless request limits for this first bridge release.
- VoiceText endpoint encoded payload limit: 1.8 MB.
- The bridge returns transcript text, provider, language and available timestamp/speaker segments.
- VoiceText's provider keys remain server-side. The integration endpoint does not persist uploaded audio or transcript records.
- Video files, larger resumable/chunked jobs, async job polling, transcript polishing/summary handoff and device-level end-to-end validation are not included in this first bridge wave. Convert video to an audio file before using this first version.
- Provider quota, language coverage and diarization availability depend on VoiceText's configured providers.

## Verification

Run `npm run test:aurora-voicetext-bridge` in the main AURORA repository and `npm test` in VoiceText. A successful static contract test does not replace a live provider test with both Vercel secrets configured.
