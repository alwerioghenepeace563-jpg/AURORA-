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
  FCM_PROJECT_ID?: string;
  FCM_CLIENT_EMAIL?: string;
  FCM_PRIVATE_KEY?: string;
}
type Device = { id: string; token?: string; platform: "android" | "web"; updatedAt: number; lastSeen: number };
type Reminder = { id: string; title: string; message: string; scheduledAt: number; status: "scheduled" | "delivered" | "cancelled"; createdAt: number };
type ActiveCall = { id: string; reminderId?: string; title: string; message: string; status: "pending" | "ringing" | "answered" | "declined" | "missed" | "ended"; createdAt: number; expiresAt: number; answeredBy?: string };
type Signal = { id: string; callId: string; fromDeviceId: string; toDeviceId: string; kind: "offer" | "answer" | "ice" | "hangup"; payload: unknown; createdAt: number };
const MAX_REMINDERS = 100;
const MAX_SIGNAL_BYTES = 48_000;
const RING_TIMEOUT_MS = 60_000;
const PUSH_QUEUE_TIMEOUT_MS = 24 * 60 * 60_000;
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
  const sameOrigin = origin === new URL(request.url).origin;
  if (origin && !sameOrigin && !allowed.has(origin)) {
    try { const parsed = new URL(origin); if (parsed.protocol !== "https:" || !/^aurora-[a-z0-9-]+-smart-bm\.vercel\.app$/i.test(parsed.hostname)) return json({ error: "Origin not allowed." }, 403); }
    catch { return json({ error: "Origin not allowed." }, 403); }
  }
  const headers = new Headers({ "Vary": "Origin", "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS", "Access-Control-Allow-Headers": "Content-Type, Authorization, apikey, x-client-info", "Access-Control-Max-Age": "86400", "Cache-Control": "no-store" });
  if (origin && (sameOrigin || allowed.has(origin) || /^https:\/\/aurora-[a-z0-9-]+-smart-bm\.vercel\.app$/i.test(new URL(origin).hostname))) headers.set("Access-Control-Allow-Origin", origin);
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
  private fcmAccessToken = "";
  private fcmAccessTokenExpiresAt = 0;
  constructor(state: DurableObjectState, env: CallingEnv) { this.state = state; this.env = env; }
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url), path = url.pathname;
    if (request.method === "GET" && path === "/api/calls/status") {
      const devices = await this.state.storage.get<Device[]>("devices") || [];
      const reminders = await this.state.storage.get<Reminder[]>("reminders") || [];
      const calls = await this.state.storage.get<ActiveCall[]>("calls") || [];
      return json({ ok: true, devices: devices.length, scheduled: reminders.filter(r => r.status === "scheduled").length, activeCalls: calls.filter(c => c.status === "ringing" || c.status === "answered").length, pushGatewayConfigured: Boolean((this.env.FCM_PROJECT_ID && this.env.FCM_CLIENT_EMAIL && this.env.FCM_PRIVATE_KEY) || (this.env.AURORA_PUSH_GATEWAY_URL && this.env.AURORA_PUSH_GATEWAY_TOKEN)) });
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
    if (!validDeviceId(id) || (token && token.length < 16)) return json({ error: "A valid device ID and optional push token are required." }, 400);
    const result = await this.state.storage.transaction(async txn => {
      const devices = await txn.get<Device[]>("devices") || [];
      const existing = devices.find(d => d.id === id);
      if (!existing && devices.length >= 10) return { error: "This AURORA account already has 10 registered devices. Remove an old device before adding another.", status: 429 };
      const next = devices.filter(d => d.id !== id);
      next.push({ id, ...((token || existing?.token) ? { token: token || existing?.token } : {}), platform, updatedAt: Date.now(), lastSeen: Date.now() });
      await txn.put("devices", next);
      return { registered: true as const };
    });
    if ("error" in result) return json({ error: result.error }, result.status);
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
      const devices = await this.state.storage.get<Device[]>("devices") || [];
      const online = devices.some(d => now - d.lastSeen < 60_000);
      const call: ActiveCall = { id: crypto.randomUUID().replace(/-/g,""), reminderId: reminder.id, title: reminder.title, message: reminder.message, status: online || devices.some(d => Boolean(d.token)) ? "ringing" : "pending", createdAt: now, expiresAt: devices.some(d => Boolean(d.token)) ? now + PUSH_QUEUE_TIMEOUT_MS : online ? now + RING_TIMEOUT_MS : 0 };
      const calls = await this.state.storage.get<ActiveCall[]>("calls") || [];
      await this.state.storage.put("calls", [...calls.filter(c => c.status !== "missed" && c.status !== "ended").slice(-19), call]);
      if (call.status === "ringing") await this.push({ event: "incoming_call", call, reminder });
      updated = updated.map(r => r.id === reminder.id ? { ...r, status: "delivered" } : r);
    }
    await this.state.storage.put("reminders", updated);
    await this.rearm();
  }
  private base64Url(value: string | Uint8Array): string {
    const bytes = typeof value === "string" ? new TextEncoder().encode(value) : value;
    let binary = "";
    for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
    return btoa(binary).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
  }
  private async getFcmAccessToken(): Promise<string> {
    if (this.fcmAccessToken && this.fcmAccessTokenExpiresAt > Date.now() + 60_000) return this.fcmAccessToken;
    const email = this.env.FCM_CLIENT_EMAIL || "", privateKey = (this.env.FCM_PRIVATE_KEY || "").replace(/\\n/g, "\n"), now = Math.floor(Date.now() / 1000);
    if (!email || !privateKey) throw new Error("FCM service account is not configured.");
    const pem = privateKey.replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----|\s/g, "");
    const binary = atob(pem), keyBytes = Uint8Array.from(binary, char => char.charCodeAt(0));
    const key = await crypto.subtle.importKey("pkcs8", keyBytes, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
    const header = this.base64Url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
    const claims = this.base64Url(JSON.stringify({ iss: email, scope: "https://www.googleapis.com/auth/firebase.messaging", aud: "https://oauth2.googleapis.com/token", iat: now, exp: now + 3600 }));
    const unsigned = header + "." + claims;
    const signature = new Uint8Array(await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(unsigned)));
    const assertion = unsigned + "." + this.base64Url(signature);
    const response = await fetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion }), signal: AbortSignal.timeout(9000) });
    const data = await response.json().catch(() => ({})) as { access_token?: string; expires_in?: number };
    if (!response.ok || !data.access_token) throw new Error("Google did not issue an FCM access token.");
    this.fcmAccessToken = data.access_token;
    this.fcmAccessTokenExpiresAt = Date.now() + Math.max(60, Number(data.expires_in) || 3600) * 1000;
    return this.fcmAccessToken;
  }
  private async push(payload: any): Promise<void> {
    const devices = await this.state.storage.get<Device[]>("devices") || [];
    if (!devices.length) return;
    const targetDeviceId = safeText(payload?.targetDeviceId, 80);
    const recipients = targetDeviceId ? devices.filter(d => d.id === targetDeviceId) : devices;
    if (!recipients.length) return;
    const projectId = this.env.FCM_PROJECT_ID || "";
    const androidDevices = recipients.filter(d => d.platform === "android" && d.token);
    let fcmDelivered = false;
    if (projectId && this.env.FCM_CLIENT_EMAIL && this.env.FCM_PRIVATE_KEY && androidDevices.length) {
      try {
        const accessToken = await this.getFcmAccessToken();
        const call = payload?.call || {};
        const data = Object.fromEntries(Object.entries({ event: payload?.event || "aurora_event", callId: call.id || payload?.callId || "", title: call.title || "AURORA", message: call.message || "" }).map(([key,value]) => [key, String(value)]));
        const outcomes = await Promise.all(androidDevices.map(async device => {
          try {
            const response = await fetch("https://fcm.googleapis.com/v1/projects/" + encodeURIComponent(projectId) + "/messages:send", {
              method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer " + accessToken },
              body: JSON.stringify({ message: { token: device.token, notification: { title: call.title || "AURORA", body: call.message || "AURORA has a reminder for you." }, data, android: { priority: "high", ttl: "86400s", notification: { channel_id: "aurora_calls", sound: "default" } } } }),
              signal: AbortSignal.timeout(9000)
            });
            if (response.ok) return { delivered: true, deviceId: device.id };
            const failure = await response.json().catch(() => ({})) as { error?: { details?: Array<{ errorCode?: string }> } };
            const invalidToken = (failure.error?.details || []).some(detail => detail.errorCode === "UNREGISTERED");
            return { delivered: false, invalidToken, deviceId: device.id };
          } catch {
            return { delivered: false, invalidToken: false, deviceId: device.id };
          }
        }));
        fcmDelivered = outcomes.some(outcome => outcome.delivered);
        const invalidTokens = new Map(outcomes.filter(outcome => outcome.invalidToken).map(outcome => [outcome.deviceId, androidDevices.find(device => device.id === outcome.deviceId)?.token]));
        if (invalidTokens.size) {
          const latest = await this.state.storage.get<Device[]>("devices") || [];
          // Retire only the exact token that FCM rejected. A newer token may
          // have been registered while the network request was in flight.
          await this.state.storage.put("devices", latest.map(device => invalidTokens.has(device.id) && device.token === invalidTokens.get(device.id) ? { ...device, token: undefined } : device));
        }
      } catch { /* pending calls remain available in the authenticated inbox */ }
    }
    const endpoint = this.env.AURORA_PUSH_GATEWAY_URL || "", secret = this.env.AURORA_PUSH_GATEWAY_TOKEN || "";
    if (!endpoint || !secret) return;
    let parsed: URL;
    try { parsed = new URL(endpoint); if (parsed.protocol !== "https:") return; } catch { return; }
    const gatewayDevices = fcmDelivered ? recipients.filter(d => d.platform === "web" && d.token) : recipients;
    if (!gatewayDevices.length) return;
    try { await fetch(parsed.toString(), { method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer " + secret }, body: JSON.stringify({ devices: gatewayDevices.map(({id,token,platform}) => ({ id, token, platform })), payload }), signal: AbortSignal.timeout(10_000) }); } catch { /* pending calls remain available in the authenticated inbox */ }
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
        call.expiresAt = Date.now() + RING_TIMEOUT_MS;
        changed = true;
        await this.push({ event: "incoming_call", call });
      } else if (call.status === "ringing" && call.expiresAt > Date.now() + RING_TIMEOUT_MS) {
        // Push-backed calls may be queued for up to 24 hours. Once a device
        // actually reconnects and sees the call, start the normal 60s ring
        // window instead of leaving the incoming-call UI active all day.
        call.expiresAt = Date.now() + RING_TIMEOUT_MS;
        changed = true;
      } else if (call.status === "ringing" && call.expiresAt === 0) {
        call.expiresAt = Date.now() + RING_TIMEOUT_MS;
        changed = true;
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
    // Serialize competing answers/declines across devices. Without this
    // transaction, two devices can both read "ringing" and both answer.
    const outcome = await this.state.storage.transaction(async txn => {
      const devices = await txn.get<Device[]>("devices") || [];
      if (!devices.some(d => d.id === deviceId)) return { error: "This device is not registered for this AURORA account.", status: 403 };
      const calls = await txn.get<ActiveCall[]>("calls") || [];
      const call = calls.find(c => c.id === id);
      if (!call) return { error: "Call not found.", status: 404 };
      if (action === "answer" && !["ringing", "pending"].includes(call.status)) return { error: "This call is no longer available.", status: 409 };
      if (action === "decline" && !["ringing", "pending"].includes(call.status)) return { error: "Only an incoming call can be declined.", status: 409 };
      if (action === "end" && call.status !== "answered") return { error: "Only an answered call can be ended.", status: 409 };
      if (action === "answer" && call.expiresAt > 0 && call.expiresAt < Date.now()) {
        call.status = "missed";
        await txn.put("calls", calls);
        return { error: "This call has expired.", status: 410 };
      }
      call.status = action === "answer" ? "answered" : action === "decline" ? "declined" : "ended";
      if (action === "answer") call.answeredBy = deviceId;
      await txn.put("calls", calls);
      return { call };
    });
    if ("error" in outcome) return json({ error: outcome.error }, outcome.status);
    await this.push({ event: "call_" + outcome.call.status, call: outcome.call, deviceId });
    return json({ updated: true, call: outcome.call });
  }
  private async sendSignal(request: Request): Promise<Response> {
    const body = await parseJson(request), callId = safeText(body.callId, 80), fromDeviceId = safeText(body.fromDeviceId, 80), toDeviceId = safeText(body.toDeviceId, 80), kind = body.kind;
    if (!idPattern.test(callId) || !validDeviceId(fromDeviceId) || !validDeviceId(toDeviceId) || !["offer","answer","ice","hangup"].includes(kind)) return json({ error: "Invalid call signal." }, 400);
    const devices = await this.state.storage.get<Device[]>("devices") || [];
    if (!devices.some(d => d.id === fromDeviceId) || !devices.some(d => d.id === toDeviceId)) return json({ error: "Both devices must be registered to this AURORA account." }, 403);
    const calls = await this.state.storage.get<ActiveCall[]>("calls") || [];
    const activeCall = calls.find(c => c.id === callId && c.status === "answered");
    if (!activeCall || !activeCall.answeredBy || (fromDeviceId !== activeCall.answeredBy && toDeviceId !== activeCall.answeredBy)) return json({ error: "Signals are allowed only for the device that answered this active call." }, 409);
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
