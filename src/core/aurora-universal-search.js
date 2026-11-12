/**
 * Read-only federated search across AURORA's registered local indexes.
 * Sources return summaries only; this service never opens or executes items.
 */
function createAuroraUniversalSearch(options = {}) {
  const sources = new Map();
  const maxResults = Math.max(1, Math.min(50, Number(options.maxResults) || 20));
  function register(id, search, label = id) {
    if (!/^[a-z][a-z0-9_.-]{1,60}$/.test(String(id)) || typeof search !== "function") throw new Error("Invalid search source.");
    if (sources.has(id)) throw new Error("Search source already registered: " + id);
    sources.set(id, { id, label: String(label), search });
    return () => sources.delete(id);
  }
  async function search(query, options = {}) {
    const text = String(query || "").trim();
    if (!text) return [];
    const selected = options.sources ? new Set(options.sources) : null;
    const limit = Math.max(1, Math.min(maxResults, Number(options.limit) || maxResults));
    const jobs = [...sources.values()].filter(s => !selected || selected.has(s.id)).map(async source => {
      try {
        const results = await source.search(text, limit);
        return (Array.isArray(results) ? results : []).map(item => ({
          source: source.id, sourceLabel: source.label,
          id: String(item.id || item.taskId || item.workflowId || item.capabilityId || ""),
          title: String(item.title || item.label || item.name || "Untitled").slice(0, 160),
          summary: String(item.summary || item.description || item.content || item.status || "").slice(0, 500),
          type: String(item.type || source.id).slice(0, 60),
          score: Number.isFinite(item.score) ? item.score : 0
        }));
      } catch { return []; }
    });
    const groups = await Promise.all(jobs);
    return groups.flat().sort((a,b) => b.score-a.score || a.title.localeCompare(b.title)).slice(0, limit);
  }
  function listSources() { return [...sources.values()].map(({ id, label }) => ({ id, label })); }
  return Object.freeze({ register, search, listSources });
}
export { createAuroraUniversalSearch };
