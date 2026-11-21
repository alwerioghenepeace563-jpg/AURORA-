export interface CallingEnv {
  SUPABASE_URL?: string;
  VITE_SUPABASE_URL?: string;
  VITE_SUPABASE_API?: string;
  SUPABASE_ANON_KEY?: string;
  VITE_SUPABASE_ANON_KEY?: string;
  AURORA_ALLOWED_ORIGIN?: string;
  AURORA_CALLS: DurableObjectNamespace;
  AURORA_PUSH_GATEWAY_URL?: string;
  AURORA_PUSH_GATEWAY_TOKEN?: string;
}
type Device = { id: string; token?: string; platform: "android" | "web"; updatedAt: number; lastSeen: number };
type Reminder = { id: string; title: string; message: string; scheduledAt: number; status: "scheduled" | "delivered" | "cancelled"; createdAt: number };
type ActiveCall = { id: string; reminderId?: string; title: string; message: string; status: "pending" | "ringing" | "answered" | "declined" | "missed" | "ended"; createdAt: number; expiresAt: number; answeredBy?: string };
type Signal = { id: string; callId: string; fromDeviceId: string; toDeviceId: string; kind: "offer" | "answer" | "ice" | "hangup"; payload: unknown; createdAt: number };
const MAX_REMINDERS = 100;
const MAX_SIGNAL_BYTES = 48_000;
const idPattern = /^[a-zA-Z0-9_-]{8,80}$/;
function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });
}
function validDeviceId(value: unknown): value is string { return typeof value === "string" && /^[a-zA-Z0-9_-]{8,80}$/.test(value); }
function safeText(value: unknown, max: number): string { return typeof value === "string" ? value.trim().slice(0, max) : ""; }
function parseJson(request: Request): Promise<any> { return request.json().catch(() => ({})); }

export async function handleCalling(request: Request, env: CallingEnv): Promise<Response> {
  const origin = request.headers.get("Origin") || "";
  const configured = (env.AURORA_ALLOWED_ORIGIN || "").split(",").map(v => v.trim().replace(/\/+$/, "")).filter(Boolean);
  const allowed = new Set(["https://localhost", "http://localhost", "capacitor://localhost", "ionic://localhost", "https://aurora-ten-gold.vercel.app", ...configured]);
  if (origin && !allowed.has(origin)) {
    try { const parsed = new URL(origin); if (parsed.protocol !== "https:" || !/^aurora-[a-z0-9-]+-smart-bm\.vercel\.app$/i.test(parsed.hostname)) return json({ error: "Origin not allowed." }, 403); }
    catch { return json({ error: "Origin not allowed." }, 403); }
  }
  const headers = new Headers({ "Vary": "Origin", "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS", "Access-Control-Allow-Headers": "Content-Type, Authorization, apikey, x-client-info", "Access-Control-Max-Age": "86400", "Cache-Control": "no-store" });
  if (origin) headers.set("Access-Control-Allow-Origin", origin);
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers });
  const url = new URL(request.url);
  const auth = request.headers.get("Authorization") || "";
  const token = auth.match(/^Bearer\s+([^\s]+)$/i)?.[1] || "";
  const supabaseUrl = String(env.SUPABASE_URL || env.VITE_SUPABASE_URL || env.VITE_SUPABASE_API || "").trim().replace(/\/$/, "").replace(/\/(?:rest\/v1|auth\/v1)$/i, "");
  const anonKey = env.SUPABASE_ANON_KEY || env.VITE_SUPABASE_ANON_KEY || "";
  if (!token || !supabaseUrl || !anonKey) return json({ error: "Sign in to AURORA to use private calling." }, 401);
  let verified: Response;
  try { verified = await fetch(supabaseUrl + "/auth/v1/user", { headers: { apikey: anonKey, Authorization: "Bearer " + token }, signal: AbortSignal.timeout(9000) }); }
  catch { return json({ error: "AURORA could not verify your sign-in session." }, 502); }
  if (!verified.ok) return json({ error: "Your sign-in session has expired. Sign in again." }, 401);
  const user = await verified.json().catch(() => null) as { id?: string } | null;
  if (!user?.id) return json({ error: "A verified AURORA account is required." }, 401);
  const stub = env.AURORA_CALLS.get(env.AURORA_CALLS.idFromName("user:" + user.id));
  const forwarded = new Request("https://aurora-calls.internal" + url.pathname + url.search, request);
  const response = await stub.fetch(forwarded);
  const resultHeaders = new Headers(response.headers);
  headers.forEach((value, key) => resultHeaders.set(key, value));
  return new Response(response.body, { status: response.status, headers: resultHeaders });
}

