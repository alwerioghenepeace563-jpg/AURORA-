# AURORA Android Native Integration Audit

**Audit date:** 2026-11-15  
**Branch:** feat/aurora-latest-plan-audit-fixes  
**Status:** Code inventory completed; implementation and device certification are separate gates.

## Registered Capacitor plugins

| Plugin | Native implementation | Main responsibility | Audit status |
|---|---|---|---|
| AuroraNative | AuroraAssistantPlugin.java | Speech/TTS, wake listener controls, Pulse overlay, app launch, contacts, calendar, maps, files, camera handoff, notifications, clipboard, device/network/storage diagnostics and settings handoffs | Broad bridge exists; feature-by-feature physical QA remains open |
| AuroraTranscription | AuroraTranscriptionPlugin.java | Foreground transcription notification and WorkManager-backed chunk/source processing | Registered; Android build and long-running device QA open |
| AuroraSecureStorage | AuroraSecureStoragePlugin.java | Android Keystore AES-GCM protected local values | Registered; key invalidation/restore device QA open |
| AuroraReminder | AuroraReminderPlugin.java | User-scheduled local reminders | Registered; OEM battery/boot behavior QA open |
| AuroraPredictive | AuroraPredictivePlugin.java | Consent-gated foreground coarse motion signals | Registered; sensor hardware QA open |
| AuroraNearby | AuroraNearbyPlugin.java | Foreground point-to-point discovery, authenticated pairing and encrypted data-only transfer | Registered; two-device QA open |
| AuroraLocation | AuroraLocationPlugin.java | Permission-gated, foreground one-shot current-location fix | Added in this audit wave; build and device QA open |

## Existing Android services and receivers

The manifest declares the assistant microphone foreground service, transcription service, accessibility service, notification listener, Pulse overlay service, voice-interaction service/session service, reminder receiver and AndroidX WorkManager foreground service. These declarations are not treated as proof that the corresponding feature is operational: each still needs runtime lifecycle, permission and device validation.

## Existing native API coverage found

- Voice: speech recognition, partial/final result event contract, text-to-speech and explicit start/stop controls.
- Assistant lifecycle: opt-in Hey AURORA foreground listener and Pulse overlay show/hide/status.
- Screen context: user-enabled Accessibility service, invoked from the foreground app.
- Communication: contacts search, dialler handoff, SMS/email composers and Android share sheet.
- Productivity: calendar read, calendar insert handoff, alarm/timer handoffs and local reminders.
- Location/maps: permission checks, last-known location (legacy), map search and directions handoff.
- Files/media: Storage Access Framework document/media selection, Save As export, explicit file share, user-controlled recorder/camera handoffs and Android-managed downloads.
- Device controls/diagnostics: app launcher inventory, audio volume, flashlight, network state, storage capacity, battery/memory/thermal status and settings shortcuts.
- Notifications/media: opt-in notification listener, bounded recent-notification view, open/dismiss selected item and active media-session controls.
- Intelligence/security: protected Android storage, foreground motion sensing, trusted-device Nearby transport and transcription work queue.

## Implemented in this audit wave

### Fresh one-shot location

The old AuroraNative.getCurrentLocation implementation reads the newest last-known provider location. That can be stale. A dedicated AuroraLocation plugin now requests a one-shot provider update while AURORA is foregrounded, supports approximate or precise permission, rejects fixes older than 30 seconds, times out after 15 seconds, removes listeners after completion, and cancels an in-flight request when AURORA leaves the foreground. It does not request background location or persist coordinates.

The typed bridge and existing Action Engine location permission/action path now route through the dedicated plugin. Android sync and parity checks verify registration and the plugin's required lifecycle/security markers.

### Android assistant-role integration added in this wave

- The VoiceInteractionService now records Android's onReady/onShutdown lifecycle, so the app can distinguish an installed manifest declaration from a service actually activated by Android.
- The assistant session now presents a small AURORA panel and launches the app only after the user taps Open AURORA; it no longer launches the app automatically as soon as Android creates the session. The service metadata no longer hard-codes a Google TTS recognition-service component, which may not exist on other Android builds.
- Added a native-only settings card showing assistant-role availability, selection and service readiness, with an explicit Android role request and manual refresh after the user returns from system settings. The card stays hidden on web/PWA and does not imply that role selection grants microphone, notification or accessibility access.
- AuroraNative exposes assistant-role availability/selection/readiness and a system-owned assistant-role request flow on Android 10+, with a voice-input settings fallback on older Android versions. Android always controls the final selection and user confirmation.
- Added static regression coverage and registered the assistant-role test in test:core.

