import { readStoredJson, isRecord } from "./aurora-storage-guard.js";
/**
 * Mission Recovery journal.
 * Persists task plans and execution receipts locally. Restored plans are
 * review-only: a user must explicitly confirm them again before execution.
 */
const KEY = "aurora-task-journal-v1";
const MAX = 100;
function createAuroraTaskJournal(options = {}) {
  const storage = options.storage === undefined ? globalThis.localStorage : options.storage;
  const now = options.now || (() => new Date().toISOString());
  function read() {
    return readStoredJson(storage, KEY, [], value =>
      Array.isArray(value) && value.every(item => isRecord(item) && typeof item.taskId === "string" && Array.isArray(item.events || [])),
      "AURORA task journal");
  }
  function write(items) {
    if (!storage?.setItem) throw new Error("Task journal storage is unavailable.");
    storage.setItem(KEY, JSON.stringify(items.slice(0, MAX)));
  }
  function safeReceipt(receipt) {
    if (!receipt || typeof receipt !== "object") return null;
    return {
      requestId: typeof receipt.requestId === "string" ? receipt.requestId.slice(0, 120) : null,
      capabilityId: typeof receipt.capabilityId === "string" ? receipt.capabilityId.slice(0, 100) : null,
      status: typeof receipt.status === "string" ? receipt.status.slice(0, 40) : "unknown",
      at: typeof receipt.at === "string" ? receipt.at.slice(0, 40) : null,
      error: receipt.error && typeof receipt.error === "object"
        ? { code: typeof receipt.error.code === "string" ? receipt.error.code.slice(0, 80) : "ACTION_FAILED" }
        : null
    };
  }
  function safeResult(result) {
    if (!result || typeof result !== "object") return null;
    return {
      taskId: typeof result.taskId === "string" ? result.taskId.slice(0, 120) : null,
      title: typeof result.title === "string" ? result.title.slice(0, 160) : null,
      status: typeof result.status === "string" ? result.status.slice(0, 40) : "unknown",
      startedAt: typeof result.startedAt === "string" ? result.startedAt.slice(0, 40) : null,
      finishedAt: typeof result.finishedAt === "string" ? result.finishedAt.slice(0, 40) : null,
      stoppedAtStep: typeof result.stoppedAtStep === "string" ? result.stoppedAtStep.slice(0, 64) : null,
      blockedBy: Array.isArray(result.blockedBy) ? result.blockedBy.filter(x => typeof x === "string").slice(0, 20).map(x => x.slice(0, 64)) : [],
      steps: Array.isArray(result.steps) ? result.steps.slice(0, 8).map(step => ({
        stepId: typeof step?.stepId === "string" ? step.stepId.slice(0, 64) : null,
        capabilityId: typeof step?.capabilityId === "string" ? step.capabilityId.slice(0, 100) : null,
        status: typeof step?.status === "string" ? step.status.slice(0, 40) : "unknown",
        receipt: safeReceipt(step?.receipt)
      })) : []
    };
  }
  function record(event) {
    if (!event || typeof event.type !== "string") return false;
    const taskId = event.taskId || event.plan?.id || event.result?.taskId;
    if (!taskId) return false;
    const items = read();
    const index = items.findIndex(x => x.taskId === taskId);
    const current = index >= 0 ? items[index] : { taskId, createdAt: now(), events: [] };
    if (event.plan) current.plan = { id: event.plan.id, title: event.plan.title, summary: event.plan.summary, steps: (event.plan.steps || []).map(step => ({ id: step.id, capabilityId: step.capabilityId, label: step.label, risk: step.risk, approvalRequired: step.approvalRequired, dependsOn: [...(step.dependsOn || [])] })) };
    if (event.result) current.result = safeResult(event.result);
    current.status = event.result?.status || (event.type === "task.started" ? "running" : current.status || "prepared");
    current.updatedAt = now();
    current.events = [...(current.events || []), { type: event.type, at: event.at || now(), stepId: event.stepId || event.step?.stepId || null, status: event.step?.status || null }].slice(-40);
    if (index >= 0) items.splice(index, 1);
    items.unshift(current);
    write(items);
    return true;
  }
  function list() { return read().map(item => ({ ...item, events: [...(item.events || [])] })); }
  function get(taskId) { return list().find(item => item.taskId === String(taskId)) || null; }
  function forget(taskId) { const items = read(), next = items.filter(x => x.taskId !== String(taskId)); if (next.length === items.length) return false; write(next); return true; }
  function recoverable() { return list().filter(x => x.plan && ["prepared", "running", "awaiting_user", "failed", "blocked"].includes(x.status)).map(x => ({ taskId: x.taskId, title: x.plan.title, status: x.status, plan: x.plan, updatedAt: x.updatedAt, requiresFreshConfirmation: true })); }
  return Object.freeze({ record, list, get, forget, recoverable, clear: () => storage?.removeItem?.(KEY) });
}
const auroraTaskJournal = createAuroraTaskJournal();
export { KEY as AURORA_TASK_JOURNAL_KEY, createAuroraTaskJournal, auroraTaskJournal };
