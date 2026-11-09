import { readStoredJson, isRecord } from "./aurora-storage-guard.js";
/**
 * Reusable workflow templates. Templates are data only; each run is converted
 * to a fresh Task Orchestrator plan and still requires explicit confirmation.
 */
const KEY = "aurora-workflows-v1";
const SAFE = /^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,63}$/;
function createAuroraWorkflowRegistry(options = {}) {
  const storage = options.storage === undefined ? globalThis.localStorage : options.storage;
  const createId = options.createId || (() => globalThis.crypto?.randomUUID?.() || "workflow-" + Date.now().toString(36));
  function read() {
    return readStoredJson(storage, KEY, [], value =>
      Array.isArray(value) && value.every(item => isRecord(item) && typeof item.id === "string" &&
        typeof item.title === "string" && Array.isArray(item.steps)),
      "AURORA workflows");
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
