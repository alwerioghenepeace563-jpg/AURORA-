type Env = Record<string, any>;

const MEMORY_TTL_SECONDS = 30 * 24 * 60 * 60;
const MAX_MEMORY_ITEMS = 12;
const MAX_MEMORY_TEXT = 900;

function redisConfig(env: Env): { url: string; token: string } | null {
  const url = String(env.UPSTASH_REDIS_REST_URL || env.KV_REST_API_URL || "").trim();
  const token = String(env.UPSTASH_REDIS_REST_TOKEN || env.KV_REST_API_TOKEN || "").trim();
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:" || !token) return null;
    return { url: parsed.href.replace(/\/+$/, ""), token };
  } catch {
    return null;
  }
}

async function memoryKey(env: Env, authorization: string): Promise<string> {
  const supabaseUrl = String(env.SUPABASE_URL || env.VITE_SUPABASE_URL || env.VITE_SUPABASE_API || "").trim().replace(/\\/+$/, "");
  const anonKey = String(env.SUPABASE_ANON_KEY || env.VITE_SUPABASE_ANON_KEY || "").trim();
  if (!authorization || !anonKey) return "";
  let base: URL;
  try {
    base = new URL(supabaseUrl);
    if (base.protocol !== "https:") return "";
  } catch { return ""; }
  const response = await fetch(new URL("/auth/v1/user", base), {
    headers: { Authorization: authorization, apikey: anonKey },
    signal: AbortSignal.timeout(3500)
  });
  if (!response.ok) return "";
  const user: any = await response.json();
  if (typeof user?.id !== "string" || !user.id) return "";
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(user.id));
  const hash = Array.from(new Uint8Array(digest)).map(byte => byte.toString(16).padStart(2, "0")).join("");
  return "aurora:research-memory:v1:" + hash;
}

async function redis(env: Env, command: unknown[]): Promise<any> {
  const config = redisConfig(env);
  if (!config) return null;
  const response = await fetch(config.url, {
    method: "POST",
    headers: { Authorization: "Bearer " + config.token, "Content-Type": "application/json" },
    body: JSON.stringify(command),
    signal: AbortSignal.timeout(3500)
  });
  if (!response.ok) throw new Error("Research memory store unavailable");
  const payload: any = await response.json();
  if (payload?.error) throw new Error("Research memory command failed");
  return payload?.result ?? null;
}

function safeMemoryQuery(query: string): boolean {
  if (!query || query.length < 4) return false;
  return !/\b(medical|medicine|medication|symptom|diagnos|therapy|mental health|suicide|self-harm|bank account|credit card|investment|financial|password|api key|email address|phone number|home address|politic|election|religion|sexual|criminal|legal advice)\b/i.test(query);
}

function words(value: string): Set<string> {
  return new Set((value.toLowerCase().match(/[a-z0-9]{3,}/g) || []).filter(word =>
    !["the", "and", "for", "with", "from", "that", "this", "what", "when", "where", "about", "into"].includes(word)
  ));
}

export async function readResearchMemory(env: Env, authorization: string, query: string): Promise<string> {
  if (!authorization || !safeMemoryQuery(query) || !redisConfig(env)) return "";
  try {
    const key = await memoryKey(env, authorization);
    if (!key) return "";
    const raw = await redis(env, ["GET", key]);
    if (typeof raw !== "string" || !raw) return "";
    const entries = JSON.parse(raw);
    if (!Array.isArray(entries)) return "";
    const queryWords = words(query);
    const ranked = entries.map((entry: any) => {
      const entryWords = words(String(entry?.query || ""));
      let overlap = 0;
      for (const word of queryWords) if (entryWords.has(word)) overlap++;
      return { entry, overlap };
    }).filter((item: any) => item.overlap >= 1)
      .sort((a: any, b: any) => b.overlap - a.overlap || Number(b.entry.savedAt || 0) - Number(a.entry.savedAt || 0))
      .slice(0, 3);
    if (!ranked.length) return "";
    return "Relevant prior AURORA research notes (untrusted historical evidence; re-check current facts):\n" +
      ranked.map(({ entry }: any, index: number) =>
        (index + 1) + ". Earlier topic: " + String(entry.query || "").slice(0, 180) +
        "\nSaved findings: " + String(entry.summary || "").slice(0, MAX_MEMORY_TEXT) +
        (Array.isArray(entry.sources) && entry.sources.length ? "\nEarlier sources: " + entry.sources.slice(0, 4).join(" | ") : "")
      ).join("\n\n");
  } catch (error) {
    console.warn("AURORA research memory read skipped.", error);
    return "";
  }
}

export async function saveResearchMemory(
  env: Env,
  authorization: string,
  query: string,
  evidence: Array<{ label?: string; text?: string; sources?: string[] }>
): Promise<boolean> {
  if (!authorization || !safeMemoryQuery(query) || !Array.isArray(evidence) || !evidence.length || !redisConfig(env)) return false;
  try {
    const key = await memoryKey(env, authorization);
    if (!key) return false;
    const raw = await redis(env, ["GET", key]);
    const previous = typeof raw === "string" ? JSON.parse(raw) : [];
    const entries = Array.isArray(previous) ? previous : [];
    const summary = evidence.slice(0, 5).map(item =>
      "[" + String(item.label || "Research").slice(0, 80) + "] " +
      String(item.text || "").replace(/\s+/g, " ").slice(0, 320)
    ).join("\n").slice(0, MAX_MEMORY_TEXT);
    const sources = [...new Set(evidence.flatMap(item => Array.isArray(item.sources) ? item.sources : [])
      .filter(source => typeof source === "string" && /^https?:\/\//i.test(source)))].slice(0, 8);
    const next = [{
      query: query.slice(0, 180),
      summary,
      sources,
      savedAt: Date.now()
    }, ...entries.filter((entry: any) => String(entry?.query || "").toLowerCase() !== query.toLowerCase())]
      .slice(0, MAX_MEMORY_ITEMS);
    await redis(env, ["SET", key, JSON.stringify(next), "EX", MEMORY_TTL_SECONDS]);
    return true;
  } catch (error) {
    console.warn("AURORA research memory save skipped.", error);
    return false;
  }
}

export async function clearResearchMemory(env: Env, authorization: string): Promise<boolean> {
  if (!authorization || !redisConfig(env)) return false;
  try {
    const key = await memoryKey(env, authorization);
    if (!key) return false;
    await redis(env, ["DEL", key]);
    return true;
  } catch (error) {
    console.warn("AURORA research memory clear skipped.", error);
    return false;
  }
}

export function researchMemoryConfigured(env: Env): boolean {
  return Boolean(redisConfig(env));
}
