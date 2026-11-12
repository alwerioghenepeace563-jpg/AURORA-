const assert = require("node:assert/strict");

async function main() {
  const { createAuroraSurfaceGateway } = await import("../src/core/aurora-surface-gateway.js");
  const published = [];
  const events = { publish: (type, payload, metadata) => published.push({ type, payload, metadata }) };
  const calls = [];
  const gateway = createAuroraSurfaceGateway({
    routeMessage: async (text) => { calls.push(text); return { context: "shared result" }; },
    events
  });

  assert.deepEqual(gateway.supportedSurfaces(), ["main_chat", "pulse", "voice"]);
  for (const surface of gateway.supportedSurfaces()) {
    const result = await gateway.route("Open my calendar", { surface, requestId: "test-" + surface });
    assert.equal(result.context, "shared result");
  }
  assert.equal(calls.length, 3);
  assert.equal(published.filter((event) => event.type === "surface.request.started").length, 3);
  assert.equal(published.filter((event) => event.type === "surface.request.completed").length, 3);
  assert.ok(published.every((event) => !JSON.stringify(event.payload).includes("Open my calendar")));

  assert.equal((await gateway.route(" ", { surface: "pulse" })).code, "EMPTY_MESSAGE");
  assert.equal((await gateway.route("test", { surface: "unknown" })).code, "UNKNOWN_SURFACE");
  assert.equal((await gateway.route("x".repeat(12001))).code, "MESSAGE_TOO_LONG");

  const failing = createAuroraSurfaceGateway({
    routeMessage: async () => { throw Object.assign(new Error("route unavailable"), { code: "OFFLINE" }); },
    events
  });
  const failure = await failing.route("Hello", { surface: "voice" });
  assert.equal(failure.code, "OFFLINE");
  assert.ok(published.some((event) => event.type === "surface.request.failed" && event.payload.code === "OFFLINE"));

  console.log("AURORA surface gateway tests passed: shared routing, surface validation, bounded input, privacy-safe events and failure normalization.");
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
