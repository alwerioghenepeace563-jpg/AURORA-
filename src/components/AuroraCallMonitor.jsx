import { useCallback, useEffect, useMemo, useState } from "react";
import { auroraApiUrl } from "../lib/aurora-native";
import { PhoneCall, Phone, PhoneOff, Mic, Send } from "lucide-react";
import "./calls.css";

const DEVICE_KEY = "aurora-internal-call-device";
function deviceIdForMonitor() {
  try {
    let id = localStorage.getItem(DEVICE_KEY);
    if (!id) { id = "aurora-" + (globalThis.crypto?.randomUUID?.() || Math.random().toString(36).slice(2) + Date.now()); localStorage.setItem(DEVICE_KEY, id); }
    return id;
  } catch { return "aurora-device-" + Date.now(); }
}
export default function AuroraCallMonitor({ authSession, onReply, onSpeak }) {
  const token = authSession?.access_token || "";
  const deviceId = useMemo(() => deviceIdForMonitor(), []);
  const [incoming, setIncoming] = useState(null);
  const [active, setActive] = useState(null);
  const [reply, setReply] = useState("");
  const [error, setError] = useState("");
  const [listening, setListening] = useState(false);
  const api = useCallback(async (path, init = {}) => {
    if (!token) throw new Error("Sign in required.");
    const response = await fetch(auroraApiUrl(path), { ...init, headers: { "Content-Type": "application/json", Authorization: "Bearer " + token, ...(init.headers || {}) } });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "AURORA call request failed.");
    return data;
  }, [token]);
  const poll = useCallback(async () => {
    const result = await api("/api/calls/inbox?deviceId=" + encodeURIComponent(deviceId));
    const next = (result.calls || []).find(call => call.status === "ringing" || call.status === "pending");
    if (next && !active && !incoming) setIncoming(next);
    if (!next && incoming) setIncoming(null);
  }, [api, deviceId, active, incoming]);
  useEffect(() => {
    if (!token) return;
    let live = true, timer;
    (async () => {
      try {
        await api("/api/calls/devices", { method: "POST", body: JSON.stringify({ deviceId, platform: /Android/i.test(navigator.userAgent) ? "android" : "web" }) });
        if (live) await poll();
        if (live) timer = window.setInterval(() => poll().catch(err => live && setError(err.message)), 7000);
      } catch (err) { if (live) setError(err.message); }
    })();
    return () => { live = false; if (timer) window.clearInterval(timer); };
  }, [api, deviceId, poll, token]);
  async function decide(action) {
    if (!incoming) return;
    const call = incoming;
    try {
      await api("/api/calls/" + encodeURIComponent(call.id) + "/" + action, { method: "POST", body: JSON.stringify({ deviceId }) });
      setIncoming(null);
      if (action === "answer") { setActive(call); onSpeak?.("AURORA calling. " + [call.title, call.message].filter(Boolean).join(". ")); }
    } catch (err) { setError(err.message); setIncoming(null); }
  }
  async function endCall() {
    if (!active) return;
    try { await api("/api/calls/" + encodeURIComponent(active.id) + "/end", { method: "POST", body: JSON.stringify({ deviceId }) }); setActive(null); }
    catch (err) { setError(err.message); }
  }
  async function sendReply(event) {
    event.preventDefault();
    if (!reply.trim()) return;
    const text = reply.trim(); setReply("");
    await onReply?.("I answered your AURORA call. " + text);
  }
  function voiceReply() {
    const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Recognition) { setError("Voice input is unavailable here. Type your reply instead."); return; }
    const recognition = new Recognition(); recognition.lang = "en-NG"; recognition.interimResults = false;
    recognition.onstart = () => setListening(true);
    recognition.onend = () => setListening(false);
    recognition.onerror = () => { setListening(false); setError("Voice input stopped. You can type your reply."); };
    recognition.onresult = event => { const text = event.results?.[0]?.[0]?.transcript || ""; if (text) onReply?.("I answered your AURORA call. " + text); };
    recognition.start();
  }
  if (!incoming && !active && !error) return null;
  return <div className="aurora-call-global-layer" role="presentation">
    <section className="aurora-call-global-card" role="dialog" aria-modal="true" aria-label={active ? "AURORA call in progress" : "Incoming AURORA call"}>
      <div className="aurora-call-global-orb"><PhoneCall size={27}/></div>
      <span className="panel-eyebrow">{active ? "AURORA VOICE SESSION" : "INCOMING FROM AURORA CORE"}</span>
      <h2>{active ? "You're connected" : incoming?.title || "AURORA is calling"}</h2>
      <p>{active ? (active.message || "You can speak or type to continue the conversation.") : (incoming?.message || "AURORA has a scheduled reminder for you.")}</p>
      {error && <small role="alert">{error}</small>}
      {incoming && <div className="aurora-call-global-actions"><button type="button" className="primary-action" onClick={() => decide("answer")}><Phone size={16}/> Answer</button><button type="button" className="outline-action" onClick={() => decide("decline")}><PhoneOff size={16}/> Decline</button></div>}
      {active && <><form className="activity-inline-form" onSubmit={sendReply}><input value={reply} onChange={e => setReply(e.target.value)} placeholder="Say something to AURORA…" aria-label="Reply to AURORA"/><button type="button" className="outline-action" onClick={voiceReply} disabled={listening}><Mic size={15}/>{listening ? "Listening" : "Speak"}</button><button className="primary-action" type="submit"><Send size={15}/> Send</button></form><button type="button" className="outline-action" onClick={endCall}><PhoneOff size={15}/> End call</button></>}
      {!incoming && !active && error && <button type="button" className="outline-action" onClick={() => setError("")}>Dismiss</button>}
    </section>
  </div>;
}
