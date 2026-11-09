/**
 * AURORA Multi-step Task Orchestrator.
 * Internal service shared by chat, Pulse and voice; it creates no screen.
 * Plans are previewable first and cannot execute until explicitly confirmed.
 * Steps run sequentially through the Action Engine, so capability-level
 * availability checks and approval gates remain authoritative.
 */
const MAX_STEPS = 8;
const SAFE_ID = /^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,63}$/;

function createAuroraTaskOrchestrator(actionEngine, options = {}) {
  if (!actionEngine || typeof actionEngine.execute !== "function" || typeof actionEngine.listCapabilities !== "function") {
    throw new TypeError("AURORA Task Orchestrator requires the shared Action Engine.");
  }
  const createId = typeof options.createId === "function"
    ? options.createId
    : () => globalThis.crypto?.randomUUID?.() || "task-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2);
  const listeners = new Set();
  const plans = new Map();
  const runs = new Map();
  const capabilityMap = () => new Map(actionEngine.listCapabilities().map((item) => [item.id, item]));

  function emit(type, payload) {
    const event = Object.freeze({ type, at: new Date().toISOString(), ...payload });
    for (const listener of listeners) {
      try { listener(event); } catch { /* observers cannot interrupt a task */ }
    }
  }

  function subscribe(listener) {
    if (typeof listener !== "function") throw new TypeError("Task listener must be a function.");
    listeners.add(listener);
    return () => listeners.delete(listener);
  }

  function createPlan(input = {}) {
    const title = String(input.title || "").trim();
    if (!title) throw new Error("A task plan needs a title.");
    if (!Array.isArray(input.steps) || input.steps.length === 0 || input.steps.length > MAX_STEPS) {
      throw new Error("A task plan must contain between 1 and " + MAX_STEPS + " steps.");
    }
    const known = capabilityMap();
    const seen = new Set();
    const steps = input.steps.map((step, index) => {
      const id = String(step?.id || "step-" + (index + 1));
      if (!SAFE_ID.test(id) || seen.has(id)) throw new Error("Task step IDs must be unique and use letters, numbers, dots, underscores or hyphens.");
      seen.add(id);
      const capability = known.get(step?.capabilityId);
      if (!capability) throw new Error("Unknown capability in task plan: " + String(step?.capabilityId || "missing"));
      const dependsOn = Array.isArray(step.dependsOn) ? step.dependsOn.map(String) : [];
      if (dependsOn.some((dependency) => !seen.has(dependency) || dependency === id)) {
        throw new Error("Each dependency must refer to an earlier step.");
      }
      return Object.freeze({
        id,
        capabilityId: capability.id,
        label: capability.label,
        risk: capability.risk,
        approvalRequired: capability.approvalRequired,
        input: Object.freeze({ ...(step.input || {}) }),
        dependsOn: Object.freeze(dependsOn)
      });
    });
    const plan = Object.freeze({
      id: String(input.id || createId()),
      title,
      summary: String(input.summary || steps.map((step) => step.label).join(" → ")),
      createdAt: new Date().toISOString(),
      steps: Object.freeze(steps)
    });
    if (plans.has(plan.id)) throw new Error("A task plan with this ID already exists.");
    plans.set(plan.id, plan);
    emit("task.plan_created", { plan });
    return plan;
  }

  function getPlan(id) {
    return plans.get(String(id)) || null;
  }

  async function runPlan(planOrId, options = {}) {
    const plan = typeof planOrId === "string" ? getPlan(planOrId) : planOrId;
    if (!plan || !Array.isArray(plan.steps) || !plans.has(plan.id)) {
      return Object.freeze({ taskId: plan?.id || null, status: "invalid_plan", steps: [] });
    }
    if (options.confirmed !== true) {
      return Object.freeze({
        taskId: plan.id,
        status: "confirmation_required",
        title: plan.title,
        summary: plan.summary,
        steps: plan.steps.map(({ id, label, risk, approvalRequired }) => ({ id, label, risk, approvalRequired }))
      });
    }
    if (runs.has(plan.id)) return runs.get(plan.id);
    const state = { taskId: plan.id, title: plan.title, status: "running", startedAt: new Date().toISOString(), steps: [] };
    runs.set(plan.id, state);
    emit("task.started", { taskId: plan.id, title: plan.title, totalSteps: plan.steps.length });

    for (const step of plan.steps) {
      const unmet = step.dependsOn.filter((dependency) => !state.steps.some((item) => item.stepId === dependency && item.status === "completed"));
      if (unmet.length) {
        state.status = "blocked";
        state.blockedBy = unmet;
        emit("task.blocked", { taskId: plan.id, stepId: step.id, unmet });
        break;
      }
      emit("task.step_started", { taskId: plan.id, stepId: step.id, capabilityId: step.capabilityId });
      const receipt = await actionEngine.execute({
        capabilityId: step.capabilityId,
        input: step.input,
        requestedBy: "task:" + plan.id,
        requestId: plan.id + ":" + step.id
      });
      const item = Object.freeze({
        stepId: step.id,
        capabilityId: step.capabilityId,
        label: step.label,
        status: receipt.status,
        receipt
      });
      state.steps.push(item);
      emit("task.step_finished", { taskId: plan.id, step: item });
      if (receipt.status !== "completed") {
        state.status = receipt.status === "rejected" ? "awaiting_user" : "failed";
        state.stoppedAtStep = step.id;
        break;
      }
    }

    if (state.status === "running") state.status = "completed";
    state.finishedAt = new Date().toISOString();
    const result = Object.freeze({
      taskId: state.taskId,
      title: state.title,
      status: state.status,
      startedAt: state.startedAt,
      finishedAt: state.finishedAt,
      stoppedAtStep: state.stoppedAtStep || null,
      blockedBy: state.blockedBy || [],
      steps: Object.freeze([...state.steps])
    });
    runs.set(plan.id, result);
    emit("task.finished", { result });
    return result;
  }

  return Object.freeze({
    createPlan,
    getPlan,
    runPlan,
    subscribe,
    listPlans: () => [...plans.values()],
    getRun: (id) => runs.get(String(id)) || null,
    maxSteps: MAX_STEPS
  });
}

export { createAuroraTaskOrchestrator };
