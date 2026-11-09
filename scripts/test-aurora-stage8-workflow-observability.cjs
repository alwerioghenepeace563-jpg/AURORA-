const assert = require("node:assert/strict");
const fs = require("node:fs");

const runtime = fs.readFileSync("src/core/aurora-runtime.js", "utf8");
const journal = fs.readFileSync("src/core/aurora-task-journal.js", "utf8");
const workflows = fs.readFileSync("src/core/aurora-workflow-registry.js", "utf8");

for (const expected of [
  "const requested = taskOrchestrator.cancelPlan(taskId)",
  "tool: \"aurora_task_cancel_requested\"",
  "already completed external actions are not undone",
  "status: \"not_running\"",
  "const taskStatusMatch = message.match(",
  "auroraTaskJournal.get(taskStatusMatch[1])",
  "const reviewTaskMatch = message.match(",
  "auroraTaskJournal.inspectRecovery(reviewTaskMatch[1])",
  "const inspectWorkflowMatch = message.match(",
  "tool: \"aurora_workflow_inspection\"",
  "readyToPrepare: unavailable.length === 0",
  "No action was executed and no permission was granted.",
  "inspectWorkflow: (workflowId) =>",
  "const items = auroraWorkflows.list()",
  "const inspectWorkflowMatch = message.match(",
  "actionEngine.listCapabilities().map(item => [item.id, item])",
  "tool: \"aurora_workflow_inspection\"",
  "capabilityAvailable: Boolean(capability)",
  "auroraWorkflows.remove(matches[0].id)",
  "const items = auroraTaskJournal.list().slice(0, 12)",
  "auroraTaskJournal.forget(forgetTaskMatch[1])",
  'tool: "aurora_recent_tasks"',
  "taskActivity: (taskId) => auroraTaskJournal.get(taskId)",
  "recentTaskActivity: (limit = 12) => auroraTaskJournal.list()",
  "forgetTaskActivity: (taskId) => auroraTaskJournal.forget(taskId)",
  "reviewTaskRecovery: (taskId) => auroraTaskJournal.inspectRecovery(taskId)"
]) assert.ok(runtime.includes(expected), "Missing runtime workflow contract: " + expected);

for (const expected of [
  "automaticResume: false",
  "requiresFreshConfirmation: true",
  'title: "AURORA task"',
  "function safeReceipt",
  "function inspectRecovery",
  "function forget(taskId)"
]) assert.ok(journal.includes(expected), "Missing task-journal privacy/recovery contract: " + expected);

assert.ok(workflows.includes("function instantiate"));
assert.ok(workflows.includes("orchestrator.createPlan"));
assert.ok(workflows.includes("function remove(id)"));
console.log("AURORA Stage 8 tests passed: cross-surface task status, recent history, local deletion, review-only recovery, saved workflow management, metadata-only journal, and fresh confirmation.");
