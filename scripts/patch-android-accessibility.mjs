import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const android = path.join(root, "android");
const javaRoot = path.join(android, "app/src/main/java/com/aurora/assistant");
const manifestPath = path.join(android, "app/src/main/AndroidManifest.xml");
if (!fs.existsSync(manifestPath)) throw new Error("Android project is missing; generate it with Capacitor first.");

const source = path.join(root, "android-native/com/aurora/assistant/AuroraAccessibilityService.java");
if (!fs.existsSync(source)) throw new Error("AURORA accessibility service source is missing.");
fs.copyFileSync(source, path.join(javaRoot, "AuroraAccessibilityService.java"));

const xmlDir = path.join(android, "app/src/main/res/xml");
fs.mkdirSync(xmlDir, { recursive: true });
fs.copyFileSync(path.join(root, "android-native/res/xml/aurora_accessibility_service.xml"), path.join(xmlDir, "aurora_accessibility_service.xml"));

const valuesDir = path.join(android, "app/src/main/res/values");
fs.mkdirSync(valuesDir, { recursive: true });
const stringsPath = path.join(valuesDir, "strings.xml");
let strings = fs.existsSync(stringsPath) ? fs.readFileSync(stringsPath, "utf8") : '<?xml version="1.0" encoding="utf-8"?>\n<resources>\n</resources>\n';
if (!strings.includes("aurora_accessibility_description")) {
  strings = strings.replace("</resources>", '    <string name="aurora_accessibility_description">Allows AURORA to read accessible text on the current screen and click matching accessible controls when you explicitly request it.</string>\n</resources>');
}
fs.writeFileSync(stringsPath, strings);

const pluginPath = path.join(javaRoot, "AuroraAssistantPlugin.java");
let plugin = fs.readFileSync(pluginPath, "utf8");
const anchor = "    @PluginMethod\n    public void status(PluginCall call) {";
const methods = `    @PluginMethod
    public void readScreen(PluginCall call) {
        String text = AuroraAccessibilityService.readVisibleText();
        if (text == null) {
            call.reject("Enable AURORA Screen Assistant in Android Accessibility settings first.");
            return;
        }
        JSObject result = new JSObject();
        result.put("text", text);
        call.resolve(result);
    }

    @PluginMethod
    public void clickVisibleText(PluginCall call) {
        String target = call.getString("text");
        if (target == null || target.trim().isEmpty()) {
            call.reject("text is required");
            return;
        }
        boolean clicked = AuroraAccessibilityService.clickVisibleText(target);
        if (!clicked) {
            call.reject("No accessible clickable item matched that text. The current app may not expose it to accessibility.");
            return;
        }
        JSObject result = new JSObject();
        result.put("clicked", true);
        call.resolve(result);
    }

    @PluginMethod
    public void status(PluginCall call) {`;
if (!plugin.includes("public void readScreen(PluginCall call)")) {
  if (!plugin.includes(anchor)) throw new Error("Could not locate native plugin insertion point.");
  plugin = plugin.replace(anchor, methods);
  fs.writeFileSync(pluginPath, plugin);
}

let manifest = fs.readFileSync(manifestPath, "utf8");
if (!manifest.includes('android:name=".AuroraAccessibilityService"')) {
  const declaration = '        <service android:name=".AuroraAccessibilityService" android:permission="android.permission.BIND_ACCESSIBILITY_SERVICE" android:exported="true" android:label="AURORA Screen Assistant">\n            <intent-filter><action android:name="android.accessibilityservice.AccessibilityService" /></intent-filter>\n            <meta-data android:name="android.accessibilityservice" android:resource="@xml/aurora_accessibility_service" />\n        </service>\n    </application>';
  manifest = manifest.replace("</application>", declaration);
  fs.writeFileSync(manifestPath, manifest);
}
console.log("AURORA opt-in accessibility screen-reading foundation installed.");
