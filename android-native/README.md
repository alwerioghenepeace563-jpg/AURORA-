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
The current project is a native UI foundation, not yet a complete port of every web screen or AI feature. The next work is to port the existing app screens and connect the native chat/voice flows to the same secure backend.

The Updates screen currently checks GitHub's latest-release API and opens a release page; it does not download or install updates yet. The repository is private, so the unauthenticated GitHub release endpoint may not be accessible from the installed app. Do not put a GitHub token or other secret in the APK. Before implementing in-app APK download/install, configure a public update feed or a secure backend proxy, use the final application ID, and sign every release with the same private signing key. Android must still ask the user to approve installation.

## Keep the web app safe
Continue native work only on `feat/true-native-android`. Do not replace or delete the existing web app as part of the native port.
