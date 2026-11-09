/**
 * AURORA's shared internal runtime.
 * Import this singleton from chat, Pulse, voice and future surfaces.
 * It owns no screen: capabilities and approvals are services.
 */
import { createAuroraApprovalBroker } from "./aurora-approval-broker";
import { createAuroraCapabilityRuntime } from "./aurora-capability-runtime";
import { auroraLayerRegistry } from "./aurora-layer-registry";
import { runAuroraToolTree } from "../lib/aurora-tool-tree";
import { parseCalendarIntent } from "./aurora-intent-parser";
import { createAuroraTaskOrchestrator } from "./aurora-task-orchestrator";
import { auroraMemory } from "./aurora-memory";
import { planAuroraActions } from "./aurora-task-planner";
import { auroraEvents } from "./aurora-event-bus";
import { auroraKnowledge } from "./aurora-knowledge-graph";
import { createAuroraSpecialistCoordinator } from "./aurora-specialist-coordinator";
import { auroraWorkflows } from "./aurora-workflow-registry";
import { auroraTaskJournal } from "./aurora-task-journal";
import { createAuroraMemorySync } from "./aurora-memory-sync";
import { createAuroraCapabilityIntelligence } from "./aurora-capability-intelligence";
import { auroraConsents } from "./aurora-consent-registry";
import { createAuroraUniversalSearch } from "./aurora-universal-search";
import { createAuroraExtensionRegistry } from "./aurora-extension-registry";
import { createAuroraDataInventory } from "./aurora-data-inventory";
import { createAuroraRoutineScheduler } from "./aurora-routine-scheduler";
import { createAuroraSupabaseMemoryAdapter } from "./aurora-supabase-memory-adapter";
import { auroraSecureStorage as nativeSecureStorage, auroraReminder } from "../lib/aurora-secure-storage";
import { createAuroraSecureStore } from "./aurora-secure-store";
import { createAuroraProtectedMemory } from "./aurora-protected-memory";
import { createAuroraReliabilityCoordinator } from "./aurora-reliability-coordinator";
import { createAuroraEnvironmentMonitor } from "./aurora-environment-monitor";
import { createAuroraSurfaceGateway } from "./aurora-surface-gateway";
import { createAuroraInteractionInterruptionCoordinator } from "./aurora-interaction-interruption";
import { connectAuroraApprovalEvents } from "./aurora-approval-event-bridge";

