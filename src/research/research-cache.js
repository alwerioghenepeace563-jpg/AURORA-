export function createResearchCache(options = {}) {
  const ttlMs = Math.max(1000, Math.min(300000, Number(options.ttlMs) || 45000));
  const maxEntries = Math.max(1, Math.min(30, Number(options.maxEntries) || 8));
  const entries = new Map();
  const keyFor = request => [
    String(request?.query || "").trim().toLowerCase(),
    String(request?.intent || "quick"),
    [...(request?.mediaTypes || ["web"])].sort().join(","),
    String(request?.freshness || "any")
  ].join("|");
  function get(request) {
    const key = keyFor(request), entry = entries.get(key);
    if (!entry) return null;
    if (Date.now() - entry.createdAt > ttlMs) { entries.delete(key); return null; }
    entries.delete(key);
    entries.set(key, entry);
    return entry.value;
  }
  function set(request, value) {
    const key = keyFor(request);
    entries.delete(key);
    entries.set(key, { createdAt: Date.now(), value });
    while (entries.size > maxEntries) entries.delete(entries.keys().next().value);
    return value;
  }
  function clear() { entries.clear(); }
  return Object.freeze({ get, set, clear, size: () => entries.size });
}
