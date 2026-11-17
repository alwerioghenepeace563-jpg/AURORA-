const json = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });

function constantTimeEqual(a: string, b: string) {
  if (!a || !b || a.length !== b.length) return false;
  let mismatch = 0;
  for (let index = 0; index < a.length; index++) mismatch |= a.charCodeAt(index) ^ b.charCodeAt(index);
  return mismatch === 0;
}

const SUPABASE_URL = (Deno.env.get("SUPABASE_URL") || "").replace(/\/$/, "");
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const API_URL = (Deno.env.get("AURORA_RESEARCH_API_URL") || "").replace(/\/$/, "");
const WORKER_TOKEN = Deno.env.get("AURORA_RESEARCH_WORKER_TOKEN") || "";
const MAX_PER_INVOCATION = 2;

function serviceHeaders(extra: Record<string, string> = {}) {
  return { apikey: SERVICE_KEY, Authorization: "Bearer " + SERVICE_KEY, "Content-Type": "application/json", ...extra };
}

async function updateTask(id: string, patch: Record<string, unknown>) {
  const response = await fetch(SUPABASE_URL + "/rest/v1/aurora_research_tasks?id=eq." + encodeURIComponent(id) + "&status=eq.running", {
    method: "PATCH",
    headers: serviceHeaders({ Prefer: "return=minimal" }),
    body: JSON.stringify({ ...patch, updated_at: new Date().toISOString() })
  });
  if (!response.ok) throw new Error("Could not update research task state (" + response.status + ").");
}

async function claimTask() {
  const response = await fetch(SUPABASE_URL + "/rest/v1/rpc/claim_aurora_research_task", {
    method: "POST",
    headers: serviceHeaders(),
    body: "{}"
  });
  if (!response.ok) throw new Error("Could not claim a research task (" + response.status + ").");
  const rows = await response.json();
  return Array.isArray(rows) ? rows[0] || null : rows || null;
}

async function processTask(task: Record<string, any>) {
  const taskId = String(task.id || "");
  const request = task.request && typeof task.request === "object" ? task.request : {};
  try {
    if (!API_URL || !WORKER_TOKEN) throw new Error("Research worker API URL or worker token is not configured.");
    const response = await fetch(API_URL + "/api/search", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-aurora-research-worker-token": WORKER_TOKEN },
      body: JSON.stringify({
        ...request,
        query: String(task.query || request.query || "").slice(0, 240),
        taskId,
        research: true,
        taskWorker: true
      }),
      signal: AbortSignal.timeout(45000)
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || result.status === "failed") {
      throw new Error(String(result.error || "Research API returned HTTP " + response.status).slice(0, 240));
    }
    const finalStatus = result.status === "partial" ? "partial" : "completed";
    await updateTask(taskId, {
      status: finalStatus,
      result,
      error: null,
      completed_at: new Date().toISOString(),
      lease_expires_at: null
    });
    return { taskId, status: finalStatus };
  } catch (error) {
    const attempts = Number(task.attempts || 1);
    const maxAttempts = Number(task.max_attempts || 3);
    const message = String((error as Error)?.message || "Research worker failed").slice(0, 240);
    const terminal = attempts >= maxAttempts;
    const delaySeconds = Math.min(300, 15 * Math.pow(2, Math.max(0, attempts - 1)));
    await updateTask(taskId, terminal ? {
      status: "failed", error: message, completed_at: new Date().toISOString(), lease_expires_at: null
    } : {
      status: "queued", error: message,
      next_attempt_at: new Date(Date.now() + delaySeconds * 1000).toISOString(),
      lease_expires_at: null
    });
    return { taskId, status: terminal ? "failed" : "queued", retryInSeconds: terminal ? 0 : delaySeconds };
  }
}

Deno.serve(async (request) => {
  if (request.method !== "POST") return json(405, { error: "Use POST." });
  const expected = WORKER_TOKEN;
  const supplied = request.headers.get("x-aurora-worker-token") || "";
  if (!constantTimeEqual(supplied, expected)) return json(401, { error: "Worker authorization failed." });
  if (!SUPABASE_URL || !SERVICE_KEY) return json(503, { error: "Research worker database credentials are unavailable." });

  const processed = [];
  try {
    for (let index = 0; index < MAX_PER_INVOCATION; index++) {
      const task = await claimTask();
      if (!task) break;
      processed.push(await processTask(task));
    }
    return json(200, { ok: true, processed, count: processed.length });
  } catch (error) {
    console.error("AURORA research worker invocation failed:", (error as Error)?.message || error);
    return json(503, { error: "Research worker could not process the queue.", processed });
  }
});
