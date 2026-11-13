const assert = require("node:assert/strict");
const fs = require("node:fs");
const app = fs.readFileSync("src/App.jsx", "utf8");
const pulse = fs.readFileSync("src/components/AuroraPulseExperience.jsx", "utf8");
const css = fs.readFileSync("src/components/AuroraPulseExperience.css", "utf8");

assert.match(app, /const pulseVisible = pulseOpen \|\| page === "pulse"/);
assert.match(app, /if \(!pulseVisible\)[\s\S]*?cleanupPulseSpeech\(\)/);
assert.match(app, /document\.addEventListener\("keydown", onKeyDown\)/);
assert.match(app, /event\.key === "Escape"/);
assert.match(app, /document\.addEventListener\("visibilitychange", onVisibility\)/);
assert.match(app, /document\.visibilityState === "hidden"/);
assert.match(app, /import AuroraPulseExperience from "\.\/components\/AuroraPulseExperience"/);
assert.match(app, /<AuroraPulseExperience[\s\S]*?messages=\{pulseMessages\}/);
assert.match(app, /const thinkingId = "pulse-response-" \+ Date\.now\(\)/);
assert.match(app, /message\.id === thinkingId[\s\S]*?status: "complete"/);

assert.match(pulse, /aria-live="polite"/);
assert.match(pulse, /message\.status === "thinking"/);
assert.match(pulse, /onPointerDown=\{startDrag\}/);
assert.match(pulse, /setToolsOpen/);
assert.match(pulse, /TRANSPARENCY/);
assert.match(css, /\.aurora-pulse-overlay\{[^}]*pointer-events:none/);
assert.match(css, /\.aurora-pulse-chatbox\{[^}]*pointer-events:auto/);
assert.match(css, /\.aurora-pulse-edge-light/);
assert.match(css, /prefers-reduced-motion:reduce/);
console.log("AURORA Pulse non-blocking overlay, interaction and accessibility checks passed.");
