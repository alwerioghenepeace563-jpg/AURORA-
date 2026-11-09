import { readStoredJson, isRecord } from "./aurora-storage-guard.js";
/**
 * Mission Recovery journal.
 * Persists bounded execution metadata only. User-authored task titles,
 * summaries, inputs, results and error messages are never persisted.
 * Restored plans are review-only and require fresh confirmation.
 */
const KEY = "aurora-task-journal-v1";
const MAX = 100;
const SAFE_TASK_ID = /^[a-zA-Z0-9][a-zA-Z0-9_.:-]{0,119}$/;
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
      requestId: typeof receipt.requestId === "string" && SAFE_TASK_ID.test(receipt.requestId) ? receipt.requestId : null,
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
      taskId: typeof result.taskId === "string" && SAFE_TASK_ID.test(result.taskId) ? result.taskId : null,
      title: "AURORA task",
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
    if (typeof taskId !== "string" || !SAFE_TASK_ID.test(taskId)) return false;
    const items = read();
    const index = items.findIndex(x => x.taskId === taskId);
    const current = index >= 0 ? items[index] : { taskId, createdAt: now(), events: [] };
    if (event.plan) current.plan = {
      id: taskId,
      title: "AURORA task",
      summary: "Review the available steps and prepare a new plan.",
      steps: (event.plan.steps || []).slice(0, 8).map(step => ({
        id: typeof step.id === "string" ? step.id.slice(0, 64) : null,
        capabilityId: typeof step.capabilityId === "string" ? step.capabilityId.slice(0, 100) : null,
        label: typeof step.label === "string" ? step.label.slice(0, 100) : "AURORA capability",
        risk: typeof step.risk === "string" ? step.risk.slice(0, 20) : "unknown",
        approvalRequired: step.approvalRequired === true,
        dependsOn: Array.isArray(step.dependsOn) ? step.dependsOn.filter(x => typeof x === "string").slice(0, 8).map(x => x.slice(0, 64)) : []
      }))
    };
    if (event.result) current.result = safeResult(event.result);
    current.status = event.result?.status || (event.type === "task.started" ? "running" : current.status || "prepared");
    current.updatedAt = now();
    current.events = [...(current.events || []), {
      type: event.type.slice(0, 80),
      at: typeof event.at === "string" ? event.at.slice(0, 40) : now(),
      stepId: typeof (event.stepId || event.step?.stepId) === "string" ? (event.stepId || event.step.stepId).slice(0, 64) : null,
      status: typeof event.step?.status === "string" ? event.step.status.slice(0, 40) : null
    }].slice(-40);
    if (index >= 0) items.splice(index, 1);
    items.unshift(current);
    write(items);
    return true;
  }
  function list() { return read().map(item => ({ ...item, events: [...(item.events || [])] })); }
  function get(taskId) { return list().find(item => item.taskId === String(taskId)) || null; }
  function forget(taskId) { const items = read(), next = items.filter(x => x.taskId !== String(taskId)); if (next.length === items.length) return false; write(next); return true; }
  function inspectRecovery(taskId) {
    const item = get(taskId);
    if (!item?.plan) return null;
    const completed = new Set((item.result?.steps || []).filter(step => step.status === "completed").map(step => step.stepId));
    const knownSteps = item.plan.steps || [];
    const interrupted = item.status === "running";
    return Object.freeze({
      taskId: item.taskId,
      status: interrupted ? "interrupted" : item.status,
      recoveryState: interrupted ? "interrupted_execution" : "needs_review",
      completedStepIds: [...completed],
      remainingStepIds: knownSteps.filter(step => !completed.has(step.id)).map(step => step.id),
      steps: knownSteps.map(step => Object.freeze({ id: step.id, capabilityId: step.capabilityId, risk: step.risk, approvalRequired: step.approvalRequired, dependsOn: [...(step.dependsOn || [])], status: completed.has(step.id) ? "completed" : "not_verified_completed" })),
      updatedAt: item.updatedAt || null,
      requiresFreshConfirmation: true,
      automaticResume: false,
      requiresNewPlan: true,
      reason: interrupted ? "The app stopped while this task was running. Review its progress and prepare a new plan; AURORA cannot verify whether an interrupted external action finished." : "This task needs review before any new action is prepared."
    });
  }
  function recoverable() {
    return list().filter(x => x.plan && ["prepared", "running", "awaiting_user", "failed", "blocked"].includes(x.status))
      .map(x => ({ taskId: x.taskId, title: "AURORA task", status: x.status === "running" ? "interrupted" : x.status, plan: x.plan, updatedAt: x.updatedAt, requiresFreshConfirmation: true, automaticResume: false }));
  }
  return Object.freeze({ record, list, get, forget, recoverable, inspectRecovery, clear: () => storage?.removeItem?.(KEY) });
}
const auroraTaskJournal = createAuroraTaskJournal();
export { KEY as AURORA_TASK_JOURNAL_KEY, createAuroraTaskJournal, auroraTaskJournal };
