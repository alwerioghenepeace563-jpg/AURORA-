const assert = require("node:assert/strict");

(async () => {
  const { createAuroraActionEngine } = await import("../src/core/aurora-action-engine.js");
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
  console.log("AURORA action contract tests passed: fail-closed permission/consent gates, verified completion, and registration validation.");
})().catch((error) => { console.error(error); process.exitCode = 1; });
