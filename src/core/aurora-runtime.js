/**
 * AURORA's shared internal runtime.
 * Import this singleton from chat, Pulse, voice and future surfaces.
 * It owns no screen: capabilities and approvals are services.
 */
import { createAuroraApprovalBroker } from "./aurora-approval-broker";
import { createAuroraCapabilityRuntime } from "./aurora-capability-runtime";
import { runAuroraToolTree } from "../lib/aurora-tool-tree";
import { parseCalendarIntent } from "./aurora-intent-parser";
import { createAuroraTaskOrchestrator } from "./aurora-task-orchestrator";
import { auroraMemory } from "./aurora-memory";
import { planAuroraActions } from "./aurora-task-planner";
import { auroraEvents } from "./aurora-event-bus";
import { auroraKnowledge } from "./aurora-knowledge-graph";
import { createAuroraSpecialistCoordinator } from "./aurora-specialist-coordinator";
import { auroraWorkflows } from "./aurora-workflow-registry";

const approvalBroker = createAuroraApprovalBroker();
const actionEngine = createAuroraCapabilityRuntime({
  approve: (proposal) => approvalBroker.request(proposal)
});
const taskOrchestrator = createAuroraTaskOrchestrator(actionEngine);
const specialists = createAuroraSpecialistCoordinator({ maxParallel: 3 });
specialists.register({ id: "context_intelligence", label: "Context and research", description: "Uses AURORA existing context, journey, weather and research tools.", matches: (text) => /weather|forecast|journey|trip|travel|traffic|road|news|research|where am i|my location|have i been|did i visit/i.test(text), run: async (text) => runAuroraToolTree(text) });
actionEngine.subscribe((event) => auroraEvents.publish("action." + event.type.replace(/^action\./, ""), event, { source: "action_engine" }));
taskOrchestrator.subscribe((event) => auroraEvents.publish(event.type, event, { source: "task_orchestrator" }));
let latestPendingTaskId = null;

actionEngine.registerCapability({
  id: "memory.save",
  label: "Save a memory",
  category: "memory",
  description: "Save a user-requested note or fact to AURORA's local-first memory.",
  risk: "low",
  approvalRequired: false,
  validate: (input) => typeof input?.content === "string" && input.content.trim().length > 0,
  execute: (input) => { const record = auroraMemory.remember({ kind: input.kind || "fact", title: input.title || "Saved memory", content: input.content, tags: input.tags || [], source: "explicit_user_request" }); auroraKnowledge.addNode({ id: "memory-" + record.id, type: "memory", label: record.title, description: record.content, tags: record.tags }); auroraEvents.publish("memory.saved", { id: record.id, title: record.title }, { source: "memory" }); return record; }
});

actionEngine.registerCapability({
  id: "memory.search",
  label: "Search saved memories",
  category: "memory",
  description: "Search locally stored AURORA memories by relevance.",
  risk: "low",
  approvalRequired: false,
  validate: (input) => typeof input?.query === "string" && input.query.trim().length > 0,
  execute: (input) => ({ items: auroraMemory.search(input.query, { limit: 10 }) })
});

