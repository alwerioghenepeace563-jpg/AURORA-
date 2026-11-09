/**
 * AURORA's shared internal runtime.
 * Import this singleton from chat, Pulse, voice and future surfaces.
 * It owns no screen: capabilities and approvals are services.
 */
import { createAuroraApprovalBroker } from "./aurora-approval-broker";
import { createAuroraCapabilityRuntime } from "./aurora-capability-runtime";

const approvalBroker = createAuroraApprovalBroker();
const actionEngine = createAuroraCapabilityRuntime({
  approve: (proposal) => approvalBroker.request(proposal)
});

const auroraRuntime = Object.freeze({
  actions: actionEngine,
  approvals: approvalBroker,
  capabilities: () => actionEngine.listCapabilities(),
  availability: (capabilityId) => actionEngine.getAvailability(capabilityId),
  execute: (request) => actionEngine.execute(request),
  subscribe: (listener) => actionEngine.subscribe(listener),
  subscribeApprovals: (listener) => approvalBroker.subscribe(listener)
});

export { auroraRuntime };
