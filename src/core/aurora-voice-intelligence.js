const INTERRUPTION_COMMANDS = /^(?:stop|stop talking|stop speaking|be quiet|thats enough|pause|hold on|wait|one second|repeat|repeat that|say that again|what did you just say|what was that|continue|go on|carry on|keep going|explain differently|explain another way|say it another way|i do not understand|i dont understand|im confused|slow down|speak slower|go back to (?:the )?(?:first|second|third|fourth|last) (?:point|part|step))[.!? ]*$/i;

export const AURORA_VOICE_INTELLIGENCE = Object.freeze({
  interruption: "hybrid",
  personality: "balanced",
  teachingMode: "adaptive",
  speechDelivery: "adaptive"
});

export function normalizeSpeechText(value) {
  return String(value || "").toLowerCase().replace(/[^a-z0-9' ]/g, " ").replace(/\s+/g, " ").trim();
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
  if (/\b(congratulations|well done|you did it|great job|excellent|fantastic|amazing|exciting|good news)\b/.test(text)) return { style: "excited", rate: 1.02, pitch: 1.02, stability: 0.38, expressiveness: 0.62 };
  if (/\b(sorry|that sounds difficult|i understand|i'm sorry|im sorry|don't worry|dont worry|take your time|it's okay|its okay|frustrat)\b/.test(text)) return { style: "reassuring", rate: 0.91, pitch: 0.96, stability: 0.68, expressiveness: 0.25 };
  if (/\b(warning|important safety|dangerous|urgent|emergency|do not|must not|critical|risk)\b/.test(text)) return { style: "serious", rate: 0.94, pitch: 0.94, stability: 0.72, expressiveness: 0.18 };
  if (/\b(why|how does|how do|what if|wonder|curious|let's explore|lets explore)\b/.test(text)) return { style: "curious", rate: 0.97, pitch: 1.01, stability: 0.48, expressiveness: 0.43 };
  if (/\b(step by step|let's learn|lets learn|for example|first,|the first step|understand|explanation|lesson|teach)\b/.test(text)) return { style: "teaching", rate: 0.91, pitch: 0.98, stability: 0.64, expressiveness: 0.3 };
  return { style: "calm", rate: 0.96, pitch: 0.98, stability: 0.58, expressiveness: 0.22 };
}

export function buildVoiceIntelligenceInstructions() {
  return [
    "CONVERSATIONAL PERSONALITY: Use a balanced personality: friendly, intelligent, mature and professional. Sound like a natural, attentive assistant. Be warm without becoming overfamiliar, theatrical, clingy, or repetitive. Use contractions and ordinary conversational phrasing where natural.",
    "SPOKEN RESPONSE WRITING: Write answers so they sound natural when read aloud. Prefer clear sentences, natural pauses, and varied but restrained phrasing. Avoid stage directions, emotion labels, phonetic spellings, and unnecessary headings in short answers. Keep the written answer useful and complete; do not sacrifice accuracy for conversational style.",
    "ADAPTIVE TEACHING: Decide whether the user needs a continuous explanation or an interactive lesson. For a simple question, answer directly without forcing a quiz. For a difficult or multi-step topic, explain one idea at a time, use a concrete example, and pause at meaningful checkpoints. If the user asks a follow-up or says they are confused, rephrase more simply and continue from the point they need. Do not repeatedly ask whether the user understands.",
    "EMOTIONAL DELIVERY: Let the meaning of the answer guide a restrained delivery tone: calm for ordinary help, curious for exploration, reassuring for frustration, serious for important warnings, teaching for lessons, and excited for genuine good news. Keep factual content, safety and uncertainty unchanged.",
    "TURN-TAKING: Respect interruptions. If the user changes topic, answer the new request instead of finishing the previous explanation. When they ask to repeat, slow down, clarify, or continue, respond to that exact conversational instruction."
  ].join("\n");
}

export function splitSpeechIntoChunks(value, maxLength = 360) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  if (!text) return [];
  const limit = Math.max(100, Math.min(900, Number(maxLength) || 360));
  const sentences = text.match(/[^.!?]+[.!?]+|[^.!?]+$/g) || [text];
  const chunks = [];
  let current = "";
  for (const raw of sentences) {
    const sentence = raw.trim();
    if (!sentence) continue;
    if (sentence.length > limit) {
      if (current) { chunks.push(current); current = ""; }
      let rest = sentence;
      while (rest.length > limit) {
        let cut = rest.lastIndexOf(" ", limit);
        if (cut < Math.floor(limit * 0.55)) cut = limit;
        chunks.push(rest.slice(0, cut).trim());
        rest = rest.slice(cut).trim();
      }
      current = rest;
    } else if (!current) current = sentence;
    else if ((current + " " + sentence).length <= limit) current += " " + sentence;
    else { chunks.push(current); current = sentence; }
  }
  if (current) chunks.push(current);
  return chunks;
}

export function resolveVoiceFollowUp(value, context = {}) {
  const command = normalizeSpeechText(value);
  const lastAnswer = String(context.lastAnswer || "").trim();
  const lastSentence = (lastAnswer.match(/[^.!?]+[.!?]+|[^.!?]+$/g) || []).map(item => item.trim()).filter(Boolean).slice(-1)[0] || "";
  if (/^(?:continue|go on|carry on|keep going)$/.test(command)) {
    return { type: "continue", prompt: lastAnswer ? "Continue the previous explanation from the point it ended. Avoid repeating what has already been covered. Previous answer: " + lastAnswer.slice(-1800) : "Continue your explanation." };
  }
  if (/^(?:what did you just say|what was that|say that again)$/.test(command)) {
    return { type: "repeat_last_sentence", text: lastSentence || lastAnswer };
  }
  if (/^(?:(?:what about|tell me about|explain)\s+)?(?:(?:the|my)\s+)?(?:other|second|first|last)\s+option$/.test(command) || /^(?:what about the other option|what was the other option)$/.test(command)) {
    return { type: "return_to_option", prompt: "Explain the " + (/(?:second)/.test(command) ? "second" : /(?:first)/.test(command) ? "first" : "other") + " option from your previous answer. Compare it briefly with the option already discussed. Previous answer: " + lastAnswer.slice(-1800) };
  }
  if (/^(?:explain differently|explain another way|say it another way|i do not understand|i dont understand|i'm confused|im confused)$/.test(command)) {
    return { type: "rephrase", prompt: lastAnswer ? "Explain your previous answer in a different, simpler way, using a fresh example. Do not merely repeat it. Previous answer: " + lastAnswer.slice(-1800) : "Please explain that more simply with a clear example." };
  }
  const point = command.match(/^(?:go back to|return to|explain)\s+(?:the\s+)?(first|second|third|fourth|last)\s+(?:point|part|step)$/);
  if (point) {
    return { type: "return_to_point", prompt: "Return to the " + point[1] + " point of your previous answer and explain it again with a little more detail. Previous answer: " + lastAnswer.slice(-1800) };
  }
  return null;
}

export function applySpeechPace(delivery, preference = "adaptive") {
  const base = delivery && Number.isFinite(delivery.rate) ? delivery.rate : 0.96;
  const multiplier = preference === "slower" ? 0.86 : preference === "faster" ? 1.08 : 1;
  return { ...delivery, rate: Math.max(0.78, Math.min(1.12, base * multiplier)) };
}
