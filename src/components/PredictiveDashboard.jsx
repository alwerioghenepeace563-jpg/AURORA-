import { useEffect, useMemo, useState } from "react";
import { auroraRuntime } from "../core/aurora-runtime";
import { auroraNative } from "../lib/aurora-native";
import { Activity, Pause, Play, ShieldCheck, Trash2, X, Clock3, Sparkles } from "lucide-react";

const engine = auroraRuntime.predictive;
function formatTime(value) {
  try { return new Date(value).toLocaleString(); } catch { return "Recently"; }
}
export default function PredictiveDashboard({ tasks = [], reminders = [], events = [] }) {
  const [status, setStatus] = useState(() => engine.getStatus());
  const [suggestions, setSuggestions] = useState(() => engine.listSuggestions());
  const [message, setMessage] = useState("");
  const [consent, setConsent] = useState(false);
  const [sensorActive, setSensorActive] = useState(false);
  const [motionSupported, setMotionSupported] = useState(typeof window !== "undefined" && ("DeviceMotionEvent" in window));
  const [nativeMotion, setNativeMotion] = useState(false);
  const [motionListener, setMotionListener] = useState(null);
  const [latestMotion, setLatestMotion] = useState("Not connected");
  const [retentionHours, setRetentionHours] = useState("24");
  const refresh = () => { setStatus(engine.getStatus()); setSuggestions(engine.listSuggestions()); };
  useEffect(() => { refresh(); }, []);
  useEffect(() => () => { motionListener?.remove?.(); auroraNative.stopPredictiveMotion().catch(() => {}); }, [motionListener]);
  useEffect(() => {
    if (!sensorActive || nativeMotion) return undefined;
    const onMotion = (event) => {
      const a = event.accelerationIncludingGravity || event.acceleration;
      if (!a) return;
      const magnitude = Math.sqrt((Number(a.x)||0)**2 + (Number(a.y)||0)**2 + (Number(a.z)||0)**2);
      const moved = Math.abs(magnitude - 9.81) > 1.15;
      try {
        const result = engine.recordSignal("device-motion", moved ? 1 : 0);
        if (result.accepted) { setLatestMotion(moved ? "Movement detected" : "Mostly still"); refresh(); }
      } catch (error) { setMessage(error.message || "Sensor reading unavailable."); }
    };
    window.addEventListener("devicemotion", onMotion, { passive: true });
    return () => window.removeEventListener("devicemotion", onMotion);
  }, [sensorActive, nativeMotion]);
  const approvedTasks = useMemo(() => tasks.filter(item => !item.done), [tasks]);
  const nextEvent = useMemo(() => events.filter(item => item && item.date && new Date(item.date).getTime() >= Date.now()).sort((a,b)=>new Date(a.date)-new Date(b.date))[0], [events]);
  async function enable() {
    setMessage("");
    if (!consent) { setMessage("Please confirm that you understand and agree to optional motion sensing."); return; }
    try {
      const isAndroid = auroraNative.isAndroid();
      if (isAndroid) {
        const nativeStatus = await auroraNative.getPredictiveMotionStatus();
        if (!nativeStatus.available) throw new Error("This Android device does not expose an accelerometer.");
      } else {
        if (!motionSupported) throw new Error("This browser does not expose motion sensors. Routine-based suggestions remain available.");
        if (typeof DeviceMotionEvent !== "undefined" && typeof DeviceMotionEvent.requestPermission === "function") {
          const permission = await DeviceMotionEvent.requestPermission();
          if (permission !== "granted") throw new Error("Motion permission was not granted.");
        }
      }
      engine.configure({ enabled: true, consent: true, retentionHours: Number(retentionHours) || 24 });
      engine.registerSource({ id: "device-motion", signal: "motion", label: isAndroid ? "Android accelerometer (coarse)" : "Browser device motion", permissionGranted: true, consent: true, samplingIntervalMs: 10000 });
      if (isAndroid) {
        const listener = await auroraNative.addPredictiveMotionListener((event) => {
          try {
            const result = engine.recordSignal("device-motion", event.moved ? 1 : 0, event.timestamp);
            if (result.accepted) { setLatestMotion(event.moved ? "Movement detected" : "Mostly still"); refresh(); }
          } catch (error) { setMessage(error.message || "Native motion reading unavailable."); }
        });
        setMotionListener(listener);
        const started = await auroraNative.startPredictiveMotion(true, 10000);
        if (!started.started) { await listener.remove(); setMotionListener(null); throw new Error("Android could not start the accelerometer."); }
      }
      setNativeMotion(isAndroid);
      setSensorActive(true);
      setLatestMotion("Waiting for a reading");
      refresh();
      setMessage("Predictive sensing is on. Only coarse movement/stillness is retained while AURORA is active.");
    } catch (error) { setSensorActive(false); engine.unregisterSource("device-motion"); setMessage(error.message || "Could not enable motion sensing."); refresh(); }
  }
  function disable() {
    setSensorActive(false);
    auroraNative.stopPredictiveMotion().catch(() => {});
    motionListener?.remove?.(); setMotionListener(null); setNativeMotion(false);
    engine.unregisterSource("device-motion");
    engine.configure({ enabled: false, consent: false, retentionHours: Number(retentionHours) || 24 });
    refresh();
    setMessage("Predictive sensing is off and its stored samples and suggestions were cleared.");
  }
  function addRoutineSuggestion() {
    if (!engine.getStatus().enabled) engine.configure({ enabled: true, consent: true, retentionHours: Number(retentionHours) || 24 });
    const open = approvedTasks.length;
    const upcoming = nextEvent ? " Your next saved calendar event is " + String(nextEvent.title || "an upcoming event") + "." : "";
    engine.suggest({ id: "routine-focus-" + new Date().toISOString().slice(0,10), title: open ? "Choose one task to focus on" : "Plan a small next step", reason: open ? "You have " + open + " unfinished task" + (open === 1 ? "" : "s") + " saved. Picking one keeps your plan manageable." + upcoming : "Your saved task list has no unfinished items. Add one small priority when you are ready." + upcoming });
    refresh();
  }
  function pause() { setSensorActive(false); auroraNative.stopPredictiveMotion().catch(() => {}); motionListener?.remove?.(); setMotionListener(null); engine.pause(); refresh(); setMessage("Predictive intelligence is paused. No new readings will be collected."); }
  function resume() {
    try {
      engine.resume(true);
      if ((motionSupported || nativeMotion) && status.sourceCount > 0) setSensorActive(true);
      refresh(); setMessage("Predictive intelligence resumed.");
    } catch (error) { setMessage(error.message); }
  }
  return <section className="activity-tool-panel predictive-dashboard">
    <div className="activity-panel-title"><div><h2><Activity size={19}/> Predictive intelligence</h2><p>Helpful suggestions from routines and optional coarse device signals.</p></div><span className={"predictive-status " + (status.enabled && !status.paused ? "is-on" : "")}>{status.paused ? "Paused" : status.enabled ? "On" : "Off"}</span></div>
    <div className="predictive-privacy"><ShieldCheck size={18}/><div><strong>Your control comes first</strong><p>Sensing is off by default. Motion is reduced to movement/stillness; no location, microphone, camera or screen content is collected. Suggestions never perform actions.</p></div></div>
    <div className="predictive-grid"><div><small>Unfinished tasks</small><strong>{approvedTasks.length}</strong></div><div><small>Reminders</small><strong>{reminders.filter(x=>!x.done).length}</strong></div><div><small>Stored samples</small><strong>{status.sampleCount}</strong></div></div>
    <label className="predictive-field"><span>Sample retention</span><select value={retentionHours} onChange={e=>setRetentionHours(e.target.value)}><option value="1">1 hour</option><option value="6">6 hours</option><option value="24">24 hours</option><option value="72">3 days</option><option value="168">7 days</option></select></label>
    {!status.enabled ? <div className="predictive-consent"><label><input type="checkbox" checked={consent} onChange={e=>setConsent(e.target.checked)}/> I agree to optional, coarse motion sensing while this screen is active.</label><button type="button" className="primary-action" onClick={enable}><Play size={15}/> Enable predictive sensing</button></div> : <div className="predictive-controls">{status.paused ? <button type="button" className="primary-action" onClick={resume}><Play size={15}/> Resume</button> : <button type="button" className="outline-action" onClick={pause}><Pause size={15}/> Pause</button>}<button type="button" className="outline-action" onClick={disable}><X size={15}/> Turn off & clear</button></div>}
    <div className="predictive-sensor-row"><span><Activity size={16}/> Motion sensor</span><strong>{sensorActive ? latestMotion : motionSupported ? "Available, not listening" : "Not supported in this browser"}</strong></div>
    <div className="predictive-suggestion-head"><div><h3><Sparkles size={17}/> Suggestions</h3><p>Review each idea; nothing runs automatically.</p></div><button type="button" className="outline-action" onClick={addRoutineSuggestion}>Suggest from my tasks</button></div>
    {suggestions.length ? suggestions.map(item=><article className="predictive-suggestion" key={item.id}><div><strong>{item.title}</strong><p>{item.reason}</p><small>{formatTime(item.createdAt)}</small></div><div className="predictive-suggestion-actions"><button type="button" className="outline-action" onClick={()=>{engine.snooze(item.id);refresh();}}><Clock3 size={14}/> Snooze</button><button type="button" className="record-delete" onClick={()=>{engine.dismiss(item.id);refresh();}} aria-label="Dismiss suggestion"><Trash2 size={15}/></button></div></article>) : <p className="activity-muted">No suggestions yet. You can ask AURORA to create one from your saved tasks.</p>}
    <div className="predictive-footer"><span>{status.sourceCount} connected source(s) · {status.retentionHours}h retention</span><button type="button" className="outline-action" onClick={()=>{engine.clear();refresh();setMessage("Predictive history cleared.");}}>Clear history</button></div>
    {message && <p className="predictive-message" role="status">{message}</p>}
  </section>;
}
