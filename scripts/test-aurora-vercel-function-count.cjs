const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");

const apiRoot = path.resolve("api");
const countJs = (dir) => fs.readdirSync(dir, { withFileTypes: true }).reduce((total, entry) => {
  const full = path.join(dir, entry.name);
  return total + (entry.isDirectory() ? countJs(full) : entry.isFile() && entry.name.endsWith(".js") ? 1 : 0);
}, 0);
const apiFunctions = countJs(apiRoot);
assert.equal(apiFunctions, 12, `Expected 12 Vercel API functions after consolidation; found ${apiFunctions}.`);

const config = JSON.parse(fs.readFileSync("vercel.json", "utf8"));
const rewrites = config.rewrites || [];
const rewriteMap = new Map(rewrites.map((item) => [item.source, item.destination]));
assert.equal(rewriteMap.get("/api/admin-code"), "/api/admin?handler=code");
assert.equal(rewriteMap.get("/api/admin-execute"), "/api/admin?handler=execute");
assert.equal(rewriteMap.get("/api/models"), "/api/meta?handler=models");
assert.equal(rewriteMap.get("/api/public-config"), "/api/meta?handler=public-config");

const admin = fs.readFileSync("api/admin.js", "utf8");
assert.match(admin, /\.\.\/lib\/vercel-handlers\/admin-code\.js/);
assert.match(admin, /\.\.\/lib\/vercel-handlers\/admin-execute\.js/);
assert.match(admin, /action === "code"/);
assert.match(admin, /action === "execute"/);

for (const name of ["admin-code.js", "admin-execute.js", "models.js", "public-config.js"]) {
  assert.ok(!fs.existsSync(path.join(apiRoot, name)), `Duplicate API entrypoint still exists: ${name}`);
}
for (const name of ["admin-code.js", "admin-execute.js", "models.js", "public-config.js", "health.js"]) {
  assert.ok(fs.existsSync(path.resolve("lib/vercel-handlers", name)), `Shared handler missing: ${name}`);
}
const movedAdminCode = fs.readFileSync("lib/vercel-handlers/admin-code.js", "utf8");
const movedAdminExecute = fs.readFileSync("lib/vercel-handlers/admin-execute.js", "utf8");
assert.match(movedAdminCode, /from "\.\.\/cors\.cjs"/);
assert.match(movedAdminExecute, /from "\.\.\/cors\.cjs"/);

console.log("AURORA Vercel function consolidation checks passed (12 API functions; legacy URLs retained).");
