const fs = require("node:fs");
const assert = require("node:assert/strict");

const manifest = fs.readFileSync("android/app/src/main/AndroidManifest.xml", "utf8");
const activity = fs.readFileSync("android/app/src/main/java/com/aurora/assistant/MainActivity.java", "utf8");
const plugin = fs.readFileSync("android/app/src/main/java/com/aurora/assistant/AuroraTranscriptionPlugin.java", "utf8");
const service = fs.readFileSync("android/app/src/main/java/com/aurora/assistant/AuroraTranscriptionService.java", "utf8");
const bridge = fs.readFileSync("src/lib/aurora-native.ts", "utf8");
const workspace = fs.readFileSync("src/components/CreativeLearningWorkspace.jsx", "utf8");

assert.match(manifest, /FOREGROUND_SERVICE_DATA_SYNC/);
assert.match(manifest, /AuroraTranscriptionService.*foregroundServiceType="dataSync"/);
assert.match(activity, /registerPlugin\(AuroraTranscriptionPlugin\.class\)/);
assert.match(plugin, /ACTION_START/);
assert.match(plugin, /ACTION_UPDATE/);
assert.match(plugin, /ACTION_STOP/);
assert.match(service, /startForeground\(/);
assert.match(service, /setOngoing\(true\)/);
assert.match(service, /setProgress\(/);
assert.match(bridge, /startTranscriptionService/);
assert.match(bridge, /updateTranscriptionService/);
assert.match(bridge, /stopTranscriptionService/);
assert.match(workspace, /startTranscriptionService\(mediaFile\.name\)/);
assert.match(workspace, /updateTranscriptionService\(mediaFile\.name,progressMessage/);
assert.match(workspace, /stopTranscriptionService\(\)/);
assert.match(workspace, /reselect the same recording and resume/);
console.log("AURORA foreground transcription contract checks passed.");
