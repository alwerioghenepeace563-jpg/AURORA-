# AURORA ↔ VoiceText integration

AURORA's server-side bridge is `POST /api/voicetext` and `GET /api/voicetext?requestId=<uuid>`. The bridge forwards requests to the separate VoiceText persistent-job API and keeps the integration token on the AURORA server.

## Required Vercel environment variables

In the AURORA Assistant Vercel project, add:

- `AURORA_VOICETEXT_API_URL=https://aurora-voicetext-qk8s.vercel.app/api/aurora-transcribe`
- `AURORA_VOICETEXT_TOKEN=<the same secret configured as AURORA_PLUGIN_TOKEN in the VoiceText Vercel project>`

In the VoiceText Vercel project, make sure `AURORA_PLUGIN_TOKEN` is set to a strong random secret. The value must match on both projects. Keep both variables server-side; do not use a `VITE_` prefix, add the token to an APK, or commit it to GitHub.

## Client API

`src/lib/voicetext-client.js` exposes:

- `voiceTextJobs.create({ filename, mimeType, sizeBytes, durationSeconds, totalChunks })`
- `voiceTextJobs.processSection({ requestId, chunkNumber, totalChunks, mimeType, languageHint, audioBase64 })`
- `voiceTextJobs.get(requestId)`

The Android/web client calls only AURORA's same-origin `/api/voicetext` bridge. The VoiceText integration secret never reaches the browser.

## AURORA chat capability

The shared capability tree recognises requests to check a VoiceText job when the user supplies its UUID, for example: "Check VoiceText job status <job-id>". It returns the stored state and cumulative transcript, and identifies the next section to resume.

## Operational notes

- Apply the VoiceText Supabase migration before creating jobs.
- The VoiceText API currently accepts each section as a base64 payload up to approximately 3 MB. The caller should split audio into valid playable sections (do not split raw file bytes arbitrarily).
- Sections are processed sequentially. After app restart, retrieve the saved job ID and call `get` to discover the next expected section.
- This bridge does not itself schedule background processing. AURORA must send each section while active and resume later if interrupted.
