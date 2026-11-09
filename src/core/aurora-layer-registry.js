/**
 * Whole-system layer registry for AURORA's progressive implementation stages.
 * Stage completion records an architecture checkpoint, not production readiness.
 * A layer leaves the active queue only when its final acceptance criteria pass.
 */
const FAMILIES = Object.freeze([
  { id: "android_device", label: "Android and device interaction", owner: "capability-runtime/native bridge", dependsOn: ["shared-runtime", "permission-policy", "action-contracts"] },
  { id: "voice_multimodal", label: "Voice and multimodal interaction", owner: "conversation gateway/native bridge", dependsOn: ["shared-runtime", "provider-routing", "permission-policy"] },
  { id: "screen_accessibility", label: "Screen, accessibility, and notifications", owner: "native accessibility/notification services", dependsOn: ["shared-runtime", "consent-policy", "permission-policy", "data-inventory"] },
  { id: "communication_people", label: "Communication and people", owner: "capability-runtime/connectors", dependsOn: ["shared-runtime", "permission-policy", "approval-policy"] },
  { id: "location_travel", label: "Location, maps, and travel", owner: "native location/maps adapters", dependsOn: ["shared-runtime", "permission-policy", "consent-policy"] },
  { id: "calendar_productivity", label: "Calendar, tasks, and productivity", owner: "task orchestrator/workflow registry", dependsOn: ["shared-runtime", "action-contracts", "approval-policy", "task-journal"] },
  { id: "files_knowledge", label: "Files, documents, and knowledge", owner: "file adapters/knowledge graph", dependsOn: ["shared-runtime", "consent-policy", "data-inventory", "secure-storage"] },
  { id: "media_creative", label: "Media and creative tools", owner: "media adapters/provider router", dependsOn: ["shared-runtime", "provider-routing", "permission-policy"] },
  { id: "intelligence_personalisation", label: "Intelligence and personalisation", owner: "memory/specialist coordinator", dependsOn: ["shared-runtime", "secure-storage", "consent-policy", "provider-routing"] },
  { id: "extensions_interoperability", label: "Extensions and interoperability", owner: "extension registry/action engine", dependsOn: ["shared-runtime", "action-contracts", "permission-policy", "approval-policy"] },
  { id: "safety_privacy_security", label: "Safety, privacy, and security", owner: "policy/consent/secure storage", dependsOn: ["shared-runtime", "action-contracts", "data-inventory"] },
  { id: "reliability_operations", label: "Reliability and operations", owner: "event bus/journal/diagnostics", dependsOn: ["shared-runtime", "action-contracts", "task-journal", "data-inventory"] }
]);

const STAGE_TWO_LAYER_AUDIT = Object.freeze({
  android_device: Object.freeze(["shared Action Engine", "Android permission gate", "native plugin bridge", "bounded execution"]),
  voice_multimodal: Object.freeze(["shared runtime entry point", "typed speech bridge", "observable speech lifecycle", "bounded action contract"]),
  screen_accessibility: Object.freeze(["accessibility permission gate", "notification-access permission gate", "explicit approval", "local notification boundary"]),
  communication_people: Object.freeze(["Contacts permission gate", "dialler handoff", "no silent call placement", "shared approval policy"]),
  location_travel: Object.freeze(["maps search handoff", "directions handoff", "travel-mode validation", "no background location collection"]),
  calendar_productivity: Object.freeze(["calendar review-before-save handoff", "task plan confirmation", "sequential shared-engine execution", "request idempotency"]),
  files_knowledge: Object.freeze(["Android system document picker", "user-selected URI boundary", "bounded text preview", "local knowledge boundary"]),
  media_creative: Object.freeze(["system media search handoff", "user-controlled playback", "shared runtime capability registry"]),
  intelligence_personalisation: Object.freeze(["default-deny consent registry", "local-first memory", "opt-in per-record cloud sync", "shared runtime context"]),
  extensions_interoperability: Object.freeze(["metadata-only extension manifests", "capability allow-list", "shared Action Engine execution", "approval policy"]),
  safety_privacy_security: Object.freeze(["fail-closed authorization", "revocable source-scoped consent", "approval broker", "verified completion receipts"]),
  reliability_operations: Object.freeze(["request-id idempotency", "bounded execution deadlines", "cooperative cancellation signal", "execution receipts and task journal"])
});

const STAGE_TWO_CHECKPOINT = Object.freeze({
  id: 2,
  name: "Shared contracts and enforcement",
  status: "complete",
  scope: "The shared execution, authorization, approval, consent, timeout, cancellation, idempotency, and verification contracts are implemented; all 12 code-level adapter audits are recorded; the full core/architecture CI run passed on commit cfefd036e3d05e2bdd78ac74e354f47a7af6a8fc. This is not physical-device certification or final product readiness.",
  validationBoundary: "Automated code and contract tests; Android device behavior, platform-specific permissions, and end-to-end surface QA remain separate validation work.",
  deliverables: Object.freeze([
    "Capability descriptors expose validated permission, consent, timeout, idempotency, and verification contracts.",
    "Missing policy handlers fail closed when a capability declares required permissions or consent.",
    "Android contacts, accessibility, notification access, and camera permission checks run through the shared authorization gate.",
    "Consequential actions retain the shared approval broker.",
    "Timeouts and cancellation are observable through bounded execution receipts and cooperative AbortSignal propagation.",
    "Repeated request IDs reuse the in-flight operation or completed receipt instead of executing twice.",
    "The shared runtime delegates consent checks to the default-deny, revocable consent registry.",
    "All 12 capability families have explicit Stage 2 contract-audit evidence and remain active for later stages."
  ])
});

