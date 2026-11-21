import { useCallback, useEffect, useMemo, useState } from "react";
import { auroraApiUrl } from "../lib/aurora-native";
import "./calls.css";
import { BellRing, Phone, PhoneCall, PhoneOff, Radio, RefreshCw, Send, Mic, Clock3 } from "lucide-react";

const DEVICE_KEY = "aurora-internal-call-device";
function getDeviceId() {
  try {
    let id = localStorage.getItem(DEVICE_KEY);
    if (!id) { id = "aurora-" + (globalThis.crypto?.randomUUID?.() || Math.random().toString(36).slice(2) + Date.now()); localStorage.setItem(DEVICE_KEY, id); }
    return id;
  } catch { return "aurora-device-" + Date.now(); }
}
function authHeaders(token) {
  return { "Content-Type": "application/json", ...(token ? { Authorization: "Bearer " + token } : {}) };
}

export default function AuroraCallsWorkspace({ authSession, onReply, onSpeak }) {
  const token = authSession?.access_token || "";
  const deviceId = useMemo(() => getDeviceId(), []);
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [when, setWhen] = useState("");
  const [reminders, setReminders] = useState([]);
  const [calls, setCalls] = useState([]);
  const [status, setStatus] = useState("Connecting this AURORA device…");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [reply, setReply] = useState("");
  const [listening, setListening] = useState(false);

  const api = useCallback(async (path, init = {}) => {
    if (!token) throw new Error("Sign in to AURORA before setting up internal calls.");
    const response = await fetch(auroraApiUrl(path), { ...init, headers: { ...authHeaders(token), ...(init.headers || {}) } });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "AURORA calling service is unavailable.");
    return data;
  }, [token]);

  const refresh = useCallback(async () => {
    const [inbox, scheduleList] = await Promise.all([
      api("/api/calls/inbox?deviceId=" + encodeURIComponent(deviceId)),
      api("/api/calls/schedules")
    ]);
    setCalls(inbox.calls || []);
    setReminders(scheduleList.reminders || []);
    setStatus("This device is connected to AURORA Core.");
  }, [api, deviceId]);

  useEffect(() => {
    let active = true, timer;
    (async () => {
      try {
        await api("/api/calls/devices", { method: "POST", body: JSON.stringify({ deviceId, platform: /Android/i.test(navigator.userAgent) ? "android" : "web" }) });
        if (active) await refresh();
        if (active) timer = window.setInterval(() => refresh().catch(err => active && setError(err.message)), 7000);
      } catch (err) { if (active) { setStatus("Not connected"); setError(err.message); } }
    })();
    return () => { active = false; if (timer) window.clearInterval(timer); };
  }, [api, deviceId, refresh]);

  async function schedule(event) {
    event.preventDefault();
    if (!title.trim() || !when) return;
    setBusy(true); setError("");
    try {
      const scheduledAt = new Date(when).getTime();
      await api("/api/calls/schedules", { method: "POST", body: JSON.stringify({ id: "rem-" + (globalThis.crypto?.randomUUID?.() || Date.now()), title: title.trim(), message: message.trim(), scheduledAt }) });
      setTitle(""); setMessage(""); setWhen(""); await refresh();
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }
  async function cancel(id) {
    try { await api("/api/calls/schedules/" + encodeURIComponent(id), { method: "DELETE" }); await refresh(); }
    catch (err) { setError(err.message); }
  }
  async function answer(call, action) {
    try {
      await api("/api/calls/" + encodeURIComponent(call.id) + "/" + action, { method: "POST", body: JSON.stringify({ deviceId }) });
      setCalls(items => items.filter(item => item.id !== call.id));
      if (action === "answer") {
        const spoken = [call.title, call.message].filter(Boolean).join(". ");
        if (spoken) onSpeak?.("AURORA calling. " + spoken);
      }
    } catch (err) { setError(err.message); }
  }
  async function sendReply(event) {
    event.preventDefault();
    if (!reply.trim()) return;
    const text = reply.trim(); setReply("");
    await onReply?.("I answered your AURORA call. " + text);
  }
  function voiceReply() {
    const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Recognition) { setError("Voice input is not available in this browser. You can type your reply instead."); return; }
    const recognition = new Recognition(); recognition.lang = "en-NG"; recognition.interimResults = false; recognition.maxAlternatives = 1;
    recognition.onstart = () => setListening(true);
    recognition.onend = () => setListening(false);
    recognition.onerror = () => { setListening(false); setError("Voice input stopped. Try again or type your reply."); };
    recognition.onresult = event => { const text = event.results?.[0]?.[0]?.transcript || ""; if (text) onReply?.("I answered your AURORA call. " + text); };
    recognition.start();
  }

  return <section className="activity-tool-panel aurora-calls-workspace">
    <div className="activity-panel-title"><div><h2><PhoneCall size={19}/> AURORA Calls</h2><p>Private calls from AURORA Core to your signed-in AURORA devices.</p></div><span className="coming-pill"><Radio size={12}/> {status}</span></div>
    {error && <p className="activity-muted" role="alert">{error}</p>}
    {calls.length > 0 && <div className="aurora-incoming-call-list">{calls.map(call => <article className="aurora-incoming-call" key={call.id}>
      <div className="aurora-call-orb"><PhoneCall size={22}/></div><div className="aurora-call-copy"><strong>Incoming AURORA call</strong><span>{call.title}</span>{call.message && <small>{call.message}</small>}</div>
      <div className="aurora-call-actions"><button type="button" className="primary-action" onClick={() => answer(call, "answer")}><Phone size={15}/> Answer</button><button type="button" className="outline-action" onClick={() => answer(call, "decline")}><PhoneOff size={15}/> Decline</button></div>
    </article>)}</div>}
    <form className="activity-note-form" onSubmit={schedule}>
      <label className="timer-label-field"><span>What should AURORA call you about?</span><input value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Your study session starts now" maxLength={120} required/></label>
      <label className="timer-label-field"><span>Call message (optional)</span><textarea value={message} onChange={e => setMessage(e.target.value)} placeholder="What should AURORA say when you answer?" maxLength={500} rows={3}/></label>
      <label className="activity-date-field"><span>Call date and time</span><input type="datetime-local" value={when} onChange={e => setWhen(e.target.value)} min={new Date(Date.now()+10000).toISOString().slice(0,16)} required/></label>
      <button className="primary-action" type="submit" disabled={busy || !token}><BellRing size={16}/> {busy ? "Scheduling…" : "Schedule AURORA call"}</button>
    </form>
    <div className="activity-panel-title"><div><h3>Scheduled calls</h3><p>Calls stay pending if your devices are offline, then appear when an AURORA device reconnects.</p></div><button className="outline-action" type="button" onClick={() => refresh().catch(err => setError(err.message))}><RefreshCw size={14}/> Refresh</button></div>
    <div className="activity-record-list">{reminders.map(item => <div className="activity-record" key={item.id}><span className="record-main"><strong>{item.title}</strong><small><Clock3 size={12}/> {new Date(item.scheduledAt).toLocaleString()}</small>{item.message && <small>{item.message}</small>}</span><button className="record-delete" type="button" onClick={() => cancel(item.id)} aria-label="Cancel scheduled call">×</button></div>)}{!reminders.length && <p className="activity-muted">No AURORA calls scheduled yet.</p>}</div>
    {calls.some(c => c.status === "ringing") && <form className="activity-inline-form" onSubmit={sendReply}><input value={reply} onChange={e => setReply(e.target.value)} placeholder="Reply to AURORA…" aria-label="Reply to AURORA call"/><button type="button" className="outline-action" onClick={voiceReply} disabled={listening}><Mic size={15}/> {listening ? "Listening…" : "Speak"}</button><button className="primary-action" type="submit"><Send size={15}/> Send</button></form>}
    <p className="activity-muted">Background ringing needs a configured push-delivery gateway and native push receiver. While the app is open, AURORA checks for incoming calls every few seconds. This feature does not place ordinary SIM or phone-network calls.</p>
  </section>;
}
