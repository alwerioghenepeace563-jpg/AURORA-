/**
 * Supabase REST adapter for explicitly selected AURORA memory records.
 * Requires the current signed-in user's access token and RLS on aurora_memories.
 * This adapter never bulk uploads, and it never uses the service-role key.
 */
function createAuroraSupabaseMemoryAdapter(options = {}) {
  const baseUrl = String(options.url || "").trim().replace(/\/$/, "").replace(/\/(?:rest\/v1|auth\/v1)$/i, "");
  const anonKey = String(options.anonKey || "").trim();
  const getAccessToken = options.getAccessToken;
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  const configured = Boolean(baseUrl && anonKey && typeof getAccessToken === "function" && typeof fetchImpl === "function");

  async function request(path, init = {}) {
    if (!configured) throw new Error("Supabase memory sync is not configured.");
    const token = await getAccessToken();
    if (typeof token !== "string" || !token.trim()) throw new Error("Sign in to AURORA before syncing memories.");
    const response = await fetchImpl(baseUrl + path, {
      ...init,
      headers: {
        apikey: anonKey,
        Authorization: "Bearer " + token,
        "Content-Type": "application/json",
        ...(init.headers || {})
      }
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      throw new Error("Supabase memory sync failed (" + response.status + "). " + detail.slice(0, 240));
    }
    if (response.status === 204) return null;
    const text = await response.text();
    return text ? JSON.parse(text) : null;
  }

  return Object.freeze({
    isConfigured: () => configured,
    async upsert(record) {
      if (!record || typeof record.id !== "string" || !record.id) throw new Error("A valid memory record is required.");
      await request("/rest/v1/aurora_memories?on_conflict=user_id,id", {
        method: "POST",
        headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
        body: JSON.stringify({ id: record.id, payload: record, updated_at: record.updatedAt || new Date().toISOString() })
      });
      return { saved: true, id: record.id };
    },
    async get(id) {
      const rows = await request("/rest/v1/aurora_memories?select=id,payload,updated_at&id=eq." + encodeURIComponent(String(id)) + "&limit=1", { method: "GET" });
      const row = Array.isArray(rows) ? rows[0] : null;
      return row ? { ...(row.payload || {}), updatedAt: row.updated_at || row.payload?.updatedAt } : null;
    },
    async remove(id) {
      await request("/rest/v1/aurora_memories?id=eq." + encodeURIComponent(String(id)), { method: "DELETE", headers: { Prefer: "return=minimal" } });
      return { removed: true, id: String(id) };
    }
  });
}
export { createAuroraSupabaseMemoryAdapter };