const STAGE_THREE_CHECKPOINT = Object.freeze({
  id: 3,
  name: "Secure state and context",
  status: "in_progress",
  scope: "Harden local persistence, encrypted protected memory, key availability reporting, data inventory accuracy, consent boundaries, and optional per-record sync. Shared fail-closed JSON/schema validation now protects memory, consent, knowledge graph, task journal, workflow, and routine stores from silent reset. Browser localStorage remains explicitly unencrypted; no automatic migration or bulk upload is permitted.",
  validationBoundary: "Automated tests cover the new Android-only protected-memory vault with a test adapter. Real Android Keystore behavior, backup exclusion, device migration, and end-to-end privacy UX still require device validation.",
  deliverables: Object.freeze([
    "Add an Android-only protected-memory vault backed by the existing Keystore AES-GCM secure-store facade; refuse operation when unavailable and never fall back to browser storage.",
    "Bound protected records, validate identifiers and content, isolate record keys, and fail safely on corrupt indexes or records.",
    "Expose protected memory through the shared AURORA runtime so Main, Pulse, and voice can use the same service.",
    "Report protected-memory storage location and encryption availability in the privacy inventory without exposing record contents.",
    "Keep ordinary local-first memory separate from protected memory; do not silently migrate existing records or enable cloud sync.",
    "Use a shared fail-closed persistence reader across memory, consent, knowledge graph, task journal, workflow, and routine stores; malformed data is preserved and reported rather than silently reset.",
    "Add regression tests proving corrupt JSON and invalid schemas do not overwrite existing local records.",
    "Keep all 12 capability families active while remaining Stage 3 storage, consent, and context boundaries are audited."
  ])
});

const STAGE_ONE_CHECKPOINT = Object.freeze({
  id: 1,
  name: "Whole-system baseline",
  status: "complete",
  scope: "Architecture mapping only; no claim of production readiness.",
  completedAt: "2026-11-09",
  deliverables: Object.freeze([
    "All 12 capability families have stable IDs and accountable owners.",
    "Cross-family dependencies are explicit.",
    "Shared runtime, action contracts, permissions, approvals, consent, storage, and recovery are identified as cross-cutting foundations.",
    "Existing code is distinguished from planned or partially implemented adapters.",
    "App identity, signing identity, existing features, and user data boundaries are protected."
  ])
});

function createAuroraLayerRegistry() {
  const families = FAMILIES.map((item) => Object.freeze({
    ...item,
    dependsOn: Object.freeze([...item.dependsOn]),
    checkpoint: "stage-1-mapped",
    stageTwoStatus: "contract-audited",
    adapterContractAudit: "passed",
    stageTwoEvidence: [...(STAGE_TWO_LAYER_AUDIT[item.id] || [])],
    implementationStatus: "contract-audited",
    finalStatus: "active"
  }));
  return Object.freeze({
    stages: Object.freeze([STAGE_ONE_CHECKPOINT, STAGE_TWO_CHECKPOINT, STAGE_THREE_CHECKPOINT]),
    stageTwoAudit: STAGE_TWO_LAYER_AUDIT,
    list: () => families.map((item) => ({ ...item, dependsOn: [...item.dependsOn] })),
    get: (id) => {
      const item = families.find((family) => family.id === id);
      return item ? { ...item, dependsOn: [...item.dependsOn] } : null;
    },
    summary: () => Object.freeze({
      totalLayers: families.length,
      stageOneMapped: families.filter((item) => item.checkpoint === "stage-1-mapped").length,
      finalLayers: families.filter((item) => item.finalStatus === "complete").length,
      activeLayers: families.filter((item) => item.finalStatus !== "complete").length,
      nextStage: 3,
      stageOneStatus: STAGE_ONE_CHECKPOINT.status,
      stageTwoStatus: STAGE_TWO_CHECKPOINT.status,
      stageThreeStatus: STAGE_THREE_CHECKPOINT.status,
      stageTwoContractReady: families.filter((item) => item.adapterContractAudit === "passed").length
    })
  });
}

const auroraLayerRegistry = createAuroraLayerRegistry();

export { FAMILIES as AURORA_LAYER_FAMILIES, STAGE_ONE_CHECKPOINT, STAGE_TWO_CHECKPOINT, STAGE_THREE_CHECKPOINT, createAuroraLayerRegistry, auroraLayerRegistry };
