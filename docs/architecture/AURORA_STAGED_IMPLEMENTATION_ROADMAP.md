# AURORA Staged Whole-System Implementation Roadmap

**Branch:** `feature/aurora-pulse-profile-overlay`  
**Current checkpoint:** Stage 5 — Capability adapter expansion  
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

<badge>Checkpoint complete — CI passed</badge>

Completed in the shared engine and adapter contract audit:
- Capability descriptors expose validated permission and consent requirements, bounded timeout settings, request-ID idempotency, and optional mandatory verification.
- Missing permission/consent policy handlers fail closed; declared consents are checked through the default-deny, revocable consent registry.
- Android Contacts, Accessibility, Notification Access, and Camera permission checks run through the common authorization gate.
- Consequential actions retain the shared approval broker; task plans and extensions continue to execute through the same Action Engine.
- Execution adapters receive an AbortSignal. Callers can cancel by request ID, deadlines produce an explicit `ACTION_TIMEOUT` receipt, and duplicate request IDs reuse an in-flight operation or stored receipt.
- Verifier-required capabilities cannot register without a verifier, and verified completion is reported separately from unverified completion.
- All 12 capability families now carry explicit Stage 2 contract-audit evidence in the machine-readable registry.

Automated coverage includes fail-closed permission/consent checks, authorization success, verifier success/failure, malformed contracts, timeout, cancellation, request-ID idempotency, shared runtime wiring, and all 12 layer records.

**Stage 2 result:** The shared-contract foundation and all 12 code-level adapter audit records are committed. The full core/architecture CI run passed on commit `cfefd036e3d05e2bdd78ac74e354f47a7af6a8fc` (run `42581638246`), including dependency installation, core/architecture tests, and web build. Stage 2 is complete as an automated code checkpoint, not physical Android certification or final feature readiness. All 12 layers remain active.

### Stage 3 — Secure state and context

<badge>Code checkpoint complete — CI passed</badge>

Implemented code-level hardening: Android-only protected-memory vault; shared runtime and privacy inventory; fail-closed JSON/schema validation across memory, consent, knowledge graph, task journal, workflow, routine, and extension stores; strict protected-vault index and decrypted-record schema validation; and per-record cloud sync that rechecks consent before each upload and disables itself after revocation. Added Stage 3 audit evidence for all 12 capability families and regression tests for corrupt extension data, invalid protected-vault indexes/records, and consent revocation. Browser localStorage remains explicitly unencrypted.

**Stage 3 result:** The full CI run passed on commit `68b9b6df623503209276751fecd78872f82be3b0` (run `42583043179`): dependency installation, AURORA core/architecture tests, and web build all succeeded. Stage 3 is complete as a code-and-CI checkpoint. This does **not** certify physical Android behavior.

**Deferred release-validation checklist — not a Stage 4 blocker:**
- [ ] Verify Android Keystore key creation, availability, invalidation, and protected-memory read/write on supported physical devices.
- [ ] Verify Android backup exclusion for protected-memory files and key material.
- [ ] Verify app restore and upgrade behavior without silent reset, exposure, or unintended migration.
- [ ] Verify device migration and document the protected-memory portability boundary.
- [ ] Run end-to-end privacy and recovery UX checks on supported Android versions and lower-memory devices.

These checks remain **deferred and unverified** by the user’s direction to finish the app first. They are mandatory before release sign-off, but do not prevent Stage 4 from beginning after the Stage 3 CI pass. Preserve local-first behavior; do not perform automatic migration or bulk upload.

### Stage 4 — Reliability and recovery (complete — code and CI checkpoint)

**Stage 4 is complete as a code-level reliability and recovery checkpoint.**

The coordinated reliability foundation adds a shared lifecycle coordinator for visibility, foreground/background, online/offline, pagehide and pageshow events; bounded metadata-only failure diagnostics; cooperative cancellation for multi-step tasks; and a review-only recovery queue. The task journal now stores bounded execution receipt metadata only: it excludes task inputs, action result payloads, error messages and sensitive document/screen/media contents. Cancellation stops active Action Engine work and prevents later steps. Existing authorization, consent, approval, timeout and idempotency gates remain authoritative. A regression test verifies that private action payloads are not persisted in recovery records.

Specialist coordination now isolates each specialist with a bounded execution deadline and cooperative AbortSignal. Repeated failures open a per-specialist circuit; after a cooldown, only one half-open probe is allowed. An unavailable specialist is skipped with a stable error code while other selected specialists continue. Error messages are not returned to callers, preventing provider exceptions from leaking private request or response details. Specialist health is inspectable through the shared runtime. This does not grant specialists permission to execute device actions; all actions still pass through the Action Engine.

Task execution now contains adapter exceptions at the individual step boundary: it records a bounded error code, emits a fault event, marks the step failed and finalizes the task receipt instead of leaving an in-memory task promise rejected. Manual retry adapter exceptions are contained the same way. Journal persistence failures are isolated from event publication so a storage quota or unavailable-storage error cannot suppress lifecycle/task events; the journal failure is surfaced as a metadata-only diagnostic event. This is best-effort journaling, not a claim that storage is durable when the platform denies writes.

