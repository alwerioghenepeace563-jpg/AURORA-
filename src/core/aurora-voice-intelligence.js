const INTERRUPTION_COMMANDS = /^(?:stop|stop talking|stop speaking|be quiet|that's enough|thats enough|pause|hold on|wait|one second|repeat|repeat that|say that again|slow down|speak slower)[.!? ]*$/i;

export const AURORA_VOICE_INTELLIGENCE = Object.freeze({
  interruption: "hybrid",
  personality: "balanced",
  teachingMode: "adaptive",
  speechDelivery: "adaptive"
});

export function normalizeSpeechText(value) {
  return String(value || "").toLowerCase().replace(/[^a-z0-9' ]/g, " ").replace(/\\s+/g, " ").trim();
}

export function isImmediateInterruptionCommand(value) {
  return INTERRUPTION_COMMANDS.test(normalizeSpeechText(value));
}

export function isLikelySpeechEcho(transcript, spokenText) {
  const heard = normalizeSpeechText(transcript);
  const source = normalizeSpeechText(spokenText);
  if (!heard || !source || isImmediateInterruptionCommand(heard)) return false;
  const words = heard.split(" ").filter(word => word.length > 1);
  if (words.length < 3) return false;
  const sourceWords = new Set(source.split(" "));
  const overlap = words.filter(word => sourceWords.has(word)).length / words.length;
  return overlap >= 0.78;
}

export function inferSpeechDelivery(value) {
  const text = normalizeSpeechText(value);
  if (/\\b(congratulations|well done|you did it|great job|excellent|fantastic|amazing|exciting|good news)\\b/.test(text)) return { style: "excited", rate: 1.02, pitch: 1.02, stability: 0.38, expressiveness: 0.62 };
  if (/\\b(sorry|that sounds difficult|i understand|i'm sorry|im sorry|don't worry|dont worry|take your time|it's okay|its okay|frustrat)\\b/.test(text)) return { style: "reassuring", rate: 0.91, pitch: 0.96, stability: 0.68, expressiveness: 0.25 };
  if (/\\b(warning|important safety|dangerous|urgent|emergency|do not|must not|critical|risk)\\b/.test(text)) return { style: "serious", rate: 0.94, pitch: 0.94, stability: 0.72, expressiveness: 0.18 };
  if (/\\b(why|how does|how do|what if|wonder|curious|let's explore|lets explore)\\b/.test(text)) return { style: "curious", rate: 0.97, pitch: 1.01, stability: 0.48, expressiveness: 0.43 };
  if (/\\b(step by step|let's learn|lets learn|for example|first,|the first step|understand|explanation|lesson|teach)\\b/.test(text)) return { style: "teaching", rate: 0.91, pitch: 0.98, stability: 0.64, expressiveness: 0.3 };
  return { style: "calm", rate: 0.96, pitch: 0.98, stability: 0.58, expressiveness: 0.22 };
}

export function buildVoiceIntelligenceInstructions(options = {}) {
  const personality = options.personality === "balanced" ? "balanced" : "balanced";
  const teachingMode = options.teachingMode === "adaptive" ? "adaptive" : "adaptive";
  return [
    "CONVERSATIONAL PERSONALITY: Use a balanced personality: friendly, intelligent, mature and professional. Sound like a natural, attentive assistant. Be warm without becoming overfamiliar, theatrical, clingy, or repetitive. Use contractions and ordinary conversational phrasing where natural.",
    "SPOKEN RESPONSE WRITING: Write answers so they sound natural when read aloud. Prefer clear sentences, natural pauses, and varied but restrained phrasing. Avoid stage directions, emotion labels, phonetic spellings, and unnecessary headings in short answers. Keep the written answer useful and complete; do not sacrifice accuracy for conversational style.",
    "ADAPTIVE TEACHING: Decide whether the user needs a continuous explanation or an interactive lesson. For a simple question, answer directly without forcing a quiz. For a difficult or multi-step topic, explain one idea at a time, use a concrete example, and pause at meaningful checkpoints. If the user asks a follow-up or says they are confused, rephrase more simply and continue from the point they need. Do not repeatedly ask whether the user understands.",
    "EMOTIONAL DELIVERY: Let the meaning of the answer guide a restrained delivery tone: calm for ordinary help, curious for exploration, reassuring for frustration, serious for important warnings, teaching for lessons, and excited for genuine good news. Keep factual content, safety and uncertainty unchanged.",
    "TURN-TAKING: Respect interruptions. If the user changes topic, answer the new request instead of finishing the previous explanation. When they ask to repeat, slow down, clarify, or continue, respond to that exact conversational instruction."
  ].join("\\n");
}
