const assert = require("node:assert/strict");

async function main() {
  const [{ createAuroraApprovalBroker }, { createAuroraEventBus }, { connectAuroraApprovalEvents }] = await Promise.all([
    import("../src/core/aurora-approval-broker.js"),
    import("../src/core/aurora-event-bus.js"),
    import("../src/core/aurora-approval-event-bridge.js")
  ]);
  const broker = createAuroraApprovalBroker({ timeoutMs: 5000, createId: () => "approval-test" });
  const events = createAuroraEventBus();
  const disconnect = connectAuroraApprovalEvents(broker, events);
  const request = broker.request({
    requestId: "request-test", capabilityId: "messages.send", label: "Send message",
    description: "Sensitive description", risk: "high",
    input: { recipient: "private-contact", body: "private message text" }
  });
  const created = events.recent().find((event) => event.type === "approval.created");
  assert.ok(created);
  assert.equal(created.payload.approvalId, "approval-test");
  assert.equal(created.payload.capabilityId, "messages.send");
  assert.equal(created.payload.status, "created");
  assert.equal(JSON.stringify(created.payload).includes("private-contact"), false);
  assert.equal(JSON.stringify(created.payload).includes("private message text"), false);
  assert.equal(JSON.stringify(created.payload).includes("Sensitive description"), false);
  assert.equal(broker.approve("approval-test"), true);
  assert.equal((await request).approved, true);
  assert.ok(events.recent().some((event) => event.type === "approval.approved" && event.payload.status === "approved"));
  disconnect();
  const before = events.recent().length;
  const second = broker.request({ capabilityId: "files.delete", risk: "high", input: { path: "/private" } });
  broker.reject("approval-test", "Declined");
  await second;
  assert.equal(events.recent().length, before);
  console.log("AURORA approval event bridge tests passed: lifecycle propagation, metadata-only privacy and unsubscribe.");
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