const approvalBroker = createAuroraApprovalBroker();
connectAuroraApprovalEvents(approvalBroker, auroraEvents);
const actionEngine = createAuroraCapabilityRuntime({
  approve: (proposal) => approvalBroker.request(proposal),
  authorize: async ({ capability }) => {
    for (const requirement of capability.consentRequirements || []) {
      const separator = requirement.lastIndexOf(":");
      if (separator < 1) return { authorized: false, code: "INVALID_CONSENT_CONTRACT", reason: "Consent requirements must use scope:source identifiers." };
      const scope = requirement.slice(0, separator);
      const source = requirement.slice(separator + 1);
      if (!auroraConsents.isGranted(scope, source)) return { authorized: false, code: "CONSENT_REQUIRED", reason: "Explicit consent is required for " + scope + " from " + source + "." };
    }
    return { authorized: true };
  }
});
const taskOrchestrator = createAuroraTaskOrchestrator(actionEngine);
const memorySync = createAuroraMemorySync(auroraMemory, { isConsentGranted: () => auroraConsents.isGranted("memory.cloud_sync", "supabase") });
const appEnv = import.meta.env || {};
const supabaseMemoryAdapter = createAuroraSupabaseMemoryAdapter({
  url: appEnv.VITE_SUPABASE_URL || appEnv.VITE_SUPABASE_API || "",
  anonKey: appEnv.VITE_SUPABASE_ANON_KEY || "",
  getAccessToken: async () => {
    try {
      if (nativeSecureStorage.isAvailable()) {
        const saved = await nativeSecureStorage.get("auth.session");
        return saved.found && saved.value ? JSON.parse(saved.value)?.access_token || null : null;
      }
      const session = JSON.parse(globalThis.localStorage?.getItem("aurora-auth-session") || "null");
      return session?.access_token || null;
    } catch { return null; }
  }
});
try {
  if (supabaseMemoryAdapter.isConfigured() && auroraConsents.isGranted("memory.cloud_sync", "supabase")) {
    memorySync.configure({ enabled: true, adapter: supabaseMemoryAdapter, consent: true });
  }
} catch { /* corrupt/unavailable consent storage fails closed; keep memory local-first */ }
const secureStorage = createAuroraSecureStore({
  available: nativeSecureStorage.isAvailable(),
  adapter: nativeSecureStorage
});
const protectedMemory = createAuroraProtectedMemory({ secureStore: secureStorage });
let pendingReminder = null;
let pendingRoutine = null;
const routineScheduler = createAuroraRoutineScheduler({ reminder: auroraReminder, workflows: auroraWorkflows });
async function hasSignedInSupabaseSession() {
  try {
    if (nativeSecureStorage.isAvailable()) {
      const saved = await nativeSecureStorage.get("auth.session");
      return Boolean(saved.found && saved.value && JSON.parse(saved.value)?.access_token);
    }
    return Boolean(JSON.parse(globalThis.localStorage?.getItem("aurora-auth-session") || "null")?.access_token);
  } catch { return false; }
}
const capabilityIntelligence = createAuroraCapabilityIntelligence(actionEngine);
const universalSearch = createAuroraUniversalSearch({ maxResults: 20 });
const extensionRegistry = createAuroraExtensionRegistry({ getCapabilities: () => actionEngine.listCapabilities(), executeCapability: (request) => actionEngine.execute(request) });
universalSearch.register("memories", (query, limit) => auroraMemory.search(query, { limit }).map(item => ({ ...item, type: "memory", summary: item.content, score: item.score || 0 })), "Saved memories");
universalSearch.register("knowledge", (query, limit) => auroraKnowledge.search(query, limit).map(item => ({ ...item, type: "knowledge", summary: item.description })), "Knowledge graph");
universalSearch.register("capabilities", (query, limit) => capabilityIntelligence.find(query, limit).map(item => ({ ...item, type: "capability", summary: item.description })), "Available tools");
universalSearch.register("workflows", (query) => auroraWorkflows.list().filter(item => (item.title + " " + (item.summary || "")).toLowerCase().includes(query.toLowerCase())).map(item => ({ ...item, type: "workflow" })), "Saved workflows");
universalSearch.register("tasks", (query) => auroraTaskJournal.list().filter(item => (item.plan?.title || "").toLowerCase().includes(query.toLowerCase())).map(item => ({ id: item.taskId, title: item.plan?.title || "Task", summary: item.status, type: "task" })), "Task history");
const dataInventory = createAuroraDataInventory({
  memories: () => ({ label: "Saved memories", location: "Local browser storage", count: auroraMemory.list().length, encrypted: false, note: "Local-first notes; individual cloud sync is opt-in." }),
  knowledge: () => ({ label: "Knowledge graph", location: "Local browser storage", count: auroraKnowledge.status().nodeCount, encrypted: false }),
  workflows: () => ({ label: "Saved workflows", location: "Local browser storage", count: auroraWorkflows.list().length, encrypted: false }),
  task_history: () => ({ label: "Task recovery journal", location: "Local browser storage", count: auroraTaskJournal.list().length, encrypted: false, note: "Bounded task summaries and execution states." }),
  permissions: () => ({ label: "Data-sharing permissions", location: "Local browser storage", count: auroraConsents.list().length, encrypted: false }),
  extensions: () => ({ label: "Installed extension manifests", location: "Local browser storage", count: extensionRegistry.list().length, encrypted: false, note: "Declarative metadata only; no downloaded code." }),
  routines: () => ({ label: "Scheduled routine reminders", location: "Local browser storage and Android alarm records", count: routineScheduler.list().length, encrypted: false, note: "Reminders only; workflow actions never run unattended." }),
  memory_sync: () => ({ label: "Cloud memory sync", location: "Supabase", count: memorySync.status().records.length, encrypted: true, syncEnabled: memorySync.status().enabled, note: "Only individually selected memories are uploaded." }),
  protected_memory: () => ({ label: "Protected memories", location: nativeSecureStorage.isAvailable() ? "Android Keystore-backed encrypted storage" : "Unavailable on this platform", count: null, encrypted: nativeSecureStorage.isAvailable(), note: "Protected memory is Android-only and never falls back to browser storage." }),
  auth_session: () => ({ label: "Android sign-in session", location: nativeSecureStorage.isAvailable() ? "Android Keystore-backed encrypted storage" : "Browser session storage", count: null, encrypted: nativeSecureStorage.isAvailable(), note: "This inventory never reads or displays session contents." })
});
const specialists = createAuroraSpecialistCoordinator({ maxParallel: 3 });
const reliability = createAuroraReliabilityCoordinator({ events: auroraEvents, taskJournal: auroraTaskJournal });
const environmentMonitor = createAuroraEnvironmentMonitor({ events: auroraEvents });
const interactionInterruptions = createAuroraInteractionInterruptionCoordinator({ events: auroraEvents, initiallyBackground: reliability.getStatus().visibility === "background" });
const surfaceGateway = createAuroraSurfaceGateway({ routeMessage, events: auroraEvents });
specialists.register({ id: "context_intelligence", label: "Context and research", description: "Uses AURORA existing context, journey, weather and research tools.", matches: (text) => /weather|forecast|journey|trip|travel|traffic|road|news|research|where am i|my location|have i been|did i visit/i.test(text), run: async (text) => runAuroraToolTree(text) });
actionEngine.subscribe((event) => auroraEvents.publish("action." + event.type.replace(/^action\./, ""), event, { source: "action_engine" }));
taskOrchestrator.subscribe((event) => {
  try { auroraTaskJournal.record(event); }
  catch (error) {
    auroraEvents.publish("task.journal_persistence_failed", { taskId: event.taskId || event.result?.taskId || null, code: typeof error?.code === "string" ? error.code.slice(0, 80) : "JOURNAL_WRITE_FAILED" }, { source: "task_journal" });
  }
  auroraEvents.publish(event.type, event, { source: "task_orchestrator" });
});
let latestPendingTaskId = null;

