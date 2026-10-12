export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Vary", "Authorization");
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Use GET." });
  }

  const authorization = req.headers.authorization || "";
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  if (!match) return res.status(401).json({ error: "Sign in with the administrator account first." });

  const supabaseUrl = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || process.env.VITE_SUPABASE_API || "").trim().replace(/\/$/, "").replace(/\/(?:rest\/v1|auth\/v1)$/i, "");
  const supabaseKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || "";
  if (!supabaseUrl || !supabaseKey) return res.status(503).json({ error: "Authentication service is not configured on the server." });

  try {
    const response = await fetch(supabaseUrl + "/auth/v1/user", {
      headers: { apikey: supabaseKey, Authorization: "Bearer " + match[1] },
      signal: AbortSignal.timeout(10000)
    });
    const user = await response.json().catch(() => ({}));
    if (!response.ok || !user.email) return res.status(401).json({ error: "Your sign-in session could not be verified. Please sign in again." });

    const allowlist = (process.env.ADMIN_EMAIL_ALLOWLIST || "alwerioghenepeace563@gmail.com")
      .split(",").map((email) => email.trim().toLowerCase()).filter(Boolean);
    const email = String(user.email).trim().toLowerCase();
    if (!allowlist.includes(email)) return res.status(403).json({ error: "This account is not authorised to access the Admin page." });

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
  } catch {
    return res.status(502).json({ error: "Could not verify administrator access right now. Please try again." });
  }
}
