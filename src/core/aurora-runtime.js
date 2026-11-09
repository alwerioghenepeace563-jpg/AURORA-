/**
 * AURORA's shared internal runtime.
 * Import this singleton from chat, Pulse, voice and future surfaces.
 * It owns no screen: capabilities and approvals are services.
 */
import { createAuroraApprovalBroker } from "./aurora-approval-broker";
import { createAuroraCapabilityRuntime } from "./aurora-capability-runtime";
import { runAuroraToolTree } from "../lib/aurora-tool-tree";

const approvalBroker = createAuroraApprovalBroker();
const actionEngine = createAuroraCapabilityRuntime({
  approve: (proposal) => approvalBroker.request(proposal)
});

actionEngine.registerCapability({
  id: "assistant.route_request",
  label: "Understand and route a request",
  category: "intelligence",
  description: "Runs AURORA’s existing local capability tree before AI response generation.",
  risk: "low",
  approvalRequired: false,
  validate: (input) => typeof input?.text === "string" && input.text.trim().length > 0,
  execute: (input) => runAuroraToolTree(input.text)
});

async function routeMessage(text) {
  const receipt = await actionEngine.execute({ capabilityId: "assistant.route_request", input: { text: String(text || "") } });
  if (receipt.status !== "completed") {
    return { error: receipt.error?.message || "AURORA could not route that request." };
  }
  return receipt.result || null;
}

const auroraRuntime = Object.freeze({
  actions: actionEngine,
  approvals: approvalBroker,
  capabilities: () => actionEngine.listCapabilities(),
  availability: (capabilityId) => actionEngine.getAvailability(capabilityId),
  execute: (request) => actionEngine.execute(request),
  routeMessage,
  subscribe: (listener) => actionEngine.subscribe(listener),
  subscribeApprovals: (listener) => approvalBroker.subscribe(listener)
});

export { auroraRuntime };
