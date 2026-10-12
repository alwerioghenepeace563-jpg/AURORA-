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
- [ ] Native actions for supported apps and device features

## Batch 3 — Remaining screens and tools
- [x] Port core profile fields and local persistence; remaining web profile/settings fields still need to port
- [x] Add native local Tasks, Notes, Reminders and Events; full web activity parity and schedules remain to port
- [x] Add native search, weather and calculator plus common unit conversions; image/document attachments and camera flows remain to port
- [ ] Port authentication and admin-only features with secure session handling
- [ ] Test each feature against its existing web counterpart

## Batch 4 — Updates and release
- [ ] Decide final application ID and preserve it for every release
- [ ] Configure private release signing securely (never commit the keystore or passwords)
- [x] Add a server-side GitHub release metadata proxy at `/api/app-update`; configure `AURORA_GITHUB_TOKEN` in the server environment for private repository releases
- [ ] Download APK updates and launch Android's user-approved package installer
- [ ] Verify version comparison, checksums/signatures, failed downloads and rollback guidance
- [ ] Build and test a signed release APK on a real Android device

## Current limitations
The app is not yet a full parity port. The current chat sends text and a small message history to `/api/chat`; it does not yet transfer all web-app profile/provider settings or voice/attachment functionality. The current update page checks release metadata through `/api/app-update` and can open a release page; it does not download or install updates yet. The server-side proxy requires `AURORA_GITHUB_TOKEN` to be configured as a secret in the deployed web app environment for this private repository.
