/**
 * AURORA experimental intelligence sandbox.
 * Experiments are declarative, bounded, consent-gated and simulation-only.
 * This module never evaluates downloaded code or executes device/service actions.
 */
const ID = /^[a-z][a-z0-9_.-]{2,64}$/;
const MAX_EXPERIMENTS = 30;
const MAX_FINDINGS = 20;
const MAX_TEXT = 500;
const ALLOWED_TYPES = new Set(["hypothesis", "workflow_simulation", "capability_prototype", "evaluation"]);
const ALLOWED_STATUSES = new Set(["draft", "ready", "running", "paused", "completed", "rejected"]);
const RISK_ORDER = { low: 1, medium: 2, high: 3, critical: 4 };
function createAuroraExperimentalIntelligence(options = {}) {
  const storage = options.storage === undefined ? globalThis.localStorage : options.storage;
  const key = "aurora-experimental-intelligence-v1";
  const now = options.now || (() => new Date().toISOString());
  const adapters = new Map();
  function read() {
    try {
      const value = JSON.parse(storage?.getItem?.(key) || "[]");
      if (!Array.isArray(value) || value.length > MAX_EXPERIMENTS) return [];
      return value.filter(item => item && ID.test(String(item.id || "")) && ALLOWED_TYPES.has(item.type) && ALLOWED_STATUSES.has(item.status) && typeof item.title === "string" && typeof item.summary === "string" && item.simulationOnly === true);
    } catch { return []; }
  }
  function write(items) {
    if (!storage?.setItem) throw new Error("Experimental intelligence storage is unavailable.");
    storage.setItem(key, JSON.stringify(items.slice(-MAX_EXPERIMENTS)));
  }
  function create(spec) {
    if (!spec || !ID.test(String(spec.id || ""))) throw new Error("Experiment ID is invalid.");
    if (!ALLOWED_TYPES.has(spec.type)) throw new Error("Experiment type is not supported.");
    const title = String(spec.title || "").trim();
    const summary = String(spec.summary || "").trim();
    if (!title || !summary) throw new Error("A title and summary are required.");
    const risk = String(spec.risk || "medium");
    if (!(risk in RISK_ORDER)) throw new Error("Experiment risk is invalid.");
    const record = {
      id: String(spec.id), type: spec.type, title: title.slice(0,120), summary: summary.slice(0,MAX_TEXT),
      risk, status: "draft", createdAt: now(), updatedAt: now(), simulationOnly: true,
      consentGranted: false, findings: [], adapterId: null
    };
    write([...read().filter(item => item.id !== record.id), record]);
    return Object.freeze({ ...record });
  }
  function registerAdapter(id, adapter) {
    if (!ID.test(String(id)) || !adapter || typeof adapter.simulate !== "function") throw new Error("A simulation-only adapter is required.");
    adapters.set(String(id), adapter);
    return true;
  }
  function prepare(id, decision = {}) {
    const items = read(), index = items.findIndex(item => item.id === String(id));
    if (index < 0) throw new Error("Experiment was not found.");
    if (decision.approved !== true || decision.consent !== true) throw Object.assign(new Error("Explicit approval and experiment consent are required."), { code: "CONSENT_REQUIRED" });
    if (decision.simulationOnly !== true) throw new Error("Experiments must remain simulation-only.");
    const item = { ...items[index], status: "ready", consentGranted: true, updatedAt: now() };
    items[index] = item; write(items);
    return Object.freeze({ ...item });
  }
  async function run(id) {
    const items = read(), index = items.findIndex(item => item.id === String(id));
    if (index < 0) throw new Error("Experiment was not found.");
    const item = items[index];
    if (item.status !== "ready" || item.consentGranted !== true) throw new Error("Experiment must be explicitly approved before simulation.");
    if (RISK_ORDER[item.risk] >= RISK_ORDER.high) throw new Error("High-risk experiments require separate safety review and cannot run in this sandbox.");
    const adapter = item.adapterId ? adapters.get(item.adapterId) : [...adapters.values()][0];
    if (!adapter) throw new Error("No simulation adapter is available.");
    const result = await adapter.simulate(Object.freeze({ id: item.id, type: item.type, summary: item.summary, simulationOnly: true }));
    if (!result || result.executed === true || result.sideEffects === true) throw new Error("Simulation adapter violated the no-side-effects contract.");
    const findings = Array.isArray(result.findings) ? result.findings.slice(0,MAX_FINDINGS).map(x => String(x).slice(0,MAX_TEXT)) : [];
    const updated = { ...item, status: "completed", findings, updatedAt: now() };
    items[index] = updated; write(items);
    options.events?.publish?.("experimental.simulation_completed", { experimentId: item.id, findingCount: findings.length }, { source: "experimental_intelligence" });
    return Object.freeze({ ...updated, findings: [...findings] });
  }
  function pause(id) { return updateStatus(id, "paused"); }
  function reject(id) { return updateStatus(id, "rejected"); }
  function updateStatus(id, status) {
    const items = read(), index = items.findIndex(item => item.id === String(id));
    if (index < 0) return false;
    items[index] = { ...items[index], status, consentGranted: false, updatedAt: now() };
    write(items); return true;
  }
  function list() { return read().map(item => Object.freeze({ ...item, findings: [...item.findings] })); }
  function certificationReadiness() {
    const items = read();
    return Object.freeze({
      experimentCount: items.length,
      pendingReview: items.filter(x => ["draft","ready","paused"].includes(x.status)).length,
      completedSimulations: items.filter(x => x.status === "completed").length,
      highRiskBlocked: true,
      simulationOnly: true,
      finalCertification: false,
      releaseGates: Object.freeze(["all automated suites pass","native Android build passes","physical-device validation completed","external connector setup and live round-trips verified","privacy and permission review signed off","release artifact and rollback plan verified"])
    });
  }
  return Object.freeze({ create, registerAdapter, prepare, run, pause, reject, list, certificationReadiness });
}
export { createAuroraExperimentalIntelligence };