actionEngine.registerCapability({
  id: "memory.forget",
  label: "Forget a saved memory",
  category: "memory",
  description: "Delete the specifically identified saved memory from AURORA's local memory after showing its title and content for approval.",
  risk: "medium",
  approvalRequired: true,
  validate: (input) => typeof input?.id === "string" && input.id.trim().length > 0,
  execute: (input) => ({ deleted: auroraMemory.forget(input.id) })
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

  const confirmTask = message.match(/^(?:please\s+)?(?:confirm|run|execute)\s+(?:(?:the\s+)?(?:aurora\s+)?task\s+([a-zA-Z0-9_.-]{4,80})|(?:the\s+)?plan)$/i);
  if (confirmTask) {
    const taskId = confirmTask[1] || latestPendingTaskId;
    if (!latestPendingTaskId || taskId !== latestPendingTaskId) {
      return { tool: "aurora_task", context: "That task is not the current pending plan. Ask AURORA to prepare the actions again so you can review the latest plan." };
    }
    const result = await taskOrchestrator.runPlan(taskId, { confirmed: true });
    latestPendingTaskId = null;
    return {
      tool: "aurora_task_execution",
      taskId,
      status: result.status,
      context: "Task " + result.status + ". " + (result.steps || []).map((step) => step.label + ": " + step.status).join("; ")
    };
  }

  const cancelTask = message.match(/^(?:please\s+)?(?:cancel|discard)\s+(?:(?:the\s+)?(?:aurora\s+)?task\s+([a-zA-Z0-9_.-]{4,80})|(?:the\s+)?plan)$/i);
  if (cancelTask) {
    if ((cancelTask[1] || latestPendingTaskId) !== latestPendingTaskId || !latestPendingTaskId) return { tool: "aurora_task", context: "That is not the current pending task plan." };
    latestPendingTaskId = null;
    return { tool: "aurora_task_cancelled", context: "The pending task plan was discarded. No actions were run." };
  }

  latestPendingTaskId = null;
  const proposedPlan = planAuroraActions(message, actionEngine.listCapabilities());
  if (proposedPlan?.unsupported) {
    return { tool: "aurora_task_plan", status: "needs_clarification", context: "I detected a multi-action request, but I could not safely identify every step. No actions were run. Please separate or clarify these parts: " + proposedPlan.unsupportedClauses.join("; ") + "." };
  }
  if (proposedPlan) {
    const plan = taskOrchestrator.createPlan(proposedPlan);
    latestPendingTaskId = plan.id;
    const preview = await taskOrchestrator.runPlan(plan, { confirmed: false });
    return {
      tool: "aurora_task_plan",
      taskId: plan.id,
      status: preview.status,
      steps: preview.steps,
      context: "I understood this as a multi-step task. Nothing has run yet.\n" +
        preview.steps.map((step, index) => (index + 1) + ". " + step.label + " [risk: " + step.risk + (step.approvalRequired ? ", separate approval required" : "") + "]").join("\n") +
        "\nTo proceed, say: confirm task " + plan.id + ". To discard it, say: cancel task " + plan.id + "."
    };
  }

  const rememberMatch = message.match(/^(?:hey aurora[, ]*)?(?:please\s+)?(?:remember|save(?: this)?|make a note that)\s+(?:that\s+)?(.+)$/i);
  if (rememberMatch?.[1]) {
    const receipt = await actionEngine.execute({ capabilityId: "memory.save", input: { title: "Saved memory", content: rememberMatch[1].trim() } });
    return receipt.status === "completed"
      ? { tool: "aurora_memory_save", context: "Saved to AURORA's local memory: " + receipt.result.title + ". You can ask me to recall it or forget it later." }
      : { error: receipt.error?.message || "I couldn't save that memory." };
  }

  const recallMatch = message.match(/^(?:hey aurora[, ]*)?(?:please\s+)?(?:what do you remember about|recall|find in my memories|search my memories for)\s+(.+?)\??$/i);
  if (recallMatch?.[1]) {
    const receipt = await actionEngine.execute({ capabilityId: "memory.search", input: { query: recallMatch[1].trim() } });
    if (receipt.status !== "completed") return { error: receipt.error?.message || "Memory search failed." };
    const items = receipt.result?.items || [];
    return { tool: "aurora_memory_search", context: items.length
      ? "Saved memories matching your request:\n" + items.map((item) => "- " + item.title + ": " + item.content).join("\n")
      : "I couldn't find a saved memory matching that request. I won't make one up." };
  }

  const forgetMatch = message.match(/^(?:hey aurora[, ]*)?(?:please\s+)?forget (?:the memory|what i said|that) (?:about\s+)?(.+?)\??$/i);
  if (forgetMatch?.[1]) {
    const search = await actionEngine.execute({ capabilityId: "memory.search", input: { query: forgetMatch[1].trim() } });
    const items = search.status === "completed" ? search.result?.items || [] : [];
    if (!items.length) return { tool: "aurora_memory_forget", context: "I couldn't find a matching saved memory to delete." };
    if (items.length > 1) return { tool: "aurora_memory_forget", context: "I found multiple matching memories. Please be more specific so I don't delete the wrong one: " + items.slice(0, 5).map((item) => item.title + " — " + item.content.slice(0, 100)).join("; ") };
    const receipt = await actionEngine.execute({ capabilityId: "memory.forget", input: { id: items[0].id, title: items[0].title, content: items[0].content } });
    return receipt.status === "completed"
      ? { tool: "aurora_memory_forget", context: "AURORA has deleted the selected local memory after your approval." }
      : { error: receipt.error?.message || "The memory was not deleted." };
  }
  if (/\b(?:enable|set up|configure|manage)\s+(?:aurora\s+)?notification access\b/i.test(message)) {
    const receipt = await actionEngine.execute({ capabilityId: "notifications.open_access_settings", input: {} });
    return receipt.status === "completed" ? { tool: "android_notification_settings", context: "Android's Notification Access settings are open. Enable or disable AURORA there whenever you choose." } : { error: receipt.error?.message || "Could not open notification settings." };
  }

  if (/\b(?:clear|delete|erase)\s+(?:aurora'?s?\s+)?(?:recent\s+)?notification cache\b/i.test(message)) {
    const receipt = await actionEngine.execute({ capabilityId: "notifications.clear_recent", input: {} });
    return receipt.status === "completed" ? { tool: "android_notifications", context: "AURORA's locally stored notification previews were cleared. Android notifications themselves were not dismissed." } : { error: receipt.error?.message || "Could not clear AURORA's notification cache." };
  }

  // Device and productivity commands are parsed into registered, typed capabilities.
  if (/^(?:what(?:'s| is)\s+)?(?:my\s+)?(?:battery|device status|phone status)\??$/i.test(message)) {
    const receipt = await actionEngine.execute({ capabilityId: "device.get_status", input: {} });
    if (receipt.status !== "completed") return { error: receipt.error?.message || "Device status is unavailable." };
    const s = receipt.result || {};
    return { tool: "android_device_status", context: "Battery: " + (s.batteryPercent == null ? "unknown" : s.batteryPercent + "%") + (s.charging ? " (charging)" : "") + ". Device: " + [s.manufacturer, s.model].filter(Boolean).join(" ") + ", Android SDK " + s.sdk + "." };
  }

  if (/\b(?:turn on|switch on|enable)\s+(?:the\s+)?(?:flashlight|torch)\b/i.test(message) || /^(?:flashlight|torch)\s+on$/i.test(message)) {
    const receipt = await actionEngine.execute({ capabilityId: "device.set_flashlight", input: { enabled: true } });
    return receipt.status === "completed" ? { tool: "android_flashlight", context: "Flashlight turned on." } : { error: receipt.error?.message || "Could not turn on the flashlight." };
  }
  if (/\b(?:turn off|switch off|disable)\s+(?:the\s+)?(?:flashlight|torch)\b/i.test(message) || /^(?:flashlight|torch)\s+off$/i.test(message)) {
    const receipt = await actionEngine.execute({ capabilityId: "device.set_flashlight", input: { enabled: false } });
    return receipt.status === "completed" ? { tool: "android_flashlight", context: "Flashlight turned off." } : { error: receipt.error?.message || "Could not turn off the flashlight." };
  }

  if (/\b(?:read|check|show|summari[sz]e)\s+(?:my\s+)?(?:recent\s+)?notifications\b/i.test(message)) {
    const receipt = await actionEngine.execute({ capabilityId: "notifications.read_recent", input: {} });
    if (receipt.status !== "completed") return { error: receipt.error?.message || "Notification access is unavailable." };
    const items = receipt.result?.items || [];
    return { tool: "android_notifications", context: items.length ? "Recent notifications (stored locally):\n" + items.map((item) => "- " + [item.title, item.text].filter(Boolean).join(": ")).join("\n") : "There are no recent notification previews in AURORA's local cache." };
  }

  const calendarIntent = parseCalendarIntent(message);
  if (calendarIntent) {
    const receipt = await actionEngine.execute({ capabilityId: "calendar.prepare_event", input: calendarIntent });
    if (receipt.status !== "completed") return { error: receipt.error?.message || "Calendar event preparation was not completed." };
    return { tool: "android_calendar", context: "I opened the calendar editor for “" + calendarIntent.title + "”. Please review the date and time and save it there." };
  }

  // Explicit app-launch requests use a fixed package allowlist; package IDs are never model supplied.
  const appTargets = [
    { pattern: /\bwhatsapp business\b/i, packageName: "com.whatsapp.w4b", label: "WhatsApp Business" },
    { pattern: /\bwhats?app\b/i, packageName: "com.whatsapp", label: "WhatsApp" },
    { pattern: /\bfacebook lite\b/i, packageName: "com.facebook.lite", label: "Facebook Lite" },
    { pattern: /\bfacebook\b/i, packageName: "com.facebook.katana", label: "Facebook" },
    { pattern: /\bchrome\b/i, packageName: "com.android.chrome", label: "Chrome" },
    { pattern: /\byoutube\b/i, packageName: "com.google.android.youtube", label: "YouTube" },
    { pattern: /\bgmail\b/i, packageName: "com.google.android.gm", label: "Gmail" },
    { pattern: /\bgoogle maps\b|\bmaps\b/i, packageName: "com.google.android.apps.maps", label: "Google Maps" },
    { pattern: /\bmessages\b/i, packageName: "com.google.android.apps.messaging", label: "Messages" },
    { pattern: /\bsettings\b/i, packageName: "com.android.settings", label: "Settings" }
  ];
  if (/^\s*(?:hey aurora[, ]*)?(?:please\s+)?(?:open|launch)\s+/i.test(message)) {
    const target = appTargets.find((item) => item.pattern.test(message));
    if (target) {
      const receipt = await actionEngine.execute({ capabilityId: "android.open_app", input: { packageName: target.packageName } });
      if (receipt.status !== "completed") return { error: receipt.error?.message || "The app could not be opened." };
      return { tool: "android_open_app", context: "AURORA handed the request to Android to open " + target.label + "." };
    }
  }

  if (/^\s*(?:hey aurora[, ]*)?(?:please\s+)?(?:choose|pick|open|read)\s+(?:a\s+)?(?:file|document)\s*$/i.test(message)) {
    const receipt = await actionEngine.execute({ capabilityId: "files.pick_document", input: {} });
    if (receipt.status !== "completed") return { error: receipt.error?.message || "The file picker could not open." };
    if (receipt.result?.cancelled) return { tool: "android_file_picker", context: "File selection was cancelled." };
    return { tool: "android_file_picker", context: receipt.result?.textIncluded
      ? "The user selected " + receipt.result.name + ". Its text content is available for the next assistant step.\n\n" + receipt.result.text
      : "The user selected " + receipt.result?.name + ". " + (receipt.result?.note || "This file type is not available as a plain-text preview.") };
  }

  // Explicit navigation requests use the registered native capability adapters.
  const destinationMatch = message.match(/\b(?:directions to|route to|navigate to|take me to|how do i get to|open (?:the )?map(?:s)? for|find on (?:the )?map)\s+(.+?)(?:[?.!,]|$)/i);
  if (destinationMatch?.[1]) {
    const destination = destinationMatch[1].trim().replace(/\s+(?:today|tomorrow|now|please)$/i, "").trim();
    const mode = /\b(walk|walking|on foot)\b/i.test(message) ? "walking"
      : /\b(cycl|bicycl)\b/i.test(message) ? "bicycling"
      : /\b(transit|bus|train)\b/i.test(message) ? "transit" : "driving";
    const receipt = await actionEngine.execute({
      capabilityId: /\b(directions|route|navigate|take me)\b/i.test(message) ? "maps.get_directions" : "maps.search_place",
      input: /\b(directions|route|navigate|take me)\b/i.test(message) ? { destination, mode } : { query: destination }
    });
    if (receipt.status !== "completed") return { error: receipt.error?.message || "The map action could not be completed." };
    return { tool: "android_maps", context: "AURORA handed " + destination + " to the installed map application. " + (receipt.result?.mode ? "Travel mode: " + receipt.result.mode + "." : "") };
  }

  // Media search is a handoff to the user's installed player; it does not
  // download media or bypass that application's playback controls.
  const mediaMatch = message.match(/^\s*(?:hey aurora[, ]*)?(?:please\s+)?(?:play|find and play|search and play)\s+(.+?)[?.!]*\s*$/i);
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
  const coordinated = await specialists.coordinate(message);
  const specialistResult = coordinated.results.find((item) => item.status === "completed" && item.result);
  if (specialistResult) return specialistResult.result;
  return receipt.result || null;
}

const auroraRuntime = Object.freeze({
  actions: actionEngine,
  approvals: approvalBroker,
  tasks: taskOrchestrator,
  memory: auroraMemory,
  knowledge: auroraKnowledge,
  events: auroraEvents,
  specialists,
  workflows: auroraWorkflows,
  saveWorkflow: (input) => auroraWorkflows.save(input, actionEngine.listCapabilities()),
  prepareWorkflow: (workflowId) => { const plan = auroraWorkflows.instantiate(workflowId, actionEngine.listCapabilities(), taskOrchestrator); latestPendingTaskId = plan.id; return taskOrchestrator.runPlan(plan, { confirmed: false }); },
  createTaskPlan: (plan) => taskOrchestrator.createPlan(plan),
  runTaskPlan: (planOrId, options) => taskOrchestrator.runPlan(planOrId, options),
  capabilities: () => actionEngine.listCapabilities(),
  availability: (capabilityId) => actionEngine.getAvailability(capabilityId),
  execute: (request) => actionEngine.execute(request),
  routeMessage,
  parseCalendarIntent,
  subscribe: (listener) => actionEngine.subscribe(listener),
  subscribeApprovals: (listener) => approvalBroker.subscribe(listener)
});

export { auroraRuntime };
