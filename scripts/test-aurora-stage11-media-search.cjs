const assert=require("node:assert/strict");
const fs=require("node:fs");
const java=fs.readFileSync("android/app/src/main/java/com/aurora/assistant/AuroraAssistantPlugin.java","utf8");
const bridge=fs.readFileSync("src/lib/aurora-native.ts","utf8");
const endpoint=fs.readFileSync("api/media-search.js","utf8");
const workspace=fs.readFileSync("src/components/CreativeLearningWorkspace.jsx","utf8");
for(const s of ["public void downloadMedia","DownloadManager","VISIBILITY_VISIBLE_NOTIFY_COMPLETED","Environment.DIRECTORY_DOWNLOADS","Only secure HTTPS","if (!confirmed)"])assert.ok(java.includes(s),"Native safeguard missing: "+s);
for(const s of ["downloadMedia(options","AuroraNative.downloadMedia(options)"])assert.ok(bridge.includes(s),"Bridge missing: "+s);
for(const s of ["commons.wikimedia.org","archive.org/advancedsearch.php","downloadUrl","license"])assert.ok(endpoint.includes(s),"Provider missing: "+s);
for(const s of ["AURORA Media Browser & Download Centre","Search downloadable media","downloadSearchMedia","Pexels Videos"])assert.ok(workspace.includes(s),"Workspace missing: "+s);
console.log("AURORA Stage 11 media browser and download checks passed.");

assert.match(workspace, /\[mediaSearchKind,setMediaSearchKind\]=useState\("image"\)/);
assert.match(workspace, /\[mediaDownloading,setMediaDownloading\]=useState\(""\)/);
assert.match(workspace, /value={mediaSearchKind} onChange={e=>setMediaSearchKind\(e.target.value\)}/);
assert.match(workspace, /type="\+mediaSearchKind/);
assert.match(workspace, /item.downloadUrl/);
