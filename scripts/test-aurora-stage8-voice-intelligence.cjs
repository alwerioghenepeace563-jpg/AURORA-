const assert = require("node:assert/strict");

(async () => {
  const voice = await import("../src/core/aurora-voice-intelligence.js");
  assert.equal(voice.AURORA_VOICE_INTELLIGENCE.interruption, "hybrid");
  assert.equal(voice.AURORA_VOICE_INTELLIGENCE.personality, "balanced");
  assert.equal(voice.AURORA_VOICE_INTELLIGENCE.teachingMode, "adaptive");
  assert.equal(voice.AURORA_VOICE_INTELLIGENCE.speechDelivery, "adaptive");
  assert.equal(voice.isImmediateInterruptionCommand("Stop talking"), true);
  assert.equal(voice.isImmediateInterruptionCommand("repeat that"), true);
  assert.equal(voice.isImmediateInterruptionCommand("please explain photosynthesis"), false);
  assert.equal(voice.isLikelySpeechEcho("photosynthesis uses sunlight and water", "Photosynthesis uses sunlight and water to make glucose"), true);
  assert.equal(voice.isLikelySpeechEcho("wait, I have a question", "Photosynthesis uses sunlight and water to make glucose"), false);
  assert.equal(voice.inferSpeechDelivery("Congratulations, you did it!").style, "excited");
  assert.equal(voice.inferSpeechDelivery("Don't worry, take your time.").style, "reassuring");
  assert.equal(voice.inferSpeechDelivery("Important safety warning").style, "serious");
  assert.equal(voice.inferSpeechDelivery("Let's learn this step by step").style, "teaching");
  assert.match(voice.buildVoiceIntelligenceInstructions(), /ADAPTIVE TEACHING/);
  assert.match(voice.buildVoiceIntelligenceInstructions(), /balanced personality/);
  console.log("AURORA Stage 8 voice-intelligence checks passed.");
})().catch(error => { console.error(error); process.exitCode = 1; });
