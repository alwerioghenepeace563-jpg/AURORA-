import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const files = {
  manifest: path.join(root, "android/app/src/main/AndroidManifest.xml"),
  plugin: path.join(root, "android/app/src/main/java/com/aurora/assistant/AuroraAssistantPlugin.java"),
  nativeTs: path.join(root, "src/lib/aurora-native.ts"),
  toolTree: path.join(root, "src/lib/aurora-tool-tree.js"),
};

function read(key) {
  if (!fs.existsSync(files[key])) throw new Error(`Missing expected file: ${files[key]}`);
  return fs.readFileSync(files[key], "utf8");
}
const original = Object.fromEntries(Object.keys(files).map(k => [k, read(k)]));
const updated = { ...original };
const checks = [];

function replaceOnce(key, regex, replacement, label) {
  const matches = [...updated[key].matchAll(new RegExp(regex.source, regex.flags.includes("g") ? regex.flags : regex.flags + "g"))];
  if (matches.length !== 1) throw new Error(`${label}: expected exactly one match, found ${matches.length}. No files were changed.`);
  updated[key] = updated[key].replace(regex, replacement);
  checks.push(label);
}

// Manifest: declare contacts access.
if (!/android:name="android\.permission\.READ_CONTACTS"/.test(updated.manifest)) {
  const anchor = /(<uses-permission\s+android:name="android\.permission\.RECORD_AUDIO"\s*\/>)/;
  replaceOnce("manifest", anchor, '$1\n    <uses-permission android:name="android.permission.READ_CONTACTS" />', "Manifest permission insertion");
} else {
  checks.push("Manifest already declares READ_CONTACTS");
}

// Native plugin: add permission alias to the existing Capacitor plugin annotation.
const annotation = /@CapacitorPlugin\s*\(\s*name\s*=\s*"AuroraNative"\s*,\s*permissions\s*=\s*\{\s*@Permission\s*\(\s*alias\s*=\s*"microphone"\s*,\s*strings\s*=\s*\{\s*Manifest\.permission\.RECORD_AUDIO\s*\}\s*\)\s*\}\s*\)/;
const annotationReplacement = `@CapacitorPlugin(
    name = "AuroraNative",
    permissions = {
        @Permission(alias = "microphone", strings = { Manifest.permission.RECORD_AUDIO }),
        @Permission(alias = "contacts", strings = { Manifest.permission.READ_CONTACTS })
    }
)`;
if (!/alias\s*=\s*"contacts"/.test(updated.plugin)) {
  replaceOnce("plugin", annotation, annotationReplacement, "Native plugin permission annotation");
} else {
  checks.push("Native plugin already declares contacts permission alias");
}

// Imports needed by contact query and dialler.
if (!updated.plugin.includes("import android.provider.ContactsContract;")) {
  const importAnchor = /import android\.content\.Intent;\s*/;
  replaceOnce("plugin", importAnchor, "$&import android.database.Cursor;\nimport android.net.Uri;\nimport android.provider.ContactsContract;\n", "Native imports");
} else {
  if (!updated.plugin.includes("import android.database.Cursor;")) throw new Error("ContactsContract import exists but Cursor import is missing; stopping without writing.");
  if (!updated.plugin.includes("import android.net.Uri;")) throw new Error("ContactsContract import exists but Uri import is missing; stopping without writing.");
  checks.push("Native contact imports already exist");
}

