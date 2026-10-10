# AURORA

AURORA is a personal AI assistant with a luminous animated energy orb, an uncluttered main screen, chat and voice controls, daily activity shortcuts, and a responsive dark sci-fi interface.

## Stack

- React + Vite
- Framer Motion for interface motion
- Lucide React icons
- Vercel serverless routes for Gemini chat and ElevenLabs voice

## Local development

1. Install Node.js 20 or newer.
2. Run `npm install`.
3. Copy `.env.example` to `.env` and add your own local provider keys if you want to test the API routes locally.
4. Run `npm run dev` for the frontend.
5. Run `npm run build` to verify the production frontend build.

The frontend can be deployed on Vercel. The `api/chat.ts` and `api/voice.ts` routes are server-side only and require the environment variables below.

## Vercel environment variables

- `GEMINI_API_KEY` — your Gemini API key.
- `GEMINI_MODEL` — optional; defaults to `gemini-2.5-flash`.
- `ELEVENLABS_API_KEY` — your ElevenLabs API key.
- `ELEVENLABS_VOICE_ID` — the selected voice's ID from ElevenLabs.
- `ELEVENLABS_MODEL_ID` — optional; defaults to `eleven_multilingual_v2`.
- `AURORA_ALLOWED_ORIGIN` — optional exact site origin, such as `https://aurora-ten-gold.vercel.app`.

Never commit real keys or put them in frontend variables. Add them in Vercel Project Settings → Environment Variables, then redeploy.

## Current UI

The home screen keeps the glowing orb as the centrepiece, with a greeting and prompt composer. The AURORA tab opens the full chat interface with an optional right-hand settings panel on desktop. Activities and Profile are included as initial navigable screens.

File attachments currently select a file but do not upload or analyse it. Microphone input depends on browser speech-recognition support and permissions. API voice responses require ElevenLabs to be configured.

## Security note

Origin checks are not authentication or rate limiting. Before sharing the app publicly, add user authentication, request limits, and abuse monitoring to protect API usage.
