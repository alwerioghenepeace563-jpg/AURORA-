const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = file => fs.readFileSync(path.join(root, file), "utf8");

(async () => {
  const { inferResearchIntent } = await import("../src/research/intent-engine.js");
  const { normalizeWebSources } = await import("../src/research/result-normalizer.js");
  const { createResearchCoordinator } = await import("../src/research/research-coordinator.js");
  const { createResearchCache } = await import("../src/research/research-cache.js");

  const intent = inferResearchIntent("Find the latest diagrams and videos about solar energy");
  assert.equal(intent.intent, "visual");
  assert.ok(intent.mediaTypes.includes("web"));
  assert.ok(intent.mediaTypes.includes("diagram"));
  assert.ok(intent.mediaTypes.includes("video"));
  assert.equal(inferResearchIntent("show me a PDF report", { mediaTypes: ["document"] }).mediaTypes[0], "document");

  const cache = createResearchCache({ ttlMs: 5000, maxEntries: 2 });
  const cacheKey = { query: "solar", intent: "quick", mediaTypes: ["web"] };
  cache.set(cacheKey, { status: "complete" });
  assert.equal(cache.get(cacheKey).status, "complete");
  cache.clear();
  assert.equal(cache.size(), 0);

  const normalized = normalizeWebSources([{ source: "Test Search", results: [
    { title: "A result", url: "https://example.com/article", snippet: "Evidence snippet" },
    { title: "Unsafe", url: "javascript:alert(1)", snippet: "Must be discarded" }
  ] }], "test-task");
  assert.equal(normalized.sources.length, 1);
  assert.equal(normalized.extractedContent.length, 1);
  assert.equal(normalized.sources[0].domain, "example.com");

  const run = createResearchCoordinator({
    search: async () => ({ providers: [{ source: "Test Search", results: [
      { title: "A result", url: "https://example.com/article", snippet: "Evidence snippet" }
    ] }], errors: [] }),
    media: async () => ({ results: [], errors: [] })
  });
  const result = await run({ query: "latest solar energy research", mediaTypes: ["web"] });
  assert.equal(result.status, "complete");
  assert.equal(result.sources.length, 1);
  assert.equal(result.verification.level, "discovery_only");
  assert.equal(result.verification.diversityLevel, "single_source_discovery");
  assert.match(result.context, /https:\/\/example\.com\/article/);

  const partialRun = createResearchCoordinator({
    search: async () => ({ providers: [{ source: "Test Search", results: [
      { title: "A result", url: "https://example.org/article", snippet: "Snippet" }
    ] }], errors: ["Bing unavailable"] }),
    media: async () => ({ results: [], errors: [] })
  });
  const partial = await partialRun({ query: "solar energy", mediaTypes: ["web"] });
  assert.equal(partial.status, "partial");
  assert.ok(partial.warnings.some(item => item.includes("Bing unavailable")));

  const searchApi = read("api/search.js");
  const mediaApi = read("api/media-search.js");
  const chatApi = read("api/chat.js");
  const pulse = read("android/app/src/main/assets/aurora_pulse_panel.html");
  const app = read("src/App.jsx");
  const researchClient = read("src/research/research-client.js");
  const nativePlugin = read("android/app/src/main/java/com/aurora/assistant/AuroraResearchBrowserPlugin.java");
  const assistantPlugin = read("android/app/src/main/java/com/aurora/assistant/AuroraAssistantPlugin.java");
  const browserActivity = read("android/app/src/main/java/com/aurora/assistant/AuroraResearchBrowserActivity.java");
  const manifest = read("android/app/src/main/AndroidManifest.xml");
  const patcher = read("scripts/patch-android-native.mjs");

  assert.match(searchApi, /searchAuroraWebMulti/);
  assert.match(searchApi, /export async function searchBingImages/);
  assert.match(searchApi, /requestBody\?\.research === true/);
  assert.match(mediaApi, /searchAuroraMedia/);
  assert.match(mediaApi, /searchBingImages/);
  assert.match(mediaApi, /"document","diagram"/);
  assert.match(chatApi, /runAuroraResearch/);
  assert.match(pulse, /research: true/);
  assert.match(app, /Visual discoveries/);
  assert.match(app, /downloadPublicMedia/);
  assert.match(assistantPlugin, /document[\s\\]*\.equals\\?\(kind\)/);
  assert.match(assistantPlugin, /documents[\\s\\S]*?pdf/);
  assert.match(app, /openResearchBrowser/);
  assert.match(researchClient, /inferResearchIntent/);
  assert.match(nativePlugin, /AuroraResearchBrowserActivity/);
  assert.match(browserActivity, /setDataDirectorySuffix\("aurora_research"\)/);
  assert.match(browserActivity, /setAcceptCookie\(false\)/);
  assert.match(browserActivity, /setAllowFileAccess\(false\)/);
  assert.match(manifest, /android:process=":aurora_research"/);
  assert.match(patcher, /registerPlugin\(AuroraResearchBrowserPlugin\.class\)/);
  console.log("AURORA Research Engine contract, routing, and isolation checks passed.");
})().catch(error => { console.error(error); process.exitCode = 1; });
