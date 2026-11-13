import assert from "node:assert/strict";
import { onRequest } from "../functions/api/[[path]].js";

const healthResponse = await onRequest({
  request: new Request("https://aurora-assistant.pages.dev/api/health")
});
assert.equal(healthResponse.status, 200, "health route should resolve through the legacy metadata rewrite");
const health = await healthResponse.json();
assert.equal(health.ok, true, "health route should return the AURORA API status");

const preflightResponse = await onRequest({
  request: new Request("https://aurora-assistant.pages.dev/api/search?type=images&q=microscope", {
    method: "OPTIONS",
    headers: {
      Origin: "https://aurora-assistant.pages.dev",
      "Access-Control-Request-Method": "GET"
    }
  })
});
assert.equal(preflightResponse.status, 204, "Cloudflare Pages API should answer CORS preflight");
assert.equal(
  preflightResponse.headers.get("access-control-allow-origin"),
  "https://aurora-assistant.pages.dev",
  "Cloudflare Pages origin should be reflected by the CORS policy"
);

const missingResponse = await onRequest({
  request: new Request("https://aurora-assistant.pages.dev/api/route-that-does-not-exist")
});
assert.equal(missingResponse.status, 404, "unknown API routes should return 404");

console.log("Cloudflare Pages adapter smoke checks passed.");
