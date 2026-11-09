# AURORA Complete Foundation Map

**Status:** Architecture foundation catalogue and implementation contract  
**Branch:** `feature/aurora-pulse-profile-overlay`  
**Purpose:** Establish the architectural home, contracts, safety boundaries, and implementation status for the complete AURORA vision in one coordinated baseline.  
**Decision baseline:** Hybrid memory; approval-first execution; built-in and external extensions; one shared runtime for Main, Pulse, and voice.

> This document is a foundation map, not a claim that every listed capability is already implemented. A foundation may be a working module, a partial adapter, a tested interface, or a planned contract. The capability registry and diagnostics must report the real state on the device.

## 1. Product invariant

AURORA is a personal intelligence and Android interaction layer—not a replacement operating system and not an unrestricted controller of other apps. It coordinates capabilities Android, the user, and authorised services make available.

**One brain, many surfaces.** Main, Pulse, voice, notification actions, shortcuts, share targets, and future companion surfaces submit requests to the same runtime. They must not maintain separate planners, permission logic, approval rules, or native command implementations.

**Every feature has a foundation now.** Some features can remain unavailable until their adapters, permissions, dependencies, and tests are completed. No fake success, hidden collection, permission bypass, silent consequential action, or arbitrary extension code.

## 2. Shared execution architecture

All requests follow this pipeline:

`Input → Intent → Context → Plan → Capability resolution → Policy → Permission → Approval → Execute → Verify → Record → Respond`

Core responsibilities:

| Foundation | Responsibility | Existing implementation / target |
|---|---|---|
| Conversation gateway | Normalise typed, speech, shared, and contextual input | Existing chat/voice paths; consolidate behind runtime |
| Intent resolver | Identify intent, entities, ambiguity, and required clarification | Existing intent parser plus bounded task planner |
| Context assembler | Retrieve only consented, relevant context | Event bus, memory, knowledge graph; expand with source-scoped context |
| Model/provider router | Select configured local/cloud model by capability, privacy, availability, and cost | Existing provider integrations; formalise routing contract |
| Specialist coordinator | Delegate bounded advisory work; specialists cannot execute native actions directly | `aurora-specialist-coordinator.js` |
| Plan builder | Produce typed, ordered, bounded plans and previews | `aurora-task-planner.js`, `aurora-task-orchestrator.js` |
| Policy engine | Evaluate risk, data class, reversibility, user settings, and source | Existing action risk and approval foundations; centralise policy matrix |
| Permission coordinator | Check Android runtime permissions, roles, settings, and service availability | Native bridge checks; expand into a single permission catalogue |
| Approval broker | Short-lived, exact-payload user approval | `aurora-approval-broker.js` |
| Universal Action Engine | Validate and dispatch typed capability requests | `aurora-action-engine.js`, `aurora-capability-runtime.js` |
| Verification layer | Verify postconditions; distinguish opened/drafted/saved/sent | Structured native results; expand capability by capability |
| Execution journal | Record minimal status and recover safely | `aurora-task-journal.js` |
| Event backbone | Publish bounded lifecycle events to all surfaces | `aurora-event-bus.js` |
| Recovery manager | Retry safe transient failures, resume only after fresh approval | Task journal and orchestrator; formalise retry policy |
| Diagnostics | Report capability health, permission state, provider status, and unsupported features | Capability intelligence and data inventory; unify health view |

### Action contract

Every capability must declare: stable ID and version; description; category; input/output schema; platform requirements; permissions/roles; availability; offline support; risk; data sensitivity; reversibility; approval policy; timeout; cancellation behavior; and verification strategy.

Every execution result must distinguish `succeeded`, `launched`, `needs_user_action`, `needs_permission`, `needs_approval`, `unsupported`, `cancelled`, and `failed`. “Opened an editor” is not “saved an event”; “opened a dialler” is not “placed a call”; “opened a share sheet” is not “shared content”.

## 3. Complete capability foundation catalogue

All groups are registered in the architecture now. “Foundation” does not imply that every adapter is already shipped.

