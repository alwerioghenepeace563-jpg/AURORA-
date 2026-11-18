const assert = require("node:assert/strict");
const { runAuroraMcpResearch, getAuroraMcpStatus } = require("../lib/aurora-mcp.cjs");

async function main() {
  delete process.env.PERPLEXITY_API_KEY;
  process.env.AURORA_EXA_ENABLED = "true";
  process.env.AURORA_FIRECRAWL_ENABLED = "false";
  delete process.env.FIRECRAWL_API_KEY;
  delete process.env.FIRECRAWL_OAUTH_TOKEN;
  delete process.env.AURORA_PLAYWRIGHT_MCP_URL;
  delete process.env.CLOUDFLARE_ACCOUNT_ID;
  delete process.env.CLOUDFLARE_API_TOKEN;
  process.env.AURORA_CLOUDFLARE_BROWSER_ENABLED = "true";
  delete process.env.AURORA_GLYPH_MCP_URL;

  const originalFetch = global.fetch;
  let calls = 0;
  global.fetch = async (_url, options = {}) => {
    calls += 1;
    const payload = options.body ? JSON.parse(options.body) : {};
    if (payload.method === "initialize") {
      return new Response(JSON.stringify({
        jsonrpc: "2.0", id: payload.id,
        result: { protocolVersion: "2025-03-26", capabilities: {}, serverInfo: { name: "mock-exa", version: "1" } }
      }), { status: 200, headers: { "content-type": "application/json", "mcp-session-id": "mock-session" } });
    }
    if (payload.method === "notifications/initialized") {
      return new Response(null, { status: 202, headers: { "mcp-session-id": "mock-session" } });
    }
    if (payload.method === "tools/list") {
      return new Response(JSON.stringify({
        jsonrpc: "2.0", id: payload.id,
        result: { tools: [{
          name: "web_search_exa",
          description: "Search the web for relevant pages.",
          inputSchema: { type: "object", properties: { query: { type: "string" }, limit: { type: "number" } }, required: ["query"] }
        }] }
      }), { status: 200, headers: { "content-type": "application/json" } });
    }
    if (payload.method === "tools/call") {
      assert.equal(payload.params.name, "web_search_exa");
      assert.equal(payload.params.arguments.query, "research photosynthesis today");
      return new Response(JSON.stringify({
        jsonrpc: "2.0", id: payload.id,
        result: { content: [{ type: "text", text: "Mock search result with source evidence." }] }
      }), { status: 200, headers: { "content-type": "application/json" } });
    }
    throw new Error("Unexpected MCP method: " + payload.method);
  };

  try {
    const skipped = await runAuroraMcpResearch("hello there");
    assert.equal(skipped.results.length, 0);
    assert.equal(calls, 0, "MCP should not run for ordinary chat.");

    const result = await runAuroraMcpResearch("research photosynthesis today");
    assert.equal(result.results.length, 1);
    assert.equal(result.results[0].server, "exa");
    assert.match(result.results[0].text, /Mock search result/);
    assert.equal(calls, 4, "Expected initialize, initialized notification, tools/list and tools/call.");
    assert.ok(getAuroraMcpStatus().some(item => item.id === "exa" && item.configured));
    assert.ok(getAuroraMcpStatus().some(item => item.id === "firecrawl" && !item.configured));
  } finally {
    global.fetch = originalFetch;
  }
  assert.ok(getAuroraMcpStatus().some(item => item.id === "cloudflare-browser-run" && !item.configured));
  assert.equal(await runAuroraMcpResearch("read https://example.com"), (await runAuroraMcpResearch("read https://example.com")));
  console.log("AURORA remote MCP connector tests passed.");
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
