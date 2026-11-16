# Security policy

AURORA is a public repository. Public visibility is intentional; credentials and private operational data must never be public.

## Reporting a vulnerability

- Do not publish exploitable vulnerability details, personal data, credentials, or proof-of-concept attack material in a public issue or pull request.
- If GitHub's private vulnerability reporting is enabled for this repository, use the repository's **Security → Report a vulnerability** flow.
- Otherwise, contact the repository owner privately through a trusted channel and share only the minimum information needed to reproduce the issue safely.

## Secrets and credentials

- Never commit real API keys, access tokens, passwords, signing keys, keystores, private certificates, service-role keys, or production environment files.
- Never paste credentials into source files, issues, pull requests, commits, screenshots, or frontend variables.
- Never use a `VITE_*`, `NEXT_PUBLIC_*`, or other client-exposed variable for a provider secret. Anything shipped to the browser or APK should be treated as public.
- Store provider keys in the backend hosting provider's encrypted environment/secret settings. Android signing material belongs in protected release secrets or a secure offline backup, never in the repository.
- Only server-side routes may read provider keys. Do not log authorization headers, API keys, session tokens, or full provider requests containing secrets.
- Use spending limits and usage alerts where available; do not expose paid endpoints without suitable authentication, authorization, and abuse controls.

## If a secret is exposed

Removing it in a later commit is not enough. Revoke or rotate it at the provider immediately, review its usage, replace it in the secure environment, and assess whether repository history or release artifacts also need remediation. Do not paste the exposed value into a report.

## Contributions and review

Changes should be proposed through pull requests and reviewed before they are merged to `main`. The repository's CODEOWNERS file identifies the owner for review; GitHub branch protection/rulesets must also be enabled to enforce review and prevent direct pushes.
