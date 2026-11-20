const assert = require("node:assert/strict");
(async () => {
  const { resolveAuroraApiUrl } = await import("../src/lib/aurora-api-config.js");
  assert.equal(resolveAuroraApiUrl("/api/chat", { baseUrl: "https://aurora-api.example.workers.dev" }), "https://aurora-api.example.workers.dev/api/chat");
  assert.equal(resolveAuroraApiUrl("api/search", { baseUrl: "https://aurora-api.example.workers.dev/" }), "https://aurora-api.example.workers.dev/api/search");
  assert.equal(resolveAuroraApiUrl("/api/chat", { isNative: true }), "https://aurora-ten-gold.vercel.app/api/chat");
  assert.equal(resolveAuroraApiUrl("/api/chat", { isNative: false }), "/api/chat");
  assert.equal(resolveAuroraApiUrl("/api/chat", { baseUrl: "javascript:alert(1)", isNative: true }), "https://aurora-ten-gold.vercel.app/api/chat");
  assert.equal(resolveAuroraApiUrl("/api/chat", { baseUrl: "https://user:pass@example.com", isNative: false }), "/api/chat");
  assert.equal(resolveAuroraApiUrl("/api/chat", { baseUrl: "https://example.com/api", isNative: false }), "/api/chat");
  assert.equal(resolveAuroraApiUrl("/api/chat", { baseUrl: "http://localhost:8787", isNative: false }), "http://localhost:8787/api/chat");
  console.log("AURORA API routing tests passed.");
})().catch(error => { console.error(error); process.exitCode = 1; });
