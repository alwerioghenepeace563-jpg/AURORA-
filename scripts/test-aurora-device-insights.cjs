const assert = require("node:assert/strict");
(async () => {
 const { buildAuroraDeviceInsights } = await import("../src/core/aurora-device-insights.js");
 const low = buildAuroraDeviceInsights({batteryPercent:18,charging:false,thermalStatus:3,memoryLow:true});
 assert.equal(low.length,3);
 assert.equal(low[0].kind,"device_battery");
 assert.equal(low[1].kind,"device_thermal");
 assert.equal(low[2].kind,"device_memory");
 assert.equal(buildAuroraDeviceInsights({batteryPercent:80,charging:true,thermalStatus:1,memoryLow:false}).length,0);
 assert.equal(buildAuroraDeviceInsights({batteryPercent:20,charging:true}).length,0);
 assert.equal(buildAuroraDeviceInsights({}).length,0);
 console.log("AURORA one-shot device insight tests passed.");
})().catch(error => { console.error(error); process.exitCode = 1; });
