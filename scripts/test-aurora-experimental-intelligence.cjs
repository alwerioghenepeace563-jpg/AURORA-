const assert = require("node:assert/strict");
(async () => {
 const { createAuroraExperimentalIntelligence } = await import("../src/core/aurora-experimental-intelligence.js");
 const store = new Map(), events = [];
 const service = createAuroraExperimentalIntelligence({ storage:{getItem:k=>store.get(k)||null,setItem:(k,v)=>store.set(k,v)}, events:{publish:(...args)=>events.push(args)}, now:()=> "2026-11-10T00:00:00.000Z" });
 const spec={id:"workflow.review",type:"workflow_simulation",title:"Review workflow",summary:"Simulate a proposed task flow",risk:"low"};
 service.create(spec);
 await assert.rejects(()=>service.run(spec.id),/explicitly approved/i);
 assert.throws(()=>service.prepare(spec.id,{approved:true,consent:true,simulationOnly:false}),/simulation-only/i);
 service.prepare(spec.id,{approved:true,consent:true,simulationOnly:true});
 service.registerAdapter("sandbox.local",{simulate:async input=>{assert.equal(input.simulationOnly,true);return {findings:["No external action occurred"],executed:false,sideEffects:false};}});
 const done=await service.run(spec.id);
 assert.equal(done.status,"completed");
 assert.equal(done.findings.length,1);
 await assert.rejects(()=>service.evaluate("not-created",{criteria:[{id:"valid.criterion",title:"A criterion",evidence:"Evidence",weight:1,passed:true}]}),/not found/i);
 const evaluation=service.evaluate(spec.id,{evaluator:"test-reviewer",passScore:80,criteria:[
  {id:"safe.behaviour",title:"No external side effects",evidence:"Adapter result declared no side effects",weight:5,passed:true,critical:true},
  {id:"useful.output",title:"Useful finding produced",evidence:"One bounded finding was returned",weight:3,passed:true},
  {id:"coverage.check",title:"All checks covered",evidence:"One optional check was not met",weight:2,passed:false}
 ]});
 assert.equal(evaluation.evaluation.score,80);
 assert.equal(evaluation.evaluation.passed,true);
 const failed=service.evaluate(spec.id,{passScore:80,criteria:[
  {id:"critical.guard",title:"Critical guard",evidence:"Critical guard failed in this simulation",weight:1,passed:false,critical:true},
  {id:"other.check",title:"Other check",evidence:"Other check passed",weight:9,passed:true}
 ]});
 assert.equal(failed.evaluation.score,90);
 assert.equal(failed.evaluation.passed,false,"critical failures must fail evaluation even above threshold");
 assert.throws(()=>service.evaluate(spec.id,{criteria:[]}),/1 to 20/i);
 assert.throws(()=>service.evaluate(spec.id,{criteria:[{id:"bad",title:"Bad",evidence:"x",weight:11,passed:true}]}),/weight/i);
 assert.equal(service.certificationReadiness().finalCertification,false);
 assert.equal(service.certificationReadiness().highRiskBlocked,true);
 assert.equal(events.length,1);
 service.create({...spec,id:"danger.prototype",type:"capability_prototype",risk:"high"});
 service.prepare("danger.prototype",{approved:true,consent:true,simulationOnly:true});
 await assert.rejects(()=>service.run("danger.prototype"),/High-risk/i);
 assert.equal(service.pause(spec.id),true);
 assert.equal(service.list().find(x=>x.id===spec.id).consentGranted,false);
 assert.throws(()=>service.registerAdapter("bad",{run:()=>{}}),/simulation-only adapter/i);
 console.log("AURORA experimental intelligence tests passed: explicit consent, simulation-only adapters, high-risk block, bounded findings and honest certification gates.");
})().catch(error=>{console.error(error);process.exitCode=1;});