### User-consented MediaProjection capture

- Added a dedicated Capacitor plugin that launches Android's system screen-capture consent prompt. A denial is handled as a normal cancellation.
- After approval, a foreground service displays an ongoing notification, creates one virtual display frame, saves a PNG in app-private cache and tears down the projection. The frame can be previewed in Settings and explicitly cleared.
- The service does not perform continuous recording, background capture or network upload. Android 14+ foreground-service permission and type are declared. Capture resolution is bounded to a 1600-pixel long edge to reduce memory pressure on entry-level Android devices, and the UI polls until the one-frame operation completes or reports its failure reason.

### Foreground NFC read and write

- Added NFC hardware/availability status and foreground reader mode for supported NFC-A/B/F/V tags.
- Reads NDEF text records and basic tag technology metadata only. Text writes must be entered and explicitly armed by the user; the plugin checks NDEF writability and tag capacity before writing.
- NFC reader mode is stopped when the app pauses or the plugin is destroyed. NFC is declared optional so devices without NFC can still install AURORA.

### Assistant-session voice capture

- The Android assistant session now offers a user-tapped Start voice input control, checks the existing microphone permission, and starts one-shot Android speech recognition.
- The transcript is stored briefly in app-private preferences and handed to AURORA Pulse when the app opens. It is placed in the message composer for the user to review and send; it is not silently submitted.
- Recognition is cancelled and released when the assistant session hides or is destroyed. The normal AURORA answer and speech pipeline remains in the app.

### Android cloud document-provider access

- The existing Android document picker now retains a persistable read grant when the selected provider offers one, and returns provider authority, document ID and grant status to the app.
- The system picker can surface installed Android document providers such as cloud-drive apps. AURORA reads only the document explicitly selected by the user.
- This is provider-mediated file access, not direct provider account integration. Direct Google Drive, Dropbox or OneDrive API connectors still require provider OAuth client IDs, approved scopes, account consent and secure backend token handling; these cannot be completed without the app owner's provider credentials.

## Remaining native integration gaps

These are deliberately recorded as gaps rather than being mislabeled as complete:

1. **MediaProjection screen capture:** implemented as a user-consented, one-frame capture with an ongoing foreground notification, private cache preview, explicit clear control and automatic teardown. Physical-device and Android 14+ validation remain open.
2. **VoiceInteraction speech session:** role discovery, session UI, explicit start of one-shot speech recognition, transcript handoff to Pulse and user-reviewed submission are implemented. Direct spoken responses inside the system assistant surface and OEM gesture certification remain open.
3. **Direct NFC actions:** foreground NDEF text read and explicit text-write are implemented. Reader mode stops on pause/destroy; tag compatibility and physical-device tests remain open.
4. **Direct Wi-Fi/Bluetooth settings changes:** AURORA opens Android Settings rather than silently toggling protected connectivity state. Nearby Connections uses its own approved peer transport; it is not a general-purpose Bluetooth/Wi-Fi control API.
5. **Full telephony/SMS dispatch:** AURORA deliberately hands off to Android's dialler and SMS composer; it does not silently place calls or send messages.
6. **Direct provider API connectors:** Android Storage Access Framework integration now supports user-selected cloud document providers with persisted read grants where supported. Direct Drive/Dropbox/OneDrive API OAuth connectors remain blocked on provider client IDs, scopes and secure token configuration.
7. **OEM and physical-device certification:** foreground microphone restrictions, notification access, exact alarm policy, WorkManager behavior, low-memory handling, Nearby discovery and location accuracy must be tested on supported Android versions and OEM builds.

## Verification boundary

- Static source and bridge checks are added to the repository.
- Static regression scripts for location, assistant-role, MediaProjection, NFC and provider-picker integration are registered in test:core.
- No successful GitHub Actions run, Gradle compile, APK build or physical-device test is claimed by this audit.
- No production deployment or PR merge is performed.