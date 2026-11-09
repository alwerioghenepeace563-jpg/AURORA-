import { auroraApiUrl } from "./aurora-native";

async function request(path, options = {}) {
  const response = await fetch(auroraApiUrl(path), {
    ...options,
    headers: { ...(options.body ? { "Content-Type": "application/json" } : {}), ...(options.headers || {}) },
    cache: "no-store"
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.error || "AURORA VoiceText request failed.");
    error.status = response.status;
    error.retryable = Boolean(data.retryable || response.status >= 500 || response.status === 429);
    error.details = data;
    throw error;
  }
  return data;
}

export const voiceTextJobs = {
  create: ({ filename, mimeType, sizeBytes, durationSeconds, totalChunks, requestId }) =>
    request("/api/voicetext", { method: "POST", body: JSON.stringify({
      action: "create", filename, mimeType, sizeBytes, durationSeconds, totalChunks, requestId
    }) }),
  processSection: ({ requestId, chunkNumber, totalChunks, mimeType, languageHint, audioBase64 }) =>
    request("/api/voicetext", { method: "POST", body: JSON.stringify({
      action: "process", requestId, chunkNumber, totalChunks, mimeType, languageHint, audioBase64
    }) }),
  get: requestId => request("/api/voicetext?requestId=" + encodeURIComponent(requestId)),
};
