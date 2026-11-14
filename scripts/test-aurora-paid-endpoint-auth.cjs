const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { verifySupabaseUser } = require("../lib/supabase-auth.cjs");

(async () => {
  const originalFetch = global.fetch;
  const originalEnv = {
    SUPABASE_URL: process.env.SUPABASE_URL,
    VITE_SUPABASE_URL: process.env.VITE_SUPABASE_URL,
    VITE_SUPABASE_API: process.env.VITE_SUPABASE_API,
    SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY,
    VITE_SUPABASE_ANON_KEY: process.env.VITE_SUPABASE_ANON_KEY
  };
  try {
    for (const key of Object.keys(originalEnv)) delete process.env[key];
    let fetchCalls = 0;
    global.fetch = async () => { fetchCalls++; return { ok: true, json: async () => ({ id: "test-user", email: "test@example.com" }) }; };

    const missing = await verifySupabaseUser({ headers: {} });
    assert.equal(missing.status, 401, "Requests without a bearer token must be rejected.");
    assert.equal(fetchCalls, 0, "Missing tokens must not call Supabase.");
    const unconfigured = await verifySupabaseUser({ headers: { authorization: "Bearer test-token" } });
    assert.equal(unconfigured.status, 503, "Missing server auth configuration must fail closed.");
    assert.equal(fetchCalls, 0, "Missing server configuration must not call Supabase.");

    process.env.SUPABASE_URL = "https://example.supabase.co";
    process.env.SUPABASE_ANON_KEY = "public-anon-test-key";
    const verified = await verifySupabaseUser({ headers: { authorization: "Bearer valid-test-token" } });
    assert.equal(verified.ok, true, "A valid Supabase user response must be accepted.");
    assert.equal(verified.user.id, "test-user");
    assert.equal(fetchCalls, 1);

    global.fetch = async () => ({ ok: false, json: async () => ({}) });
    const expired = await verifySupabaseUser({ headers: { authorization: "Bearer expired-test-token" } });
    assert.equal(expired.status, 401, "Expired or invalid sessions must be rejected.");

    const voice = fs.readFileSync(path.join(__dirname, "../api/voice.js"), "utf8");
    const image = fs.readFileSync(path.join(__dirname, "../api/media-generate.js"), "utf8");
    const v1 = fs.readFileSync(path.join(__dirname, "../api/v1/chat.js"), "utf8");
    const app = fs.readFileSync(path.join(__dirname, "../src/App.jsx"), "utf8");
    const creative = fs.readFileSync(path.join(__dirname, "../src/components/CreativeLearningWorkspace.jsx"), "utf8");
    assert.match(voice, /verifySupabaseUser\(req\)/, "Cloud voice must verify the signed-in user.");
    assert.match(image, /verifySupabaseUser\(req\)/, "Image generation must verify the signed-in user.");
    assert.match(v1, /verifySupabaseUser\(req\)/, "Versioned chat must use the shared Supabase verifier.");
    assert.doesNotMatch(v1, /auth\/v1\/user/, "Versioned chat must not keep a duplicate verifier implementation.");
    assert.match(app, /Authorization: "Bearer " \+ \(authSession\?\.access_token \|\| ""\)/, "Cloud voice client must send the session token.");
    assert.match(creative, /Authorization:"Bearer "\+\(authSession\?\.access_token\|\|""\)/, "Image generation client must send the session token.");

    const cors = fs.readFileSync(path.join(__dirname, "../lib/cors.cjs"), "utf8");
    assert.match(cors, /Access-Control-Allow-Headers.*Authorization/i, "CORS must allow bearer-token preflight headers.");
    console.log("AURORA paid-endpoint authentication checks passed.");
  } finally {
    global.fetch = originalFetch;
    for (const [key, value] of Object.entries(originalEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
