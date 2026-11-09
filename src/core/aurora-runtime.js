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
  const message = String(text || "").trim();
  // Explicit navigation requests use the registered native capability adapters.
  const destinationMatch = message.match(/\\b(?:directions to|route to|navigate to|take me to|how do i get to|open (?:the )?map(?:s)? for|find on (?:the )?map)\\s+(.+?)(?:[?.!,]|$)/i);
  if (destinationMatch?.[1]) {
    const destination = destinationMatch[1].trim().replace(/\\s+(?:today|tomorrow|now|please)$/i, "").trim();
    const mode = /\\b(walk|walking|on foot)\\b/i.test(message) ? "walking"
      : /\\b(cycl|bicycl)\\b/i.test(message) ? "bicycling"
      : /\\b(transit|bus|train)\\b/i.test(message) ? "transit" : "driving";
    const receipt = await actionEngine.execute({
      capabilityId: /\\b(directions|route|navigate|take me)\\b/i.test(message) ? "maps.get_directions" : "maps.search_place",
      input: /\\b(directions|route|navigate|take me)\\b/i.test(message) ? { destination, mode } : { query: destination }
    });
    if (receipt.status !== "completed") return { error: receipt.error?.message || "The map action could not be completed." };
    return { tool: "android_maps", context: "AURORA handed " + destination + " to the installed map application. " + (receipt.result?.mode ? "Travel mode: " + receipt.result.mode + "." : "") };
  }

  // Media search is a handoff to the user's installed player; it does not
  // download media or bypass that application's playback controls.
  const mediaMatch = message.match(/^\\s*(?:hey aurora[, ]*)?(?:please\\s+)?(?:play|find and play|search and play)\\s+(.+?)[?.!]*\\s*$/i);
  if (mediaMatch?.[1]) {
    const query = mediaMatch[1].trim();
    const receipt = await actionEngine.execute({ capabilityId: "media.search_play", input: { query } });
    if (receipt.status !== "completed") return { error: receipt.error?.message || "The media app could not open." };
    return { tool: "android_media", context: "AURORA handed the search for " + query + " to an installed media app. Playback remains under your app's controls." };
  }

  const receipt = await actionEngine.execute({ capabilityId: "assistant.route_request", input: { text: message } });
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
