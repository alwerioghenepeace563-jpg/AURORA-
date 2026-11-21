type Env = Record<string, any>;

const MCP_PROTOCOL_VERSION = "2025-03-26";
const MCP_TIMEOUT_MS = 8500;
const BROWSER_TIMEOUT_MS = 11000;
const MAX_TEXT = 7000;

type Connector = {
  id: string;
  label: string;
  url: string;
  token: string;
  enabled: boolean;
  kind: "research" | "browser" | "custom";
};

function value(env: Env, key: string): string {
  return typeof env?.[key] === "string" ? env[key].trim() : "";
}

function connectors(env: Env): Connector[] {
  const firecrawlToken = value(env, "FIRECRAWL_OAUTH_TOKEN") || value(env, "FIRECRAWL_API_KEY");
  const tavilyToken = value(env, "TAVILY_API_KEY");
  const cloudflareMcpToken = value(env, "AURORA_CLOUDFLARE_MCP_TOKEN");
  const perplexityToken = value(env, "PERPLEXITY_API_KEY");
  return [
    {
      id: "exa",
      label: "Exa Web Research",
      url: value(env, "AURORA_EXA_MCP_URL") || "https://mcp.exa.ai/mcp",
      token: "",
      enabled: value(env, "AURORA_EXA_ENABLED").toLowerCase() !== "false",
      kind: "research"
    },
    {
      id: "firecrawl",
      label: "Firecrawl Search and Extraction",
      url: value(env, "AURORA_FIRECRAWL_MCP_URL") || "https://mcp.firecrawl.dev/v2/mcp",
      token: firecrawlToken,
      enabled: value(env, "AURORA_FIRECRAWL_ENABLED").toLowerCase() !== "false",
      kind: "research"
    },
    {
      id: "tavily",
      label: "Tavily Web Research",
      url: value(env, "AURORA_TAVILY_MCP_URL") || "https://mcp.tavily.com/mcp/",
      token: tavilyToken,
      enabled: Boolean(tavilyToken) && value(env, "AURORA_TAVILY_ENABLED").toLowerCase() !== "false",
      kind: "research"
    },
    {
      id: "cloudflare-api",
      label: "Cloudflare Documentation and Read-only API Research",
      url: value(env, "AURORA_CLOUDFLARE_MCP_URL") || "https://mcp.cloudflare.com/mcp",
      token: cloudflareMcpToken,
      enabled: Boolean(cloudflareMcpToken) && value(env, "AURORA_CLOUDFLARE_MCP_ENABLED").toLowerCase() !== "false",
      kind: "research"
    },
    {
      id: "perplexity",
      label: "Perplexity Research",
      url: value(env, "AURORA_PERPLEXITY_MCP_URL") || "https://api.perplexity.ai/mcp",
      token: perplexityToken,
      enabled: Boolean(perplexityToken) && value(env, "AURORA_PERPLEXITY_ENABLED").toLowerCase() !== "false",
      kind: "research"
    },
    {
      id: "playwright",
      label: "Playwright Browser (Chrome-compatible)",
      url: value(env, "AURORA_PLAYWRIGHT_MCP_URL"),
      token: value(env, "AURORA_PLAYWRIGHT_MCP_TOKEN"),
      enabled: Boolean(value(env, "AURORA_PLAYWRIGHT_MCP_URL")),
      kind: "browser"
    },
    {
      id: "glyph",
      label: "Glyph MCP",
      url: value(env, "AURORA_GLYPH_MCP_URL"),
      token: value(env, "AURORA_GLYPH_MCP_TOKEN"),
      enabled: Boolean(value(env, "AURORA_GLYPH_MCP_URL")),
      kind: "custom"
    }
  ];
}

export function getMcpStatus(env: Env) {
  const list = connectors(env);
  return {
    defaultResearch: "exa",
    connectors: list.map(item => ({
      id: item.id,
      label: item.label,
      configured: item.enabled && Boolean(item.url),
      authenticationConfigured: Boolean(item.token),
      transport: "streamable-http"
    })),
    cloudflareBrowserRun: {
      configured: Boolean(value(env, "CLOUDFLARE_ACCOUNT_ID") && value(env, "CLOUDFLARE_BROWSER_RUN_TOKEN")) &&
        value(env, "AURORA_CLOUDFLARE_BROWSER_ENABLED").toLowerCase() !== "false",
      authenticationConfigured: Boolean(value(env, "CLOUDFLARE_BROWSER_RUN_TOKEN"))
    }
  };
}

