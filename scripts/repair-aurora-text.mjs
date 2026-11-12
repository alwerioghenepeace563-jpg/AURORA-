import fs from "node:fs";

const file = "src/App.jsx";
const original = fs.readFileSync(file, "utf8");
let updated = original;

const replacements = [
  ["â\u0081´", "⁴"],
  ["â\u0081µ", "⁵"],
  ["â†“", "↓"],
  ["â†˜", "↘"],
  ["â†—", "↗"],
  ["â€œ", "“"],
  ["â€\u009D", "”"],
  ["â€™", "’"],
  ["â€”", "—"],
  ["â€¦", "…"],
  ["Â°", "°"],
  ["æ–‡", "文"]
];

for (const [bad, good] of replacements) {
  const count = updated.split(bad).length - 1;
  if (count > 0) {
    updated = updated.split(bad).join(good);
    console.log(JSON.stringify(bad), "->", JSON.stringify(good), "count:", count);
  }
}

if (updated === original) {
  console.log("No exact sequences matched; file left unchanged.");
  process.exit(0);
}

fs.writeFileSync(file, updated, "utf8");
console.log("Updated src/App.jsx. Bytes:", Buffer.byteLength(updated, "utf8"));
