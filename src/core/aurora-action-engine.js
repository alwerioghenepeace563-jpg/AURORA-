/**
 * AURORA Universal Action Engine
 * Internal runtime module: capabilities are services, not pages.
 * Every surface (Main, Pulse, future voice surfaces) calls this same engine.
 */

const RISK = Object.freeze({ NONE: "none", LOW: "low", MEDIUM: "medium", HIGH: "high", CRITICAL: "critical" });
const RISK_ORDER = Object.freeze({ none: 0, low: 1, medium: 2, high: 3, critical: 4 });

function makeError(code, message, details = {}) {
  const error = new Error(message);
  error.code = code;
  error.details = details;
  return error;
}

function defaultId() {
  return globalThis.crypto?.randomUUID?.() || "aurora-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2);
}

function createAuroraActionEngine(options = {}) {
  const capabilities = new Map();
  const receipts = new Map();
  const inFlight = new Map();
  const listeners = new Set();
  const approve = typeof options.approve === "function" ? options.approve : async () => ({ approved: false });
  const now = typeof options.now === "function" ? options.now : () => new Date().toISOString();
  const createId = typeof options.createId === "function" ? options.createId : defaultId;

  function emit(type, payload = {}) {
    const event = Object.freeze({ type, at: now(), ...payload });
    for (const listener of listeners) {
      try { listener(event); } catch { /* A subscriber must never break action execution. */ }
    }
  }

  function subscribe(listener) {
    if (typeof listener !== "function") throw makeError("INVALID_LISTENER", "Event listener must be a function.");
    listeners.add(listener);
    return () => listeners.delete(listener);
  }

  function registerCapability(definition) {
    if (!definition || typeof definition.id !== "string" || !/^[a-z][a-z0-9_.-]{2,80}$/.test(definition.id)) {
      throw makeError("INVALID_CAPABILITY", "Capability IDs must be stable lowercase identifiers.");
    }
    if (capabilities.has(definition.id)) throw makeError("DUPLICATE_CAPABILITY", "Capability is already registered.", { id: definition.id });
    if (typeof definition.execute !== "function") throw makeError("INVALID_CAPABILITY", "A capability needs an execution adapter.", { id: definition.id });
    const risk = definition.risk || RISK.LOW;
    if (!(risk in RISK_ORDER)) throw makeError("INVALID_CAPABILITY_RISK", "Unknown capability risk level.", { id: definition.id, risk });
    const capability = Object.freeze({
      id: definition.id,
      label: String(definition.label || definition.id),
      category: String(definition.category || "system"),
      description: String(definition.description || ""),
      risk,
      approvalRequired: definition.approvalRequired === true || RISK_ORDER[risk] >= RISK_ORDER.medium,
      availability: typeof definition.availability === "function" ? definition.availability : async () => ({ available: true }),
      validate: typeof definition.validate === "function" ? definition.validate : () => true,
      execute: definition.execute,
      source: String(definition.source || "builtin"),
      version: String(definition.version || "1")
    });
    capabilities.set(capability.id, capability);
    emit("capability.registered", { capability: publicCapability(capability) });
    return publicCapability(capability);
  }

  function publicCapability(capability) {
    return Object.freeze({
      id: capability.id, label: capability.label, category: capability.category,
      description: capability.description, risk: capability.risk,
      approvalRequired: capability.approvalRequired, source: capability.source,
      version: capability.version
    });
  }

  function listCapabilities() {
    return [...capabilities.values()].map(publicCapability);
  }

  async function getAvailability(id) {
    const capability = capabilities.get(id);
    if (!capability) throw makeError("CAPABILITY_NOT_FOUND", "AURORA does not know this capability.", { id });
    try {
      const state = await capability.availability();
      return { id, available: state?.available === true, reason: state?.reason || null, metadata: state?.metadata || null };
    } catch (error) {
      return { id, available: false, reason: error?.message || "Availability check failed." };
    }
  }

  async function execute(request = {}) {
    const capability = capabilities.get(request.capabilityId);
    if (!capability) throw makeError("CAPABILITY_NOT_FOUND", "AURORA does not know this capability.", { id: request.capabilityId });
    const requestId = String(request.requestId || createId());
    if (receipts.has(requestId)) return receipts.get(requestId);
    if (inFlight.has(requestId)) return inFlight.get(requestId);

    const operation = (async () => {
    const availability = await getAvailability(capability.id);
    if (!availability.available) {
      const receipt = Object.freeze({ requestId, capabilityId: capability.id, status: "unavailable", error: { code: "CAPABILITY_UNAVAILABLE", message: availability.reason || "Capability is unavailable." }, at: now() });
      receipts.set(requestId, receipt);
      emit("action.failed", { receipt });
      return receipt;
    }

    const input = request.input ?? {};
    let valid;
    try { valid = await capability.validate(input); }
    catch (error) { throw makeError("INVALID_ACTION_INPUT", error?.message || "Action input is invalid.", { capabilityId: capability.id }); }
    if (valid !== true) throw makeError("INVALID_ACTION_INPUT", typeof valid === "string" ? valid : "Action input is invalid.", { capabilityId: capability.id });

    const proposal = Object.freeze({
      requestId, capabilityId: capability.id, label: capability.label,
      description: capability.description, risk: capability.risk,
      input, requestedBy: String(request.requestedBy || "user")
    });
    emit("action.proposed", { proposal });

    if (capability.approvalRequired) {
      emit("action.approval_required", { proposal });
      let decision;
      try { decision = await approve(proposal); }
      catch (error) { decision = { approved: false, reason: error?.message || "Approval could not be completed." }; }
      if (decision?.approved !== true) {
        const receipt = Object.freeze({ requestId, capabilityId: capability.id, status: "rejected", error: { code: "APPROVAL_REQUIRED", message: decision?.reason || "Approval was not granted." }, at: now() });
        receipts.set(requestId, receipt);
        emit("action.rejected", { receipt });
        return receipt;
      }
    }

    emit("action.started", { requestId, capabilityId: capability.id });
    try {
      const result = await capability.execute(input, { requestId, capabilityId: capability.id });
      const receipt = Object.freeze({ requestId, capabilityId: capability.id, status: "completed", result: result ?? null, at: now() });
      receipts.set(requestId, receipt);
      emit("action.completed", { receipt });
      return receipt;
    } catch (error) {
      const receipt = Object.freeze({
        requestId, capabilityId: capability.id, status: "failed",
        error: { code: error?.code || "EXECUTION_FAILED", message: error?.message || "The action failed." },
        at: now()
      });
      receipts.set(requestId, receipt);
      emit("action.failed", { receipt });
      return receipt;
    }
    })();
    inFlight.set(requestId, operation);
    try { return await operation; }
    finally { inFlight.delete(requestId); }
  }

  return Object.freeze({
    registerCapability, listCapabilities, getAvailability, execute, subscribe,
    getReceipt: (requestId) => receipts.get(requestId) || null,
    riskLevels: RISK
  });
}

export { RISK as AURORA_ACTION_RISK, createAuroraActionEngine };
