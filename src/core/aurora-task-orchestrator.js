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
  const inFlight = new Map();
  const controllers = new Map();
  const retryAttempts = new Map();
  const retryResults = new Map();
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
    if (inFlight.has(plan.id)) return inFlight.get(plan.id);
    if (runs.has(plan.id)) return runs.get(plan.id);
    const controller = new AbortController();
    controllers.set(plan.id, controller);
    const operation = (async () => {
    const state = { taskId: plan.id, title: plan.title, status: "running", startedAt: new Date().toISOString(), steps: [] };
    emit("task.started", { taskId: plan.id, title: plan.title, totalSteps: plan.steps.length });

    for (const step of plan.steps) {
      if (controller.signal.aborted) { state.status = "cancelled"; state.stoppedAtStep = step.id; break; }
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
        requestId: plan.id + ":" + step.id,
        signal: controller.signal
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
        state.status = controller.signal.aborted || receipt.error?.code === "ACTION_CANCELLED" ? "cancelled" : receipt.status === "rejected" ? "awaiting_user" : "failed";
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
    })();
    inFlight.set(plan.id, operation);
    try { return await operation; }
    finally { inFlight.delete(plan.id); controllers.delete(plan.id); }
  }

  async function retryFailedStep(taskId, stepId, options = {}) {
    const id = String(taskId);
    const plan = getPlan(id);
    const previous = runs.get(id);
    if (!plan || !previous || previous.status !== "failed") {
      return Object.freeze({ status: "not_retryable", reason: "no_failed_task", taskId: id, stepId: String(stepId) });
    }
    if (options.confirmed !== true) {
      return Object.freeze({ status: "confirmation_required", taskId: id, stepId: String(stepId), requiresFreshConfirmation: true });
    }
    const step = plan.steps.find(item => item.id === String(stepId));
    const failed = previous.steps.find(item => item.stepId === String(stepId));
    if (!step || !failed || failed.status !== "failed") {
      return Object.freeze({ status: "not_retryable", reason: "step_not_failed", taskId: id, stepId: String(stepId) });
    }
    const completed = new Set(previous.steps.filter(item => item.status === "completed").map(item => item.stepId));
    if (step.dependsOn.some(dependency => !completed.has(dependency))) {
      return Object.freeze({ status: "not_retryable", reason: "dependencies_not_completed", taskId: id, stepId: step.id });
    }
    if (typeof actionEngine.getRetryEligibility !== "function") {
      return Object.freeze({ status: "not_retryable", reason: "retry_contract_unavailable", taskId: id, stepId: step.id });
    }
    const eligibility = actionEngine.getRetryEligibility(step.capabilityId);
    if (eligibility?.eligible !== true) {
      emit("task.retry_denied", { taskId: id, stepId: step.id, reason: eligibility?.reason || "adapter_idempotency_not_proven" });
      return Object.freeze({ status: "not_retryable", reason: eligibility?.reason || "adapter_idempotency_not_proven", taskId: id, stepId: step.id });
    }
    const retryKey = id + ":" + step.id;
    if (retryResults.get(retryKey)?.status === "completed") return Object.freeze({ status: "not_retryable", reason: "retry_already_succeeded", taskId: id, stepId: step.id });
    const attempt = (retryAttempts.get(retryKey) || 0) + 1;
    if (attempt > 2) return Object.freeze({ status: "not_retryable", reason: "retry_limit_reached", taskId: id, stepId: step.id });
    retryAttempts.set(retryKey, attempt);
    emit("task.retry_started", { taskId: id, stepId: step.id, attempt, evidence: eligibility.evidence });
    const receipt = await actionEngine.execute({
      capabilityId: step.capabilityId,
      input: step.input,
      requestedBy: "task-retry:" + id,
      requestId: id + ":" + step.id + ":manual-retry:" + attempt
    });
    const result = Object.freeze({
      taskId: id, stepId: step.id, attempt, status: receipt.status,
      receipt, requiresFreshConfirmationForFurtherActions: true
    });
    retryResults.set(retryKey, result);
    emit("task.retry_finished", { taskId: id, stepId: step.id, attempt, status: receipt.status });
    return result;
  }

  return Object.freeze({
    createPlan,
    getPlan,
    runPlan,
    retryFailedStep,
    cancelPlan: (taskId) => { const id = String(taskId); const controller = controllers.get(id); if (!controller || controller.signal.aborted) return false; controller.abort(new Error("Task cancelled by the user.")); emit("task.cancel_requested", { taskId: id }); return true; },
    subscribe,
    listPlans: () => [...plans.values()],
    getRun: (id) => runs.get(String(id)) || null,
    maxSteps: MAX_STEPS
  });
}

export { createAuroraTaskOrchestrator };
