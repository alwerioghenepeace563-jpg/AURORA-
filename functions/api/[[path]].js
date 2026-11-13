import adminCodeHandler from "../../api/admin-code.js";
import adminExecuteHandler from "../../api/admin-execute.js";
import adminHandler from "../../api/admin.js";
import chatHandler from "../../api/chat.js";
import mediaGenerateHandler from "../../api/media-generate.js";
import mediaSearchHandler from "../../api/media-search.js";
import metaHandler from "../../api/meta.js";
import modelsHandler from "../../api/models.js";
import publicConfigHandler from "../../api/public-config.js";
import searchHandler from "../../api/search.js";
import voiceHandler from "../../api/voice.js";
import voicesHandler from "../../api/voices.js";
import voiceTextTranscribeHandler from "../../api/voicetext-transcribe.js";
import voiceTextHandler from "../../api/voicetext.js";
import weatherHandler from "../../api/weather.js";
import v1ChatHandler from "../../api/v1/chat.js";

const ROUTES = {
  "admin-code": adminCodeHandler,
  "admin-execute": adminExecuteHandler,
  admin: adminHandler,
  chat: chatHandler,
  "media-generate": mediaGenerateHandler,
  "media-search": mediaSearchHandler,
  meta: metaHandler,
  models: modelsHandler,
  "public-config": publicConfigHandler,
  search: searchHandler,
  voice: voiceHandler,
  voices: voicesHandler,
  "voicetext-transcribe": voiceTextTranscribeHandler,
  voicetext: voiceTextHandler,
  weather: weatherHandler,
  "v1/chat": v1ChatHandler
};

function queryObject(url) {
  const result = {};
  for (const [key, value] of url.searchParams) {
    if (key in result) result[key] = Array.isArray(result[key]) ? [...result[key], value] : [result[key], value];
    else result[key] = value;
  }
  return result;
}

async function parseBody(request) {
  if (request.method === "GET" || request.method === "HEAD") return undefined;
  const type = request.headers.get("content-type") || "";
  if (type.includes("application/json")) {
    const text = await request.text();
    if (!text) return {};
    try { return JSON.parse(text); } catch { return text; }
  }
  if (type.includes("application/x-www-form-urlencoded")) {
    return Object.fromEntries(new URLSearchParams(await request.text()));
  }
  if (type.includes("multipart/form-data")) {
    const form = await request.formData();
    const body = {};
    for (const [key, value] of form.entries()) {
      if (key in body) body[key] = Array.isArray(body[key]) ? [...body[key], value] : [body[key], value];
      else body[key] = value;
    }
    return body;
  }
  const text = await request.text();
  return text || undefined;
}

function createResponseBridge() {
  const headers = new Headers();
  let statusCode = 200;
  let body;
  let sent = false;
  return {
    headers,
    get headersSent() { return sent; },
    status(code) { statusCode = Number(code) || 200; return this; },
    setHeader(name, value) { headers.set(name, String(value)); return this; },
    getHeader(name) { return headers.get(name); },
    json(value) {
      if (!headers.has("content-type")) headers.set("content-type", "application/json; charset=utf-8");
      body = JSON.stringify(value);
      sent = true;
      return this;
    },
    end(value) {
      if (value !== undefined) body = value;
      sent = true;
      return this;
    },
    toResponse() {
      return new Response(body ?? null, { status: statusCode, headers });
    }
  };
}

export async function onRequest({ request }) {
  const url = new URL(request.url);
  const route = url.pathname.replace(/^\/api\/?/, "").replace(/\/$/, "");
  let handler = ROUTES[route];

  // Match the legacy Vercel rewrites so existing client URLs remain valid.
  if (route === "health") {
    handler = metaHandler;
    url.searchParams.set("handler", "health");
  } else if (route === "models") {
    handler = metaHandler;
    url.searchParams.set("handler", "models");
  } else if (route === "public-config") {
    handler = metaHandler;
    url.searchParams.set("handler", "public-config");
  }

  if (!handler) {
    return Response.json({ error: "AURORA API route not found." }, { status: 404 });
  }

  const headers = {};
  for (const [key, value] of request.headers) headers[key.toLowerCase()] = value;
  const req = {
    method: request.method,
    headers,
    query: queryObject(url),
    body: await parseBody(request),
    url: url.pathname + url.search
  };
  const res = createResponseBridge();

  try {
    await handler(req, res);
    return res.toResponse();
  } catch (error) {
    console.error("AURORA Cloudflare API adapter failed:", error?.stack || error?.message || error);
    if (!res.headersSent) {
      return Response.json({ error: "AURORA API encountered an unexpected error." }, { status: 500 });
    }
    return res.toResponse();
  }
}
