const assert = require("node:assert/strict");
const fs = require("node:fs");
const app = fs.readFileSync("src/App.jsx", "utf8");
const css = fs.readFileSync("src/styles.css", "utf8");
const pkg = JSON.parse(fs.readFileSync("package.json", "utf8"));
for (const type of ["flow", "card", "live", "research", "action", "map", "metrics"]) {
  assert.ok(app.includes('"'+type+'"') || app.includes(type), "renderer should support "+type+" cards");
}
assert.match(app, /function StructuredVisual\(\{ data \}\)/);
assert.match(app, /function findStructuredBlock\(line\)/);
assert.match(app, /new URL\(String\(value \|\| ""\)\)/, "external links must be protocol-validated");
assert.match(app, /rel="noreferrer"/);
assert.match(app, /data\.updatedAt/);
assert.match(app, /Open in Maps/);
assert.match(css, /\.aurora-data-card\{/);
assert.match(css, /\.aurora-metric-grid\{/);
assert.match(css, /\.aurora-action-list\{/);
assert.match(pkg.scripts["test:core"], /test-aurora-pulse-visual-cards\.cjs/);
console.log("AURORA Pulse visual-card framework source checks passed.");
