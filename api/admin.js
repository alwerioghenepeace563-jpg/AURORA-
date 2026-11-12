import cors from "../lib/cors.cjs";
const { applyAuroraCors } = cors;

export default async function handler(req, res) {
  const action = String(req.query?.handler || "");
  if (action === "code") return adminCodeHandler(req, res);
  if (action === "execute") return adminExecuteHandler(req, res);
  try {
    if (applyAuroraCors(req, res, "GET, OPTIONS")) return;
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Vary", "Origin, Authorization");

    if (req.method !== "GET") {
      res.setHeader("Allow", "GET");
      return res.status(405).json({ error: "Use GET." });
    }

    const authorization = String(req?.headers?.authorization || "");
    const match = authorization.match(/^Bearer\s+(.+)$/i);
    if (!match) {
      return res.status(401).json({ error: "Sign in with the administrator account first." });
    }

    const supabaseUrl = String(
      process.env.SUPABASE_URL ||
      process.env.VITE_SUPABASE_URL ||
      process.env.VITE_SUPABASE_API ||
      ""
    ).trim().replace(/\/$/, "").replace(/\/(?:rest\/v1|auth\/v1)$/i, "");
    const supabaseKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || "";
    if (!supabaseUrl || !supabaseKey) {
      return res.status(503).json({ error: "Authentication service is not configured on the server." });
    }

    let response;
    try {
      response = await fetch(supabaseUrl + "/auth/v1/user", {
        headers: { apikey: supabaseKey, Authorization: "Bearer " + match[1] },
        signal: AbortSignal.timeout(10000)
      });
    } catch (error) {
      console.error("AURORA Admin could not reach Supabase:", error?.message || "Unknown upstream error");
      return res.status(502).json({ error: "Could not reach the authentication service. Please try again." });
    }

    const user = await response.json().catch(() => ({}));
    if (!response.ok || !user.email) {
      return res.status(401).json({ error: "Your sign-in session could not be verified. Please sign in again." });
    }

    const allowlist = (process.env.ADMIN_EMAIL_ALLOWLIST || "alwerioghenepeace563@gmail.com")
      .split(",").map((email) => email.trim().toLowerCase()).filter(Boolean);
    const email = String(user.email).trim().toLowerCase();
    if (!allowlist.includes(email)) {
      return res.status(403).json({ error: "This account is not authorised to access the Admin page." });
    }

    return res.status(200).json({
      authorized: true,
      adminEmail: email,
      providers: {
        groq: Boolean(process.env.GROQ_API_KEY),
        openrouter: Boolean(process.env.OPENROUTER_API_KEY),
        gemini: Boolean(process.env.GEMINI_API_KEY)
      },
      checkedAt: new Date().toISOString()
    });
  } catch (error) {
    console.error("AURORA Admin function failed:", error?.stack || error?.message || "Unknown error");
    if (!res.headersSent) {
      return res.status(500).json({ error: "Admin verification failed unexpectedly. Check the Vercel function logs." });
    }
    return res.end();
  }
}