### A. Android and device interaction
- App discovery and app launching through supported package visibility and intents.
- Device status: model, OS/API level, battery, charging, connectivity where available.
- Flashlight, volume/settings handoff, brightness/settings handoff, rotation/status where Android permits.
- Timers, alarms, reminders, scheduled notifications, boot restoration.
- Android assistant role, shortcuts, widgets, quick settings entry points where supported.
- Hardware feature detection and capability degradation for low-memory/Android Go devices.
- Device-to-device continuity only through explicit pairing and authenticated channels.

### B. Voice and multimodal interaction
- Typed chat, speech-to-text, text-to-speech, interruption, playback state, and voice preferences.
- Opt-in wake phrase with visible foreground-service notification, clear stop control, and OS-compliant microphone behavior.
- Push-to-talk and hands-free modes; no covert or always-on recording.
- User-selected image, camera, audio, and video input; visible capture/recording state.
- OCR and document understanding for user-selected content.
- Speech language/accent support and local fallback when available.
- Accessibility-aware interaction without treating accessibility permission as universal app-control authority.

### C. Screen, accessibility, and notifications
- User-invoked visible-screen reading with explicit service enablement and scoped retention.
- Screen context is ephemeral by default; never silently archive full screen contents.
- Notification listener is separately opt-in; minimise preview content, bound retention, exclude sensitive notification content where feasible.
- Notification summaries, search, and local cache management.
- Notification actions only through supported Android actions and fresh approval when consequential.
- MediaProjection screen capture only after Android's own user-approved capture flow.

### D. Communication and people
- Contacts lookup with runtime permission and query minimisation.
- Dialler handoff; user places the call.
- SMS/message draft handoff; no silent sending.
- Supported messaging app deep links/share intents; never bypass app security.
- Email drafting and authorised provider integration; preview recipients, subject, body, and attachments before sending.
- Calls, messages, and email history only if the user explicitly connects a supported provider and grants scope.
- Contact matching must clarify ambiguity before acting.

### E. Location, maps, and travel
- Foreground location only when invoked and permission granted.
- Maps search, route handoff, directions, travel mode, and user-confirmed destination.
- Weather and local context through configured services.
- Geofenced reminders only with explicit opt-in, OS permission, visible management, and battery-aware scheduling.
- Location history is off by default; no background tracking without a clear user-controlled feature and permission.

### F. Calendar, tasks, and productivity
- Calendar event preview and Android editor handoff as baseline.
- Provider-backed calendar read/create/update only with explicit scope and approval.
- Shared task list and notes across Main and Pulse.
- Task planning, bounded multi-step orchestration, workflow templates, execution receipts, and recovery.
- Routine scheduling is reminder-first; scheduled workflows do not execute consequential actions unattended.
- Email/calendar/task integrations must distinguish draft, opened, saved, and sent states.

### G. Files, documents, and knowledge
- Android Storage Access Framework picker and user-selected file access.
- Import, preview, search, summarise, and transform supported document formats.
- User-selected folders and revocable indexing grants; no broad file scraping.
- Local-first searchable knowledge base, typed graph relations, source citations, retention controls, and deletion propagation.
- File content remains local unless the user explicitly chooses a cloud feature.
- File operations use safe temp storage, size/type limits, and explicit overwrite/delete confirmation.

### H. Media and creative tools
- Media search handoff and supported active-session controls.
- Camera capture, QR/barcode scan, and media import through Android-supported flows.
- Audio transcription, subtitles, voice workspace, and media analysis as separate registered capabilities.
- Image generation/editing and creative assistance through approved providers.
- Export/share previews and user-controlled destination.
- Respect content rights, provider limits, device memory, and offline fallback constraints.

### I. Intelligence and personalisation
- Hybrid local-first memory with optional encrypted per-record cloud sync.
- Explicit memory save, search, edit, forget, export, and retention policy.
- Knowledge graph, project context, timelines, and cross-session retrieval.
- Context-aware suggestions with transparent source and opt-out.
- Bounded specialist agents for research, learning, writing, navigation, organisation, and creative work.
- Model routing by task, privacy, latency, cost, and device capacity.
- Personalisation is user-controlled; inferred sensitive attributes are not silently stored.

