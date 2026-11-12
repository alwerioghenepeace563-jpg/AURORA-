const assert = require("node:assert/strict");
const fs = require("node:fs");
const endpoint = fs.readFileSync("api/media-generate.js", "utf8");
const workspace = fs.readFileSync("src/components/CreativeLearningWorkspace.jsx", "utf8");

for (const value of [
  "GEMINI_API_KEY",
  "generativelanguage.googleapis.com/v1beta/interactions",
  "gemini-3.1-flash-image",
  "ASPECT_RATIOS",
  "prompt.length > 1800",
  "AbortSignal.timeout(90000)",
  "image_size: \"1K\"",
  "data.length > 14000000",
  "saved: false"
]) assert.ok(endpoint.includes(value), "Image endpoint safeguard missing: " + value);

for (const value of [
  "AI Image Creator",
  "/api/media-generate",
  "maxLength={1800}",
  "Generate image",
  "Download image",
  "setGeneratedImage",
  "generatedImage.mimeType",
  "onClick={downloadGeneratedImage}"
]) assert.ok(workspace.includes(value), "Image creator UI missing: " + value);

assert.ok(!workspace.includes("GEMINI_API_KEY"), "Provider secret must never appear in client code.");
console.log("AURORA Stage 11 AI image generation checks passed.");
