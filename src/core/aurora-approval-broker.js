/**
 * In-memory approval broker shared by Main, Pulse and voice surfaces.
 * Approval is an internal service; it does not create a dedicated page.
 */
function createAuroraApprovalBroker(options = {}) {
  const timeoutMs = Number.isFinite(options.timeoutMs) ? Math.max(5000, options.timeoutMs) : 60000;
  const pending = new Map();
  const listeners = new Set();
  const now = typeof options.now === "function" ? options.now : () => new Date().toISOString();
  const createId = typeof options.createId === "function" ? options.createId : () =>
    globalThis.crypto?.randomUUID?.() || "approval-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2);

  function emit(type, approval) {
    const event = Object.freeze({ type, approval: publicApproval(approval), at: now() });
    for (const listener of listeners) { try { listener(event); } catch { /* isolate UI subscribers */ } }
  }
  function publicApproval(item) {
    return Object.freeze({
      id: item.id, requestId: item.proposal.requestId,
      capabilityId: item.proposal.capabilityId, label: item.proposal.label,
      description: item.proposal.description, risk: item.proposal.risk,
      requestedAt: item.requestedAt, expiresAt: item.expiresAt,
      input: item.proposal.input
    });
  }
  function subscribe(listener) {
    if (typeof listener !== "function") throw new TypeError("Approval listener must be a function.");
    listeners.add(listener);
    return () => listeners.delete(listener);
  }
  function request(proposal) {
    const id = createId();
    const requestedAt = now();
    const expiresAt = new Date(Date.now() + timeoutMs).toISOString();
    return new Promise((resolve) => {
      const timer = setTimeout(() => settle(id, false, "Approval expired. Ask AURORA to try again."), timeoutMs);
      pending.set(id, { id, proposal, requestedAt, expiresAt, timer, resolve });
      emit("approval.created", pending.get(id));
    });
  }
  function settle(id, approved, reason) {
    const item = pending.get(id);
    if (!item) return false;
    clearTimeout(item.timer);
    pending.delete(id);
    const result = { approved: approved === true, approvalId: id, reason: reason || (approved ? "Approved by the user." : "Declined by the user.") };
    emit(approved ? "approval.approved" : "approval.rejected", item);
    item.resolve(result);
    return true;
  }
  return Object.freeze({
    request,
    approve: (id) => settle(id, true),
    reject: (id, reason) => settle(id, false, reason),
    subscribe,
    listPending: () => [...pending.values()].map(publicApproval),
    hasPending: () => pending.size > 0
  });
}

export { createAuroraApprovalBroker };
