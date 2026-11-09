/**
 * User-scoped durable media job storage for AURORA.
 * Uses the signed-in user's Supabase JWT and RLS; never uses a service-role key.
 * Audio sections and transcript checkpoints survive page/app reloads.
 */
function createAuroraMediaJobAdapter(options = {}) {
  const baseUrl = String(options.url || "").trim().replace(/\/$/, "").replace(/\/(?:rest\/v1|auth\/v1)$/i, "");
  const anonKey = String(options.anonKey || "").trim();
  const getAccessToken = options.getAccessToken;
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  const bucket = "aurora-media-jobs";
  const configured = Boolean(baseUrl && anonKey && typeof getAccessToken === "function" && typeof fetchImpl === "function");

  async function headers(extra = {}) {
    if (!configured) throw new Error("Cloud transcription storage is not configured.");
    const token = await getAccessToken();
    if (typeof token !== "string" || !token.trim()) throw new Error("Sign in to AURORA to use cloud transcription recovery.");
    return { apikey: anonKey, Authorization: "Bearer " + token, ...extra };
  }
  async function request(path, init = {}) {
    const response = await fetchImpl(baseUrl + path, { ...init, headers: { ...(await headers()), ...(init.headers || {}) } });
    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      throw new Error("Cloud transcription storage failed (" + response.status + "). " + detail.slice(0, 180));
    }
    if (response.status === 204) return null;
    const raw = await response.text();
    return raw ? JSON.parse(raw) : null;
  }
  function encode(value) { return encodeURIComponent(String(value)); }

  return Object.freeze({
    isConfigured: () => configured,
    async findJob(fingerprint) {
      const rows = await request("/rest/v1/aurora_media_jobs?select=*&fingerprint=eq." + encode(fingerprint) + "&order=updated_at.desc&limit=1");
      return Array.isArray(rows) ? rows[0] || null : null;
    },
    async createJob(input) {
      const id = globalThis.crypto?.randomUUID?.() || ("media-" + Date.now() + "-" + Math.random().toString(36).slice(2));
      const rows = await request("/rest/v1/aurora_media_jobs?select=*", {
        method: "POST",
        headers: { "Content-Type": "application/json", Prefer: "return=representation" },
        body: JSON.stringify({ id, fingerprint: input.fingerprint, file_name: String(input.fileName || "recording").slice(0, 240), file_size: input.fileSize, last_modified: input.lastModified, mime_type: String(input.mimeType || "application/octet-stream").slice(0, 100), status: "queued" })
      });
      if (!Array.isArray(rows) || !rows[0]) throw new Error("Cloud transcription job was not created.");
      return rows[0];
    },
    async listSections(jobId) {
      const rows = await request("/rest/v1/aurora_media_job_sections?select=*&job_id=eq." + encode(jobId) + "&order=section_index.asc");
      return Array.isArray(rows) ? rows : [];
    },
    async uploadSection(job, index, blob) {
      const path = job.user_id + "/" + job.id + "/" + String(index).padStart(8, "0") + ".webm";
      const response = await fetchImpl(baseUrl + "/storage/v1/object/" + bucket + "/" + path.split("/").map(encode).join("/"), {
        method: "POST",
        headers: await headers({ "Content-Type": blob.type || "audio/webm", "x-upsert": "true" }),
        body: blob
      });
      if (!response.ok) {
        const detail = await response.text().catch(() => "");
        throw new Error("Audio checkpoint upload failed (" + response.status + "). " + detail.slice(0, 180));
      }
      return path;
    },
    async saveSection(jobId, section) {
      const rows = await request("/rest/v1/aurora_media_job_sections?on_conflict=job_id,section_index", {
        method: "POST",
        headers: { "Content-Type": "application/json", Prefer: "resolution=merge-duplicates,return=representation" },
        body: JSON.stringify({ job_id: jobId, section_index: section.index, start_seconds: section.start, end_seconds: section.end, storage_path: section.storagePath, transcript: section.transcript, segments: Array.isArray(section.segments) ? section.segments : [] })
      });
      return Array.isArray(rows) ? rows[0] || null : null;
    },
    async updateJob(jobId, patch) {
      await request("/rest/v1/aurora_media_jobs?id=eq." + encode(jobId), {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Prefer: "return=minimal" },
        body: JSON.stringify({ ...patch, updated_at: new Date().toISOString() })
      });
      return { updated: true };
    }
  });
}
export { createAuroraMediaJobAdapter };
