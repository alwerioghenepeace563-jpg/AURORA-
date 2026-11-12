import fs from "node:fs";

const file = "src/App.jsx";
const backup = "src/App.jsx.before-final-symbol-fix.bak";

if (fs.existsSync(backup)) {
  throw new Error("Backup already exists; stopping without editing.");
}

const original = fs.readFileSync(file, "utf8");
const fixes = [
  ['â— ACTIVE', '● ACTIVE'],
  ['âœ“ COMPLETED', '✓ COMPLETED'],
  ['â—· SCHEDULED', '◷ SCHEDULED'],
  ['Preferences saved âœ“', 'Preferences saved ✓'],
  ['â˜€', '☀'],
  ['âŒ–', '⌖'],
  ['â€º', '›'],
  ['â†‘', '↑'],
  ['âŒ•', '⌕'],
  ['â–£', '▣'],
  ['âœŽ', '✎'],
  ['â€¢â€¢â€¢', '•••'],
  ['CAPTURE â€¢ REVIEW â€¢ CONTINUE', 'CAPTURE • REVIEW • CONTINUE']
];

let updated = original;
for (const [bad, good] of fixes) {
  const count = updated.split(bad).length - 1;
  if (count > 0) {
    updated = updated.split(bad).join(good);
    console.log(JSON.stringify(bad), "->", JSON.stringify(good), "count:", count);
  }
}

if (updated === original) {
  throw new Error("No matching damaged symbols found; file unchanged.");
}

fs.copyFileSync(file, backup);
fs.writeFileSync(file, updated, "utf8");
console.log("Backup created:", backup);
console.log("Repair saved.");
