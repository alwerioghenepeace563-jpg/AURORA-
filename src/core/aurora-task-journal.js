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
    try { const value = JSON.parse(storage?.getItem(KEY) || "[]"); return Array.isArray(value) ? value.filter(x => x && typeof x.taskId === "string") : []; }
    catch { return []; }
  }
  function write(items) {
    if (!storage?.setItem) throw new Error("Task journal storage is unavailable.");
    storage.setItem(KEY, JSON.stringify(items.slice(0, MAX)));
  }
  function record(event) {
    if (!event || typeof event.type !== "string") return false;
    const taskId = event.taskId || event.plan?.id || event.result?.taskId;
    if (!taskId) return false;
    const items = read();
    const index = items.findIndex(x => x.taskId === taskId);
    const current = index >= 0 ? items[index] : { taskId, createdAt: now(), events: [] };
    if (event.plan) current.plan = event.plan;
    if (event.result) current.result = event.result;
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
