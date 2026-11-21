const assert = require("node:assert/strict");
const fs = require("node:fs");

const service = fs.readFileSync("android/app/src/main/java/com/aurora/assistant/AuroraAssistantService.java", "utf8");
const plugin = fs.readFileSync("android/app/src/main/java/com/aurora/assistant/AuroraAssistantPlugin.java", "utf8");
const app = fs.readFileSync("src/App.jsx", "utf8");
const manifest = fs.readFileSync("android/app/src/main/AndroidManifest.xml", "utf8");

assert.match(service, /ACTION_STOP/);
assert.match(service, /addAction\(android\.R\.drawable\.ic_media_pause, "Stop listening"/);
assert.match(service, /FOREGROUND_SERVICE_TYPE_MICROPHONE/);
assert.match(service, /checkSelfPermission\(android\.Manifest\.permission\.RECORD_AUDIO\)/);
assert.match(service, /checkSelfPermission\(android\.Manifest\.permission\.POST_NOTIFICATIONS\)/);
assert.match(service, /return START_NOT_STICKY/);
assert.doesNotMatch(service, /return START_STICKY/);
assert.match(service, /putBoolean\("wake_word_listening", false\)/);
assert.match(service, /putBoolean\("wake_detected", true\)/);
assert.match(service, /putString\("wake_command", spokenCommand\)/, "The wake listener must retain words spoken after the wake phrase.");
assert.match(service, /EXTRA_AUTO_LISTEN, spokenCommand\.isEmpty\(\)/, "Pulse should only start a second listening session when no command was captured.");
assert.match(plugin, /putString\("command", command\)/, "The native bridge must return the captured wake command.");
assert.match(plugin, /wake_command_at/, "Captured wake commands must expire.");
assert.match(service, /stopForeground\(true\)/);
assert.match(plugin, /Allow notifications first so Android can show the active microphone listener and its Stop control/);
assert.match(plugin, /serviceRunning && listeningFlag/);
assert.match(app, /requestNotificationPermission\(\)/);
assert.match(app, /Start Hey AURORA/);
assert.match(app, /Stop service/);
assert.match(app, /pulseDispatchRef\.current\?\.\(result\.command\.trim\(\)\)/, "Wake commands must enter the shared Pulse dispatcher.");
assert.match(app, /shared AURORA action engine/, "The app must report shared wake-command routing.");
assert.match(manifest, /android:foregroundServiceType="microphone"/);

console.log("AURORA wake-listener tests passed: explicit permissions, visible stop control, truthful live status, and no sticky auto-restart.");
