import cors from "../cors.cjs";
const { applyAuroraCors } = cors;
const PROVIDERS = {
  groq: {
    env: "GROQ_API_KEY",
    url: "https://api.groq.com/openai/v1/chat/completions",
    payload: () => ({ model: process.env.GROQ_MODEL || "openai/gpt-oss-20b", messages: [{ role: "user", content: "Reply with OK." }], max_tokens: 3, temperature: 0 }),
    headers: (key) => ({ Authorization: "Bearer " + key, "Content-Type": "application/json" })
  },
  openrouter: {
    env: "OPENROUTER_API_KEY",
    url: "https://openrouter.ai/api/v1/chat/completions",
    payload: () => ({ model: process.env.OPENROUTER_MODEL || "openrouter/free", messages: [{ role: "user", content: "Reply with OK." }], max_tokens: 3, temperature: 0 }),
    headers: (key) => ({ Authorization: "Bearer " + key, "Content-Type": "application/json", "HTTP-Referer": process.env.AURORA_ALLOWED_ORIGIN || "https://aurora-ten-gold.vercel.app", "X-Title": "AURORA Admin Diagnostics" })
  },
  gemini: {
    env: "GEMINI_API_KEY",
    url: null,
    payload: () => ({ contents: [{ parts: [{ text: "Reply with OK." }] }], generationConfig: { maxOutputTokens: 4, temperature: 0 } }),
    headers: () => ({ "Content-Type": "application/json" })
  }
};

async function verifyAdmin(req) {
  const authorization = req.headers.authorization || "";
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  if (!match) return { error: "Sign in with the administrator account first.", status: 401 };
  const supabaseUrl = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || process.env.VITE_SUPABASE_API || "").trim().replace(/\/$/, "").replace(/\/(?:rest\/v1|auth\/v1)$/i, "");
  const supabaseKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || "";
  if (!supabaseUrl || !supabaseKey) return { error: "Authentication service is not configured on the server.", status: 503 };
  try {
    const response = await fetch(supabaseUrl + "/auth/v1/user", {
      headers: { apikey: supabaseKey, Authorization: "Bearer " + match[1] },
      signal: AbortSignal.timeout(8000)
    });
    const user = await response.json().catch(() => ({}));
    if (!response.ok || !user.email) return { error: "Your sign-in session could not be verified. Please sign in again.", status: 401 };
    const allowlist = (process.env.ADMIN_EMAIL_ALLOWLIST || "alwerioghenepeace563@gmail.com").split(",").map((email) => email.trim().toLowerCase()).filter(Boolean);
    const email = String(user.email).trim().toLowerCase();
    if (!allowlist.includes(email)) return { error: "This account is not authorised to execute Admin actions.", status: 403 };
    return { email };
  } catch {
    return { error: "Could not verify administrator access right now.", status: 502 };
  }
}

async function testProvider(name, config) {
  const key = process.env[config.env];
  if (!key) return { configured: false, status: "missing", latencyMs: null, message: "Server credential is not configured." };
  const started = Date.now();
  try {
    const url = name === "gemini"
      ? "https://generativelanguage.googleapis.com/v1beta/models/" + encodeURIComponent((process.env.GEMINI_MODEL || "gemini-2.5-flash").replace(/^models\//, "")) + ":generateContent?key=" + encodeURIComponent(key)
      : config.url;
    const response = await fetch(url, {
      method: "POST",
      headers: config.headers(key),
      body: JSON.stringify(config.payload()),
      signal: AbortSignal.timeout(12000)
    });
    const data = await response.json().catch(() => ({}));
    const latencyMs = Date.now() - started;
    if (!response.ok) {
      const raw = typeof data?.error?.message === "string" ? data.error.message : typeof data?.message === "string" ? data.message : "Provider returned HTTP " + response.status + ".";
      const safeMessage = raw.replace(/https?:\/\/\S+/g, "[provider link]").replace(/\b[A-Za-z0-9_-]{24,}\b/g, "[redacted]").slice(0, 180);
      return { configured: true, status: "error", latencyMs, httpStatus: response.status, message: safeMessage };
    }
    const hasReply = name === "gemini"
      ? Boolean(data?.candidates?.[0]?.content?.parts?.length)
      : Boolean(data?.choices?.length);
    return { configured: true, status: hasReply ? "online" : "no_response", latencyMs, httpStatus: response.status, message: hasReply ? "Live test succeeded." : "Provider responded but returned no text candidate." };
  } catch (error) {
    const message = error?.name === "TimeoutError" || error?.name === "AbortError" ? "Provider test timed out." : "Could not connect to provider endpoint.";
    return { configured: true, status: "error", latencyMs: Date.now() - started, message };
  }
}

export default async function handler(req, res) {
  if (applyAuroraCors(req, res, "POST, OPTIONS")) return;
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Vary", "Authorization");
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Use POST." });
  }
  let body = req.body;
  if (typeof body === "string") { try { body = JSON.parse(body); } catch { body = null; } }
  if (!body || body.action !== "test_providers") return res.status(400).json({ error: "Unsupported action. Allowed action: test_providers." });
  const auth = await verifyAdmin(req);
  if (auth.error) return res.status(auth.status).json({ error: auth.error });
  const entries = Object.entries(PROVIDERS);
  const results = await Promise.all(entries.map(async ([name, config]) => [name, await testProvider(name, config)]));
  const providers = Object.fromEntries(results);
  return res.status(200).json({
    authorized: true,
    action: "test_providers",
    executedAt: new Date().toISOString(),
    executedBy: auth.email,
    providers,
    summary: {
      total: entries.length,
      online: Object.values(providers).filter((item) => item.status === "online").length,
      configured: Object.values(providers).filter((item) => item.configured).length
    }
  });
}
