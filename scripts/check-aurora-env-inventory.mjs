import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const roots = ["api", "lib", "src"];
const ignored = new Set(["node_modules", ".git", "dist", "build"]);
const files = [];

function walk(dir) {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (ignored.has(entry.name) || entry.name.endsWith(".bak")) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (/\.(?:js|jsx|ts|tsx|mjs|cjs)$/.test(entry.name)) files.push(full);
  }
}
roots.forEach((name) => walk(path.join(root, name)));

const references = new Map();
const patterns = [
  /process\.env\.([A-Z][A-Z0-9_]*)/g,
  /process\.env\[\s*["']([A-Z][A-Z0-9_]*)["']\s*\]/g,
  /import\.meta\.env\.([A-Z][A-Z0-9_]*)/g
];
for (const file of files) {
  const source = fs.readFileSync(file, "utf8");
  for (const pattern of patterns) {
    pattern.lastIndex = 0;
    for (const match of source.matchAll(pattern)) {
      const name = match[1];
      if (!references.has(name)) references.set(name, []);
      references.get(name).push(path.relative(root, file));
    }
  }
}

const template = fs.readFileSync(path.join(root, ".env.example"), "utf8");
const guide = fs.readFileSync(path.join(root, "docs/integrations/AURORA_API_KEYS_AND_SECRETS_SETUP.md"), "utf8");
const missingGuide = [...references.keys()].filter((name) => !guide.includes(name));
const missingTemplate = [...references.keys()].filter((name) => name.startsWith("VITE_") && !template.includes(name));
const privilegedClientVars = [...references.keys()].filter((name) =>
  name.startsWith("VITE_") && /(SECRET|SERVICE_ROLE|PRIVATE|TOKEN|API_KEY)/i.test(name)
);

if (missingGuide.length || missingTemplate.length || privilegedClientVars.length) {
  console.error("AURORA environment inventory check failed.");
  if (missingGuide.length) console.error("Undocumented environment variables:", missingGuide.join(", "));
  if (missingTemplate.length) console.error("Client build variables missing from .env.example:", missingTemplate.join(", "));
  if (privilegedClientVars.length) console.error("Potential privileged secrets exposed as VITE_ variables:", privilegedClientVars.join(", "));
  process.exit(1);
}

console.log(`AURORA environment inventory passed: ${references.size} referenced variables checked across ${files.length} source files.`);
