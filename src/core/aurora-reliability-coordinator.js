/** Shared lifecycle and reliability coordinator. Diagnostics retain bounded metadata only; resume never replays actions. */
function createAuroraReliabilityCoordinator(options = {}) {
 const events=options.events, journal=options.taskJournal;
 if(!events||typeof events.publish!=="function"||typeof events.subscribe!=="function")throw new TypeError("Shared AURORA event bus required.");
 if(!journal||typeof journal.recoverable!=="function")throw new TypeError("Task recovery journal required.");
 const max=Math.max(10,Math.min(200,Number(options.maxDiagnostics)||60)),diagnostics=[],removers=[];
 let visibility="unknown",connectivity="unknown",disposed=false;
 const now=typeof options.now==="function"?options.now:()=>new Date().toISOString();
 const unsub=events.subscribe("*",e=>{
  if(!(/\.failed$|\.timeout$|\.blocked$/.test(e.type)||(e.type==="task.finished"&&e.payload?.result?.status!=="completed")))return;
  diagnostics.push(Object.freeze({id:String(e.id||"diag-"+Date.now().toString(36)),type:String(e.type).slice(0,80),at:String(e.at||now()),source:String(e.source||"runtime").slice(0,40),code:typeof e.payload?.receipt?.error?.code==="string"?e.payload.receipt.error.code.slice(0,80):typeof e.payload?.result?.status==="string"?e.payload.result.status:null}));
  if(diagnostics.length>max)diagnostics.splice(0,diagnostics.length-max);
 });removers.push(unsub);
 function on(target,name,fn){if(!target?.addEventListener)return;target.addEventListener(name,fn);removers.push(()=>target.removeEventListener(name,fn));}
 const doc=options.document===undefined?globalThis.document:options.document,win=options.window===undefined?globalThis.window:options.window;
 if(doc){visibility=doc.visibilityState==="hidden"?"background":"foreground";on(doc,"visibilitychange",()=>{visibility=doc.visibilityState==="hidden"?"background":"foreground";events.publish("app.lifecycle.visibility",{visibility},{source:"reliability"});if(visibility==="foreground")events.publish("app.lifecycle.resume",{visibility,recoverableCount:journal.recoverable().length},{source:"reliability"});});}
 if(win){connectivity=win.navigator?.onLine===false?"offline":"online";on(win,"online",()=>{connectivity="online";events.publish("app.lifecycle.connectivity",{connectivity},{source:"reliability"});});on(win,"offline",()=>{connectivity="offline";events.publish("app.lifecycle.connectivity",{connectivity},{source:"reliability"});});on(win,"pagehide",()=>events.publish("app.lifecycle.background",{visibility:"background"},{source:"reliability"}));on(win,"pageshow",()=>{visibility="foreground";events.publish("app.lifecycle.foreground",{visibility},{source:"reliability"});events.publish("app.lifecycle.resume",{visibility,recoverableCount:journal.recoverable().length},{source:"reliability"});});}
 return Object.freeze({
  getStatus:()=>Object.freeze({visibility,connectivity,diagnosticCount:diagnostics.length,recoverableCount:journal.recoverable().length,automaticRecovery:false}),
  getDiagnostics:(limit=max)=>diagnostics.slice(-Math.max(1,Math.min(max,Number(limit)||max))).map(x=>({...x})),
  getRecoveryQueue:()=>journal.recoverable(),
  inspectRecoveryTask:(taskId)=>typeof journal.inspectRecovery==="function"?journal.inspectRecovery(taskId):null,
  dismissRecoveryTask:(taskId)=>typeof journal.forget==="function"?journal.forget(taskId):false,
  publishLifecycle:(type,details={})=>{if(!/^(foreground|background|resume|connectivity)$/.test(String(type)))throw new Error("Unsupported lifecycle event.");return events.publish("app.lifecycle."+type,details,{source:"reliability"});},
  dispose:()=>{if(disposed)return false;disposed=true;for(const remove of removers.splice(0)){try{remove();}catch{}}return true;}
 });
}
export {createAuroraReliabilityCoordinator};