// Native methods are inserted immediately before openApp.
if (!updated.plugin.includes("public void searchContacts(")) {
  const methodAnchor = /(?=\s*@PluginMethod\s+public void openApp\s*\()/;
  const methods = `
    @PluginMethod
    public void requestContactsPermission(PluginCall call) {
        if (getPermissionState("contacts") == PermissionState.GRANTED) {
            JSObject result = new JSObject();
            result.put("granted", true);
            call.resolve(result);
            return;
        }
        requestPermissionForAlias("contacts", call, "contactsPermissionCallback");
    }

    @PermissionCallback
    private void contactsPermissionCallback(PluginCall call) {
        JSObject result = new JSObject();
        result.put("granted", getPermissionState("contacts") == PermissionState.GRANTED);
        call.resolve(result);
    }

    @PluginMethod
    public void searchContacts(PluginCall call) {
        if (getPermissionState("contacts") != PermissionState.GRANTED) {
            call.reject("Contact permission is required. Request it before searching.");
            return;
        }
        String query = call.getString("query", "").trim();
        if (query.isEmpty()) {
            call.reject("Enter a contact name to search.");
            return;
        }

        JSArray contacts = new JSArray();
        String selection = ContactsContract.CommonDataKinds.Phone.DISPLAY_NAME + " LIKE ?";
        String[] selectionArgs = new String[] { "%" + query + "%" };
        String sortOrder = ContactsContract.CommonDataKinds.Phone.DISPLAY_NAME + " ASC";

        try (Cursor cursor = getContext().getContentResolver().query(
                ContactsContract.CommonDataKinds.Phone.CONTENT_URI,
                new String[] {
                    ContactsContract.CommonDataKinds.Phone.CONTACT_ID,
                    ContactsContract.CommonDataKinds.Phone.DISPLAY_NAME,
                    ContactsContract.CommonDataKinds.Phone.NUMBER
                },
                selection,
                selectionArgs,
                sortOrder
        )) {
            if (cursor != null) {
                int idIndex = cursor.getColumnIndex(ContactsContract.CommonDataKinds.Phone.CONTACT_ID);
                int nameIndex = cursor.getColumnIndex(ContactsContract.CommonDataKinds.Phone.DISPLAY_NAME);
                int numberIndex = cursor.getColumnIndex(ContactsContract.CommonDataKinds.Phone.NUMBER);
                int count = 0;
                while (cursor.moveToNext() && count < 20) {
                    String name = nameIndex >= 0 ? cursor.getString(nameIndex) : "";
                    String number = numberIndex >= 0 ? cursor.getString(numberIndex) : "";
                    String contactId = idIndex >= 0 ? cursor.getString(idIndex) : "";
                    if (number == null || number.trim().isEmpty()) continue;
                    JSObject item = new JSObject();
                    item.put("id", contactId == null ? "" : contactId);
                    item.put("name", name == null ? "" : name);
                    item.put("number", number.trim());
                    contacts.put(item);
                    count++;
                }
            }
            JSObject result = new JSObject();
            result.put("contacts", contacts);
            call.resolve(result);
        } catch (Exception e) {
            call.reject("Could not search contacts: " + e.getMessage(), e);
        }
    }

    @PluginMethod
    public void openDialer(PluginCall call) {
        String number = call.getString("number", "").trim();
        if (number.isEmpty() || !number.matches("[+0-9() .-]+") || !number.matches(".*[0-9].*")) {
            call.reject("A valid phone number is required.");
            return;
        }
        try {
            Intent intent = new Intent(Intent.ACTION_DIAL, Uri.fromParts("tel", number, null));
            getActivity().runOnUiThread(() -> {
                try {
                    getActivity().startActivity(intent);
                    JSObject result = new JSObject();
                    result.put("opened", true);
                    call.resolve(result);
                } catch (Exception e) {
                    call.reject("Could not open the phone dialler: " + e.getMessage(), e);
                }
            });
        } catch (Exception e) {
            call.reject("Could not open the phone dialler: " + e.getMessage(), e);
        }
    }

`;
  if (!methodAnchor.test(updated.plugin)) throw new Error("Could not find the native openApp method insertion point. No files were changed.");
  updated.plugin = updated.plugin.replace(methodAnchor, methods);
  checks.push("Native contact search, permission request, and dialler methods");
} else {
  checks.push("Native contact methods already exist");
}

// TypeScript bridge types and wrappers.
if (!updated.nativeTs.includes("requestContactsPermission(): Promise<{ granted: boolean }>")) {
  const typeAnchor = /(\s*openApp\(options:\s*\{\s*packageName:\s*string\s*\}\):\s*Promise<\{\s*opened:\s*boolean;\s*packageName:\s*string\s*\}>;)/;
  replaceOnce("nativeTs", typeAnchor,
    `    requestContactsPermission(): Promise<{ granted: boolean }>;
    searchContacts(options: { query: string }): Promise<{ contacts: Array<{ id?: string; name: string; number: string }> }>;
    openDialer(options: { number: string }): Promise<{ opened: boolean }>;
$1`,
    "TypeScript native bridge declarations");
} else {
  checks.push("TypeScript contact declarations already exist");
}

const registerAnchor = /const AuroraNative = registerPlugin<AuroraNativePlugin>\("AuroraNative"\);/;
if (!/export async function searchAuroraContacts\(/.test(updated.nativeTs)) {
  replaceOnce("nativeTs", registerAnchor,
    `$&
    
export async function requestAuroraContactsPermission(): Promise<{ granted: boolean }> {
  try {
    return await AuroraNative.requestContactsPermission();
  } catch {
    return { granted: false };
  }
}

export async function searchAuroraContacts(query: string): Promise<Array<{ id?: string; name: string; number: string }>> {
  const result = await AuroraNative.searchContacts({ query });
  return result.contacts || [];
}

export async function openAuroraDialer(number: string): Promise<{ opened: boolean }> {
  return AuroraNative.openDialer({ number });
}`,
    "TypeScript contact wrapper exports");
} else {
  checks.push("TypeScript contact wrapper exports already exist");
}

// Shared tool tree: add imports and intercept direct call commands before other tools.
const importAnchor = /import\s*\{\s*auroraApiUrl\s*\}\s*from\s*["']\.\/aurora-native["'];/;
if (!/searchAuroraContacts/.test(updated.toolTree)) {
  replaceOnce("toolTree", importAnchor,
    'import { auroraApiUrl, requestAuroraContactsPermission, searchAuroraContacts, openAuroraDialer } from "./aurora-native";',
    "Tool-tree native bridge import");

  const runAnchor = /export\s+async\s+function\s+runAuroraToolTree\s*\(\s*userText\s*\)\s*\{/;
  const intercept = `
  const contactCallMatch = String(userText || "").match(/^\\\\s*(?:hey\\\\s+aurora[, ]*)?(?:please\\\\s+)?(?:call|phone|ring|dial)\\\\s+(?:my\\\\s+)?(.+?)\\\\s*[?.!]*\\\\s*$/i);
  if (contactCallMatch) {
    const requestedName = contactCallMatch[1].trim().replace(/\\\\s+(?:now|please|for me)$/i, "").trim();
    if (!requestedName) {
      return { tool: "call_contact", context: "Please say the contact name, for example: call Mom." };
    }
    try {
      const permission = await requestAuroraContactsPermission();
      if (!permission.granted) {
        return { tool: "call_contact", context: "AURORA needs Contacts permission to find that person. Allow Contacts permission, then try again." };
      }
      const found = await searchAuroraContacts(requestedName);
      const unique = [];
      const seen = new Set();
      for (const contact of found) {
        const key = String(contact.number || "").replace(/[^0-9+]/g, "");
        if (!key) continue;
        const identity = (contact.name || "").toLowerCase() + "|" + key;
        if (!seen.has(identity)) {
          seen.add(identity);
          unique.push({ ...contact, number: contact.number });
        }
      }
      if (!unique.length) {
        return { tool: "call_contact", context: 'I could not find a phone number for "' + requestedName + '". Check the saved contact name and try again.' };
      }
      if (unique.length > 1) {
        const choices = unique.slice(0, 5).map(c => (c.name || "Unknown contact") + " â€” " + c.number).join("; ");
        return { tool: "call_contact", context: "I found more than one matching contact/number. Please say the exact name or choose one: " + choices };
      }
      const contact = unique[0];
      await openAuroraDialer(contact.number);
      return { tool: "call_contact", context: "I opened the phone dialler for " + (contact.name || requestedName) + " (" + contact.number + "). Review the number and tap Call when ready." };
    } catch (error) {
      return { tool: "call_contact", context: "I could not complete the contact lookup: " + (error?.message || "unknown error") + ". You can still open Contacts and try again." };
    }
  }

`;
  if (!runAnchor.test(updated.toolTree)) throw new Error("Could not find runAuroraToolTree(userText) insertion point. No files were changed.");
  updated.toolTree = updated.toolTree.replace(runAnchor, m => m + intercept);
  checks.push("Tool-tree contact-call routing");
} else {
  checks.push("Tool-tree contact-call routing already exists");
}

// Only now back up and write files.
const changed = Object.keys(files).filter(k => updated[k] !== original[k]);
if (!changed.length) {
  console.log("No changes needed; contact-calling patch appears to be present.");
  process.exit(0);
}
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
for (const key of changed) {
  const backup = `${files[key]}.before-contact-calling-${stamp}.bak`;
  fs.copyFileSync(files[key], backup);
}
for (const key of changed) fs.writeFileSync(files[key], updated[key], "utf8");

console.log("AURORA contact-calling patch applied to:");
for (const key of changed) console.log(" - " + path.relative(root, files[key]));
console.log("Backups created beside each changed file.");
console.log("Implemented: contact permission request, name search, contact-call intent routing, and opening the system dialler.");
console.log("NOT verified yet: Android compilation, runtime permissions, contact matching on-device, or call completion.");
console.log("Next: run npm.cmd run android:sync, then npm.cmd run android:check, then npm.cmd run android:apk.");
