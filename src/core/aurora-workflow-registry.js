/**
 * Reusable workflow templates. Templates are data only; each run is converted
 * to a fresh Task Orchestrator plan and still requires explicit confirmation.
 */
const KEY = "aurora-workflows-v1";
const SAFE = /^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,63}$/;
function createAuroraWorkflowRegistry(options = {}) {
  const storage = options.storage === undefined ? globalThis.localStorage : options.storage;
  const createId = options.createId || (() => globalThis.crypto?.randomUUID?.() || "workflow-" + Date.now().toString(36));
  function read() { try { const x = JSON.parse(storage?.getItem(KEY) || "[]"); return Array.isArray(x) ? x : []; } catch { return []; } }
  function write(items) { if (!storage?.setItem) throw new Error("Workflow storage unavailable."); storage.setItem(KEY, JSON.stringify(items.slice(0, 100))); }
  function save(input = {}, capabilities = []) {
    const title = String(input.title || "").trim();
    if (!title || !Array.isArray(input.steps) || !input.steps.length || input.steps.length > 8) throw new Error("Workflow needs a title and 1–8 steps.");
    const known = new Set(capabilities.map(c => c.id));
    const steps = input.steps.map((s, i) => {
      if (!known.has(s.capabilityId)) throw new Error("Workflow references an unavailable capability: " + String(s.capabilityId));
      const id = String(s.id || "step-" + (i+1));
      if (!SAFE.test(id)) throw new Error("Invalid workflow step ID.");
      return { id, capabilityId: s.capabilityId, input: s.input && typeof s.input === "object" ? { ...s.input } : {}, dependsOn: Array.isArray(s.dependsOn) ? s.dependsOn.map(String) : [] };
    });
    const ids = new Set(steps.map(s => s.id));
    if (ids.size !== steps.length || steps.some((s,i) => s.dependsOn.some(dep => !ids.has(dep) || dep === s.id || steps.findIndex(x => x.id === dep) >= i))) throw new Error("Workflow dependencies must refer to earlier unique steps.");
    const record = { id: String(input.id || createId()), title: title.slice(0,120), summary: String(input.summary || title).slice(0,500), steps, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
    const items = read().filter(x => x.id !== record.id); items.unshift(record); write(items); return record;
  }
  function instantiate(id, capabilities, orchestrator) {
    const item = read().find(x => x.id === String(id));
    if (!item) throw new Error("Workflow not found.");
    const known = new Set(capabilities.map(c => c.id));
    if (item.steps.some(s => !known.has(s.capabilityId))) throw new Error("A workflow capability is no longer available.");
    return orchestrator.createPlan({ title: item.title, summary: item.summary, steps: item.steps });
  }
  function remove(id) { const items=read(), next=items.filter(x=>x.id!==String(id)); if(next.length===items.length)return false; write(next); return true; }
  return Object.freeze({ save, list: read, get: id => read().find(x=>x.id===String(id)) || null, instantiate, remove, clear: () => storage?.removeItem?.(KEY) });
}
const auroraWorkflows = createAuroraWorkflowRegistry();
export { KEY as AURORA_WORKFLOW_STORAGE_KEY, createAuroraWorkflowRegistry, auroraWorkflows };
