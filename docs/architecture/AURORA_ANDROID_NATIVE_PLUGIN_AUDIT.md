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

## Remaining native integration gaps

These are deliberately recorded as gaps rather than being mislabeled as complete:

1. **MediaProjection screen capture:** the app has Accessibility-based visible-text reading, but no dedicated, user-consented MediaProjection capture session. If added, it must use Android's system consent prompt, a visible foreground-service notification, one-session scope, explicit stop/revoke and no silent capture.
2. **VoiceInteraction speech session:** Android assistant-role discovery, session display, and explicit Open AURORA handoff are implemented. A full voice-session capture/response loop that uses the Android assistant session APIs, device-specific assistant gesture behavior and default-assistant validation remain open.
3. **Direct NFC actions:** current UI/API provides a Settings handoff and hardware inventory, not an NFC reader/writer session. Any future NFC session needs foreground-only, user-initiated operation and explicit tag-content review.
4. **Direct Wi-Fi/Bluetooth settings changes:** AURORA opens Android Settings rather than silently toggling protected connectivity state. Nearby Connections uses its own approved peer transport; it is not a general-purpose Bluetooth/Wi-Fi control API.
5. **Full telephony/SMS dispatch:** AURORA deliberately hands off to Android's dialler and SMS composer; it does not silently place calls or send messages.
6. **Provider-specific Stage 13 connectors:** the shared connector registry is not a native plugin for every third-party provider. OAuth/account linking, scopes, provider SDKs and live round-trip tests must be added per supported provider.
7. **OEM and physical-device certification:** foreground microphone restrictions, notification access, exact alarm policy, WorkManager behavior, low-memory handling, Nearby discovery and location accuracy must be tested on supported Android versions and OEM builds.

## Verification boundary

- Static source and bridge checks are added to the repository.
- Static regression scripts for location and assistant-role integration are registered in test:core.
- No successful GitHub Actions run, Gradle compile, APK build or physical-device test is claimed by this audit.
- No production deployment or PR merge is performed.