const assert = require("node:assert/strict");
(async () => {
 let now=1000; const events=[];
 const sessions=(await import("../src/core/aurora-context-sessions.js")).createAuroraContextSessions({now:()=>now,maxText:12,events:{publish:(...args)=>events.push(args)}});
 assert.throws(()=>sessions.begin({source:"screen",surface:"main_chat"}),/explicit user action/i);
 assert.throws(()=>sessions.begin({source:"bad",surface:"main_chat",userInitiated:true}),/unsupported/i);
 const s=sessions.begin({source:"screen",surface:"main_chat",userInitiated:true,ttlMs:90000});
 assert.equal(s.expiresAt,61000);
 const snapshot=sessions.consume(s.id," private screen text beyond limit ");
 assert.equal(snapshot.text,"private scree"); assert.equal(snapshot.truncated,true);
 assert.equal(sessions.status().persistent,false); assert.equal(sessions.status().activeSessions,0);
 assert.throws(()=>sessions.consume(s.id,"again"),/missing|expired|already used/i);
 const expired=sessions.begin({source:"document",surface:"pulse",userInitiated:true,ttlMs:1000}); now+=1001;
 assert.throws(()=>sessions.consume(expired.id,"secret"),/expired/i);
 const revoke=sessions.begin({source:"location",surface:"voice",userInitiated:true});
 assert.equal(sessions.revoke(revoke.id),true); assert.equal(sessions.revoke(revoke.id),false);
 const log=JSON.stringify(events); assert.equal(log.includes("private screen text"),false); assert.equal(log.includes("secret"),false);
 console.log("AURORA context-session tests passed.");
})().catch(e=>{console.error(e);process.exitCode=1;});
