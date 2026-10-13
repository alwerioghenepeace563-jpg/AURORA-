import cors from "../lib/cors.cjs";
const { applyAuroraCors } = cors;
export default function handler(req, res) {
  if (applyAuroraCors(req, res, "GET, OPTIONS")) return;
  res.setHeader("Cache-Control", "no-store");
  const configuredProviders = [
    process.env.GROQ_API_KEY ? "groq" : null,
    process.env.OPENROUTER_API_KEY ? "openrouter" : null,
    process.env.GEMINI_API_KEY ? "gemini" : null
  ].filter(Boolean);
  const sharedStateConfigured = Boolean(
    (process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL) &&
    (process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN)
  );
  return res.status(200).json({
    ok: true,
    service: "AURORA API",
    method: req.method,
    configuredProviders,
    providerOrder: ["groq", "openrouter", "gemini"].filter((provider) => configuredProviders.includes(provider)),
    providerState: sharedStateConfigured ? "shared-kv-and-client-sticky" : "client-sticky-plus-instance-fallback",
    voiceConfigured: Boolean(process.env.ELEVENLABS_API_KEY || process.env.ELEVENLAB_API_KEY)
  });
}
