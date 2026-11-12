const fs = require("fs");
const file = "src/App.jsx";
const source = fs.readFileSync(file, "utf8");
const marker = "                `}</style>";

if (!source.includes(marker)) {
  throw new Error("Expected Pulse style closing marker not found. No changes made.");
}
if (source.includes("AURORA_PULSE_GLASS_FIX_V1")) {
  throw new Error("Glass fix already exists. No changes made.");
}

const backup = file + ".before-glass-layout-fix.bak";
fs.copyFileSync(file, backup);

const css = `
/* AURORA_PULSE_GLASS_FIX_V1 */
.aurora-pulse-backdrop {
  background: rgba(10, 12, 16, 0.22) !important;
  backdrop-filter: blur(3px) saturate(85%) !important;
  -webkit-backdrop-filter: blur(3px) saturate(85%) !important;
  padding: 16px !important;
}
.aurora-pulse-panel {
  box-sizing: border-box !important;
  width: min(520px, 100%) !important;
  height: min(760px, 88vh) !important;
  min-height: 0 !important;
  padding: 18px !important;
  gap: 10px !important;
  overflow: hidden !important;
  border: 1px solid rgba(255,255,255,.18) !important;
  border-radius: 26px !important;
  background: rgba(22, 24, 28, .20) !important;
  box-shadow: 0 18px 55px rgba(0,0,0,.14) !important;
  color: rgba(255,255,255,.92) !important;
}
.aurora-pulse-head {
  display: flex !important;
  position: relative !important;
  align-items: center !important;
  justify-content: center !important;
  flex: 0 0 48px !important;
  height: 48px !important;
  min-height: 48px !important;
  padding: 0 !important;
}
.aurora-pulse-head .aurora-pulse-orb {
  position: static !important;
  inset: auto !important;
  transform: none !important;
  flex: 0 0 42px !important;
  width: 42px !important;
  height: 42px !important;
  box-shadow: 0 0 12px rgba(255,255,255,.14) !important;
}
.aurora-pulse-head .aurora-pulse-orb::before {
  content: none !important;
}
.aurora-pulse-close {
  position: absolute !important;
  top: 4px !important;
  right: 0 !important;
  border: 1px solid rgba(255,255,255,.18) !important;
  background: rgba(255,255,255,.06) !important;
  color: white !important;
}
.aurora-pulse-greeting {
  flex: 0 0 auto !important;
  padding: 4px 0 8px !important;
}
.aurora-pulse-greeting small {
  color: rgba(255,255,255,.62) !important;
}
.aurora-pulse-greeting p,
.aurora-pulse-weather-copy small,
.aurora-pulse-weather .pulse-weather-note {
  color: rgba(255,255,255,.66) !important;
}
.aurora-pulse-weather {
  position: static !important;
  transform: none !important;
  width: 100% !important;
  box-sizing: border-box !important;
  flex: 0 0 auto !important;
  margin: 0 !important;
  background: rgba(255,255,255,.055) !important;
  border: 1px solid rgba(255,255,255,.14) !important;
  box-shadow: none !important;
  backdrop-filter: blur(16px) !important;
  -webkit-backdrop-filter: blur(16px) !important;
}
.aurora-pulse-chips {
  flex: 0 0 auto !important;
  margin: 0 !important;
}
.aurora-pulse-chips button {
  background: rgba(255,255,255,.045) !important;
  border-color: rgba(255,255,255,.16) !important;
  color: rgba(255,255,255,.88) !important;
}
.aurora-pulse-chat {
  position: relative !important;
  flex: 1 1 0 !important;
  min-height: 40px !important;
  width: 100% !important;
  box-sizing: border-box !important;
  overflow-x: hidden !important;
}
.aurora-pulse-message {
  box-sizing: border-box !important;
  max-width: 100% !important;
  background: rgba(255,255,255,.055) !important;
  border-color: rgba(255,255,255,.12) !important;
}
.aurora-pulse-message.user {
  background: rgba(255,255,255,.09) !important;
  border-color: rgba(255,255,255,.18) !important;
}
.aurora-pulse-composer {
  position: relative !important;
  inset: auto !important;
  transform: none !important;
  width: 100% !important;
  max-width: 100% !important;
  box-sizing: border-box !important;
  flex: 0 0 auto !important;
  margin: 0 !important;
  padding: 8px 10px !important;
  border: 1px solid rgba(255,255,255,.20) !important;
  border-radius: 20px !important;
  background: rgba(255,255,255,.065) !important;
  box-shadow: none !important;
  backdrop-filter: blur(18px) saturate(85%) !important;
  -webkit-backdrop-filter: blur(18px) saturate(85%) !important;
}
.aurora-pulse-composer input {
  min-width: 0 !important;
  color: rgba(255,255,255,.94) !important;
}
.aurora-pulse-composer input::placeholder {
  color: rgba(255,255,255,.48) !important;
}
.aurora-pulse-send {
  background: rgba(255,255,255,.13) !important;
  color: white !important;
  box-shadow: none !important;
}
.aurora-pulse-shortcuts {
  position: static !important;
  transform: none !important;
  width: 100% !important;
  box-sizing: border-box !important;
  flex: 0 0 auto !important;
  margin: 0 !important;
  gap: 6px !important;
}
.aurora-pulse-shortcuts button {
  min-width: 0 !important;
  background: rgba(255,255,255,.045) !important;
  border-color: rgba(255,255,255,.14) !important;
  color: rgba(255,255,255,.88) !important;
}
.aurora-pulse-foot {
  flex: 0 0 auto !important;
  margin: 0 !important;
  color: rgba(255,255,255,.48) !important;
}
@media (max-width: 480px) {
  .aurora-pulse-backdrop {
    padding: 10px !important;
    padding-bottom: max(10px, env(safe-area-inset-bottom)) !important;
  }
  .aurora-pulse-panel {
    width: 100% !important;
    height: min(760px, 88dvh) !important;
    min-height: 0 !important;
    padding: 14px !important;
    border-radius: 22px !important;
  }
  .aurora-pulse-shortcuts {
    gap: 4px !important;
  }
  .aurora-pulse-shortcuts button {
    height: 36px !important;
    font-size: 12px !important;
  }
  .aurora-pulse-shortcuts button span {
    font-size: 10px !important;
  }
}
/* END AURORA_PULSE_GLASS_FIX_V1 */
`;

fs.writeFileSync(file, source.replace(marker, css + "\n" + marker), "utf8");
console.log("Glass layout CSS appended.");
console.log("Backup:", backup);