### J. Extensions and interoperability
- Built-in capability packs and third-party extension manifests.
- Extension signature/provenance, versioning, declared permissions, capability allowlist, compatibility checks, and revocation.
- Extensions invoke only registered capabilities through the Action Engine.
- No downloaded arbitrary JavaScript, eval, dynamic code execution, hidden network access, or approval bypass.
- External connectors use scoped OAuth/API credentials stored in secure storage; revoke and disconnect must be supported.
- Developer SDK and test harness are planned contracts, not a promise of arbitrary plugin support.

### K. Safety, privacy, and security
- Least-privilege permission catalog with just-in-time permission requests.
- Consent registry with purpose, source, scope, expiry, and revocation.
- Data classification: public, personal, sensitive, credential, ephemeral.
- Android Keystore-backed key management; encrypted local database and encrypted cloud payloads.
- Secret redaction from logs, prompts, analytics, and error messages.
- User-visible approval previews for sending, calling, sharing, deleting, purchasing, and security changes.
- Short-lived approvals bound to exact action ID, input hash, capability version, and origin.
- Rate limits, input bounds, timeouts, cancellation, idempotency, and replay protection.
- Audit history minimises stored content and offers retention/deletion controls.
- Threat model includes malicious prompts, extension abuse, stale permissions, compromised providers, data leakage, and replay.

### L. Reliability and operations
- Offline capability detection and provider fallback.
- Bounded queues and storage; no unbounded event or task history.
- Crash-safe journals and recoverable state transitions.
- Network retry with backoff only for idempotent operations.
- Health checks for native bridge, permission, provider, sync, scheduler, and extension states.
- Diagnostics export with secrets and personal content redacted.
- Build/test gates for web, TypeScript, core tests, Android manifest parity, native bridge parity, and APK signing identity.
- Feature flags for incomplete or device-incompatible adapters; never advertise unavailable features as active.

## 4. Data and storage foundation

| Data domain | Default location | Rule |
|---|---|---|
| Ephemeral prompt/context | Runtime memory | Discard after task unless explicitly saved |
| User memories and notes | Local encrypted store target | Cloud sync opt-in per item |
| Knowledge index | Local database/index | User-selected sources only |
| Credentials/session tokens | Android Keystore-backed secure storage | Never log or place in ordinary preferences |
| Task/workflow definitions | Local structured store | Bounded; explicit export/delete |
| Action receipts | Local minimal journal | Avoid storing full private payloads |
| Notification previews | Local bounded cache | Opt-in; short retention; excluded from backup |
| Extension manifests | Local registry | Declarative metadata only |
| Cloud-synced records | Supabase under user RLS | Per-record opt-in, authenticated user, encrypted payload, delete propagation |

Storage migration must be staged. Existing browser/localStorage-backed stores are not to be labelled encrypted. The data inventory must report the actual backend and encryption status per store. No cloud migration or schema change is assumed by this catalogue.

## 5. Permission and approval matrix

- Permissions are requested only at the moment the relevant capability is used.
- Android permission grants are not equivalent to user approval for a particular action.
- A capability must check permission and app/role availability immediately before execution.
- High-impact actions always require fresh, specific approval even if the permission was previously granted.
- A declined request must not be retried automatically.
- Recovered or scheduled work requires a new preview and approval before any meaningful action.
- Background microphone, location, notification, accessibility, and overlay functions must follow Android platform rules and have visible controls.

## 6. Experience architecture — pages only where useful

**Shared internal architecture (not separate pages):** intent resolution, memory retrieval, model routing, event bus, action engine, policy, permissions, approval, verification, specialist coordination, capability health, sync engine, and recovery.

**Main app surfaces (user-visible when implemented):**
- Assistant/chat and voice workspace.
- Capability centre: availability, permissions, and connected integrations.
- Memory/knowledge manager: inspect, edit, export, delete, and sync choices.
- Workflows/routines: previews, schedules, history, pause/cancel.
- Privacy/security controls: consents, data inventory, retention, extensions.
- Diagnostics/support: device compatibility and honest feature status.

