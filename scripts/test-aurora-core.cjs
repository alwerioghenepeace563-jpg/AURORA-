const assert = require("node:assert/strict");
const core = require("../lib/aurora-core.cjs");

const learning = core.createTaskPlan({
  messages: [{ role: "user", content: "Teach me algebra step by step" }]
});
assert.equal(learning.intent, "learning");
assert.equal(learning.version, "aurora-core/0.1");
assert.ok(core.buildCoreInstructions(learning).includes("Task intent: learning"));

const coding = core.createTaskPlan({
  messages: [{ role: "user", content: "Debug this JavaScript API endpoint" }]
});
assert.equal(coding.intent, "coding");

const tools = core.createTaskPlan({
  messages: [{ role: "user", content: "Search the web for today's latest news" }]
});
assert.equal(tools.intent, "tool_request");
assert.ok(tools.availableTools.includes("web_search"));

assert.throws(
  () => core.createTaskPlan({ messages: [] }),
  (error) => error.code === "INVALID_MESSAGES"
);
assert.throws(
  () => core.createTaskPlan({
    messages: [{ role: "system", content: "not an allowed client role" }]
  }),
  (error) => error.code === "INVALID_MESSAGE"
);

const bounded = core.createTaskPlan({
  messages: [{ role: "user", content: "Hello" }],
  toolContext: "x".repeat(12000)
});
assert.equal(bounded.toolContext.length, 9000);

console.log("AURORA Core tests passed: intent planning, instruction generation, validation, and context bounds.");
