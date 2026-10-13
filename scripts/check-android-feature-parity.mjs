import fs from "node:fs";
import path from "node:path";

const requiredFiles = [
  "src/App.jsx",
  "src/lib/aurora-native.ts",
  "api/admin.js",
  "api/admin-code.js",
  "api/admin-execute.js",
  "api/chat.js",
  "api/search.js",
  "api/voice.js",
  "api/weather.js",
  "capacitor.config.json"
];

const missing = requiredFiles.filter((file) => !fs.existsSync(path.resolve(file)));
if (missing.length) {
  console.error("AURORA Android parity check failed. Missing required files:", missing.join(", "));
  process.exit(1);
}

const adminApi = fs.readFileSync("api/admin.js", "utf8");
if (!adminApi.includes("ADMIN_EMAIL_ALLOWLIST") || !adminApi.includes("@gmail.com")) {
  console.error("AURORA Android parity check failed: Admin API must retain the configured administrator email allowlist.");
  process.exit(1);
}

const app = fs.readFileSync("src/App.jsx", "utf8");
const checks = [
  ["Admin dashboard", /adminData|Admin/i],
  ["AI Executor", /executorPrompt|Executor/i],
  ["AI chat", /sendMessage|api\/chat|chatMessages/i],
  ["Search tool", /api\/search|Search/i],
  ["Voice feature", /api\/voice|voiceReplies|Voice/i],
  ["Weather tool", /api\/weather|Weather/i],
  ["Quiz maker", /parseQuizPayload|Quiz/i],
  ["Camera/image tool", /Camera|ImageIcon|capture/i],
  ["Translation tool", /Translation|translate/i],
  ["PDF/file attachment support", /PDF|attachment|FileText/i],
  ["Chat history", /History|history/i],
  ["Calculator", /Calculator|calculate/i],
  ["Activities/tools area", /Activities|tools/i],
  ["Theme/customization code", /theme|appearance|accent/i]
];
const failures = checks.filter(([, pattern]) => !pattern.test(app)).map(([name]) => name);

const nativeBridge = fs.readFileSync("src/lib/aurora-native.ts", "utf8");
for (const [name, pattern] of [
  ["native bridge registration", /registerPlugin/],
  ["native service controls", /startAssistantService|stopAssistantService/],
  ["native app launching", /openApp|openWhatsApp/]
]) {
  if (!pattern.test(nativeBridge)) failures.push(name);
}

const config = JSON.parse(fs.readFileSync("capacitor.config.json", "utf8"));
if (config.appId !== "com.aurora.assistant") failures.push("AURORA Android application ID");
if (config.appName !== "AURORA") failures.push("AURORA Android app name");
if (config.webDir !== "dist") failures.push("Capacitor web build directory");

if (failures.length) {
  console.error("AURORA Android parity check failed:");
  for (const failure of failures) console.error(" - " + failure);
  process.exit(1);
}

console.log("AURORA Android parity check passed.");
console.log("Verified the main tools/Admin code, required API endpoints, Capacitor bridge, and Android app configuration.");
console.log("Note: source-presence checks do not replace runtime testing of every feature on a physical device.");
