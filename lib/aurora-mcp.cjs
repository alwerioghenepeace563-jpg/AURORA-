/**
 * AURORA remote MCP connectors.
 *
 * Uses MCP Streamable HTTP from the server only. Credentials never reach the
 * browser. Each connector is optional and isolated by a short deadline.
 * Only explicitly selected read-oriented tools are eligible for automatic use.
 */
const MCP_PROTOCOL_VERSION = "2025-03-26";
const REQUEST_TIMEOUT_MS = 12000;
const MAX_RESULT_CHARS = 9000;
let nextId = 1;

function env(name) {
  return typeof process !== "undefined" && typeof process.env?.[name] === "string"
    ? process.env[name].trim() : "";
}
function connectorDefinitions() {
  return [
    {
      id: "exa",
      label: "Exa Free Web Research",
      url: env("AURORA_EXA_MCP_URL") || "https://mcp.exa.ai/mcp",
      // Exa's hosted MCP supports keyless, rate-limited access.
      token: "",
      enabled: env("AURORA_EXA_ENABLED") !== "false",
      kind: "research"
    },
    {
      id: "firecrawl",
      label: "Firecrawl Search and Extraction",
      url: env("AURORA_FIRECRAWL_MCP_URL") || "https://mcp.firecrawl.dev/v2/mcp",
      token: env("FIRECRAWL_OAUTH_TOKEN") || env("FIRECRAWL_API_KEY"),
      // Current hosted Firecrawl requires a credential; do not assume legacy keyless access.
      enabled: env("AURORA_FIRECRAWL_ENABLED") !== "false" &&
        Boolean(env("FIRECRAWL_OAUTH_TOKEN") || env("FIRECRAWL_API_KEY")),
      kind: "research"
    },
    {
      id: "playwright",
      label: "Cloudflare Browser Run (Playwright)",
      url: env("AURORA_PLAYWRIGHT_MCP_URL"),
      token: env("AURORA_PLAYWRIGHT_MCP_TOKEN"),
      enabled: Boolean(env("AURORA_PLAYWRIGHT_MCP_URL")),
      kind: "browser"
    },
    {
      id: "glyph",
      label: "Glyph MCP (custom endpoint)",
      url: env("AURORA_GLYPH_MCP_URL"),
      token: env("AURORA_GLYPH_MCP_TOKEN"),
      enabled: Boolean(env("AURORA_GLYPH_MCP_URL")),
      kind: "custom"
    }
  ];
}
function validateEndpoint(raw) {
  let url;
  try { url = new URL(raw); } catch { throw new Error("MCP endpoint URL is invalid."); }
  if (url.protocol !== "https:" && !(url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname))) {
    throw new Error("MCP endpoints must use HTTPS (HTTP is allowed only for localhost).");
  }
  return url.href;
}
async function readResponse(response) {
  const type = String(response.headers.get("content-type") || "").toLowerCase();
  if (response.status === 202 || response.status === 204) return null;
  const body = await response.text();
  if (!body) return null;
  if (type.includes("text/event-stream") || body.startsWith("event:") || body.startsWith("data:")) {
    const events = body.split(/\r?\n\r?\n/);
    for (const event of events) {
      const data = event.split(/\r?\n/).filter(line => line.startsWith("data:"))
        .map(line => line.slice(5).trim()).join("\n");
      if (data && data !== "[DONE]") {
        try { return JSON.parse(data); } catch { /* continue to next SSE event */ }
      }
    }
    return null;
  }
  try { return JSON.parse(body); } catch { throw new Error("MCP server returned an unsupported response."); }
}
function textFromResult(result) {
  if (!result) return "";
  const content = Array.isArray(result.content) ? result.content : [];
  const chunks = content.filter(item => item && item.type === "text" && typeof item.text === "string").map(item => item.text);
  if (chunks.length) return chunks.join("\n").slice(0, MAX_RESULT_CHARS);
  if (result.structuredContent) return JSON.stringify(result.structuredContent).slice(0, MAX_RESULT_CHARS);
  return JSON.stringify(result).slice(0, MAX_RESULT_CHARS);
}
function makeArgs(tool, query, targetUrl) {
  const schema = tool.inputSchema && typeof tool.inputSchema === "object" ? tool.inputSchema : {};
  const properties = schema.properties && typeof schema.properties === "object" ? schema.properties : {};
  const required = Array.isArray(schema.required) ? schema.required : [];
  const args = {};
  for (const key of Object.keys(properties)) {
    const name = key.toLowerCase();
    if (/(query|search.?term|prompt|question|input|instruction)/.test(name)) args[key] = query;
    else if (/(^url$|website|webpage|uri)/.test(name) && targetUrl) args[key] = targetUrl;
    else if (/(limit|max.?results|num.?results)/.test(name)) args[key] = 5;
    else if (/(country)/.test(name)) args[key] = "NG";
  }
  return required.every(key => Object.prototype.hasOwnProperty.call(args, key)) ? args : null;
}
function eligibleTool(server, tool, query, targetUrl) {
  const name = String(tool?.name || "").toLowerCase();
  const description = String(tool?.description || "").toLowerCase();
  if (!name || tool?.annotations?.destructiveHint === true || tool?.annotations?.readOnlyHint === false) return false;
  if (server.kind === "browser") return Boolean(targetUrl) && /navigate|snapshot|page.*content|read.*page/.test(name + " " + description);
  if (server.kind === "research") return /search|research|ask|scrape|extract|parse/.test(name + " " + description);
  return /search|research|read|lookup|fetch|scrape/.test(name + " " + description);
}
async function createSession(server) {
  const endpoint = validateEndpoint(server.url);
  let sessionId = "";
  const headers = {
    "Content-Type": "application/json",
    "Accept": "application/json, text/event-stream"
  };
  if (server.token) headers.Authorization = "Bearer " + server.token;
  async function rpc(method, params = {}) {
    const id = nextId++;
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { ...headers, ...(sessionId ? { "Mcp-Session-Id": sessionId } : {}) },
      body: JSON.stringify({ jsonrpc: "2.0", id, method, params }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
    });
    const newSession = response.headers.get("mcp-session-id");
    if (newSession) sessionId = newSession;
    if (!response.ok) throw Object.assign(new Error("MCP HTTP " + response.status), { code: "MCP_HTTP_ERROR" });
    const payload = await readResponse(response);
    if (payload?.error) throw Object.assign(new Error(payload.error.message || "MCP request failed"), { code: "MCP_RPC_ERROR" });
    return payload?.result ?? null;
  }
  await rpc("initialize", {
    protocolVersion: MCP_PROTOCOL_VERSION,
    capabilities: {},
    clientInfo: { name: "AURORA", version: "1.0.0" }
  });
  const initId = nextId++;
  const initResponse = await fetch(endpoint, {
    method: "POST",
    headers: { ...headers, ...(sessionId ? { "Mcp-Session-Id": sessionId } : {}) },
    body: JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized", params: {} }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
  });
  const newSession = initResponse.headers.get("mcp-session-id");
  if (newSession) sessionId = newSession;
  if (!initResponse.ok && initResponse.status !== 202) throw new Error("MCP initialization notification failed.");
  return { rpc };
}
async function runServer(server, query, targetUrl) {
  if (!server.enabled || !server.url) return null;
  const session = await createSession(server);
  const listed = await session.rpc("tools/list", {});
  const tools = Array.isArray(listed?.tools) ? listed.tools : [];
  const tool = tools.find(item => eligibleTool(server, item, query, targetUrl) &&
    makeArgs(item, query, targetUrl) !== null);
  if (!tool) return null;
  const args = makeArgs(tool, query, targetUrl);
  const result = await session.rpc("tools/call", { name: tool.name, arguments: args });
  if (result?.isError) throw new Error("MCP tool reported an error.");
  return {
    server: server.id,
    label: server.label,
    tool: tool.name,
    text: textFromResult(result)
  };
}
function wantsResearch(query) {
  return /\b(search|research|look up|find online|latest|current|today|recent|news|compare sources|investigate|browse|website|webpage)\b/i.test(query);
}
function extractUrl(query) {
  const match = String(query || "").match(/https?:\/\/[^\s<>"')\]]+/i);
  if (!match) return "";
  try {
    const url = new URL(match[0]);
    return ["http:", "https:"].includes(url.protocol) ? url.href : "";
  } catch { return ""; }
}
async function runAuroraMcpResearch(query, options = {}) {
  const text = String(query || "").trim().slice(0, 500);
  if (!text || !wantsResearch(text)) return { results: [], configured: connectorDefinitions().filter(s => s.enabled).map(s => s.id) };
  const servers = connectorDefinitions();
  const targetUrl = extractUrl(text);
  const selected = servers.filter(server => server.enabled && (server.kind !== "browser" || targetUrl));
  const jobs = selected.map(server => runServer(server, text, targetUrl)
    .catch(error => ({ server: server.id, label: server.label, error: error?.code || "MCP_UNAVAILABLE" })));
  const settled = await Promise.all(jobs);
  const results = settled.filter(item => item && item.text);
  const max = Math.max(1, Math.min(4, Number(options.maxResults) || 3));
  return {
    configured: servers.filter(s => s.enabled).map(s => s.id),
    results: results.slice(0, max)
  };
}
function getAuroraMcpStatus() {
  return connectorDefinitions().map(server => ({
    id: server.id, label: server.label,
    configured: Boolean(server.enabled && server.url),
    authenticationConfigured: Boolean(server.token),
    transport: "streamable-http"
  }));
}

module.exports = { runAuroraMcpResearch, getAuroraMcpStatus };
