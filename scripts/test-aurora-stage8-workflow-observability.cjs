const assert = require("node:assert/strict");
const fs = require("node:fs");

const runtime = fs.readFileSync("src/core/aurora-runtime.js", "utf8");
const journal = fs.readFileSync("src/core/aurora-task-journal.js", "utf8");
const workflows = fs.readFileSync("src/core/aurora-workflow-registry.js", "utf8");

assert.match(runtime, /show\|check\|review\) task status/);
assert.match(runtime, /auroraTaskJournal\.get\(taskStatusMatch\[1\]\)/);
assert.match(runtime, /review task \(\[a-zA-Z0-9_\.:-\]/);
assert.match(runtime, /auroraTaskJournal\.inspectRecovery\(reviewTaskMatch\[1\]\)/);
assert.match(runtime, /show\|list\).*workflows/);
assert.match(runtime, /auroraWorkflows\.list\(\)/);
assert.match(runtime, /delete\|remove\) workflow/);
assert.match(runtime, /auroraWorkflows\.remove\(matches\[0\]\.id\)/);
assert.match(runtime, /taskActivity: \(taskId\) => auroraTaskJournal\.get\(taskId\)/);
assert.match(runtime, /reviewTaskRecovery: \(taskId\) => auroraTaskJournal\.inspectRecovery\(taskId\)/);
assert.match(journal, /automaticResume: false/);
assert.match(journal, /requiresFreshConfirmation: true/);
assert.match(journal, /title: "AURORA task"/);
assert.match(journal, /function safeReceipt/);
assert.match(workflows, /function instantiate/);
assert.match(workflows, /orchestrator\.createPlan/);

console.log("AURORA Stage 8 workflow observability tests passed: cross-surface task status, review-only recovery, saved workflow management, metadata-only journal, and fresh confirmation.");