Interrupted-task inspection now distinguishes a task that was still marked running when the app stopped. It reports only step IDs, capability IDs, risk/approval metadata and whether a step was previously recorded as completed; an in-flight step is explicitly marked `not_verified_completed` because an external side effect may have happened before the interruption. The shared runtime exposes review and dismissal operations. Inspection never restores inputs, recreates executable plans, resumes a step, or assumes an uncertain action failed. A new plan and fresh confirmation are required.

Recovery is **not automatic**. A recovered task is review-only and requires fresh explicit confirmation; every action passes normal permission, consent and approval checks. No unattended retries are introduced, particularly for consequential or potentially non-idempotent actions. The Action Engine now exposes retry eligibility per capability. Retry defaults to `never`; opting into `idempotent` requires documented adapter evidence. Eligibility is advisory only: it does not trigger automatic retry, and consequential actions still require fresh approval. The engine reports unknown or unproven adapters as ineligible.

All 12 active families receive Stage 4 audit evidence. The task-orchestrator cancellation test syntax has been corrected, and the task journal has dedicated metadata-only persistence coverage. The Action Engine requires explicit adapter idempotency evidence before a retry can be considered eligible. A manual failed-step retry API now requires fresh user confirmation, checks completed dependencies, refuses unproven adapters, and caps retries at two per step; no automatic retry or whole-plan replay occurs. Physical Android lifecycle/interruption validation remains later device work; Stage 3 Keystore/backup/restore/migration checks remain deferred to final release hardening.

The final implementation pass extends reliability into persistent and scheduled services:
- Memory sync deduplicates concurrent uploads for the same record, rechecks consent after remote conflict reads and immediately before upload, disables cloud sync on revocation, and records bounded failure codes without exposing provider messages. Local memory remains authoritative.
- Workflow storage now validates the complete stored shape, unique ordered dependencies, capability identifiers, bounded step inputs, workflow limits and planner availability again at instantiation. Corrupt or stale workflow data fails closed rather than being silently replaced or executed.
- Routine scheduling validates stored records and bounds, compensates if persistence fails after an Android alarm is created, and makes cancellation transactional: the saved record is restored if Android cannot cancel the reminder. Routines remain reminders only and never execute workflow steps in the background.
- Existing extension execution remains metadata-only and routes every requested capability through the shared Action Engine; no downloaded code or autonomous extension execution is introduced.

**Stage 4 implementation result:** The planned code changes now cover task execution, task journaling, specialist isolation, lifecycle diagnostics, recovery review, storage-backed workflows, memory sync, extension execution boundaries and scheduled background reminders. No Stage 5 work has started. The user previously asked to defer testing, but has now authorized completion work. The latest feature-branch CI run (GitHub Actions run 42591318770) passed dependency installation, the blocking dependency audit, all core/architecture tests, and the web production build on commit `5c646116d4341b4ff62c30a34183bc02dcbd717c`. The dedicated feature-branch CI gate is verified. Per the project decision, Android APK compilation is deferred until the later release-preparation phase: its workflow is now manual-only and will not consume build time on every source push. The earlier Android run was cancelled during Gradle compilation when later pushes superseded it; this was not a confirmed Gradle build failure. APK compilation, archive validation, artifact upload, and physical-device lifecycle/interruption checks remain explicitly deferred and unverified. Stage 4 is closed on its active code-level reliability, security, recovery, tests, and web CI gates. APK/device certification is a later release gate. Stage 5 is now the active checkpoint; all 12 capability families remain in the active upgrade queue.

### Stage 5 — Capability adapter expansion (active)

**Implementation wave 1 completed:** Shared Action Engine adapters for Android speech output, stop speaking, foreground assistant service start/stop, accessibility settings handoff, and installed build information. Starting the background service requires microphone permission and explicit approval.

**Implementation wave 2 completed:** Native Android speech recognition start/stop, explicit microphone permission, transcript/error/status event delivery, notification permission request, and assistant service status reporting. Starting microphone capture requires fresh approval and microphone permission.

**Implementation wave 3 completed:** Approval-gated local search across recent Android notification previews, requiring Notification Access, and in-memory search over user-selected document text, bounded to 1 MB and 20 excerpts. Document content is not persisted.

**Implementation wave 4 completed:** Approval-gated SMS draft handoff opens Android's composer without sending; text sharing opens the system chooser so the user selects a destination and confirms the action.

**Implementation wave 5 completed:** Native contacts permission and search are implemented against Android's contacts provider with a 20-result cap and minimal returned fields. Phone-call preparation now opens Android ACTION_DIAL; AURORA never places a call silently.

**Implementation wave 6 completed:** Removed duplicate SMS capability registration and consolidated text sharing under one canonical communication capability. Added a CI regression guard that checks the production capability catalogue for unique IDs and protects required calendar, file, media, notification, maps and voice adapters from accidental removal.

**Implementation wave 7 completed:** Added a native, read-only calendar search adapter for upcoming events (next 90 days, maximum 20 results, optional title filter). It requests Android Calendar permission through the shared authorization gate, requires explicit Action Engine approval, returns only bounded event metadata, and keeps results local without persisting or uploading calendar contents.

**Remaining Stage 5 work:** Complete the Pulse floating overlay's native lifecycle, improve location/maps beyond external app handoff, expand screen and notification workflows, calendar/task integrations, richer file/document processing, media creation, intelligence tools, and extension interoperability. Every adapter must use shared permission/consent/approval contracts, honest platform availability, and automated regression coverage. No Stage 4 work is reopened; only ordinary regression checks apply.

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
