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
    implementationStatus: "requires-audit",
    finalStatus: "active"
  }));
  return Object.freeze({
    stages: Object.freeze([STAGE_ONE_CHECKPOINT]),
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
      nextStage: 2,
      stageOneStatus: STAGE_ONE_CHECKPOINT.status
    })
  });
}

const auroraLayerRegistry = createAuroraLayerRegistry();

export { FAMILIES as AURORA_LAYER_FAMILIES, STAGE_ONE_CHECKPOINT, createAuroraLayerRegistry, auroraLayerRegistry };
