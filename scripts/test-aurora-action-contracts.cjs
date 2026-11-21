const assert = require("node:assert/strict");

(async () => {
  const { createAuroraActionEngine } = await import("../src/core/aurora-action-engine.js");
  const fs = require("node:fs");
  const path = require("node:path");
  const runtimeSource = fs.readFileSync(path.resolve(__dirname, "../src/core/aurora-capability-runtime.js"), "utf8");
  const nativeSource = fs.readFileSync(path.resolve(__dirname, "../src/lib/aurora-native.ts"), "utf8");
  const androidSource = fs.readFileSync(path.resolve(__dirname, "../android/app/src/main/java/com/aurora/assistant/AuroraAssistantPlugin.java"), "utf8");
  assert.match(runtimeSource, /id: "device\.set_flashlight"[\s\S]*?approvalRequired: true[\s\S]*?permissionRequirements: \["android\.camera"\][\s\S]*?typeof input\?\.enabled === "boolean"[\s\S]*?verified: true/);
  assert.match(nativeSource, /setFlashlight\(enabled: boolean\)/);
  assert.match(androidSource, /public void setFlashlight\(PluginCall call\)[\s\S]*?manager\.setTorchMode\(selected, enabled\)/);
  assert.match(androidSource, /private void cameraPermissionCallback[\s\S]*?PermissionState\.GRANTED/);

  let executions = 0;
  const denied = createAuroraActionEngine();
  denied.registerCapability({
    id: "test.permission_gate", risk: "low",
    permissionRequirements: ["android.contacts"],
    execute: async () => { executions++; return { ok: true }; }
  });
  const noPolicy = await denied.execute({ capabilityId: "test.permission_gate", requestId: "contract-no-policy" });
  assert.equal(noPolicy.status, "rejected");
  assert.equal(noPolicy.error.code, "POLICY_DENIED");
  assert.equal(executions, 0, "Missing permission policy must fail closed.");

  const rejected = createAuroraActionEngine({ authorize: async () => ({ authorized: false, code: "CONSENT_REQUIRED", reason: "Consent missing." }) });
  rejected.registerCapability({ id: "test.consent_gate", consentRequirements: ["screen.read:android"], execute: async () => { executions++; } });
  const noConsent = await rejected.execute({ capabilityId: "test.consent_gate", requestId: "contract-no-consent" });
  assert.equal(noConsent.status, "rejected");
  assert.equal(noConsent.error.code, "CONSENT_REQUIRED");
  assert.equal(executions, 0, "A denied consent gate must prevent execution.");

  const allowed = createAuroraActionEngine({ authorize: async ({ capability, proposal }) => {
    assert.deepEqual(capability.permissionRequirements, ["android.contacts"]);
    assert.equal(proposal.capabilityId, "test.authorized");
    return { authorized: true };
  } });
  allowed.registerCapability({ id: "test.authorized", permissionRequirements: ["android.contacts"], execute: async () => ({ ok: true }) });
  const success = await allowed.execute({ capabilityId: "test.authorized", requestId: "contract-authorized" });
  assert.equal(success.status, "completed");

  const verified = createAuroraActionEngine();
  verified.registerCapability({
    id: "test.verified", verificationRequired: true,
    execute: async () => ({ changed: true }),
    verify: async (result) => result.changed === true
  });
  const verifiedReceipt = await verified.execute({ capabilityId: "test.verified", requestId: "contract-verified" });
  assert.equal(verifiedReceipt.status, "completed");
  assert.equal(verifiedReceipt.verified, true);

  const failedVerification = createAuroraActionEngine();
  failedVerification.registerCapability({
    id: "test.verification_failed",
    execute: async () => ({ changed: false }),
    verify: async () => ({ verified: false, reason: "State did not change." })
  });
  const failedReceipt = await failedVerification.execute({ capabilityId: "test.verification_failed", requestId: "contract-verification-failed" });
  assert.equal(failedReceipt.status, "failed");
  assert.equal(failedReceipt.error.code, "VERIFICATION_FAILED");

  assert.throws(() => verified.registerCapability({ id: "test.missing_verifier", verificationRequired: true, execute: async () => ({}) }), /verification adapter/i);
  assert.throws(() => verified.registerCapability({ id: "test.bad_permissions", permissionRequirements: ["Not A Permission"], execute: async () => ({}) }), /requirements/i);

  const listed = allowed.listCapabilities().find(item => item.id === "test.authorized");
  assert.deepEqual(listed.permissionRequirements, ["android.contacts"]);
  assert.equal(listed.timeoutMs, 15000);
  assert.equal(listed.idempotency, "request-id");
  assert.deepEqual(allowed.getRetryEligibility("test.authorized"), { eligible: false, reason: "adapter_idempotency_not_proven", capabilityId: "test.authorized" });
  assert.throws(() => allowed.registerCapability({ id: "test.retry_without_evidence", retryPolicy: { mode: "idempotent" }, execute: async () => ({}) }), /documented adapter evidence/i);
  allowed.registerCapability({ id: "test.retry_proven", retryPolicy: { mode: "idempotent", evidence: "PUT by stable resource ID with conditional version check." }, execute: async () => ({ ok: true }) });
  assert.equal(allowed.getRetryEligibility("test.retry_proven").eligible, true);
  assert.equal(allowed.getRetryEligibility("test.retry_proven").automaticRetry, false);
  assert.throws(() => allowed.registerCapability({ id: "test.invalid_timeout", timeoutMs: 99, execute: async () => ({}) }), /timeoutMs/i);

  const cancellable = createAuroraActionEngine();
  cancellable.registerCapability({
    id: "test.cancel_action", timeoutMs: 5000,
    execute: async (_input, context) => new Promise(resolve => context.signal.addEventListener("abort", () => resolve({ stopped: true }), { once: true }))
  });
  const pendingCancellation = cancellable.execute({ capabilityId: "test.cancel_action", requestId: "contract-cancel" });
  await new Promise(resolve => setTimeout(resolve, 10));
  assert.equal(cancellable.cancel("contract-cancel"), true);
  const cancelledReceipt = await pendingCancellation;
  assert.equal(cancelledReceipt.status, "failed");
  assert.equal(cancelledReceipt.error.code, "ACTION_CANCELLED");

  async function assertPreflightTimeout(label, configure) {
    const engine = createAuroraActionEngine(configure.engineOptions || {});
    let failureEvents = 0;
    engine.subscribe(event => { if (event.type === "action.failed") failureEvents++; });
    engine.registerCapability({
      id: "test.preflight_" + label,
      timeoutMs: 100,
      ...(configure.capability || {}),
      execute: async () => { throw new Error("Execution must not start after preflight timeout."); }
    });
    const receipt = await engine.execute({ capabilityId: "test.preflight_" + label, requestId: "contract-preflight-" + label });
    assert.equal(receipt.status, "failed", label + " timeout must return a failure receipt.");
    assert.equal(receipt.error.code, "ACTION_TIMEOUT", label + " timeout must preserve ACTION_TIMEOUT.");
    assert.equal(failureEvents, 1, label + " timeout must publish exactly one failure event.");
    assert.equal(engine.getReceipt("contract-preflight-" + label), receipt);
  }

  await assertPreflightTimeout("availability", {
    capability: { availability: () => new Promise(() => {}) }
  });
  await assertPreflightTimeout("validation", {
    capability: { validate: () => new Promise(() => {}) }
  });
  await assertPreflightTimeout("authorization", {
    engineOptions: { authorize: () => new Promise(() => {}) },
    capability: { permissionRequirements: ["android.contacts"] }
  });

  const timed = createAuroraActionEngine();
  timed.registerCapability({
    id: "test.timeout_action", timeoutMs: 100,
    execute: async (_input, context) => new Promise(resolve => context.signal.addEventListener("abort", () => resolve({ stopped: true }), { once: true }))
  });
  const timeoutReceipt = await timed.execute({ capabilityId: "test.timeout_action", requestId: "contract-timeout" });
  assert.equal(timeoutReceipt.status, "failed");
  assert.equal(timeoutReceipt.error.code, "ACTION_TIMEOUT");

  console.log("AURORA action contract tests passed: fail-closed authorization, verifier enforcement, bounded deadlines, cancellation, idempotency, and contract validation.");
})().catch((error) => { console.error(error); process.exitCode = 1; });
