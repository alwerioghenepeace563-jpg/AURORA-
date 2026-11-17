const LIVE_PATTERN = /\b(latest|current|today|right now|recent|this week|news|headlines|breaking|as of now|price today|search online|look up online)\b/i;
const IMAGE_PATTERN = /\b(image|images|photo|photos|picture|pictures|visual reference|illustration)\b/i;
const DIAGRAM_PATTERN = /\b(diagram|chart|infographic|schematic|flowchart)\b/i;
const VIDEO_PATTERN = /\b(video|videos|clip|clips|footage|watch)\b/i;
const DOCUMENT_PATTERN = /\b(pdf|document|documents|paper|papers|report|reports|manual|ebook)\b/i;

export function inferResearchIntent(query, options = {}) {
  const text = String(query || "").trim().slice(0, 240);
  const requestedTypes = Array.isArray(options.mediaTypes)
    ? options.mediaTypes.filter(type => ["web", "image", "diagram", "video", "document"].includes(type))
    : [];
  const mediaTypes = requestedTypes.length ? [...new Set(requestedTypes)] : ["web"];
  if (!requestedTypes.length) {
    if (IMAGE_PATTERN.test(text)) mediaTypes.push("image");
    if (DIAGRAM_PATTERN.test(text)) mediaTypes.push("diagram");
    if (VIDEO_PATTERN.test(text)) mediaTypes.push("video");
    if (DOCUMENT_PATTERN.test(text)) mediaTypes.push("document");
  }
  const intent = ["quick", "deep", "visual", "document"].includes(options.intent)
    ? options.intent
    : mediaTypes.some(type => type !== "web")
      ? mediaTypes.includes("document") ? "document" : "visual"
      : LIVE_PATTERN.test(text) ? "deep" : "quick";
  const freshness = ["current", "recent", "any"].includes(options.freshness)
    ? options.freshness
    : /\b(today|now|current|latest|breaking|this week|recent)\b/i.test(text) ? "current" : "any";
  if (!mediaTypes.includes("web") && mediaTypes.length === 0) mediaTypes.push("web");
  return { query: text, intent, mediaTypes, freshness };
}
