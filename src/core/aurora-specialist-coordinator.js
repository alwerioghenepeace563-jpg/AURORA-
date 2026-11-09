/**
 * Bounded specialist registry. Specialists return structured advice/proposals;
 * they never execute Android actions. Execution remains in the Action Engine.
 */
const SAFE_ID = /^[a-z][a-z0-9_.-]{1,47}$/;
function createAuroraSpecialistCoordinator(options = {}) {
  const specialists = new Map(), maxParallel = Math.max(1, Math.min(4, Number(options.maxParallel) || 3));
  function register(definition = {}) {
    const id = String(definition.id || "").toLowerCase();
    if (!SAFE_ID.test(id) || typeof definition.run !== "function") throw new Error("Specialist needs a valid ID and run function.");
    if (specialists.has(id)) throw new Error("Specialist already registered: " + id);
    const item = Object.freeze({ id, label: String(definition.label || id).slice(0, 80), description: String(definition.description || "").slice(0, 300), matches: typeof definition.matches === "function" ? definition.matches : () => false, run: definition.run });
    specialists.set(id, item); return () => specialists.delete(id);
  }
  function select(input, limit = maxParallel) {
    const text = String(input || "");
    return [...specialists.values()].map(item => {
      let match = false; try { match = item.matches(text) === true; } catch {}
      return { id: item.id, label: item.label, description: item.description, matched: match };
    }).filter(x => x.matched).slice(0, Math.max(1, Math.min(maxParallel, Number(limit)||maxParallel)));
  }
  async function coordinate(input, context = {}) {
    const selected = select(input, context.limit || maxParallel);
    const results = await Promise.all(selected.map(async item => {
      const specialist = specialists.get(item.id);
      try {
        const result = await specialist.run(String(input), Object.freeze({ ...context, specialistId: item.id }));
        return { specialistId: item.id, status: "completed", result };
      } catch (error) { return { specialistId: item.id, status: "failed", error: String(error?.message || error).slice(0, 500) }; }
    }));
    return Object.freeze({ status: results.some(r => r.status === "completed") ? "completed" : selected.length ? "failed" : "no_match", selected: selected.map(x => x.id), results });
  }
  return Object.freeze({ register, select, coordinate, list: () => [...specialists.values()].map(({ run, matches, ...item }) => item) });
}
export { createAuroraSpecialistCoordinator };
