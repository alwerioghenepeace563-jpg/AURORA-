# AURORA Web-to-Native Port — Four Batches

Source of truth: the existing React web app in `src/App.jsx` and `src/styles.css`. Keep the web app intact. Native work stays on `feat/true-native-android`.

## Batch 1 — Core interface and navigation
- [x] Native Kotlin/Jetpack Compose app shell
- [x] Dark sci-fi palette, animated cyan orb, AURORA brand header
- [x] Home, Activities, Jarvis and Profile bottom navigation
- [x] Native chat layout and basic message composer
- [x] Profile links to AI connection settings and app updates
- [ ] Fine visual comparison against the complete web UI and device screenshots

## Batch 2 — AI and voice
- [x] Initial text-chat request wired to the deployed web app's `/api/chat` endpoint
- [x] Carry over the saved native profile and selected AI provider with chat requests; active schedules and attachment payloads remain to port
- [x] Save native chat history locally; rich message rendering remains to port
- [x] Add Android speech-to-text input and hosted voice-reply playback; wake phrase and background assistant service remain to port
- [x] Native app-launch commands for supported apps and Android Settings/camera; wake phrase and background service remain to port

## Batch 3 — Remaining screens and tools
- [x] Port core profile fields and local persistence; remaining web profile/settings fields still need to port
- [x] Add native local Tasks, Notes, Reminders and Events; full web activity parity and schedules remain to port
- [x] Add native search, weather and calculator plus common unit conversions; image/document attachments and camera flows remain to port
- [ ] Port authentication and admin-only features with secure session handling
- [ ] Test each feature against its existing web counterpart

## Batch 4 — Updates and release
- [ ] Decide final application ID and preserve it for every release
- [x] Add environment-based release signing configuration and a tag-triggered signed-release workflow; signing secrets still need to be configured
- [x] Add a server-side GitHub release metadata proxy at `/api/app-update`; configure `AURORA_GITHUB_TOKEN` in the server environment for private repository releases
- [x] Add APK download through a short-lived GitHub asset URL and hand off to Android's user-approved package installer
- [ ] Verify version comparison, checksums/signatures, failed downloads and rollback guidance
- [ ] Build and test a signed release APK on a real Android device

## Current limitations
The app is not yet a full parity port. Native chat sends text, recent history, core profile preferences and the selected provider to `/api/chat`; rich message rendering, attachments, active schedules, wake phrase/background service, full authentication and admin features remain. The updater can request a short-lived release-asset URL, download the APK with Android DownloadManager, and hand off to Android's package installer. To work against this private repository, configure `AURORA_GITHUB_TOKEN` as a server-side secret in the deployed web app, and configure the release-signing secrets listed in `android-native/README.md`. The native APK build and real-device installation/update have not yet been verified.