function safeTargetUrl(raw: string): string {
  try {
    const url = new URL(raw);
    const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
    if (!["https:", "http:"].includes(url.protocol) || url.username || url.password) return "";
    if (/^(?:\d{1,3}\.){3}\d{1,3}$/.test(host) || host.includes(":")) return "";
    if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") ||
        host === "metadata.google.internal" || host === "metadata" ||
        host === "169.254.169.254" || host === "::1" || host === "0.0.0.0" ||
        /^(127\.|10\.|192\.168\.|172\.(1[6-9]|2[0-9]|3[01])\.)/.test(host)) return "";
    return url.href;
  } catch {
    return "";
  }
}

function extractTargetUrl(query: string): string {
  const match = query.match(/https?:\/\/[^\s<>"')\]]+/i);
  return match ? safeTargetUrl(match[0]) : "";
}

function wantsResearch(query: string): boolean {
  return Boolean(extractTargetUrl(query)) ||
    /\b(search|research|look up|find online|latest|current|today|recent|news|compare sources|investigate|browse|website|webpage|read this|open this)\b/i.test(query);
}

function readOnlyTool(server: Connector, tool: any, targetUrl: string): boolean {
  const name = String(tool?.name || "").toLowerCase();
  const description = String(tool?.description || "").toLowerCase();
  if (!name || tool?.annotations?.destructiveHint === true || tool?.annotations?.readOnlyHint === false) return false;
  if (/\b(click|type|fill|submit|login|log_in|send|post|purchase|checkout|delete|remove|update|write|edit|upload|download_file)\b/.test(name)) return false;
  if (server.kind === "browser") return Boolean(targetUrl) && /navigate|snapshot|page.*content|read.*page|browser.*url/.test(name + " " + description);
  if (server.kind === "research") return /search|research|ask|scrape|extract|parse|answer/.test(name + " " + description);
  return /search|research|read|lookup|fetch|scrape|inspect/.test(name + " " + description);
}

function buildToolArgs(tool: any, query: string, targetUrl: string): Record<string, unknown> | null {
  const schema = tool?.inputSchema && typeof tool.inputSchema === "object" ? tool.inputSchema : {};
  const properties = schema.properties && typeof schema.properties === "object" ? schema.properties : {};
  const required = Array.isArray(schema.required) ? schema.required : [];
  const args: Record<string, unknown> = {};
  for (const key of Object.keys(properties)) {
    const name = key.toLowerCase();
    if (/(query|search.?term|prompt|question|input|instruction)/.test(name)) args[key] = query;
    else if (/(^url$|website|webpage|uri)/.test(name) && targetUrl) args[key] = targetUrl;
    else if (/(limit|max.?results|num.?results)/.test(name)) args[key] = 5;
    else if (/country/.test(name)) args[key] = "NG";
  }
  return required.every((key: string) => Object.prototype.hasOwnProperty.call(args, key)) ? args : null;
}

async function parseMcpResponse(response: Response): Promise<any> {
  if (response.status === 202 || response.status === 204) return null;
  const body = await response.text();
  if (!body) return null;
  const type = (response.headers.get("content-type") || "").toLowerCase();
  if (type.includes("text/event-stream") || body.startsWith("event:") || body.startsWith("data:")) {
    for (const event of body.split(/\r?\n\r?\n/)) {
      const data = event.split(/\r?\n/).filter(line => line.startsWith("data:"))
        .map(line => line.slice(5).trim()).join("\n");
      if (data && data !== "[DONE]") {
        try { return JSON.parse(data); } catch { /* try the next event */ }
      }
    }
    return null;
  }
  try { return JSON.parse(body); } catch {
    throw new Error("MCP server returned an unsupported response.");
  }
}

async function runMcpServer(server: Connector, query: string, targetUrl: string) {
  if (!server.enabled || !server.url) return null;
  const endpoint = new URL(server.url);
  if (endpoint.protocol !== "https:" || endpoint.username || endpoint.password) {
    throw new Error("MCP endpoint must be a credential-free HTTPS URL.");
  }
  let sessionId = "";
  let requestId = 0;
  let negotiatedProtocolVersion = MCP_PROTOCOL_VERSION;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "Accept": "application/json, text/event-stream"
  };
  if (server.token) headers.Authorization = "Bearer " + server.token;

  const rpc = async (method: string, params: Record<string, unknown> = {}) => {
    const id = ++requestId;
    const response = await fetch(endpoint.href, {
      method: "POST",
      headers: { ...headers, ...(method === "initialize" ? {} : { "MCP-Protocol-Version": negotiatedProtocolVersion }), ...(sessionId ? { "Mcp-Session-Id": sessionId } : {}) },
      body: JSON.stringify({ jsonrpc: "2.0", id, method, params }),
      signal: AbortSignal.timeout(MCP_TIMEOUT_MS)
    });
    const newSession = response.headers.get("mcp-session-id");
    if (newSession) sessionId = newSession;
    if (!response.ok) throw new Error("MCP HTTP " + response.status);
    const payload = await parseMcpResponse(response);
    if (payload?.error) throw new Error(String(payload.error.message || "MCP request failed"));
    return payload?.result ?? null;
  };

  const initialized = await rpc("initialize", {
    protocolVersion: MCP_PROTOCOL_VERSION,
    capabilities: {},
    clientInfo: { name: "AURORA-Cloudflare", version: "1.0.0" }
  });
  if (typeof initialized?.protocolVersion === "string") negotiatedProtocolVersion = initialized.protocolVersion;
  const notification = await fetch(endpoint.href, {
    method: "POST",
    headers: { ...headers, "MCP-Protocol-Version": negotiatedProtocolVersion, ...(sessionId ? { "Mcp-Session-Id": sessionId } : {}) },
    body: JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized", params: {} }),
    signal: AbortSignal.timeout(MCP_TIMEOUT_MS)
  });
  if (!notification.ok && notification.status !== 202) throw new Error("MCP initialization notification failed.");

  const listed = await rpc("tools/list");
  const tools = Array.isArray(listed?.tools) ? listed.tools : [];
  const selected = tools.find((tool: any) =>
    readOnlyTool(server, tool, targetUrl) && buildToolArgs(tool, query, targetUrl) !== null
  );
  if (!selected) return null;
  const args = buildToolArgs(selected, query, targetUrl) || {};
  const result = await rpc("tools/call", { name: selected.name, arguments: args });
  if (result?.isError) throw new Error("MCP tool reported an error.");
  const chunks = Array.isArray(result?.content)
    ? result.content.filter((part: any) => part?.type === "text" && typeof part.text === "string").map((part: any) => part.text)
    : [];
  const output = chunks.join("\n").trim() ||
    (result?.structuredContent ? JSON.stringify(result.structuredContent) : "");
  if (!output) return null;
  return { server: server.id, label: server.label, tool: selected.name, text: output.slice(0, MAX_TEXT) };
}

async function runCloudflareBrowserRun(env: Env, targetUrl: string) {
  const account = value(env, "CLOUDFLARE_ACCOUNT_ID");
  const token = value(env, "CLOUDFLARE_BROWSER_RUN_TOKEN");
  if (!account || !token || !targetUrl || value(env, "AURORA_CLOUDFLARE_BROWSER_ENABLED").toLowerCase() === "false") return null;
  const response = await fetch("https://api.cloudflare.com/client/v4/accounts/" +
    encodeURIComponent(account) + "/browser-rendering/markdown", {
    method: "POST",
    headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
    body: JSON.stringify({ url: targetUrl }),
    signal: AbortSignal.timeout(BROWSER_TIMEOUT_MS)
  });
  if (!response.ok) throw new Error("Cloudflare Browser Run HTTP " + response.status);
  const payload: any = await response.json();
  if (payload?.success === false || payload?.errors?.length) throw new Error("Cloudflare Browser Run could not read this page.");
  const markdown = typeof payload?.result === "string" ? payload.result :
    typeof payload?.result?.markdown === "string" ? payload.result.markdown : "";
  return markdown.trim() ? {
    server: "cloudflare-browser-run", label: "Cloudflare Browser Run", tool: "markdown",
    text: markdown.slice(0, MAX_TEXT)
  } : null;
}

export async function runAuroraMcpResearch(env: Env, query: string) {
  const cleanQuery = String(query || "").trim().slice(0, 500);
  if (!cleanQuery || !wantsResearch(cleanQuery)) return { configured: getMcpStatus(env), results: [] };
  const targetUrl = extractTargetUrl(cleanQuery);
  const selected = connectors(env).filter(server =>
    server.enabled && (server.kind !== "browser" || Boolean(targetUrl))
  );
  const jobs: Promise<any>[] = selected.map(server => runMcpServer(server, cleanQuery, targetUrl)
    .catch((error: any) => ({ server: server.id, label: server.label, error: String(error?.message || "MCP unavailable").slice(0, 120) })));
  if (targetUrl) {
    jobs.push(runCloudflareBrowserRun(env, targetUrl)
      .catch((error: any) => ({ server: "cloudflare-browser-run", label: "Cloudflare Browser Run", error: String(error?.message || "Browser unavailable").slice(0, 120) })));
  }
  const settled = await Promise.all(jobs);
  return {
    configured: getMcpStatus(env),
    results: settled.filter((item: any) => item && item.text).slice(0, 4)
  };
}
