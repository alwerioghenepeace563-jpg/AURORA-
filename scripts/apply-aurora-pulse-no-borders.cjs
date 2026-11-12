const fs = require("fs");

const file = "src/App.jsx";
const source = fs.readFileSync(file, "utf8");
const marker = "/* AURORA_PULSE_COMPACT_GLOW_V1 */";
const styleEnd = "                `}</style>";

if (!source.includes(marker) || !source.includes(styleEnd)) {
  throw new Error("Expected Pulse CSS markers not found. No changes made.");
}
if (source.includes("AURORA_PULSE_NO_BORDERS_V1")) {
  throw new Error("Border override already exists. No changes made.");
}

fs.copyFileSync(file, file + ".before-no-borders.bak");

const css = `
/* AURORA_PULSE_NO_BORDERS_V1 */
.aurora-pulse-backdrop .aurora-pulse-panel,
.aurora-pulse-backdrop .aurora-pulse-panel *,
.aurora-pulse-backdrop .aurora-pulse-panel *::before,
.aurora-pulse-backdrop .aurora-pulse-panel *::after {
  border-color: transparent !important;
  border-style: none !important;
  outline: none !important;
}
.aurora-pulse-backdrop .aurora-pulse-panel {
  box-shadow:
    0 0 10px rgba(190, 225, 255, .24),
    0 0 26px rgba(140, 195, 255, .16),
    0 16px 45px rgba(0, 0, 0, .12) !important;
}
.aurora-pulse-backdrop .aurora-pulse-composer {
  box-shadow: none !important;
}
/* END AURORA_PULSE_NO_BORDERS_V1 */
`;

fs.writeFileSync(file, source.replace(styleEnd, css + "\n" + styleEnd), "utf8");
console.log("Pulse border override applied.");
console.log("Backup: " + file + ".before-no-borders.bak");
