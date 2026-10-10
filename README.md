# AURORA

AURORA is a personal AI assistant concept for web and Android, with a futuristic animated orb, intelligent chat, natural voice interaction, personalized daily planning, and a premium sci-fi interface.

## Security first

- Never commit API keys, passwords, tokens, or private environment files.
- Keep OpenAI and ElevenLabs keys on the server/backend only.
- Frontend code must call our own backend endpoint; it must never call a provider using a secret key.
- Use deployment-platform secret/environment settings for production keys.
- If a key is exposed, revoke it and create a replacement immediately.

## Environment variables

See [`.env.example`](.env.example) for variable names only. Do not put real values in that file.

## Planned integrations

- OpenAI API: assistant responses.
- ElevenLabs API: optional AURORA voice output.
- Browser speech recognition: optional speech input, depending on browser support.
- Responsive web interface and Android packaging.

## Development status

This repository is the clean AURORA project starting point. UI, backend routes, tests, and Android packaging should be added in separate, testable steps.
