const fs = require("fs");

const file = "src/App.jsx";
const source = fs.readFileSync(file, "utf8");
const marker = "/* AURORA_PULSE_GLASS_FIX_V1 */";

if (!source.includes(marker)) {
  throw new Error("Glass fix marker not found. No changes made.");
}

if (source.includes("AURORA_PULSE_COMPACT_GLOW_V1")) {
  throw new Error("Compact glow update already exists. No changes made.");
}

const backup = file + ".before-compact-glow.bak";
fs.copyFileSync(file, backup);

const css = `
/* AURORA_PULSE_COMPACT_GLOW_V1 */
.aurora-pulse-backdrop {
  padding: 10px !important;
  background: rgba(8, 10, 14, .12) !important;
  backdrop-filter: blur(2px) saturate(80%) !important;
  -webkit-backdrop-filter: blur(2px) saturate(80%) !important;
}
.aurora-pulse-panel {
  width: min(420px, 100%) !important;
  height: min(620px, 78vh) !important;
  padding: 12px !important;
  gap: 7px !important;
  border: none !important;
  border-radius: 28px !important;
  background: rgba(18, 20, 25, .24) !important;
  box-shadow:
    0 0 7px rgba(190, 225, 255, .30),
    0 0 20px rgba(140, 195, 255, .19),
    0 0 42px rgba(140, 195, 255, .10),
    0 16px 45px rgba(0, 0, 0, .13) !important;
}
.aurora-pulse-head {
  flex-basis: 76px !important;
  height: 76px !important;
  min-height: 76px !important;
}
.aurora-pulse-head .aurora-pulse-orb {
  width: 68px !important;
  height: 68px !important;
  flex-basis: 68px !important;
  border-radius: 50% !important;
  box-shadow:
    0 0 12px rgba(160, 220, 255, .45),
    0 0 26px rgba(130, 190, 255, .26) !important;
}
.aurora-pulse-greeting {
  padding: 0 0 4px !important;
}
.aurora-pulse-weather {
  border: none !important;
  border-radius: 16px !important;
}
.aurora-pulse-message {
  border: none !important;
  border-radius: 16px !important;
}
.aurora-pulse-message.user {
  border: none !important;
}
.aurora-pulse-composer {
  min-height: 58px !important;
  padding: 12px 14px !important;
  border: none !important;
  border-radius: 22px !important;
  background: rgba(255, 255, 255, .10) !important;
  box-shadow:
    inset 0 0 0 1px rgba(255, 255, 255, .07),
    0 0 18px rgba(175, 215, 255, .08) !important;
}
.aurora-pulse-composer input {
  font-size: 15px !important;
}
.aurora-pulse-shortcuts {
  gap: 5px !important;
}
.aurora-pulse-shortcuts button {
  border: none !important;
  background: rgba(255, 255, 255, .065) !important;
}
@media (max-width: 480px) {
  .aurora-pulse-backdrop {
    padding: 8px !important;
    padding-bottom: max(8px, env(safe-area-inset-bottom)) !important;
  }
  .aurora-pulse-panel {
    width: 100% !important;
    height: min(620px, 78dvh) !important;
    padding: 10px !important;
    border-radius: 24px !important;
  }
  .aurora-pulse-head {
    flex-basis: 72px !important;
    height: 72px !important;
    min-height: 72px !important;
  }
  .aurora-pulse-head .aurora-pulse-orb {
    width: 64px !important;
    height: 64px !important;
    flex-basis: 64px !important;
  }
}
/* END AURORA_PULSE_COMPACT_GLOW_V1 */
`;

fs.writeFileSync(
  file,
  source.replace(marker, marker + "\n" + css),
  "utf8"
);

console.log("Compact glass and glow update applied.");
console.log("Backup:", backup);