export class AuroraCallsDurableObject {
  private state: DurableObjectState;
  private env: CallingEnv;
  constructor(state: DurableObjectState, env: CallingEnv) { this.state = state; this.env = env; }
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url), path = url.pathname;
    if (request.method === "GET" && path === "/api/calls/status") {
      const devices = await this.state.storage.get<Device[]>("devices") || [];
      const reminders = await this.state.storage.get<Reminder[]>("reminders") || [];
      const calls = await this.state.storage.get<ActiveCall[]>("calls") || [];
      return json({ ok: true, devices: devices.length, scheduled: reminders.filter(r => r.status === "scheduled").length, activeCalls: calls.filter(c => c.status === "ringing" || c.status === "answered").length, pushGatewayConfigured: Boolean(this.env.AURORA_PUSH_GATEWAY_URL && this.env.AURORA_PUSH_GATEWAY_TOKEN) });
    }
    if (path === "/api/calls/devices" && request.method === "POST") return this.registerDevice(request);
    if (path.startsWith("/api/calls/devices/") && request.method === "DELETE") return this.removeDevice(decodeURIComponent(path.split("/").pop() || ""));
    if (path === "/api/calls/inbox" && request.method === "GET") return this.readInbox(url.searchParams.get("deviceId") || "");
    if (path === "/api/calls/schedules" && request.method === "POST") return this.createReminder(request);
    if (path === "/api/calls/schedules" && request.method === "GET") {
      const reminders = await this.state.storage.get<Reminder[]>("reminders") || [];
      return json({ reminders: reminders.filter(r => r.status === "scheduled").sort((a,b) => a.scheduledAt-b.scheduledAt) });
    }
    if (path.startsWith("/api/calls/schedules/") && request.method === "DELETE") return this.cancelReminder(decodeURIComponent(path.split("/").pop() || ""));
    if (path === "/api/calls/signals" && request.method === "POST") return this.sendSignal(request);
    if (path === "/api/calls/signals" && request.method === "GET") return this.readSignals(url.searchParams.get("deviceId") || "");
    const match = path.match(/^\/api\/calls\/([a-zA-Z0-9_-]{8,80})\/(answer|decline|end)$/);
    if (match && request.method === "POST") return this.updateCall(request, match[1], match[2] as "answer" | "decline" | "end");
    return json({ error: "Unknown AURORA calling route." }, 404);
  }
  private async registerDevice(request: Request): Promise<Response> {
    const body = await parseJson(request), id = safeText(body.deviceId, 80), token = safeText(body.pushToken, 4096);
    const platform = body.platform === "web" ? "web" : "android";
    if (!validDeviceId(id) || token.length < 16) return json({ error: "A valid device ID and push token are required." }, 400);
    const devices = await this.state.storage.get<Device[]>("devices") || [];
    const next = devices.filter(d => d.id !== id);
    next.push({ id, ...(token ? { token } : {}), platform, updatedAt: Date.now(), lastSeen: Date.now() });
    await this.state.storage.put("devices", next.slice(-10));
    return json({ registered: true, deviceId: id, deviceLimit: 10 });
  }
  private async removeDevice(id: string): Promise<Response> {
    if (!validDeviceId(id)) return json({ error: "Invalid device ID." }, 400);
    const devices = await this.state.storage.get<Device[]>("devices") || [];
    await this.state.storage.put("devices", devices.filter(d => d.id !== id));
    return json({ removed: true });
  }
  private async createReminder(request: Request): Promise<Response> {
    const body = await parseJson(request), id = safeText(body.id, 80), title = safeText(body.title, 120), message = safeText(body.message, 500);
    const scheduledAt = Number(body.scheduledAt);
    if (!validDeviceId(id) || !title || !Number.isFinite(scheduledAt) || scheduledAt < Date.now() + 10_000 || scheduledAt > Date.now() + 365 * 86400_000) return json({ error: "Provide an ID, title and a time between 10 seconds and 365 days from now." }, 400);
    const reminders = await this.state.storage.get<Reminder[]>("reminders") || [];
    if (reminders.filter(r => r.status === "scheduled").length >= MAX_REMINDERS) return json({ error: "This account has reached its 100 scheduled-call limit." }, 429);
    const reminder: Reminder = { id, title, message, scheduledAt, status: "scheduled", createdAt: Date.now() };
    await this.state.storage.put("reminders", [...reminders.filter(r => r.id !== id), reminder]);
    const current = await this.state.storage.get<number>("nextAlarm");
    if (!current || scheduledAt < current) await this.state.storage.setAlarm(scheduledAt);
    await this.state.storage.put("nextAlarm", current ? Math.min(current, scheduledAt) : scheduledAt);
    return json({ scheduled: true, reminder });
  }
  private async cancelReminder(id: string): Promise<Response> {
    if (!validDeviceId(id)) return json({ error: "Invalid reminder ID." }, 400);
    const reminders = await this.state.storage.get<Reminder[]>("reminders") || [];
    const next = reminders.map(r => r.id === id && r.status === "scheduled" ? { ...r, status: "cancelled" as const } : r);
    await this.state.storage.put("reminders", next);
    await this.rearm();
    return json({ cancelled: next.some((r,i) => r.id === id && r.status === "cancelled" && reminders[i]?.status === "scheduled") });
  }
  private async rearm(): Promise<void> {
    const reminders = await this.state.storage.get<Reminder[]>("reminders") || [];
    const next = reminders.filter(r => r.status === "scheduled").reduce<number | null>((min,r) => min === null || r.scheduledAt < min ? r.scheduledAt : min, null);
    if (next === null) { await this.state.storage.deleteAlarm(); await this.state.storage.delete("nextAlarm"); }
    else { await this.state.storage.setAlarm(next); await this.state.storage.put("nextAlarm", next); }
  }
  async alarm(): Promise<void> {
    const reminders = await this.state.storage.get<Reminder[]>("reminders") || [], now = Date.now();
    const due = reminders.filter(r => r.status === "scheduled" && r.scheduledAt <= now + 5000);
    let updated = reminders;
    for (const reminder of due) {
      const devices = await this.state.storage.get<Device[]>("devices") || [];\n      const online = devices.some(d => now - d.lastSeen < 60_000);\n      const call: ActiveCall = { id: crypto.randomUUID().replace(/-/g,""), reminderId: reminder.id, title: reminder.title, message: reminder.message, status: online ? "ringing" : "pending", createdAt: now, expiresAt: online ? now + 45_000 : 0 };
      const calls = await this.state.storage.get<ActiveCall[]>("calls") || [];
      await this.state.storage.put("calls", [...calls.filter(c => c.status !== "missed" && c.status !== "ended").slice(-19), call]);
      if (call.status === "ringing") await this.push({ event: "incoming_call", call, reminder });
      updated = updated.map(r => r.id === reminder.id ? { ...r, status: "delivered" } : r);
    }
    await this.state.storage.put("reminders", updated);
    await this.rearm();
  }
  private async push(payload: unknown): Promise<void> {
    const endpoint = this.env.AURORA_PUSH_GATEWAY_URL || "", secret = this.env.AURORA_PUSH_GATEWAY_TOKEN || "";
    if (!endpoint || !secret) return;
    let parsed: URL;
    try { parsed = new URL(endpoint); if (parsed.protocol !== "https:") return; } catch { return; }
    const devices = await this.state.storage.get<Device[]>("devices") || [];
    if (!devices.length) return;
    try { await fetch(parsed.toString(), { method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer " + secret }, body: JSON.stringify({ devices: devices.map(({id,token,platform}) => ({ id, token, platform })), payload }), signal: AbortSignal.timeout(10_000) }); } catch { /* retry is provided by the pending-call list */ }
  }
  private async readInbox(deviceId: string): Promise<Response> {
    if (!validDeviceId(deviceId)) return json({ error: "A valid device ID is required." }, 400);
    const devices = await this.state.storage.get<Device[]>("devices") || [];
    const device = devices.find(d => d.id === deviceId);
    if (!device) return json({ error: "Register this AURORA device before checking incoming calls." }, 403);
    device.lastSeen = Date.now();
    await this.state.storage.put("devices", devices);
    const calls = await this.state.storage.get<ActiveCall[]>("calls") || [];
    let changed = false;
    for (const call of calls) {
      if (call.status === "pending") {
        call.status = "ringing";
        call.expiresAt = Date.now() + 45_000;
        changed = true;
        await this.push({ event: "incoming_call", call });
      } else if (call.status === "ringing" && call.expiresAt > 0 && call.expiresAt < Date.now()) {
        call.status = "missed";
        changed = true;
      }
    }
    if (changed) await this.state.storage.put("calls", calls);
    return json({ calls: calls.filter(c => c.status === "ringing" || c.status === "pending"), deviceId, polledAt: Date.now() });
  }
  private async updateCall(request: Request, id: string, action: "answer" | "decline" | "end"): Promise<Response> {
    const body = await parseJson(request), deviceId = safeText(body.deviceId, 80);
    if (!validDeviceId(deviceId)) return json({ error: "A registered device ID is required." }, 400);
    const devices = await this.state.storage.get<Device[]>("devices") || [];
    if (!devices.some(d => d.id === deviceId)) return json({ error: "This device is not registered for this AURORA account." }, 403);
    const calls = await this.state.storage.get<ActiveCall[]>("calls") || [], call = calls.find(c => c.id === id);
    if (!call) return json({ error: "Call not found." }, 404);
    if (action === "answer" && !["ringing","pending"].includes(call.status)) return json({ error: "This call is no longer available." }, 409);
    if (action === "answer" && call.expiresAt > 0 && call.expiresAt < Date.now()) { call.status = "missed"; await this.state.storage.put("calls", calls); return json({ error: "This call has expired." }, 410); }
    call.status = action === "answer" ? "answered" : action === "decline" ? "declined" : "ended";
    if (action === "answer") call.answeredBy = deviceId;
    await this.state.storage.put("calls", calls);
    await this.push({ event: "call_" + call.status, call, deviceId });
    return json({ updated: true, call });
  }
  private async sendSignal(request: Request): Promise<Response> {
    const body = await parseJson(request), callId = safeText(body.callId, 80), fromDeviceId = safeText(body.fromDeviceId, 80), toDeviceId = safeText(body.toDeviceId, 80), kind = body.kind;
    if (!idPattern.test(callId) || !validDeviceId(fromDeviceId) || !validDeviceId(toDeviceId) || !["offer","answer","ice","hangup"].includes(kind)) return json({ error: "Invalid call signal." }, 400);
    const devices = await this.state.storage.get<Device[]>("devices") || [];
    if (!devices.some(d => d.id === fromDeviceId) || !devices.some(d => d.id === toDeviceId)) return json({ error: "Both devices must be registered to this AURORA account." }, 403);
    const raw = JSON.stringify(body.payload ?? null);
    if (raw.length > MAX_SIGNAL_BYTES) return json({ error: "Call signal is too large." }, 413);
    const signals = await this.state.storage.get<Signal[]>("signals") || [];
    const signal: Signal = { id: crypto.randomUUID(), callId, fromDeviceId, toDeviceId, kind, payload: body.payload ?? null, createdAt: Date.now() };
    await this.state.storage.put("signals", [...signals.filter(s => Date.now() - s.createdAt < 120_000), signal].slice(-100));
    await this.push({ event: "call_signal", targetDeviceId: toDeviceId, callId });
    return json({ queued: true, signalId: signal.id });
  }
  private async readSignals(deviceId: string): Promise<Response> {
    if (!validDeviceId(deviceId)) return json({ error: "A valid device ID is required." }, 400);
    const devices = await this.state.storage.get<Device[]>("devices") || [];
    if (!devices.some(d => d.id === deviceId)) return json({ error: "This device is not registered." }, 403);
    const signals = await this.state.storage.get<Signal[]>("signals") || [];
    const mine = signals.filter(s => s.toDeviceId === deviceId && Date.now() - s.createdAt < 120_000);
    await this.state.storage.put("signals", signals.filter(s => s.toDeviceId !== deviceId && Date.now() - s.createdAt < 120_000));
    return json({ signals: mine });
  }
}
