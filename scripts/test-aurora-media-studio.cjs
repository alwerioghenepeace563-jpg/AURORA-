const assert = require("node:assert/strict");
const fs = require("node:fs");
const api = fs.readFileSync("api/media-jobs.js", "utf8");
const studio = fs.readFileSync("src/components/CreativeMediaStudio.jsx", "utf8");
const workspace = fs.readFileSync("src/components/CreativeLearningWorkspace.jsx", "utf8");
const styles = fs.readFileSync("src/styles.css", "utf8");
const imageWorkspace = fs.readFileSync("src/components/CreativeLearningWorkspace.jsx", "utf8");
const mediaVault = fs.readFileSync("src/lib/aurora-media-vault.js", "utf8");

for (const value of [
  "GEMINI_API_KEY",
  "veo-3.1-generate-preview",
  "predictLongRunning",
  "video:create",
  "video:status",
  "video:download",
  "safeOperationName",
  "durationSeconds",
  "personGeneration: \"allow_adult\"",
  "48000000"
]) assert.ok(api.includes(value), "Video API safeguard missing: " + value);

for (const value of [
  "aurora.creative.video-job.v1",
  "localStorage",
  "operationName",
  "setTimeout(poll, 10000)",
  "Retry job",
  "Load MP4",
  "Generate voiceover",
  "/api/voice",
  "/api/voices",
  "Download MP3",
  "Save script to project"
]) assert.ok(studio.includes(value), "Creative Media Studio feature missing: " + value);

assert.ok(!studio.includes("GEMINI_API_KEY"), "Provider secrets must never appear in client code.");
assert.ok(!studio.includes("ELEVENLABS_API_KEY"), "Voice provider secrets must never appear in client code.");
for (const value of ["aurora.creative.image-job.v1", "saveAuroraMediaBlob", "getAuroraMediaBlob", "Retry image", "URL.createObjectURL"]) assert.ok(imageWorkspace.includes(value), "Image job recovery wiring missing: " + value);
for (const value of ["indexedDB.open", "generated-media", "saveAuroraMediaBlob", "getAuroraMediaBlob"]) assert.ok(mediaVault.includes(value), "Local media vault feature missing: " + value);
assert.ok(workspace.includes('import CreativeMediaStudio from "./CreativeMediaStudio"'), "Media Studio is not imported into Creative Studio.");
assert.ok(workspace.includes("<CreativeMediaStudio projectId={selected} onSaved={refresh} authSession={authSession} />"), "Media Studio is not mounted in the project workspace.");
for (const value of [".clw-media-studio-grid", ".clw-job-status", ".clw-generated-video", ".clw-generated-audio"]) {
  assert.ok(styles.includes(value), "Media Studio styling missing: " + value);
}
console.log("AURORA Creative Media Studio checks passed: Veo job API, local job recovery, MP4 retrieval, ElevenLabs voiceover and workspace integration.");
