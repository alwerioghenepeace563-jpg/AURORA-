/**
 * Bridges approval lifecycle into the shared event stream without publishing
 * proposal inputs, descriptions, or other user-provided content.
 */
function connectAuroraApprovalEvents(approvalBroker, events) {
  if (!approvalBroker || typeof approvalBroker.subscribe !== "function") throw new TypeError("Approval broker is required.");
  if (!events || typeof events.publish !== "function") throw new TypeError("Shared event bus is required.");
  return approvalBroker.subscribe((event) => {
    const approval = event?.approval || {};
    const type = String(event?.type || "");
    if (!["approval.created", "approval.approved", "approval.rejected"].includes(type)) return;
    events.publish(type, {
      approvalId: String(approval.id || "").slice(0, 120),
      requestId: String(approval.requestId || "").slice(0, 120),
      capabilityId: String(approval.capabilityId || "").slice(0, 120),
      risk: String(approval.risk || "unknown").slice(0, 24),
      status: type.slice("approval.".length)
    }, { source: "approval_broker" });
  });
}
export { connectAuroraApprovalEvents };
