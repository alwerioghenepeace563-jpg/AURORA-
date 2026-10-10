# Security policy

## API keys

- Never paste real API keys into source files, issues, commits, screenshots, or frontend variables.
- Never use a `VITE_*`, `NEXT_PUBLIC_*`, or other client-exposed variable for a provider secret.
- Store OpenAI and ElevenLabs keys in the backend hosting provider's encrypted environment/secret settings.
- Only server-side routes may read provider keys.
- Do not log authorization headers, API keys, or full provider requests containing secrets.
- Use spending limits and usage alerts where the provider offers them.
- Revoke and rotate any key that may have been exposed.

## Reporting

If a key is accidentally committed, removing it in a later commit is not enough. Revoke it at the provider and replace it with a new key.
