import { useCallback, useEffect, useState } from "react";
import { auroraApiUrl } from "../lib/aurora-native";
import "./calls.css";
import { BellRing, Clock3, RefreshCw } from "lucide-react";

function authHeaders(token) {
  return { "Content-Type": "application/json", ...(token ? { Authorization: "Bearer " + token } : {}) };
}

export default function AuroraCallsWorkspace({ authSession }) {
  const token = authSession?.access_token || "";
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [when, setWhen] = useState("");
  const [reminders, setReminders] = useState([]);
  const [status, setStatus] = useState("Connecting to AURORA Core…");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const api = useCallback(async (path, init = {}) => {
    if (!token) throw new Error("Sign in to AURORA before scheduling calls.");
    const response = await fetch(auroraApiUrl(path), {
      ...init,
      headers: { ...authHeaders(token), ...(init.headers || {}) }
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "AURORA calling service is unavailable.");
    return data;
  }, [token]);

  const refresh = useCallback(async () => {
    const result = await api("/api/calls/schedules");
    setReminders(result.reminders || []);
    setStatus("Connected · incoming calls handled across AURORA");
  }, [api]);

  useEffect(() => {
    let live = true;
    refresh().catch(err => {
      if (live) { setStatus("Not connected"); setError(err.message); }
    });
    const timer = window.setInterval(() => {
      refresh().catch(err => live && setError(err.message));
    }, 30000);
    return () => { live = false; window.clearInterval(timer); };
  }, [refresh]);

  async function schedule(event) {
    event.preventDefault();
    if (!title.trim() || !when) return;
    setBusy(true); setError("");
    try {
      const scheduledAt = new Date(when).getTime();
      await api("/api/calls/schedules", {
        method: "POST",
        body: JSON.stringify({
          id: "rem-" + (globalThis.crypto?.randomUUID?.() || Date.now()),
          title: title.trim(),
          message: message.trim(),
          scheduledAt
        })
      });
      setTitle(""); setMessage(""); setWhen("");
      await refresh();
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }

  async function cancel(id) {
    setError("");
    try {
      await api("/api/calls/schedules/" + encodeURIComponent(id), { method: "DELETE" });
      await refresh();
    } catch (err) { setError(err.message); }
  }

  return <section className="activity-tool-panel aurora-calls-workspace">
    <div className="activity-panel-title">
      <div><h2><BellRing size={19}/> AURORA Calls</h2><p>Schedule private voice reminders from AURORA Core to your signed-in devices.</p></div>
      <span className="coming-pill">{status}</span>
    </div>
    {error && <p className="activity-muted" role="alert">{error}</p>}
    <p className="activity-muted">Incoming calls are managed by AURORA’s app-wide call monitor, so the same call cannot appear in two competing inboxes when you open Activities.</p>
    <form className="activity-note-form" onSubmit={schedule}>
      <label className="timer-label-field"><span>What should AURORA call you about?</span><input value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Your study session starts now" maxLength={120} required/></label>
      <label className="timer-label-field"><span>Call message (optional)</span><textarea value={message} onChange={e => setMessage(e.target.value)} placeholder="What should AURORA say when you answer?" maxLength={500} rows={3}/></label>
      <label className="activity-date-field"><span>Call date and time</span><input type="datetime-local" value={when} onChange={e => setWhen(e.target.value)} min={new Date(Date.now()+10000).toISOString().slice(0,16)} required/></label>
      <button className="primary-action" type="submit" disabled={busy || !token}><BellRing size={16}/> {busy ? "Scheduling…" : "Schedule AURORA call"}</button>
    </form>
    <div className="activity-panel-title">
      <div><h3>Scheduled calls</h3><p>Calls stay pending if your devices are offline, then appear when an AURORA device reconnects.</p></div>
      <button className="outline-action" type="button" onClick={() => refresh().catch(err => setError(err.message))}><RefreshCw size={14}/> Refresh</button>
    </div>
    <div className="activity-record-list">
      {reminders.map(item => <div className="activity-record" key={item.id}>
        <span className="record-main"><strong>{item.title}</strong><small><Clock3 size={12}/> {new Date(item.scheduledAt).toLocaleString()}</small>{item.message && <small>{item.message}</small>}</span>
        <button className="record-delete" type="button" onClick={() => cancel(item.id)} aria-label="Cancel scheduled call">×</button>
      </div>)}
      {!reminders.length && <p className="activity-muted">No AURORA calls scheduled yet.</p>}
    </div>
    <p className="activity-muted">Android background notifications require Firebase app configuration and Cloudflare FCM credentials. While AURORA is open, the app-wide monitor checks the private call inbox. This feature does not place ordinary SIM or phone-network calls.</p>
  </section>;
}