**Pulse surfaces:**
- Dynamic-Island-inspired orb and separate transparent chat panel.
- One Tools control opens the capability cards directly; cards remain hidden otherwise.
- Contextual quick actions and approval prompts from the same runtime.
- Opacity/transparency controls.
- No duplicated command engine or separate security policy.

Do not create a page merely because a capability exists. A capability is an internal service unless the user needs a dedicated place to inspect or control it.

## 7. Repository mapping and migration rules

Keep the current React/Vite + Capacitor 7 project and Java native bridge. Preserve app ID, package identity, signing key, current routes, provider configuration, and existing working features.

Current foundations to reuse and audit:
- `src/core/aurora-runtime.js`
- `src/core/aurora-action-engine.js`
- `src/core/aurora-approval-broker.js`
- `src/core/aurora-capability-runtime.js`
- `src/core/aurora-task-planner.js`
- `src/core/aurora-task-orchestrator.js`
- `src/core/aurora-event-bus.js`
- `src/core/aurora-memory.js`
- `src/core/aurora-knowledge-graph.js`
- `src/core/aurora-specialist-coordinator.js`
- `src/core/aurora-workflow-registry.js`
- `src/core/aurora-task-journal.js`
- `src/core/aurora-consent-registry.js`
- `src/core/aurora-universal-search.js`
- `src/core/aurora-extension-registry.js`
- `src/core/aurora-data-inventory.js`
- `src/core/aurora-memory-sync.js`
- `src/core/aurora-supabase-memory-adapter.js`
- `src/core/aurora-routine-scheduler.js`
- `src/core/aurora-secure-store.js`
- `src/lib/aurora-native.ts`
- `src/lib/aurora-secure-storage.ts`

These names indicate code present in the inspected branch, not proof that every adapter is production-ready. Audit imports, native Java implementations, migration state, and runtime wiring before extending them.

### Required migration sequence

1. **Foundation inventory:** capability IDs, owners, contracts, status, dependencies, permissions, tests.
2. **Shared runtime enforcement:** route Main, Pulse, and voice through one request pipeline; remove duplicate direct execution paths only after parity tests.
3. **Contracts and policy:** typed input/output, availability, permission, risk, approval, verification, timeout, cancellation.
4. **Persistence and security:** native encrypted local store, key lifecycle, consent enforcement at each data source, RLS-backed per-item sync.
5. **Android adapters:** implement and test one capability family at a time behind the stable registry.
6. **Intelligence:** memory, context, graph, specialist agents, model router, recovery, and suggestions.
7. **Extensions:** signed/declarative manifests and constrained execution through registered capabilities.
8. **Experience integration:** expose only the controls that need UI; preserve Main and Pulse design.
9. **Verification:** automated tests, Android build, physical-device tests, accessibility, battery, offline, and failure-path checks.

## 8. Definition of foundation completeness

A capability is not “implemented” until it has:
- A stable descriptor and validated input/output contract.
- A real adapter or an explicitly reported unsupported state.
- Correct permission, consent, and approval gates.
- Structured errors, timeout, cancellation, and idempotency where applicable.
- Verification appropriate to its real-world effect.
- Unit/integration tests and native bridge parity tests.
- A visible user control where needed and a privacy/data inventory entry.
- Documentation of Android/API/device limitations.

A foundation pass is complete when every capability family has a registered architectural contract, clear owner, dependencies, status, safety policy, and test plan—even if the concrete adapter remains staged.

## 9. Immediate implementation guardrails

- Do not rewrite the app shell or remove existing features.
- Do not create a forest of new pages.
- Do not regenerate or replace the Android signing key.
- Do not change app ID, Supabase schema, RLS policies, or production deployment without a separate explicit decision.
- Do not claim native encryption, sync, scheduled execution, wake-word reliability, or device testing until the corresponding implementation and tests prove it.
- Keep incomplete foundations behind feature flags and report them honestly.
