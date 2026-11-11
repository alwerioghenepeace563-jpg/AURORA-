/**
 * AURORA experimental intelligence sandbox.
 * Experiments are declarative, bounded, consent-gated and simulation-only.
 * This module never evaluates downloaded code or executes device/service actions.
 */
const ID = /^[a-z][a-z0-9_.-]{2,64}$/;
const MAX_EXPERIMENTS = 30;
const MAX_FINDINGS = 20;
const MAX_TEXT = 500;
const MAX_EVALUATION_CRITERIA = 20;
const DEFAULT_PASS_SCORE = 80;
const DEFAULT_SIMULATION_TIMEOUT_MS = 10000;
const MAX_SIMULATION_TIMEOUT_MS = 30000;
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
      consentGranted: false, findings: [], evaluation: null, adapterId: null
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
    const requestedTimeout = Number(options.simulationTimeoutMs ?? DEFAULT_SIMULATION_TIMEOUT_MS);
    const timeoutMs = Number.isFinite(requestedTimeout) ? Math.min(MAX_SIMULATION_TIMEOUT_MS, Math.max(100, requestedTimeout)) : DEFAULT_SIMULATION_TIMEOUT_MS;
    const controller = new AbortController();
    let timer;
    let result;
    try {
      const simulation = Promise.resolve().then(() => adapter.simulate(Object.freeze({ id: item.id, type: item.type, summary: item.summary, simulationOnly: true, signal: controller.signal })));
      const timeout = new Promise((_, reject) => {
        timer = setTimeout(() => {
          reject(Object.assign(new Error("Simulation timed out before its bounded deadline."), { code: "SIMULATION_TIMEOUT" }));
          controller.abort();
        }, timeoutMs);
      });
      result = await Promise.race([simulation, timeout]);
    } finally {
      clearTimeout(timer);
    }
    if (!result || result.executed === true || result.sideEffects === true) throw new Error("Simulation adapter violated the no-side-effects contract.");
    const findings = Array.isArray(result.findings) ? result.findings.slice(0,MAX_FINDINGS).map(x => String(x).slice(0,MAX_TEXT)) : [];
    const updated = { ...item, status: "completed", findings, updatedAt: now() };
    items[index] = updated; write(items);
    options.events?.publish?.("experimental.simulation_completed", { experimentId: item.id, findingCount: findings.length }, { source: "experimental_intelligence" });
    return Object.freeze({ ...updated, findings: [...findings] });
  }
  function evaluate(id, rubric = {}) {
    const items = read(), index = items.findIndex(item => item.id === String(id));
    if (index < 0) throw new Error("Experiment was not found.");
    const item = items[index];
    if (item.status !== "completed") throw new Error("Only completed simulations can be evaluated.");
    if (!Array.isArray(rubric.criteria) || rubric.criteria.length < 1 || rubric.criteria.length > MAX_EVALUATION_CRITERIA) {
      throw new Error("Evaluation requires 1 to 20 bounded rubric criteria.");
    }
    const criteria = rubric.criteria.map((criterion) => {
      const criterionId = String(criterion?.id || "");
      const title = String(criterion?.title || "").trim();
      const evidence = String(criterion?.evidence || "").trim();
      const weight = Number(criterion?.weight ?? 1);
      if (!ID.test(criterionId) || !title || title.length > 120 || !evidence || evidence.length > MAX_TEXT ||
          !Number.isFinite(weight) || weight < 1 || weight > 10 || typeof criterion.passed !== "boolean") {
        throw new Error("Each rubric criterion needs a valid ID, title, evidence, boolean result and weight from 1 to 10.");
      }
      return Object.freeze({ id: criterionId, title: title.slice(0,120), evidence: evidence.slice(0,MAX_TEXT), weight, passed: criterion.passed, critical: criterion.critical === true });
    });
    const totalWeight = criteria.reduce((sum, item) => sum + item.weight, 0);
    const earnedWeight = criteria.reduce((sum, item) => sum + (item.passed ? item.weight : 0), 0);
    const score = Math.round((earnedWeight / totalWeight) * 100);
    const threshold = Number(rubric.passScore ?? DEFAULT_PASS_SCORE);
    if (!Number.isFinite(threshold) || threshold < 1 || threshold > 100) throw new Error("Pass score must be between 1 and 100.");
    const criticalFailures = criteria.filter(item => item.critical && !item.passed).map(item => item.id);
    const evaluation = Object.freeze({
      score, passScore: threshold, passed: score >= threshold && criticalFailures.length === 0,
      criticalFailures, criteria, evaluatedAt: now(), evaluator: String(rubric.evaluator || "local-review").slice(0,120)
    });
    const evaluationHistory = [...(item.evaluationHistory || []), evaluation].slice(-10);
    const updated = { ...item, evaluation, evaluationHistory, updatedAt: now() };
    items[index] = updated; write(items);
    options.events?.publish?.("experimental.evaluation_completed", { experimentId: item.id, score, passed: evaluation.passed }, { source: "experimental_intelligence" });
    return Object.freeze({ ...updated, evaluation });
  }
  function regressionReport(id) {
    const item = read().find(entry => entry.id === String(id));
    if (!item) throw new Error("Experiment was not found.");
    const history = Array.isArray(item.evaluationHistory) ? item.evaluationHistory.slice(-10) : (item.evaluation ? [item.evaluation] : []);
    if (!history.length) return Object.freeze({ experimentId: item.id, status: "not_evaluated", evaluationCount: 0, scoreDelta: null, newCriticalFailures: Object.freeze([]) });
    const latest = history[history.length - 1];
    const previous = history.length > 1 ? history[history.length - 2] : null;
    const previousFailures = new Set(previous?.criticalFailures || []);
    const newCriticalFailures = (latest.criticalFailures || []).filter(id => !previousFailures.has(id));
    const scoreDelta = previous ? latest.score - previous.score : null;
    const regressed = Boolean(previous && (scoreDelta < 0 || newCriticalFailures.length));
    return Object.freeze({ experimentId: item.id, status: !previous ? "first_evaluation" : regressed ? "regression" : scoreDelta > 0 ? "improved" : scoreDelta < 0 ? "regression" : "unchanged", evaluationCount: history.length, latestScore: latest.score, previousScore: previous?.score ?? null, scoreDelta, newCriticalFailures: Object.freeze(newCriticalFailures) });
  }
  function pause(id) { return updateStatus(id, "paused"); }
  function reject(id) { return updateStatus(id, "rejected"); }
  function updateStatus(id, status) {
    const items = read(), index = items.findIndex(item => item.id === String(id));
    if (index < 0) return false;
    items[index] = { ...items[index], status, consentGranted: false, updatedAt: now() };
    write(items); return true;
  }
  function list() { return read().map(item => Object.freeze({ ...item, findings: [...item.findings], evaluationHistory: [...(item.evaluationHistory || [])] })); }
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
  return Object.freeze({ create, registerAdapter, prepare, run, evaluate, regressionReport, pause, reject, list, certificationReadiness });
}
export { createAuroraExperimentalIntelligence };
