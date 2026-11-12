const assert = require("node:assert/strict");
(async () => {
  const { connectAuroraNativeLifecycle } = await import("../src/core/aurora-native-lifecycle.js");
  let callback, removed = 0;
  const app = { addListener: (name, fn) => { assert.equal(name, "appStateChange"); callback = fn; return Promise.resolve({ remove: () => { removed++; } }); } };
  const events = [];
  const reliability = {
    publishLifecycle: (type, details) => events.push({ type, details }),
    getStatus: () => ({ recoverableCount: 2, automaticRecovery: false })
  };
  const dispose = connectAuroraNativeLifecycle(app, reliability);
  callback({ isActive: false });
  callback({ isActive: true });
  assert.deepEqual(events.map(x => x.type), ["background", "foreground", "resume"]);
  assert.equal(events[2].details.recoverableCount, 2);
  assert.equal(events[2].details.automaticRecovery, false);
  assert.equal(dispose(), true);
  await Promise.resolve();
  assert.equal(removed, 1);
  callback({ isActive: true });
  assert.equal(events.length, 3);
  assert.equal(dispose(), false);
  console.log("AURORA native lifecycle tests passed: background, resume, review-only recovery and cleanup.");
})().catch(error => { console.error(error); process.exitCode = 1; });
