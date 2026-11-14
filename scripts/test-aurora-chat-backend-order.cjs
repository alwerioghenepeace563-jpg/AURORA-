import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../api/chat.js", import.meta.url), "utf8");
const mediaDeclaration = "const hasMedia = body.messages.some((m) => m && m.media);";
const declarationIndex = source.indexOf(mediaDeclaration);
const payloadIndex = source.indexOf("const payload = {");

assert.notEqual(declarationIndex, -1, "Chat handler must declare the media attachment flag.");
assert.notEqual(payloadIndex, -1, "Chat handler must construct its provider payload.");
assert.ok(declarationIndex < payloadIndex, "Media attachment flag must be declared before payload generation reads it.");
assert.equal(source.split(mediaDeclaration).length - 1, 1, "Chat handler must have exactly one media flag declaration.");
assert.match(source, /maxOutputTokens:\\s*hasMedia\\s*\\?\\s*8192\\s*:\\s*1200/, "Media requests must retain the larger output-token budget.");

console.log("AURORA chat backend initialization-order checks passed.");
