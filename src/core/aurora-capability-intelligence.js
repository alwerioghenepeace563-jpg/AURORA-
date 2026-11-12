/**
 * Read-only capability discovery and matching.
 * It can recommend registered tools but cannot execute them or grant approval.
 */
function createAuroraCapabilityIntelligence(actionEngine) {
  if (!actionEngine || typeof actionEngine.listCapabilities !== "function") throw new TypeError("Capability intelligence requires the Action Engine.");
  function inspect() {
    return actionEngine.listCapabilities().map(item => ({
      id: item.id, label: item.label, category: item.category || "general",
      description: item.description || "", risk: item.risk || "low",
      approvalRequired: item.approvalRequired === true
    }));
  }
  function find(query, limit = 8) {
    const terms = String(query || "").toLowerCase().split(/[^a-z0-9_.]+/).filter(Boolean);
    if (!terms.length) return [];
    return inspect().map(item => {
      const text = [item.id, item.label, item.category, item.description].join(" ").toLowerCase();
      const score = terms.reduce((n, term) => n + (text.includes(term) ? (item.id.includes(term) ? 3 : 1) : 0), 0);
      return { ...item, score };
    }).filter(item => item.score > 0).sort((a,b) => b.score-a.score || a.label.localeCompare(b.label)).slice(0, Math.max(1, Math.min(20, Number(limit) || 8)));
  }
  async function availability(id) {
    const item = inspect().find(cap => cap.id === String(id));
    if (!item) return { id: String(id), available: false, reason: "Capability is not registered." };
    const state = await actionEngine.getAvailability(item.id);
    return { id: item.id, label: item.label, ...state, approvalRequired: item.approvalRequired, risk: item.risk };
  }
  return Object.freeze({ inspect, find, availability });
}
export { createAuroraCapabilityIntelligence };