actionEngine.registerCapability({
  id: "memory.save",
  label: "Save a memory",
  category: "memory",
  description: "Save a user-requested note or fact to AURORA's local-first memory.",
  risk: "low",
  approvalRequired: false,
  validate: (input) => typeof input?.content === "string" && input.content.trim().length > 0,
  execute: (input) => { const record = auroraMemory.remember({ kind: input.kind || "fact", title: input.title || "Saved memory", content: input.content, tags: input.tags || [], source: "explicit_user_request" }); try { auroraKnowledge.addNode({ id: "memory-" + record.id, type: "memory", label: record.title, description: record.content, tags: record.tags }); } catch { /* memory remains available if graph storage is unavailable */ } auroraEvents.publish("memory.saved", { id: record.id, title: record.title }, { source: "memory" }); return record; }
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
  execute: (input) => { const deleted = auroraMemory.forget(input.id); if (deleted && !auroraMemory.list().some((item) => item.title === input.title)) auroraKnowledge.removeNode("memory-" + input.id); auroraEvents.publish("memory.forgotten", { id: input.id }, { source: "memory" }); return { deleted }; }
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

  const reminderMatch = message.match(/^remind me to (.{2,180}) in (\d{1,5})\s*(minutes?|mins?|hours?|hrs?|days?)$/i);
  if (reminderMatch) {
    const amount = Number(reminderMatch[2]);
    const unit = reminderMatch[3].toLowerCase();
    const multiplier = /^m/.test(unit) ? 60000 : /^h/.test(unit) ? 3600000 : 86400000;
    const at = Date.now() + amount * multiplier;
    if (!Number.isSafeInteger(amount) || amount < 1 || at > Date.now() + 31536000000) return { tool: "aurora_reminder", context: "Choose a reminder between 1 minute and 365 days from now." };
    pendingReminder = { id: "reminder-" + (globalThis.crypto?.randomUUID?.() || Date.now().toString(36)), title: reminderMatch[1].trim(), message: "It's time to: " + reminderMatch[1].trim(), at };
    return { tool: "aurora_reminder_preview", reminder: pendingReminder, context: "Reminder preview: “" + pendingReminder.title + "” at " + new Date(at).toLocaleString() + ". Nothing is scheduled yet. Say confirm reminder " + pendingReminder.id + " to schedule it, or cancel reminder " + pendingReminder.id + "." };
  }
  const confirmReminder = message.match(/^confirm reminder ([a-zA-Z0-9_.-]{4,100})$/i);
  if (confirmReminder) {
    if (!pendingReminder || confirmReminder[1] !== pendingReminder.id) return { tool: "aurora_reminder", context: "That is not the current pending reminder. Prepare it again so you can review it." };
    try {
      const permission = await auroraReminder.requestPermission();
      if (!permission?.granted) return { tool: "aurora_reminder", context: "Notification permission is needed before AURORA can schedule a reminder." };
      const scheduled = await auroraReminder.schedule(pendingReminder);
      pendingReminder = null;
      return { tool: "aurora_reminder_scheduled", reminder: scheduled, context: "Reminder scheduled by Android. Android may deliver it a little later than the requested time because this uses a battery-friendly, inexact alarm." };
    } catch (error) { return { tool: "aurora_reminder", context: error?.message || "Android could not schedule the reminder." }; }
  }
  const cancelReminder = message.match(/^cancel reminder ([a-zA-Z0-9_.-]{4,100})$/i);
  if (cancelReminder) {
    if (pendingReminder && cancelReminder[1] === pendingReminder.id) {
      pendingReminder = null;
      return { tool: "aurora_reminder_cancelled", context: "Pending reminder discarded. Nothing was scheduled." };
    }
    try {
      const result = await auroraReminder.cancel(cancelReminder[1]);
      return { tool: "aurora_reminder_cancelled", result, context: result.cancelled ? "That scheduled reminder was cancelled." : "No scheduled reminder with that ID was found." };
    } catch (error) { return { tool: "aurora_reminder", context: error?.message || "The reminder could not be cancelled." }; }
  }
  const scheduleRoutineMatch = message.match(/^schedule routine ["“]?(.+?)["”]? in (\d{1,5})\s*(minutes?|mins?|hours?|hrs?|days?)$/i);
  if (scheduleRoutineMatch) {
    const title = scheduleRoutineMatch[1].trim();
    const workflow = auroraWorkflows.list().find(item => item.title.toLowerCase() === title.toLowerCase());
    if (!workflow) return { tool: "aurora_routine", context: "I could not find a saved workflow named “" + title + "”. Save the workflow first, then schedule it. Saved workflows: " + (auroraWorkflows.list().map(item => item.title).join(", ") || "none") };
    const amount = Number(scheduleRoutineMatch[2]);
    const unit = scheduleRoutineMatch[3].toLowerCase();
    const multiplier = /^m/.test(unit) ? 60000 : /^h/.test(unit) ? 3600000 : 86400000;
    const at = Date.now() + amount * multiplier;
    if (!Number.isSafeInteger(amount) || amount < 1 || at > Date.now() + 31536000000) return { tool: "aurora_routine", context: "Choose a routine reminder between 1 minute and 365 days from now." };
    pendingRoutine = { id: "routine-" + (globalThis.crypto?.randomUUID?.() || Date.now().toString(36)), workflowId: workflow.id, title: workflow.title, at };
    return { tool: "aurora_routine_preview", routine: pendingRoutine, context: "Routine reminder preview: “" + workflow.title + "” at " + new Date(at).toLocaleString() + ". When it is due, AURORA will notify you; it will not run any steps in the background. Say confirm routine " + pendingRoutine.id + " to schedule it, or cancel routine " + pendingRoutine.id + " to discard it." };
  }
  const confirmRoutine = message.match(/^confirm routine ([a-zA-Z0-9_.-]{4,100})$/i);
  if (confirmRoutine) {
    if (!pendingRoutine || confirmRoutine[1] !== pendingRoutine.id) return { tool: "aurora_routine", context: "That is not the current routine preview. Prepare it again so you can review it." };
    try {
      const saved = await routineScheduler.schedule({ ...pendingRoutine, approved: true });
      pendingRoutine = null;
      return { tool: "aurora_routine_scheduled", routine: saved, context: "Routine reminder scheduled. When it is due, AURORA will notify you to review the saved workflow. You must prepare and approve a fresh task plan before any actions run." };
    } catch (error) { return { tool: "aurora_routine", context: error?.message || "The routine reminder could not be scheduled." }; }
  }
  const cancelRoutine = message.match(/^cancel routine ([a-zA-Z0-9_.-]{4,100})$/i);
  if (cancelRoutine) {
    if (pendingRoutine && cancelRoutine[1] === pendingRoutine.id) { pendingRoutine = null; return { tool: "aurora_routine_cancelled", context: "Routine preview discarded. Nothing was scheduled." }; }
    try { const result = await routineScheduler.cancel(cancelRoutine[1]); return { tool: "aurora_routine_cancelled", result, context: result.cancelled ? "That routine reminder was cancelled." : "No scheduled routine with that ID was found." }; }
    catch (error) { return { tool: "aurora_routine", context: error?.message || "The routine could not be cancelled." }; }
  }
  if (/^(?:show|list) (?:my )?scheduled routines\??$/i.test(message)) {
    const items = routineScheduler.list();
    return { tool: "aurora_routines", routines: items, context: items.length ? "Scheduled routines (reminders only):\n" + items.map(item => "- " + item.title + " — " + new Date(item.at).toLocaleString() + " (" + item.status + ") [ID: " + item.id + "]").join("\n") : "You have no scheduled AURORA routines." };
  }
  if (/^(?:show|list) (?:my )?(?:scheduled )?reminders\??$/i.test(message)) {
    try {
      const result = await auroraReminder.list();
      return { tool: "aurora_reminders", reminders: result.items, context: result.items.length
        ? "Your scheduled reminders:\n" + result.items.map(item => "- " + item.title + " — " + new Date(item.at).toLocaleString() + " [ID: " + item.id + "]").join("\n")
        : "You have no scheduled AURORA reminders." };
    } catch (error) { return { tool: "aurora_reminders", context: error?.message || "Scheduled reminders are unavailable." }; }
  }

  if (/^prepare memory sync\??$/i.test(message)) {
    if (!supabaseMemoryAdapter.isConfigured()) return { tool: "aurora_memory_sync", context: "Supabase memory sync is not configured in this build." };
    if (!(await hasSignedInSupabaseSession())) return { tool: "aurora_memory_sync", context: "Sign in to AURORA first. No memory data has been uploaded." };
    return { tool: "aurora_memory_sync_preview", context: "Memory sync will use your signed-in Supabase account, protected by per-user database policies. Only individual memories you explicitly choose to sync will be uploaded; there is no bulk upload. Say “confirm enable memory sync” to turn on the per-record sync controls." };
  }
  if (/^confirm enable memory sync$/i.test(message)) {
    if (!supabaseMemoryAdapter.isConfigured()) return { tool: "aurora_memory_sync", context: "Supabase memory sync is not configured in this build." };
    try {
      if (!(await hasSignedInSupabaseSession())) return { tool: "aurora_memory_sync", context: "Sign in to AURORA first. No memory data has been uploaded." };
      auroraConsents.grant({ scope: "memory.cloud_sync", source: "supabase", purpose: "Allow individually selected AURORA memories to sync to this signed-in account." });
      const status = memorySync.configure({ enabled: true, adapter: supabaseMemoryAdapter, consent: true });
      return { tool: "aurora_memory_sync_enabled", status, context: "Memory sync is enabled. Existing memories were not uploaded. To sync one, say “sync memory” followed by its memory ID." };
    } catch (error) { return { tool: "aurora_memory_sync", context: error?.message || "Memory sync could not be enabled." }; }
  }
  if (/^disable memory sync$/i.test(message)) {
    memorySync.disable();
    auroraConsents.revoke("memory.cloud_sync", "supabase");
    return { tool: "aurora_memory_sync_disabled", context: "Memory sync is disabled. Local memories remain on this device." };
  }
  const syncMemoryMatch = message.match(/^sync memory ([a-zA-Z0-9_.-]{4,100})$/i);
  if (syncMemoryMatch) {
    try {
      auroraConsents.requireGrant("memory.cloud_sync", "supabase");
      const result = await memorySync.syncOne(syncMemoryMatch[1], { conflict: "keep_local" });
      return { tool: "aurora_memory_sync_result", result, context: result.synced ? "That selected memory was synced to your account." : (result.reason || "The memory was not synced.") };
    } catch (error) { return { tool: "aurora_memory_sync", context: error?.message || "The memory was not synced." }; }
  }

  const universalMatch = message.match(/^(?:search everything|search all|universal search) for (.+)$/i);
  if (universalMatch) {
    const results = await universalSearch.search(universalMatch[1], { limit: 15 });
    return { tool: "aurora_universal_search", results, context: results.length
      ? "I searched AURORA's connected local indexes. Results are read-only; nothing was opened, changed or executed. " + results.map(item => "[" + item.sourceLabel + "] " + item.title + (item.summary ? ": " + item.summary : "")).join(" | ")
      : "No matching records were found in AURORA's currently registered local search indexes." };
  }
  if (/^(?:show|list|inspect) (?:my )?(?:aurora )?(?:data inventory|storage report|stored data)\\??$/i.test(message) || /^what data does aurora store\\??$/i.test(message)) {
    const report = dataInventory.inspect();
    return { tool: "aurora_data_inventory", inventory: report, context: "AURORA data inventory (counts only; no private record contents are exposed): " + report.stores.map(item => item.label + ": " + (item.count == null ? "unknown count" : item.count) + " (" + item.location + (item.encrypted ? ", encrypted" : ", not encrypted") + (item.syncEnabled ? ", cloud sync enabled" : "") + ")").join("; ") + ". Total known records: " + report.totals.knownRecords + ". This report does not delete or upload anything." };
  }
  if (/^prepare location access\\??$/i.test(message)) {
    return { tool: "aurora_location_consent_preview", context: "AURORA can read one last-known device location only when you explicitly approve this request. It will report timestamp, estimated accuracy and freshness. No background tracking or location storage will be enabled. Say “confirm location access” to grant this scoped permission; Android will still ask for its separate location permission." };
  }
  if (/^confirm location access$/i.test(message)) {
    auroraConsents.grant({ scope: "location.current", source: "android", purpose: "Allow AURORA to read the device's last-known location only when explicitly requested." });
    return { tool: "aurora_location_consent_enabled", context: "Scoped current-location consent is enabled. AURORA will still require Android location permission and fresh approval for each location read. No background tracking is enabled." };
  }
  if (/^(?:show|list) (?:my )?(?:privacy settings|consents|data permissions)\??$/i.test(message)) {
    const grants = auroraConsents.list();
    return { tool: "aurora_privacy_controls", consents: grants, context: grants.length
      ? "Explicitly granted data permissions: " + grants.map(item => item.scope + " from " + item.source).join("; ")
      : "No scoped data-sharing grants are currently recorded. AURORA uses default-deny for registered context scopes." };
  }
  if (/^(?:show|list) (?:my )?(?:extensions|installed extensions)\??$/i.test(message)) {
    const items = extensionRegistry.list();
    return { tool: "aurora_extensions", extensions: items, context: items.length
      ? "Installed declarative extensions (metadata only): " + items.map(item => item.name + " " + item.version + " — " + item.capabilities.join(", ")).join("; ")
      : "No extensions are installed. AURORA currently supports metadata-only extension registration; it does not execute downloaded extension code." };
  }

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

  const saveWorkflowMatch = message.match(/^save this as (?:a )?workflow(?: called| named)? (.+)$/i);
  if (saveWorkflowMatch && latestPendingTaskId) {
    const pending = taskOrchestrator.getPlan(latestPendingTaskId);
    if (!pending) return { tool: "aurora_workflow", context: "There is no pending plan to save." };
    const saved = auroraWorkflows.save({ title: saveWorkflowMatch[1].trim(), summary: pending.summary, steps: pending.steps }, actionEngine.listCapabilities());
    return { tool: "aurora_workflow_saved", workflowId: saved.id, context: "Saved workflow “" + saved.title + "”. It will still ask for confirmation every time you run it." };
  }

  const runWorkflowMatch = message.match(/^(?:prepare|run|start) workflow (.+)$/i);
  if (runWorkflowMatch) {
    const query = runWorkflowMatch[1].trim().toLowerCase();
    const matches = auroraWorkflows.list().filter((item) => item.title.toLowerCase() === query || item.title.toLowerCase().includes(query));
    if (matches.length !== 1) return { tool: "aurora_workflow", context: matches.length ? "I found multiple workflows: " + matches.map(item => item.title).join(", ") + ". Please specify one." : "I couldn't find that saved workflow." };
    const plan = auroraWorkflows.instantiate(matches[0].id, actionEngine.listCapabilities(), taskOrchestrator);
    latestPendingTaskId = plan.id;
    const preview = await taskOrchestrator.runPlan(plan, { confirmed: false });
    return { tool: "aurora_workflow_preview", taskId: plan.id, steps: preview.steps, context: "Workflow “" + matches[0].title + "” is ready. Nothing has run. Review the steps, then say confirm task " + plan.id + " or cancel task " + plan.id + "." };
  }

  const capabilityMatch = message.match(/^(?:what|show|list|find) (?:are )?(?:my |aurora )?(?:available )?(?:tools|capabilities)(?: for)?(?: (.+))?\??$/i);
  if (capabilityMatch) {
    const matches = capabilityMatch[1] ? capabilityIntelligence.find(capabilityMatch[1], 10) : capabilityIntelligence.inspect();
    return { tool: "aurora_capability_discovery", capabilities: matches, context: matches.length ? "Registered AURORA capabilities (read-only discovery):\n" + matches.map(item => "- " + item.label + " [" + item.id + ", " + item.risk + (item.approvalRequired ? ", approval required" : "") + "]").join("\n") : "I couldn't find a registered capability matching that request. I cannot invent tools or bypass their approval requirements." };
  }

  const recoveryMatch = message.match(/^(?:show|list|review) (?:my )?(?:interrupted|recoverable|recent) tasks\??$/i);
  if (recoveryMatch) {
    const items = auroraTaskJournal.recoverable();
    return { tool: "aurora_task_recovery", tasks: items, context: items.length ? "Recoverable task records are available. Review the saved plan and prepare it again; every recovered plan requires fresh confirmation before anything runs.\n" + items.map(item => "- " + item.title + " [" + item.status + "] — " + item.taskId).join("\n") : "There are no interrupted or recoverable task plans in the local journal." };
  }

  const knowledgeMatch = message.match(/^(?:search|find) (?:my )?(?:knowledge graph|knowledge) for (.+)$/i);
  if (knowledgeMatch) {
    const matches = auroraKnowledge.search(knowledgeMatch[1], 10);
    return { tool: "aurora_knowledge_search", context: matches.length ? "Related saved knowledge:\n" + matches.map(item => "- " + item.label + " (" + item.type + "): " + item.description).join("\n") : "No matching knowledge records were found." };
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

  if (/^(?:where am i|where am i right now|my current location)$/i.test(message)) {
    const receipt = await actionEngine.execute({ capabilityId: "location.get_current", input: {} });
    const result = receipt?.result || {};
    if (receipt?.status !== "completed") return { tool: "aurora_current_location", receipt, context: receipt?.message || "AURORA could not read the current device location. Check permission and location settings." };
    return { tool: "aurora_current_location", receipt, context: "AURORA read the device's last-known location. Coordinates: " + result.latitude + ", " + result.longitude + ". Estimated accuracy: " + (result.accuracyMeters >= 0 ? Math.round(result.accuracyMeters) + " metres" : "not reported") + ". Fix age: " + Math.round(result.ageMs / 1000) + " seconds. " + (result.fresh ? "This fix is recent." : "This fix may be stale; do not treat it as live GPS.") + " No background tracking or location storage was performed." };
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

  const coordinated = await specialists.coordinate(message);
  const specialistResult = coordinated.results.find((item) => item.status === "completed" && item.result);
  if (specialistResult) return specialistResult.result;
  const receipt = await actionEngine.execute({ capabilityId: "assistant.route_request", input: { text: message } });
  if (receipt.status !== "completed") return { error: receipt.error?.message || "AURORA could not route that request." };
  return receipt.result || null;
}

const auroraRuntime = Object.freeze({
  layers: auroraLayerRegistry,
  actions: actionEngine,
  approvals: approvalBroker,
  tasks: taskOrchestrator,
  taskJournal: auroraTaskJournal,
  reliability,
  environment: environmentMonitor,
  diagnostics: () => reliability.getDiagnostics(),
  cancelTask: (taskId) => taskOrchestrator.cancelPlan(taskId),
  memorySync,
  capabilityIntelligence,
  consents: auroraConsents,
  universalSearch,
  extensions: extensionRegistry,
  dataInventory,
  executeExtension: (extensionId, capabilityId, input) => extensionRegistry.execute(extensionId, capabilityId, input),
  secureStorage,
  protectedMemory,
  reminders: auroraReminder,
  routines: routineScheduler,
  memory: auroraMemory,
  knowledge: auroraKnowledge,
  events: auroraEvents,
  specialists,
  specialistHealth: (id) => id ? specialists.getHealth(id) : specialists.health(),
  workflows: auroraWorkflows,
  saveWorkflow: (input) => auroraWorkflows.save(input, actionEngine.listCapabilities()),
  prepareWorkflow: (workflowId) => { const plan = auroraWorkflows.instantiate(workflowId, actionEngine.listCapabilities(), taskOrchestrator); latestPendingTaskId = plan.id; return taskOrchestrator.runPlan(plan, { confirmed: false }); },
  createTaskPlan: (plan) => taskOrchestrator.createPlan(plan),
  runTaskPlan: (planOrId, options) => taskOrchestrator.runPlan(planOrId, options),
  retryFailedTaskStep: (taskId, stepId, options) => taskOrchestrator.retryFailedStep(taskId, stepId, options),
  capabilities: () => actionEngine.listCapabilities(),
  availability: (capabilityId) => actionEngine.getAvailability(capabilityId),
  inspectCapabilities: () => capabilityIntelligence.inspect(),
  findCapabilities: (query, limit) => capabilityIntelligence.find(query, limit),
  recoverableTasks: () => auroraTaskJournal.recoverable(),
  inspectRecoveryTask: (taskId) => reliability.inspectRecoveryTask(taskId),
  dismissRecoveryTask: (taskId) => reliability.dismissRecoveryTask(taskId),
  execute: (request) => actionEngine.execute(request),
  routeMessage,
  surfaces: surfaceGateway,
  parseCalendarIntent,
  subscribe: (listener) => actionEngine.subscribe(listener),
  subscribeApprovals: (listener) => approvalBroker.subscribe(listener)
});

export { auroraRuntime };
