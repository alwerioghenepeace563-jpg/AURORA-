/**
 * Per-user durable media jobs backed by a private Supabase Storage bucket and RLS table.
 * Uses the signed-in user's access token; never a service-role key.
 */
function createAuroraMediaJobAdapter(options = {}) {
  const baseUrl = String(options.url || "").trim().replace(/\/$/, "").replace(/\/(?:rest\/v1|auth\/v1)$/i, "");
  const anonKey = String(options.anonKey || "").trim();
  const getAccessToken = options.getAccessToken;
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  const bucket = "aurora-media-jobs";
  const configured = Boolean(baseUrl && anonKey && typeof getAccessToken === "function" && typeof fetchImpl === "function");

  async function request(path, init = {}) {
    if (!configured) throw new Error("Cloud transcription storage is not configured.");
    const token = await getAccessToken();
    if (!token) throw new Error("Sign in to AURORA to save a resumable transcription.");
    const response = await fetchImpl(baseUrl + path, {
      ...init,
      headers: { apikey: anonKey, Authorization: "Bearer " + token, ...(init.headers || {}) }
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      throw new Error("Cloud transcription storage failed (" + response.status + "). " + detail.slice(0, 180));
    }
    if (response.status === 204) return null;
    const body = await response.text();
    return body ? JSON.parse(body) : null;
  }

  function safeId(value) {
    const id = String(value || "");
    if (!/^[a-zA-Z0-9_-]{8,80}$/.test(id)) throw new Error("Invalid transcription job ID.");
    return id;
  }

  return Object.freeze({
    isConfigured: () => configured,
    async uploadSource(file, jobId) {
      const id = safeId(jobId);
      if (!file || !Number.isFinite(file.size) || file.size <= 0) throw new Error("Choose a non-empty recording.");
      const token = await getAccessToken();
      if (!token) throw new Error("Sign in to AURORA before uploading a recording.");
      const path = tokenUserIdPlaceholder(token, id, file.name);
      const response = await fetchImpl(baseUrl + "/storage/v1/object/" + bucket + "/" + path, {
        method: "POST",
        headers: { apikey: anonKey, Authorization: "Bearer " + token, "Content-Type": file.type || "application/octet-stream", "x-upsert": "true" },
        body: file
      });
      if (!response.ok) {
        const detail = await response.text().catch(() => "");
        throw new Error("Recording upload failed (" + response.status + "). " + detail.slice(0, 180));
      }
      return path;
    },
    async downloadSource(path) {
      const safePath = String(path || "");
      if (!/^\/[a-zA-Z0-9_-]+\/[a-zA-Z0-9_-]+\/[a-zA-Z0-9._-]+$/.test("/" + safePath)) throw new Error("Invalid cloud recording path.");
      const token = await getAccessToken();
      if (!token) throw new Error("Sign in to restore this transcription.");
      const response = await fetchImpl(baseUrl + "/storage/v1/object/" + bucket + "/" + safePath, { headers: { apikey: anonKey, Authorization: "Bearer " + token } });
      if (!response.ok) throw new Error("The saved recording could not be restored (" + response.status + ").");
      return response.blob();
    },
    async createJob(job) {
      const id = safeId(job?.id);
      const rows = await request("/rest/v1/aurora_media_jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json", Prefer: "return=representation" },
        body: JSON.stringify({ id, filename: String(job.filename || "recording").slice(0, 240), mime_type: String(job.mimeType || "application/octet-stream").slice(0, 120), source_path: job.sourcePath, file_size: job.fileSize, duration_seconds: job.durationSeconds || null, status: "queued", progress_seconds: 0, transcript: "", error_message: null })
      });
      return rows?.[0] || { id };
    },
    async updateJob(id, patch) {
      const allowed = {};
      if (Number.isFinite(patch.progressSeconds)) allowed.progress_seconds = Math.max(0, patch.progressSeconds);
      if (typeof patch.transcript === "string") allowed.transcript = patch.transcript.slice(0, 2000000);
      if (["queued", "processing", "paused", "completed", "failed"].includes(patch.status)) allowed.status = patch.status;
      if (typeof patch.errorMessage === "string" || patch.errorMessage === null) allowed.error_message = patch.errorMessage?.slice(0, 500) ?? null;
      if (Number.isFinite(patch.durationSeconds)) allowed.duration_seconds = patch.durationSeconds;
      await request("/rest/v1/aurora_media_jobs?id=eq." + encodeURIComponent(safeId(id)), {
        method: "PATCH", headers: { "Content-Type": "application/json", Prefer: "return=minimal" }, body: JSON.stringify(allowed)
      });
      return { id, updated: true };
    },
    async listJobs(limit = 20) {
      const rows = await request("/rest/v1/aurora_media_jobs?select=id,filename,mime_type,source_path,file_size,duration_seconds,status,progress_seconds,transcript,error_message,updated_at&order=updated_at.desc&limit=" + Math.max(1, Math.min(50, Number(limit) || 20)), { method: "GET" });
      return Array.isArray(rows) ? rows : [];
    },
    async deleteJob(id, sourcePath) {
      await request("/rest/v1/aurora_media_jobs?id=eq." + encodeURIComponent(safeId(id)), { method: "DELETE", headers: { Prefer: "return=minimal" } });
      if (sourcePath) {
        const token = await getAccessToken();
        await fetchImpl(baseUrl + "/storage/v1/object/" + bucket, { method: "DELETE", headers: { apikey: anonKey, Authorization: "Bearer " + token, "Content-Type": "application/json" }, body: JSON.stringify({ prefixes: [sourcePath] }) });
      }
      return { deleted: true, id };
    }
  });
}
function tokenUserIdPlaceholder(jobId, filename) {
  const clean = String(filename || "recording").normalize("NFKD").replace(/[^a-zA-Z0-9._-]+/g, "_").slice(-90) || "recording";
  return userId + "/" + jobId + "/" + clean;
}
export { createAuroraMediaJobAdapter };
