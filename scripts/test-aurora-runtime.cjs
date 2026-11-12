const assert = require("node:assert/strict");
const { runTask, normalizeModelDecision, hasExactApproval } = require("../lib/aurora-runtime.cjs");

async function main() {
  assert.deepEqual(normalizeModelDecision({ type: "final", text: "done" }), { type: "final", text: "done" });
  assert.throws(() => normalizeModelDecision({ type: "tool_call", name: "unknown", arguments: {} }));
  assert.equal(hasExactApproval(
    { name: "device_action", arguments: { action: "open_app", app: "WhatsApp" } },
    [{ name: "device_action", arguments: { action: "open_app", app: "WhatsApp" } }]
  ), true);
  assert.equal(hasExactApproval(
    { name: "device_action", arguments: { action: "open_app", app: "WhatsApp" } },
    [{ name: "device_action", arguments: { action: "open_app", app: "Settings" } }]
  ), false);

  let calls = 0;
  const result = await runTask({
    messages: [{ role: "user", content: "Calculate 2 + 3 and explain the result." }],
    allowedTools: ["calculator"],
    modelAdapter: async ({ messages }) => {
      calls += 1;
      if (calls === 1) return { type: "tool_call", name: "calculator", arguments: { expression: "2 + 3" } };
      assert.ok(messages.some((message) => message.content.includes('"result":5')));
      return { type: "final", text: "2 + 3 = 5." };
    }
  });
  assert.equal(result.ok, true);
  assert.equal(result.status, "completed");
  assert.equal(result.reply, "2 + 3 = 5.");
  assert.equal(result.trace.filter((entry) => entry.type === "tool_result").length, 1);

  let deviceCalls = 0;
  const denied = await runTask({
    messages: [{ role: "user", content: "Open WhatsApp." }],
    allowedTools: ["device_action"],
    adapters: { device_action: async () => { deviceCalls += 1; return { opened: true }; } },
    modelAdapter: async () => ({ type: "tool_call", name: "device_action", arguments: { action: "open_app", app: "WhatsApp" } }),
    maxSteps: 1
  });
  assert.equal(denied.status, "step_limit_reached");
  assert.equal(deviceCalls, 0);
  assert.ok(denied.trace.some((entry) => entry.type === "tool_error" && entry.code === "CONFIRMATION_REQUIRED"));

  const limited = await runTask({
    messages: [{ role: "user", content: "Keep working." }],
    allowedTools: [],
    maxSteps: 2,
    modelAdapter: async () => ({ type: "tool_call", name: "calculator", arguments: { expression: "1+1" } })
  });
  assert.equal(limited.status, "step_limit_reached");
  assert.equal(limited.steps, 2);

  console.log("AURORA Runtime tests passed: bounded loop, structured decisions, real tool feedback, and action authorization.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
