# AURORA Native Android

This is the separate Kotlin + Jetpack Compose Android implementation. It is intentionally kept separate from the existing React/Vite web app and Capacitor package.

## Build a preview APK
GitHub Actions workflow: `.github/workflows/android-native-apk.yml`

1. Open the workflow and choose **Run workflow**, or push a change under `android-native/` to `feat/true-native-android`.
2. Wait for the run to finish successfully.
3. Open the run's **Artifacts** section and download `AURORA-Native-Android-Preview`.
4. Extract the ZIP and install the debug APK on Android. Android may ask you to allow installs from the app you used to open it.

The preview APK uses a separate debug package ID (`com.aurora.assistant.nativepreview`) so it won't overwrite an existing AURORA build.

## Important status
The native project now includes the core home/orb/navigation shell, text chat using the existing backend, locally saved chat/profile data, hosted voice replies, Android speech input, image/PDF/text attachments, camera-photo capture, app-launch commands, local Activities, a focus timer, search/weather/calculator/conversion tools, and the first updater/download-install flow. It is still a partial port: wake phrase/background assistant service, full schedule notifications, complete authentication/admin screens, rich message rendering and one-to-one visual verification remain. The build and update flow still need verification on a real Android device.

The Updates screen checks release metadata through /api/app-update. Once a signed APK is attached to a GitHub Release and AURORA_GITHUB_TOKEN is configured server-side, the native updater can request a short-lived download URL, download the APK, and hand it to Android's installer. Android requires user approval; the app cannot silently install itself. Never put the GitHub token in the APK or commit it to Git.


## Signed releases and updates

The release workflow is .github/workflows/android-native-release.yml. It runs for tags like aurora-v0.1.1 or by manually running the workflow on a tag.

Before creating the first release, create one long-lived Android signing keystore on a trusted computer and keep a secure backup. Never regenerate or lose it after publishing an APK, because updates must use the same signing key.

Add these GitHub repository Actions secrets:
- AURORA_KEYSTORE_BASE64 — the keystore file encoded as Base64
- AURORA_KEYSTORE_PASSWORD
- AURORA_KEY_ALIAS
- AURORA_KEY_PASSWORD

Add AURORA_GITHUB_TOKEN as a server-side secret in the deployed web app environment. Use a fine-grained token with read-only access to the AURORA repository contents/releases. Redeploy the web app after adding it. Do not name it with a VITE_ prefix.

The debug preview package is com.aurora.assistant.nativepreview; the signed release package is com.aurora.assistant. The first release installs as a separate app from the debug preview. Later signed releases can update the release app only when the package ID and signing key remain unchanged.

## Keep the web app safe
Continue native work only on `feat/true-native-android`. Do not replace or delete the existing web app as part of the native port.
