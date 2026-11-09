const NATIVE_ORIGINS = new Set([
  "https://localhost",
  "http://localhost",
  "capacitor://localhost",
  "ionic://localhost",
  "https://aurora-ten-gold.vercel.app"
]);

function isAuroraVercelPreview(origin) {
  try {
    const url = new URL(origin);
    // Allow only HTTPS preview deployments belonging to this AURORA Vercel project.
    // The project-specific slug and team suffix prevent allowing unrelated Vercel sites.
    return url.protocol === "https:" &&
      /^aurora-[a-z0-9-]+-smart-bm\.vercel\.app$/i.test(url.hostname);
  } catch {
    return false;
  }
}

function applyAuroraCors(req, res, methods = "GET, POST, OPTIONS") {
  const origin = String((req.headers && req.headers.origin) || "");
  const configuredOrigins = String(process.env.AURORA_ALLOWED_ORIGIN || "")
    .split(",").map((item) => item.trim().replace(/\/+$/, "")).filter(Boolean);
  const allowed = new Set([...NATIVE_ORIGINS, ...configuredOrigins]);
  if (origin && !allowed.has(origin) && !isAuroraVercelPreview(origin)) {
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

module.exports = { applyAuroraCors };
