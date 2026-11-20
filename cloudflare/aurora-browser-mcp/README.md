# AURORA Browser MCP (Cloudflare Free plan)

This is AURORA's optional browser-automation service. It uses Cloudflare's
official `@cloudflare/playwright-mcp` package and Browser Run binding. It is
separate from the Vercel app so browser execution stays on Cloudflare.

## Free-plan limits

Cloudflare currently lists 10 browser minutes per day, up to 3 concurrent
browser sessions, one new session every 20 seconds, and a 60-second browser
timeout on Workers Free. Browser Run usage is shared with other Browser Run
features on the same Cloudflare account. Stay on Workers Free; do not enable a
paid plan or billing for this integration.

## Deploy

1. In the Cloudflare dashboard, stay on the Free Workers plan.
2. Create a Cloudflare API token with **Browser Rendering - Edit** permission
   for deployment/management. Keep it private.
3. From this directory, install and deploy with Wrangler:
   `npm install`
   `npx wrangler login`
   `npx wrangler secret put AURORA_MCP_TOKEN`
   Enter a long random secret when prompted. Do not commit it or send it in chat.
   `npm run deploy`
4. Wrangler prints the Worker URL, for example
   `https://aurora-browser-mcp.<your-subdomain>.workers.dev`.

The Worker requires the secret on every request and exposes Streamable HTTP at
`/mcp`. It also exposes SSE at `/sse` for compatible clients.

## Connect AURORA

In the Vercel project settings for AURORA, add these server-only variables to
the same environments where the chat API runs:

- `AURORA_PLAYWRIGHT_MCP_URL=https://<your-worker>.workers.dev/mcp`
- `AURORA_PLAYWRIGHT_MCP_TOKEN=<the same secret entered with wrangler>`

Do not use a `VITE_` prefix. Redeploy the Vercel preview after setting them.
The current AURORA MCP client will then discover the server's tools and use
only read-oriented browser tools for explicit requests containing a URL.

## Safety

The browser connector is for reading and inspecting pages. AURORA's automatic
tool selection must not submit forms, sign in, purchase, post, delete, or change
external accounts. Those actions need a separate user-confirmation workflow.
The MCP token is a server secret; rotate it by setting a new Worker secret and
updating the Vercel environment variable.
