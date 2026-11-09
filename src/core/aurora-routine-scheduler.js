import { readStoredJson, isRecord } from "./aurora-storage-guard.js";
/**
 * Scheduled routine reminders. A due routine only notifies the user; it never
 * executes workflow steps in the background. The user must prepare and approve
 * a fresh task plan when they return to AURORA.
 */
const KEY = "aurora-scheduled-routines-v1";
const MAX_ROUTINES = 100;
function createAuroraRoutineScheduler(options = {}) {
  const storage = options.storage === undefined ? globalThis.localStorage : options.storage;
  const reminder = options.reminder;
  const workflows = options.workflows;
  const now = options.now || (() => Date.now());
  const createId = options.createId || (() => "routine-" + (globalThis.crypto?.randomUUID?.() || Date.now().toString(36)));
  function read() {
    return readStoredJson(storage, KEY, [], value =>
      Array.isArray(value) && value.every(item => isRecord(item) && typeof item.id === "string" &&
        typeof item.workflowId === "string" && Number.isSafeInteger(item.at)),
      "AURORA scheduled routines");
  }
  function write(items) {
    if (!storage?.setItem) throw new Error("Scheduled routine storage is unavailable.");
    if (items.length > MAX_ROUTINES) throw new Error("AURORA can store up to 100 scheduled routines. Cancel an old routine first.");
    storage.setItem(KEY, JSON.stringify(items));
  }
  async function schedule(input = {}) {
    if (input.approved !== true) throw Object.assign(new Error("Explicit approval is required to schedule this routine."), { code: "APPROVAL_REQUIRED" });
    if (!reminder || typeof reminder.schedule !== "function") throw new Error("Android reminder scheduling is unavailable.");
    const workflow = workflows?.get?.(input.workflowId);
    if (!workflow) throw new Error("Saved workflow was not found.");
    const at = Number(input.at);
    if (!Number.isSafeInteger(at) || at <= now() + 5000 || at > now() + 31536000000) throw new Error("Choose a routine reminder between 5 seconds and 365 days from now.");
    const id = String(input.id || createId());
    if (!id.trim() || id.length > 80) throw new Error("Routine ID is invalid.");
    const existing = read();
    if (!existing.some(item => item.id === id) && existing.length >= MAX_ROUTINES) throw new Error("AURORA can store up to 100 scheduled routines. Cancel an old routine first.");
    if (typeof reminder.requestPermission === "function") {
      const permission = await reminder.requestPermission();
      if (!permission?.granted) throw new Error("Notification permission is required before scheduling a routine reminder.");
    }
    const record = { id, workflowId: workflow.id, title: workflow.title, at, status: "scheduled", createdAt: new Date(now()).toISOString() };
    await reminder.schedule({
      id,
      title: "AURORA routine due: " + workflow.title,
      message: "Your saved routine is due. Open AURORA to review it. No actions will run until you approve a fresh task plan.",
      at
    });
    try {
      write([record, ...existing.filter(item => item.id !== id)]);
    } catch (error) {
      try { await reminder.cancel(id); } catch {}
      throw error;
    }
    return Object.freeze({ ...record });
  }
  async function cancel(id) {
    const key = String(id);
    if (reminder?.cancel) await reminder.cancel(key);
    const items = read(), next = items.filter(item => item.id !== key);
    if (next.length !== items.length) write(next);
    return { cancelled: next.length !== items.length, id: key };
  }
  function list() {
    return read().map(item => Object.freeze({ ...item, status: item.at <= now() ? "due" : "scheduled" }));
  }
  return Object.freeze({ schedule, cancel, list });
}
export { KEY as AURORA_ROUTINE_SCHEDULER_KEY, createAuroraRoutineScheduler };
