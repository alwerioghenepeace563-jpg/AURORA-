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

  const voiceKeyConfigured = Boolean(process.env.ELEVENLABS_API_KEY || process.env.ELEVENLAB_API_KEY);
  const voiceIdConfigured = Boolean(
    process.env.ELEVENLABS_VOICE_ID || process.env.ELEVENLAB_VOICE_ID ||
    process.env.ELEVENLABS_JESSICA_VOICE_ID || process.env.ELEVENLABS_BELLA_VOICE_ID ||
    process.env.ELEVENLABS_LAURA_VOICE_ID || process.env.ELEVENLABS_LUCIAN_VOICE_ID ||
    process.env.ELEVENLAB_LUCIAN_VOICE_ID
  );
  const supabaseConfigured = Boolean(
    (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || process.env.VITE_SUPABASE_API) &&
    (process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY)
  );
  const voiceTextConfigured = Boolean(
    process.env.VOICETEXT_PLUGIN_TOKEN &&
    (process.env.VOICETEXT_API_URL || "https://aurora-voicetext-qk8s.vercel.app")
  );
  const sharedStateConfigured = Boolean(
    (process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL) &&
    (process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN)
  );
  const githubCodeEditConfigured = Boolean(
    (process.env.AURORA_GITHUB_TOKEN || process.env.GITHUB_TOKEN) &&
    (process.env.GROQ_API_KEY || process.env.OPENROUTER_API_KEY) &&
    supabaseConfigured
  );

  return res.status(200).json({
    ok: true,
    service: "AURORA API",
    method: req.method,
    configuredProviders,
    providerOrder: ["groq", "openrouter", "gemini"].filter((provider) => configuredProviders.includes(provider)),
    providerState: sharedStateConfigured ? "shared-kv-and-client-sticky" : "client-sticky-plus-instance-fallback",
    integrations: {
      supabaseAuth: supabaseConfigured,
      imageGeneration: Boolean(process.env.GEMINI_API_KEY),
      voiceKey: voiceKeyConfigured,
      voiceId: voiceIdConfigured,
      voice: voiceKeyConfigured && voiceIdConfigured,
      voiceTextBridge: voiceTextConfigured,
      sharedProviderState: sharedStateConfigured,
      adminCodeEditing: githubCodeEditConfigured
    }
  });
}
