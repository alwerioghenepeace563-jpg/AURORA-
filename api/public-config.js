import cors from "../lib/cors.cjs";
const { applyAuroraCors } = cors;
export default async function handler(req, res) {
  if (applyAuroraCors(req, res, "GET, OPTIONS")) return;
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Use GET." });
  }

  const supabaseUrl = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || process.env.VITE_SUPABASE_API || "")
    .trim().replace(/\/$/, "").replace(/\/(?:rest\/v1|auth\/v1)$/i, "");
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || "";

  // This endpoint exposes only the public Supabase anon/publishable key required by client sign-in.
  // Never return service-role keys or any other server secret from this route.
  if (!supabaseUrl || !supabaseAnonKey) {
    return res.status(503).json({ error: "Public sign-in configuration is not available on the server." });
  }

  return res.status(200).json({ supabaseUrl, supabaseAnonKey });
}
