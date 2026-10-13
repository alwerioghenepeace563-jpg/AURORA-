const NATIVE_ORIGINS = new Set([
  "https://localhost",
  "http://localhost",
  "capacitor://localhost",
  "ionic://localhost",
  // The production web app calls these API routes from this same origin.
  // Without this entry, the CORS guard rejects the request before the browser
  // can read the JSON response, which appears in the UI as "Failed to fetch".
  "https://aurora-ten-gold.vercel.app"
]);

export function applyAuroraCors(req, res, methods = "GET, POST, OPTIONS") {
  const origin = String(req.headers?.origin || "");
  const configuredOrigins = String(process.env.AURORA_ALLOWED_ORIGIN || "")
    .split(",").map((item) => item.trim().replace(/\\/+$/, "")).filter(Boolean);
  const allowed = new Set([...NATIVE_ORIGINS, ...configuredOrigins]);
  if (origin && !allowed.has(origin)) {
    res.setHeader("Vary", "Origin");
    res.status(403).json({ error: "Origin not allowed." });
    return true;
  }
  if (origin) res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", methods);
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, apikey, x-client-info");
  res.setHeader("Access-Control-Max-Age", "86400");
  if (req.method === "OPTIONS") {
    res.status(204).end();
    return true;
  }
  return false;
}
