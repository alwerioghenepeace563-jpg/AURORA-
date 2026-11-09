const fs = require("node:fs");
const assert = require("node:assert/strict");

const endpoint = fs.readFileSync("api/voicetext-transcribe.js", "utf8");
const workspace = fs.readFileSync("src/components/CreativeLearningWorkspace.jsx", "utf8");
const env = fs.readFileSync(".env.example", "utf8");

assert.match(endpoint, /VOICETEXT_PLUGIN_TOKEN/);
assert.match(endpoint, /VOICETEXT_API_URL/);
assert.match(endpoint, /Authorization: "Bearer " \+ token/);
assert.match(endpoint, /\/api\/aurora-transcribe/);
assert.match(endpoint, /4000000/);
assert.match(endpoint, /audio files only/);
assert.match(workspace, /\/api\/voicetext-transcribe/);
assert.match(workspace, /AURORA VoiceText/);
assert.match(workspace, /Nigerian English and Nigerian Pidgin/);
assert.match(workspace, /new MediaRecorder\(capture\.stream/);\nassert.match(workspace, /setTimeout\(finish,20000\)/);\nassert.match(workspace, /mediaResumeOffset/);\nassert.match(workspace, /Resume transcription/);\nassert.doesNotMatch(workspace, /mediaFile\.size\s*>\s*\d+/);
assert.doesNotMatch(workspace, /messages:\[\{role:"user",content:prompt,media:/);
assert.match(env, /VOICETEXT_PLUGIN_TOKEN=/);
assert.match(env, /VOICETEXT_API_URL=/);
console.log("AURORA VoiceText bridge contract checks passed.");
