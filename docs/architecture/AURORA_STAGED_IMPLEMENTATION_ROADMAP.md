# AURORA Staged Whole-System Implementation Roadmap

**Branch:** `feature/aurora-pulse-profile-overlay`  
**Current checkpoint:** Stage 2 — Shared contracts and enforcement  
**Rule:** Every stage advances every active layer to the same stage standard. A stage is not closed while any layer is missing its required checkpoint evidence.

## How progression works

AURORA is upgraded in coordinated stages, not by taking one feature to completion while the rest of the system is forgotten.

1. Every active layer receives the current stage's improvements.
2. Shared foundations are improved once and consumed by all dependent layers.
3. Each layer must pass its stage-specific checks before the stage can close.
4. A layer that reaches its **final** acceptance criteria is saved as complete and removed from the active upgrade queue. It remains supported and receives compatibility/regression checks.
5. A layer that has only passed an intermediate stage remains active for the next stage.
6. No stage may claim completion based only on documentation: code, tests, and device evidence are labelled separately.

A stage checkpoint is not the same as final feature completion.

## Stage 1 — Whole-system baseline

<badge>Checkpoint recorded</badge>

**Purpose:** Give every part of AURORA a stable place, owner, dependency map, and honest implementation status before deeper upgrades begin.

Stage 1 deliverables:

- Catalogue all 12 capability families with stable IDs.
- Assign each family an accountable architectural owner.
- Record cross-layer dependencies so shared changes cannot strand dependent features.
- Establish the shared runtime, action contract, permission, approval, consent, storage, event, journal, and recovery foundations as cross-cutting concerns.
- Separate architecture mapped, code present, adapter wired, automated-tested, and physical-device-tested states.
- Protect existing app identity, signing identity, routes, features, and user-data boundaries.
- Add automated checks that prevent a layer from silently disappearing or being marked final merely because it is catalogued.

**Stage 1 result:** All 12 families are mapped and remain active. This is an architecture checkpoint, not a claim that all 12 are implemented or production-ready.

## The 12 layers tracked at every stage

| ID | Layer | Primary owner |
|---|---|---|
| `android_device` | Android and device interaction | Capability runtime / native bridge |
| `voice_multimodal` | Voice and multimodal interaction | Conversation gateway / native bridge |
| `screen_accessibility` | Screen, accessibility, and notifications | Native accessibility / notification services |
| `communication_people` | Communication and people | Capability runtime / connectors |
| `location_travel` | Location, maps, and travel | Native location / maps adapters |
| `calendar_productivity` | Calendar, tasks, and productivity | Task orchestrator / workflow registry |
| `files_knowledge` | Files, documents, and knowledge | File adapters / knowledge graph |
| `media_creative` | Media and creative tools | Media adapters / provider router |
| `intelligence_personalisation` | Intelligence and personalisation | Memory / specialist coordinator |
| `extensions_interoperability` | Extensions and interoperability | Extension registry / Action Engine |
| `safety_privacy_security` | Safety, privacy, and security | Policy / consent / secure storage |
| `reliability_operations` | Reliability and operations | Event bus / journal / diagnostics |

The machine-readable source of truth is `src/core/aurora-layer-registry.js`. Tests live in `scripts/test-aurora-layer-registry.cjs`.

## Completed and next stages

### Stage 2 — Shared contracts and enforcement

<badge>Complete — automated contract checkpoint</badge>

Completed in the shared engine and adapter contract audit:
- Capability descriptors expose validated permission and consent requirements, bounded timeout settings, request-ID idempotency, and optional mandatory verification.
- Missing permission/consent policy handlers fail closed; declared consents are checked through the default-deny, revocable consent registry.
- Android Contacts, Accessibility, Notification Access, and Camera permission checks run through the common authorization gate.
- Consequential actions retain the shared approval broker; task plans and extensions continue to execute through the same Action Engine.
- Execution adapters receive an AbortSignal. Callers can cancel by request ID, deadlines produce an explicit `ACTION_TIMEOUT` receipt, and duplicate request IDs reuse an in-flight operation or stored receipt.
- Verifier-required capabilities cannot register without a verifier, and verified completion is reported separately from unverified completion.
- All 12 capability families now carry explicit Stage 2 contract-audit evidence in the machine-readable registry.

Automated coverage includes fail-closed permission/consent checks, authorization success, verifier success/failure, malformed contracts, timeout, cancellation, request-ID idempotency, shared runtime wiring, and all 12 layer records.

**Stage 2 result:** The shared-contract checkpoint is complete. This means the cross-family code/contract baseline is in place; it does not certify physical Android behavior, every surface's end-to-end UX, or final feature readiness. All 12 layers remain active for later implementation and device-validation stages.

### Stage 3 — Secure state and context (next)

Harden local persistence, key lifecycle, data inventory accuracy, consent enforcement, memory/context boundaries, and optional per-record sync. Do not label browser storage encrypted. Preserve local-first behavior and avoid schema changes without separate approval.

### Stage 4 — Reliability and recovery

Unify lifecycle events, execution receipts, bounded journals, cancellation, safe retries, diagnostics, and fresh approval on recovery. Apply the same rules to every capability family.

### Stage 5 — Capability adapter expansion

Upgrade Android, voice, screen, communication, maps, productivity, files, media, intelligence, and extension adapters behind the shared contracts. Each adapter must have automated tests and honest platform availability reporting.

### Stage 6 — Surface integration and device validation

Connect Main, Pulse, voice, and future surfaces to the same runtime; add only necessary controls, then validate on supported Android versions and lower-memory devices. Verify accessibility, battery, offline behavior, failure recovery, and signing identity.

These stages may be refined as repository audits reveal dependencies, but no layer may be silently skipped. A stage can be split into smaller checkpoints; it cannot be declared complete until every active layer meets its acceptance criteria.

## Completion and drop rule

A layer is dropped from the **active upgrade queue** only after its final acceptance criteria are met:

- Contract and implementation are complete.
- Permission, consent, safety, and approval behavior are enforced.
- Automated tests pass, including relevant cross-layer regression tests.
- Required native/device tests pass on supported configurations.
- Failure, offline, cancellation, and recovery behavior are verified.
- Documentation and diagnostics report the real state.

Then mark it final, preserve it in the completed-layer register, and continue regression checks whenever shared foundations change. “Dropped” never means deleted or unsupported.
