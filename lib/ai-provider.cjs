const PROVIDERS = ["groq", "openrouter", "gemini"];
let instancePreferredProvider = "groq";

function redisConfig() {
  const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
  return url && token ? { url: url.replace(/\/$/, ""), token } : null;
}

function hasSharedProviderState() {
  return Boolean(redisConfig());
}

async function getPreferredProvider() {
  const redis = redisConfig();
  if (redis) {
    try {
      const response = await fetch(redis.url + "/get/aurora:active-ai-provider", {
        headers: { Authorization: "Bearer " + redis.token },
        signal: AbortSignal.timeout(2500)
      });
      const data = await response.json().catch(() => ({}));
      const value = data && data.result;
      if (PROVIDERS.includes(value)) {
        instancePreferredProvider = value;
        return value;
      }
    } catch (error) {
      console.warn("AURORA shared provider state read failed; using instance state:", (error && error.message) || "Unknown error");
    }
  }
  return instancePreferredProvider;
}

async function setPreferredProvider(provider) {
  if (!PROVIDERS.includes(provider)) return;
  instancePreferredProvider = provider;
  const redis = redisConfig();
  if (!redis) return;
  try {
    await fetch(redis.url + "/set/aurora:active-ai-provider/" + encodeURIComponent(provider), {
      method: "POST",
      headers: { Authorization: "Bearer " + redis.token },
      signal: AbortSignal.timeout(2500)
    });
  } catch (error) {
    console.warn("AURORA shared provider state write failed; provider state is instance-local:", (error && error.message) || "Unknown error");
  }
}

function providerOrder(preferred, configuredProviders) {
  const available = PROVIDERS.filter((provider) => configuredProviders.includes(provider));
  if (!available.length) return [];
  const start = available.includes(preferred) ? preferred : available[0];
  const index = available.indexOf(start);
  return [...available.slice(index), ...available.slice(0, index)];
}

module.exports = { hasSharedProviderState, getPreferredProvider, setPreferredProvider, providerOrder };
