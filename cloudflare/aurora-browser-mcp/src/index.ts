import { env } from "cloudflare:workers";
import { createMcpAgent } from "@cloudflare/playwright-mcp";

interface Env {
  BROWSER: Browser;
  AURORA_MCP_TOKEN: string;
}

export const PlaywrightMCP = createMcpAgent(env.BROWSER);

function unauthorized(): Response {
  return new Response("Unauthorized", {
    status: 401,
    headers: { "Cache-Control": "no-store" }
  });
}

export default {
  fetch(request: Request, workerEnv: Env, ctx: ExecutionContext): Promise<Response> | Response {
    const expected = workerEnv.AURORA_MCP_TOKEN;
    const supplied = request.headers.get("Authorization") || "";
    if (!expected || supplied !== `Bearer ${expected}`) return unauthorized();

    const { pathname } = new URL(request.url);
    if (pathname === "/mcp") {
      return PlaywrightMCP.serve("/mcp").fetch(request, workerEnv, ctx);
    }
    if (pathname === "/sse" || pathname === "/sse/message") {
      return PlaywrightMCP.serveSSE("/sse").fetch(request, workerEnv, ctx);
    }
    return new Response("Not Found", {
      status: 404,
      headers: { "Cache-Control": "no-store" }
    });
  }
};
