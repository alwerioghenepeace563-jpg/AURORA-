/**
 * Resolve the API origin without changing existing deployments by default.
 * A configured origin must be a bare HTTPS origin (or localhost for development).
 */
export function resolveAuroraApiUrl(path, options = {}) {
  const normalizedPath = String(path || "/").startsWith("/") ? String(path || "/") : "/" + String(path || "/");
  const configured = String(options.baseUrl || "").trim();
  if (configured) {
    try {
      const parsed = new URL(configured);
      const localHttp = parsed.protocol === "http:" && ["localhost", "127.0.0.1"].includes(parsed.hostname);
      const valid = (parsed.protocol === "https:" || localHttp) &&
        !parsed.username && !parsed.password &&
        (parsed.pathname === "/" || parsed.pathname === "") &&
        !parsed.search && !parsed.hash;
      if (valid) return parsed.origin + normalizedPath;
    } catch { /* Invalid optional configuration falls back safely. */ }
  }
  if (options.isNative) return String(options.legacyOrigin || "https://aurora-ten-gold.vercel.app").replace(/\/$/, "") + normalizedPath;
  return normalizedPath;
}
