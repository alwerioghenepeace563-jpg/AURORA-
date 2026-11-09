const assert=require("node:assert/strict");
const fs=require("node:fs");
const endpoint=fs.readFileSync("api/media-search.js","utf8");
const workspace=fs.readFileSync("src/components/CreativeLearningWorkspace.jsx","utf8");
for(const value of ["duckduckgo.com/i.js","rightsNotice","AbortSignal.timeout","https:","slice(0,12)"]) assert.ok(endpoint.includes(value),"Missing endpoint safeguard: "+value);
for(const value of ["AI media fallback · Search the web","searchMediaFallback","/api/media-search?q=","imageUrl","Save source","userApproved:true","check the source licence"]) assert.ok(workspace.includes(value),"Missing UI behaviour: "+value);
console.log("AURORA Stage 11 media search fallback checks passed.");
