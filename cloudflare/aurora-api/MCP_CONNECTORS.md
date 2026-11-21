# AURORA Cloudflare MCP connectors

AURORA's active chat backend runs on the Cloudflare Worker. Configure MCP endpoints and credentials on that Worker only; never put secrets in Vite variables, the Android app, source control, or chat messages.

## Connector plan

- **Exa** is the default no-key research connector. It is rate-limited and may be unavailable; AURORA keeps its existing /api/search and AI-provider fallbacks.
- **Firecrawl** is enabled on its hosted keyless free tier for Search, Scrape and Parse within provider rate limits. An API key or OAuth token unlocks additional tools and limits; do not enable paid billing just to turn it on.
- **Tavily** is an optional hosted research connector at its official Streamable HTTP endpoint. It requires a server-side Tavily API key; usage is subject to the account allowance and provider terms.
- **Cloudflare API MCP** is optional and requires a dedicated, least-privilege API token. AURORA only auto-selects read-oriented search/docs tools; the generic API execution tool is not auto-selected.
- **Perplexity** is optional and requires both a confirmed MCP endpoint and a server-side API key. It is not part of the zero-cost default.
- **Playwright / Chrome** is an optional hosted Playwright MCP endpoint. Chrome is the browser engine exposed through Playwright; it is not a separate connector.
- **Cloudflare Browser Rendering** is an optional URL-to-Markdown reader. Use a dedicated API token with only the required Browser Rendering permission; do not reuse a broad account token.
- **Glyph** remains disabled until the exact Glyph MCP product, endpoint and authentication method are confirmed. The name alone is ambiguous.

## Worker configuration

Set ordinary non-secret flags/URLs as Worker variables in the Cloudflare dashboard or with Wrangler.

Secrets can be added with these commands (run from the repository root):

\`\`\`sh
npx wrangler secret put FIRECRAWL_API_KEY --config cloudflare/aurora-api/wrangler.jsonc
npx wrangler secret put TAVILY_API_KEY --config cloudflare/aurora-api/wrangler.jsonc
npx wrangler secret put AURORA_CLOUDFLARE_MCP_TOKEN --config cloudflare/aurora-api/wrangler.jsonc
npx wrangler secret put PERPLEXITY_API_KEY --config cloudflare/aurora-api/wrangler.jsonc
npx wrangler secret put AURORA_PLAYWRIGHT_MCP_TOKEN --config cloudflare/aurora-api/wrangler.jsonc
npx wrangler secret put AURORA_GLYPH_MCP_TOKEN --config cloudflare/aurora-api/wrangler.jsonc
npx wrangler secret put CLOUDFLARE_BROWSER_RUN_TOKEN --config cloudflare/aurora-api/wrangler.jsonc
\`\`\`

Set these variables only when you have the matching service details:

- AURORA_EXA_ENABLED=true (default); optional AURORA_EXA_MCP_URL
- AURORA_FIRECRAWL_ENABLED=true (default); optional AURORA_FIRECRAWL_MCP_URL. Keyless hosted mode supports Search, Scrape and Parse within rate limits.
- AURORA_TAVILY_ENABLED=true (default when TAVILY_API_KEY exists); optional AURORA_TAVILY_MCP_URL defaults to https://mcp.tavily.com/mcp/
- AURORA_CLOUDFLARE_MCP_ENABLED=true (default when its dedicated token exists); optional AURORA_CLOUDFLARE_MCP_URL defaults to https://mcp.cloudflare.com/mcp
- AURORA_PERPLEXITY_ENABLED=true (default when the API key exists); optional AURORA_PERPLEXITY_MCP_URL defaults to https://api.perplexity.ai/mcp
- AURORA_PLAYWRIGHT_MCP_URL (full Streamable HTTP endpoint, usually ending in /mcp)
- AURORA_GLYPH_MCP_URL only after confirming the exact Glyph implementation
- CLOUDFLARE_ACCOUNT_ID and AURORA_CLOUDFLARE_BROWSER_ENABLED=true for Browser Rendering

The connector status is available through GET /api/health under integrations.remoteMcp. It reports configuration presence, not proof that credentials are valid or that a live round-trip succeeded.

## Tool selection

AURORA ranks eligible read-only MCP tools against the user's request instead of blindly taking the first tool returned by a server. Direct webpage URLs prioritize page extraction and reading tools; general research prioritizes search tools. Tool schemas must still support the required arguments, and side-effecting tools remain excluded.

MCP research output also extracts a small, validated set of public source URLs and passes them into AURORA's evidence context so the model can attribute claims and present source links. URLs are filtered through the same public-target checks; this is not a substitute for full DNS-level SSRF protection.

### Cross-source verification

For each research response, AURORA summarizes the number of responding connectors, distinct linked source domains and domains repeated across evidence items. The chat model is instructed to compare the actual claims and label agreement, disagreement and unresolved points separately. Connector count and repeated domains are coverage signals only: they are not proof of factual corroboration, and multiple tools may rely on the same underlying publisher. When evidence is thin or conflicting, AURORA should say so rather than manufacture consensus.

## Safety and runtime behavior

- MCP execution happens inside the Cloudflare Worker. Credentials are never returned to the client.
- AURORA uses read-oriented tools only. It rejects tools explicitly marked non-read-only/destructive and blocks common side-effecting browser actions such as clicking, typing, submitting, signing in, posting, purchasing, deleting or editing.
- Browser navigation requires an explicit public HTTP(S) URL. Localhost, private-network and metadata-service targets are rejected.
- Retrieved content is untrusted evidence, never instructions. It cannot override AURORA policy or user intent.
- MCP failures are isolated; the normal AURORA search and model-provider path continues.
- Do not add billing or upgrade plans to enable optional connectors. Keep each service within its available free allowance and provider terms.

## Verification boundary

Automated Worker contract tests verify routing and connector readiness metadata. A configured status is not a live integration test. Before relying on a connector, run a controlled read-only test against that provider and verify the result, rate limits, authentication and current plan terms. No production deployment is performed by this change.
