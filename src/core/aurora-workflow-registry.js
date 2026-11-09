import { readStoredJson, isRecord } from "./aurora-storage-guard.js";
/** Reusable workflow templates are data only; each run requires a fresh plan and confirmation. */
const KEY = "aurora-workflows-v1";
const SAFE = /^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,63}$/;
const MAX_WORKFLOWS = 100, MAX_STEPS = 8, MAX_INPUT_BYTES = 16000;
function validSteps(steps) {
  if (!Array.isArray(steps) || steps.length < 1 || steps.length > MAX_STEPS) return false;
  const seen = new Set();
  for (const step of steps) {
    if (!isRecord(step) || typeof step.id !== "string" || !SAFE.test(step.id) ||
        typeof step.capabilityId !== "string" || !step.capabilityId.trim() ||
        !isRecord(step.input) || !Array.isArray(step.dependsOn) ||
        step.dependsOn.some(dep => typeof dep !== "string" || !SAFE.test(dep))) return false;
    if (seen.has(step.id) || step.dependsOn.some(dep => !seen.has(dep) || dep === step.id)) return false;
    seen.add(step.id);
    try {
      const serialized = JSON.stringify(step.input);
      if (typeof serialized !== "string" || serialized.length > MAX_INPUT_BYTES) return false;
    } catch { return false; }
  }
  return true;
}
function createAuroraWorkflowRegistry(options = {}) {
  const storage = options.storage === undefined ? globalThis.localStorage : options.storage;
  const createId = options.createId || (() => globalThis.crypto?.randomUUID?.() || "workflow-" + Date.now().toString(36));
  function read() {
    return readStoredJson(storage, KEY, [], value =>
      Array.isArray(value) && value.length <= MAX_WORKFLOWS && value.every(item =>
        isRecord(item) && typeof item.id === "string" && SAFE.test(item.id) &&
        typeof item.title === "string" && item.title.length <= 120 &&
        typeof item.summary === "string" && item.summary.length <= 500 &&
        validSteps(item.steps) && typeof item.createdAt === "string" && typeof item.updatedAt === "string"
      ), "AURORA workflows");
  }
  function write(items) {
    if (!storage?.setItem) throw new Error("Workflow storage unavailable.");
    if (items.length > MAX_WORKFLOWS) throw new Error("AURORA can store up to 100 workflows. Remove an old workflow first.");
    storage.setItem(KEY, JSON.stringify(items));
  }
  function save(input = {}, capabilities = []) {
    if (!isRecord(input)) throw new Error("Workflow details must be a plain object.");
    const title = String(input.title || "").trim();
    if (!title || !Array.isArray(input.steps) || !input.steps.length || input.steps.length > MAX_STEPS) throw new Error("Workflow needs a title and 1–8 steps.");
    const known = new Set(capabilities.map(c => c.id));
    const steps = input.steps.map((s, i) => {
      if (!isRecord(s) || !known.has(s.capabilityId)) throw new Error("Workflow references an unavailable capability: " + String(s?.capabilityId));
      const id = String(s.id || "step-" + (i + 1));
      if (!SAFE.test(id)) throw new Error("Invalid workflow step ID.");
      const stepInput = isRecord(s.input) ? JSON.parse(JSON.stringify(s.input)) : {};
      if (JSON.stringify(stepInput).length > MAX_INPUT_BYTES) throw new Error("A workflow step input is too large.");
      return { id, capabilityId: s.capabilityId, input: stepInput, dependsOn: Array.isArray(s.dependsOn) ? s.dependsOn.map(String) : [] };
    });
    if (!validSteps(steps)) throw new Error("Workflow dependencies must refer only to earlier unique steps, and step data must be valid.");
    const id = String(input.id || createId());
    if (!SAFE.test(id)) throw new Error("Workflow ID is invalid.");
    const timestamp = new Date().toISOString();
    const record = { id, title: title.slice(0, 120), summary: String(input.summary || title).slice(0, 500), steps, createdAt: timestamp, updatedAt: timestamp };
    const items = read().filter(x => x.id !== record.id);
    items.unshift(record); write(items); return record;
  }
  function instantiate(id, capabilities, orchestrator) {
    const item = read().find(x => x.id === String(id));
    if (!item) throw new Error("Workflow not found.");
    const known = new Set(capabilities.map(c => c.id));
    if (!validSteps(item.steps) || item.steps.some(s => !known.has(s.capabilityId))) throw new Error("A workflow is invalid or references a capability that is no longer available.");
    if (!orchestrator || typeof orchestrator.createPlan !== "function") throw new Error("The task planner is unavailable.");
    return orchestrator.createPlan({ title: item.title, summary: item.summary, steps: item.steps.map(step => ({ ...step, input: { ...step.input }, dependsOn: [...step.dependsOn] })) });
  }
  function remove(id) {
    const items = read(), next = items.filter(x => x.id !== String(id));
    if (next.length === items.length) return false;
    write(next); return true;
  }
  return Object.freeze({ save, list: read, get: id => read().find(x => x.id === String(id)) || null, instantiate, remove, clear: () => storage?.removeItem?.(KEY) });
}
const auroraWorkflows = createAuroraWorkflowRegistry();
export { KEY as AURORA_WORKFLOW_STORAGE_KEY, createAuroraWorkflowRegistry, auroraWorkflows };
