import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [ui, worker, signaling, config, app] = await Promise.all([
  readFile(new URL("../src/components/AuroraConnectWorkspace.jsx", import.meta.url), "utf8"),
  readFile(new URL("../cloudflare/aurora-api/src/index.ts", import.meta.url), "utf8"),
  readFile(new URL("../cloudflare/aurora-api/src/connect.ts", import.meta.url), "utf8"),
  readFile(new URL("../cloudflare/aurora-api/wrangler.jsonc", import.meta.url), "utf8"),
  readFile(new URL("../src/App.jsx", import.meta.url), "utf8")
]);

assert.match(ui, /RTCPeerConnection/, "Connect must use WebRTC peer connections");
assert.match(ui, /getUserMedia/, "Connect must request microphone access");
assert.match(ui, /api\/connect\/ticket/, "Connect must request a short-lived call ticket");
assert.match(ui, /AURORA COMMUNICATIONS NETWORK/, "Connect workspace must be discoverable");
assert.match(ui, /TURN relay service is not configured/, "Missing TURN fallback must be disclosed");
assert.match(worker, /handleAuroraConnect/, "Worker must expose authenticated Connect ticket creation");
assert.match(worker, /auth\/v1\/user/, "Worker must verify the Supabase caller");
assert.match(worker, /AURORA_CONNECT_ROOMS/, "Worker must route signaling to the room Durable Object");
assert.match(signaling, /class AuroraConnectRoom/, "A room Durable Object must exist");
assert.match(signaling, /expirationTtl: 90/, "Call tickets must expire quickly");
assert.match(signaling, /peers\.length >= 2/, "Rooms must enforce a two-person limit");
assert.match(signaling, /16000/, "Signaling payloads must be size limited");
assert.match(config, /AuroraConnectRoom/, "Wrangler must bind and migrate the signaling Durable Object");
assert.match(app, /AuroraConnectWorkspace/, "Connect workspace must be wired into the app");
assert.match(app, /navigate\("connect"\)/, "Connect must be reachable from Explore");

console.log("AURORA Connect contract checks passed.");
