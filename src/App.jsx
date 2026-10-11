import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import {
  Activity, ArrowDown, ArrowLeft, ArrowUp, AudioLines, CalendarDays,
  Camera, Check, ChevronRight, CircleHelp, Clock3, Command, FileText, House,
  Image as ImageIcon, Mic, MoreHorizontal, Paperclip, Pause, Plus, Send, Settings2, ShieldCheck,
  SlidersHorizontal, Sparkles, SquarePen, UserRound, Volume2, VolumeX, WandSparkles, X
} from "lucide-react";

function Orb({ compact = false, speaking = false }) {
  return (
    <motion.div
      className={`orb-wrap ${compact ? "orb-wrap-compact" : ""} ${speaking ? "orb-speaking" : ""}`}
      animate={{ y: [0, -7, 0] }}
      transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }}
      aria-label="AURORA animated energy orb"
    >
      <div className="orb-halo" />
      <div className="orb-ring orb-ring-one" />
      <div className="orb-ring orb-ring-two" />
      <div className="orb-orbit orb-orbit-a"><span /></div>
      <div className="orb-orbit orb-orbit-b"><span /></div>
      <div className="orb-axis orb-axis-vertical" />
      <div className="orb-axis orb-axis-horizontal" />
      <div className="orb-node orb-node-top" />
      <div className="orb-node orb-node-right" />
      <div className="orb-node orb-node-bottom" />
      <div className="orb-node orb-node-left" />
      <div className="orb-core">
        <div className="orb-shine" />
        <div className="orb-current orb-current-one" />
        <div className="orb-current orb-current-two" />
        <div className="orb-current orb-current-three" />
        <div className="orb-heart" />
      </div>
      <div className="orb-dust orb-dust-one" />
      <div className="orb-dust orb-dust-two" />
    </motion.div>
  );
}

function BottomNav({ active, onNavigate }) {
  const items = [
    { id: "home", label: "Home", Icon: House },
    { id: "activities", label: "Activities", Icon: CalendarDays },
    { id: "chat", label: "AURORA", Icon: AudioLines },
    { id: "profile", label: "Profile", Icon: UserRound }
  ];
  return (
    <nav className="bottom-nav" aria-label="Main navigation">
      {items.map(({ id, label, Icon }) => (
        <button key={id} className={`nav-item ${active === id ? "active" : ""} ${id === "chat" ? "nav-aurora" : ""}`} onClick={() => onNavigate(id)}>
          <span className="nav-icon"><Icon size={19} strokeWidth={1.8} /></span>
          <span>{label}</span>
        </button>
      ))}
    </nav>
  );
}

export default function App() {
  const [page, setPage] = useState("home");
  const [draft, setDraft] = useState("");
  const [messages, setMessages] = useState(() => { try { const saved = JSON.parse(localStorage.getItem("aurora-chat-history") || "[]"); return Array.isArray(saved) ? saved.filter((m) => m && ["user", "assistant"].includes(m.role) && typeof m.content === "string").slice(-40) : []; } catch { return []; } });
  const [busy, setBusy] = useState(false);
  const [listening, setListening] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [soundOn, setSoundOn] = useState(true);
  const [selectedVoice, setSelectedVoice] = useState(() => { try { return localStorage.getItem("aurora-selected-voice") || "jessica"; } catch { return "jessica"; } });
  const [profile, setProfile] = useState(() => { try { return { name: "", nickname: "", wakeTime: "", sleepTime: "", priorities: "", foodPreferences: "", dietaryRestrictions: "", assistantStyle: "warm", ...JSON.parse(localStorage.getItem("aurora-profile") || "{}") }; } catch { return { name: "", nickname: "", wakeTime: "", sleepTime: "", priorities: "", foodPreferences: "", dietaryRestrictions: "", assistantStyle: "warm" }; } });
  const [profileSaved, setProfileSaved] = useState(false);
  const [attachmentOpen, setAttachmentOpen] = useState(false);
  const [tunerOpen, setTunerOpen] = useState(false);
  const [showSettings, setShowSettings] = useState(true);
  const [notice, setNotice] = useState("");
  const [activityTab, setActivityTab] = useState("tasks");
  const [tasks, setTasks] = useState(() => { try { return JSON.parse(localStorage.getItem("aurora-tasks") || "[]"); } catch { return []; } });
  const [notes, setNotes] = useState(() => { try { return JSON.parse(localStorage.getItem("aurora-notes") || "[]"); } catch { return []; } });
  const [reminders, setReminders] = useState(() => { try { return JSON.parse(localStorage.getItem("aurora-reminders") || "[]"); } catch { return []; } });
  const [events, setEvents] = useState(() => { try { return JSON.parse(localStorage.getItem("aurora-calendar-events") || "[]"); } catch { return []; } });
  const [taskDraft, setTaskDraft] = useState("");
  const [noteTitle, setNoteTitle] = useState("");
  const [noteBody, setNoteBody] = useState("");
  const [reminderTitle, setReminderTitle] = useState("");
  const [reminderAt, setReminderAt] = useState("");
  const [eventTitle, setEventTitle] = useState("");
  const [eventAt, setEventAt] = useState("");
  const [timerMinutes, setTimerMinutes] = useState("10");
  const [timerSecondsLeft, setTimerSecondsLeft] = useState(0);
  const [timerRunning, setTimerRunning] = useState(false);
  const [timerLabel, setTimerLabel] = useState("Focus timer");
  const chatEndRef = useRef(null);
  const recognitionRef = useRef(null);
  const audioRef = useRef(null);
  const fileRef = useRef(null);
  const cameraRef = useRef(null);
  const galleryRef = useRef(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, busy]);

  useEffect(() => {
    try { localStorage.setItem("aurora-selected-voice", selectedVoice); } catch {}
  }, [selectedVoice]);

  useEffect(() => {
    try { localStorage.setItem("aurora-profile", JSON.stringify(profile)); } catch {}
  }, [profile]);

  useEffect(() => {
    try { localStorage.setItem("aurora-chat-history", JSON.stringify(messages.slice(-40))); } catch {}
  }, [messages]);
  useEffect(() => { try { localStorage.setItem("aurora-tasks", JSON.stringify(tasks)); } catch {} }, [tasks]);
  useEffect(() => { try { localStorage.setItem("aurora-notes", JSON.stringify(notes)); } catch {} }, [notes]);
  useEffect(() => { try { localStorage.setItem("aurora-reminders", JSON.stringify(reminders)); } catch {} }, [reminders]);
  useEffect(() => { try { localStorage.setItem("aurora-calendar-events", JSON.stringify(events)); } catch {} }, [events]);
  useEffect(() => {
    if (!timerRunning) return;
    const id = window.setInterval(() => setTimerSecondsLeft((seconds) => {
      if (seconds <= 1) { window.clearInterval(id); setTimerRunning(false); setNotice(timerLabel + " finished."); return 0; }
      return seconds - 1;
    }), 1000);
    return () => window.clearInterval(id);
  }, [timerRunning, timerLabel]);
  useEffect(() => {
    const id = window.setInterval(() => {
      setReminders((current) => current.map((item) => {
        if (!item.done && !item.notified && new Date(item.at).getTime() <= Date.now()) {
          setNotice("Reminder: " + item.title);
          if ("Notification" in window && Notification.permission === "granted") new Notification("AURORA reminder", { body: item.title });
          return { ...item, notified: true };
        }
        return item;
      }));
    }, 15000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => () => {
    recognitionRef.current?.stop();
    audioRef.current?.pause();
  }, []);

  function navigate(next) {
    setPage(next);
    setNotice("");
  }

  async function speak(text) {
    if (!soundOn || !text) return;
    try {
      setSpeaking(true);
      const response = await fetch("/api/voice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: text.slice(0, 2400), voice: selectedVoice })
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || "Voice is not configured yet.");
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      audioRef.current = audio;
      audio.onended = () => { URL.revokeObjectURL(url); setSpeaking(false); };
      audio.onerror = () => { URL.revokeObjectURL(url); setSpeaking(false); };
      await audio.play();
    } catch (error) {
      setSpeaking(false);
      setNotice(error.message || "Voice could not play. Check the voice settings.");
    }
  }

  async function sendMessage(textOverride) {
    const text = (textOverride ?? draft).trim();
    if (!text || busy) return;
    const nextMessages = [...messages, { role: "user", content: text }];
    setMessages(nextMessages);
    setDraft("");
    setPage("chat");
    setBusy(true);
    setNotice("");
    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: nextMessages.slice(-20), profile })
      });
      const rawResponse = await response.text();
      let data = {};
      try { data = rawResponse ? JSON.parse(rawResponse) : {}; } catch { data = {}; }
      if (!response.ok) {
        const detail = typeof data.error === "string" ? data.error : rawResponse.slice(0, 180);
        throw new Error(detail ? `Chat API HTTP ${response.status}: ${detail}` : `Chat API HTTP ${response.status}. Check the Vercel deployment logs.`);
      }
      const reply = String(data.reply || "").trim();
      if (!reply) throw new Error("AURORA returned an empty response.");
      setMessages((current) => [...current, { role: "assistant", content: reply }]);
      if (soundOn) speak(reply);
    } catch (error) {
      setNotice(error.message || "Couldn't reach AURORA's AI service. Check the Vercel environment variables.");
    } finally {
      setBusy(false);
    }
  }

  function toggleMic() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setNotice("Voice input isn't supported in this browser. Try Chrome on a secure connection.");
      return;
    }
    if (listening) {
      recognitionRef.current?.stop();
      setListening(false);
      return;
    }
    const recognition = new SpeechRecognition();
    recognition.lang = "en-GB";
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    recognition.onresult = (event) => {
      const spokenText = event.results?.[0]?.[0]?.transcript || "";
      setDraft(spokenText);
      setListening(false);
      if (spokenText.trim()) sendMessage(spokenText);
    };
    recognition.onerror = () => {
      setListening(false);
      setNotice("Microphone didn't start. Please allow microphone access and try again.");
    };
    recognition.onend = () => setListening(false);
    recognitionRef.current = recognition;
    try { recognition.start(); setListening(true); setNotice(""); }
    catch { setListening(false); setNotice("Microphone is already active. Try again in a moment."); }
  }

  async function onFileSelected(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    setAttachmentOpen(false);
    if (!file) return;
    if (file.type.startsWith("image/")) {
      setNotice("Image selected: " + file.name + ". Image understanding is not connected yet, so choose a text file for analysis for now.");
      return;
    }
    const allowedTypes = ["text/plain", "text/markdown", "text/csv", "application/json"];
    const allowedExtensions = /\\.(txt|md|csv|json)$/i;
    if (!allowedTypes.includes(file.type) && !allowedExtensions.test(file.name)) {
      setNotice("AURORA can currently read .txt, .md, .csv and .json files. Other file analysis is coming next.");
      return;
    }
    if (file.size > 60000) {
      setNotice("That file is too large for the current reader. Please choose a text file under 60 KB.");
      return;
    }
    try {
      const contents = await file.text();
      if (!contents.trim()) {
        setNotice("That file appears to be empty.");
        return;
      }
      setDraft((current) => (current.trim() ? current + "\\n\\n" : "") + "Please help me analyse this attached file: " + file.name + "\\n\\n--- FILE CONTENT ---\\n" + contents.slice(0, 12000));
      setNotice("Attached “" + file.name + "”. Review the message and tap send when you're ready.");
    } catch {
      setNotice("I couldn't read that file. Please try a text, Markdown, CSV or JSON file.");
    }
  }

  function openAttachment(kind) {
    setAttachmentOpen(false);
    if (kind === "camera") cameraRef.current?.click();
    if (kind === "gallery") galleryRef.current?.click();
    if (kind === "files") fileRef.current?.click();
    if (kind === "tuner") setTunerOpen(true);
  }

  const personalityOptions = [
    { id: "warm", title: "Friendly", description: "Warm, supportive and encouraging", Icon: Sparkles },
    { id: "strict", title: "Strict", description: "Firm, focused and accountable", Icon: ShieldCheck },
    { id: "calm", title: "Calm", description: "Steady, patient and organised", Icon: Volume2 },
    { id: "teacher", title: "Teacher", description: "Detailed, step-by-step explanations", Icon: FileText },
    { id: "concise", title: "Short & direct", description: "Quick answers without extra talk", Icon: SlidersHorizontal }
  ];

  return (
    <div className="app-shell">
      <div className="ambient ambient-left" />
      <div className="ambient ambient-right" />
      <header className="topbar">
        <button className="brand-lockup" onClick={() => navigate("home")} aria-label="AURORA home">
          <span className="brand-mark"><span /></span>
          <span className="brand-name">AURORA<span className="brand-dot">.</span><small>PERSONAL INTELLIGENCE</small></span>
        </button>
        <div className="topbar-right">
          <div className="connection-pill"><span className="live-dot" /> YOUR AI COMPANION</div>
          <button className="icon-button top-settings" onClick={() => setShowSettings((v) => !v)} aria-label="Toggle settings"><Settings2 size={19} /></button>
        </div>
      </header>

      <main className={`main-layout page-${page}`}>
        <AnimatePresence mode="wait">
          {page === "home" && (
            <motion.section key="home" className="home-screen" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.25 }}>
              <div className="home-eyebrow"><span className="eyebrow-line" /> YOUR SPACE. YOUR INTELLIGENCE. <span className="eyebrow-line" /></div>
              <div className="hero-orb"><Orb speaking={speaking} /></div>
              <div className="home-copy">
                <p className="welcome-kicker">GOOD TO HAVE YOU HERE</p>
                <h1>Hello<span>,</span> there.</h1>
                <p className="hero-subtitle">What can I help you bring to life today?</p>
                <div className="availability"><span className="live-dot" /> AURORA IS READY WHEN YOU ARE</div>
              </div>
              <form className="home-composer glass-panel" onSubmit={(e) => { e.preventDefault(); sendMessage(); }}>
                <button type="button" className="composer-tool" aria-label="Attach a file" onClick={() => setAttachmentOpen((v) => !v)} aria-expanded={attachmentOpen}><Plus size={20} /></button>
                <input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Ask AURORA anything..." aria-label="Ask AURORA anything" />
                <button type="button" className={`composer-tool mic-tool ${listening ? "is-listening" : ""}`} aria-label="Use microphone" onClick={toggleMic}><Mic size={19} /></button>
                <button className="send-button" type="submit" disabled={!draft.trim() || busy} aria-label="Send message">{busy ? <span className="mini-loader" /> : <ArrowUp size={20} />}</button>
              </form>
              <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="visually-hidden" onChange={onFileSelected} /><input ref={galleryRef} type="file" accept="image/*" multiple className="visually-hidden" onChange={onFileSelected} /><input ref={fileRef} type="file" accept=".txt,.md,.csv,.json,text/plain,text/markdown,text/csv,application/json" className="visually-hidden" onChange={onFileSelected} />
              {notice && <div className="notice" role="status">{notice}<button onClick={() => setNotice("")} aria-label="Dismiss message"><X size={14} /></button></div>}
              <div className="suggestion-row">
                <button onClick={() => sendMessage("Help me plan my day.")}><CalendarDays size={15} /> Plan my day</button>
                <button onClick={() => sendMessage("Help me think through an idea.")}><Sparkles size={15} /> Explore an idea</button>
                <button onClick={() => sendMessage("Help me organise my tasks.")}><Check size={15} /> Organise tasks</button>
              </div>
              <div className="home-footer-note"><ShieldCheck size={13} /> PRIVATE BY DESIGN <span /> BUILT AROUND YOU</div>
            </motion.section>
          )}

          {page === "chat" && (
            <motion.section key="chat" className="chat-screen" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.22 }}>
              <div className="chat-column">
                <div className="chat-heading">
                  <button className="back-button" onClick={() => navigate("home")}><ArrowLeft size={17} /> Home</button>
                  <div className="chat-title-wrap"><span className="mini-orb"><Orb compact speaking={speaking} /></span><div><h1>AURORA <span>CHAT</span></h1><p><span className="live-dot" /> Your assistant is here</p></div></div>
                  <button className="icon-button" onClick={() => setMessages([])} aria-label="New conversation"><SquarePen size={18} /></button>
                </div>
                <div className="messages-area">
                  {messages.length === 0 && <div className="empty-chat"><Orb compact /><h2>Let's make something happen.</h2><p>Ask a question, work through an idea, or plan your next move.</p></div>}
                  {messages.map((message, index) => (
                    <div key={index} className={`message-row ${message.role === "user" ? "message-user" : "message-assistant"}`}>
                      {message.role === "assistant" && <span className="message-avatar"><Sparkles size={15} /></span>}
                      <div className="message-bubble"><div className="message-label">{message.role === "user" ? "YOU" : "AURORA"}</div><p>{message.content}</p>{message.role === "assistant" && <button className="speak-message" onClick={() => speak(message.content)}><Volume2 size={14} /> Read aloud</button>}</div>
                    </div>
                  ))}
                  {busy && <div className="message-row message-assistant"><span className="message-avatar"><Sparkles size={15} /></span><div className="message-bubble"><div className="message-label">AURORA</div><div className="typing-indicator"><i /><i /><i /></div></div></div>}
                  <div ref={chatEndRef} />
                </div>
                {notice && <div className="notice chat-notice" role="status">{notice}<button onClick={() => setNotice("")} aria-label="Dismiss message"><X size={14} /></button></div>}
                <form className="chat-composer glass-panel" onSubmit={(e) => { e.preventDefault(); sendMessage(); }}>
                  <button type="button" className="composer-tool" aria-label="Attach a file" onClick={() => setAttachmentOpen((v) => !v)} aria-expanded={attachmentOpen}><Paperclip size={18} /></button>
                  <input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Message AURORA..." aria-label="Message AURORA" />
                  <button type="button" className={`composer-tool mic-tool ${listening ? "is-listening" : ""}`} onClick={toggleMic} aria-label="Use microphone"><Mic size={18} /></button>
                  <button className="send-button" type="submit" disabled={!draft.trim() || busy} aria-label="Send message">{busy ? <span className="mini-loader" /> : <ArrowUp size={20} />}</button>
                </form>
                <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="visually-hidden" onChange={onFileSelected} /><input ref={galleryRef} type="file" accept="image/*" multiple className="visually-hidden" onChange={onFileSelected} /><input ref={fileRef} type="file" accept=".txt,.md,.csv,.json,text/plain,text/markdown,text/csv,application/json" className="visually-hidden" onChange={onFileSelected} />
                <p className="composer-footnote">AURORA can make mistakes. Check important information.</p>
              </div>
              {showSettings && <aside className="settings-panel">
                <div className="settings-header"><div><p className="panel-eyebrow">PERSONALISE</p><h2>Assistant settings</h2></div><button className="icon-button settings-close" onClick={() => setShowSettings(false)} aria-label="Close settings"><X size={16} /></button></div>
                <div className="orb-status-card"><div className="status-orb"><Orb compact speaking={speaking} /></div><div><strong>{speaking ? "Speaking now" : "AURORA is online"}</strong><span>{listening ? "Listening to you" : "Ready to assist"}</span></div><span className="live-dot" /></div>
                <div className="setting-group"><p className="setting-label">VOICE EXPERIENCE</p><button className="setting-row" onClick={() => setSoundOn((v) => !v)}><span className="setting-icon"><Volume2 size={17} /></span><span className="setting-text"><strong>Voice responses</strong><small>Spoken answers from AURORA</small></span><span className={`toggle ${soundOn ? "toggle-on" : ""}`}><i /></span></button><div style={{ margin: "10px 0 12px", padding: "12px", border: "1px solid rgba(107, 192, 255, 0.18)", borderRadius: "14px", background: "rgba(20, 48, 75, 0.28)" }}><label htmlFor="aurora-voice-choice" className="setting-label" style={{ display: "block", marginBottom: "8px" }}>AURORA VOICE</label><select id="aurora-voice-choice" value={selectedVoice} onChange={(event) => setSelectedVoice(event.target.value)} style={{ width: "100%", padding: "11px 12px", color: "#eaf7ff", background: "#101e30", border: "1px solid rgba(107, 192, 255, 0.3)", borderRadius: "10px", font: "inherit" }}><option value="jessica">Jessica</option><option value="bella">Bella</option><option value="laura">Laura</option><option value="lucian">Lucian Rock</option></select><small style={{ display: "block", marginTop: "7px", color: "#9fb7ca", lineHeight: 1.5 }}>Choose which voice AURORA uses for spoken answers. Your choice is saved on this device.</small></div><button className="setting-row" onClick={toggleMic}><span className="setting-icon"><Mic size={17} /></span><span className="setting-text"><strong>Voice input</strong><small>{listening ? "Tap to stop listening" : "Speak instead of typing"}</small></span><ChevronRight size={16} className="setting-chevron" /></button></div>
                <div className="setting-group"><p className="setting-label">QUICK ACCESS</p><button className="setting-row" onClick={() => navigate("activities")}><span className="setting-icon"><CalendarDays size={17} /></span><span className="setting-text"><strong>Daily activities</strong><small>Tasks, notes and plans</small></span><ChevronRight size={16} className="setting-chevron" /></button><button className="setting-row" onClick={() => navigate("profile")}><span className="setting-icon"><UserRound size={17} /></span><span className="setting-text"><strong>Your profile</strong><small>Personalise your experience</small></span><ChevronRight size={16} className="setting-chevron" /></button></div>
                <div className="privacy-note"><ShieldCheck size={17} /><div><strong>Your privacy matters</strong><p>Your API keys stay on the server, never in the browser.</p></div></div>
                <div className="panel-bottom"><span>AURORA INTERFACE</span><span>V 0.2</span></div>
              </aside>}
            </motion.section>
          )}

          {page === "activities" && (
            <motion.section key="activities" className="utility-page" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}>
              <p className="panel-eyebrow">YOUR DAY, IN FOCUS</p><h1>Activities<span>.</span></h1><p className="utility-intro">A calm space to turn good intentions into your next steps.</p>
              <div className="activity-grid">
                <button className="activity-card" onClick={() => sendMessage("Help me make a practical plan for today.")}><span className="activity-icon"><CalendarDays /></span><strong>Plan my day</strong><small>Build a simple daily schedule</small><ChevronRight /></button>
                <button className="activity-card" onClick={() => sendMessage("Help me create a task list for today.")}><span className="activity-icon"><Check /></span><strong>My tasks</strong><small>Break goals into clear actions</small><ChevronRight /></button>
                <button className="activity-card" onClick={() => sendMessage("Help me organise and summarise my notes.")}><span className="activity-icon"><FileText /></span><strong>Notes & ideas</strong><small>Capture and shape your thoughts</small><ChevronRight /></button>
                <button className="activity-card" onClick={() => sendMessage("Help me choose the most important thing to focus on next.")}><span className="activity-icon"><WandSparkles /></span><strong>Focus session</strong><small>Choose your next best step</small><ChevronRight /></button>
              </div>
              <div className="utility-orb"><Orb compact /><div><strong>Need a hand?</strong><p>Ask AURORA to help you get started.</p><button className="outline-action" onClick={() => navigate("chat")}>Open assistant <ArrowUp size={15} /></button></div></div>
            </motion.section>
          )}

          {page === "profile" && (
            <motion.section key="profile" className="utility-page profile-page" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}>
              <p className="panel-eyebrow">MADE TO WORK WITH YOU</p><h1>Your space<span>.</span></h1><p className="utility-intro">Your AURORA experience will grow around your preferences.</p>
              <div className="profile-card"><div className="profile-avatar"><UserRound size={30} /></div><div><h2>{profile.nickname || profile.name || "Your profile"}</h2><p>Personal details and preferences</p></div><span className="coming-pill">ON THIS DEVICE</span></div>
              <form className="profile-form" onSubmit={(event) => { event.preventDefault(); setProfileSaved(true); setTimeout(() => setProfileSaved(false), 2400); }}>
                <div className="profile-form-heading"><div><h2>Personalise AURORA</h2><p>These details stay saved on this device and help tailor replies when you chat.</p></div></div>
                <div className="profile-field-grid">
                  <label className="profile-field"><span>Name</span><input value={profile.name} onChange={(e) => setProfile((p) => ({ ...p, name: e.target.value }))} placeholder="Your name" autoComplete="given-name" /></label>
                  <label className="profile-field"><span>Preferred name</span><input value={profile.nickname} onChange={(e) => setProfile((p) => ({ ...p, nickname: e.target.value }))} placeholder="What should AURORA call you?" /></label>
                  <label className="profile-field"><span>Usual wake-up time</span><input type="time" value={profile.wakeTime} onChange={(e) => setProfile((p) => ({ ...p, wakeTime: e.target.value }))} /></label>
                  <label className="profile-field"><span>Usual sleep time</span><input type="time" value={profile.sleepTime} onChange={(e) => setProfile((p) => ({ ...p, sleepTime: e.target.value }))} /></label>
                  <label className="profile-field profile-field-wide"><span>Daily priorities</span><textarea value={profile.priorities} onChange={(e) => setProfile((p) => ({ ...p, priorities: e.target.value }))} placeholder="School, projects, reminders, goals..." rows={2} /></label>
                  <label className="profile-field profile-field-wide"><span>Food preferences (optional)</span><input value={profile.foodPreferences} onChange={(e) => setProfile((p) => ({ ...p, foodPreferences: e.target.value }))} placeholder="Foods you enjoy or prefer to avoid" /></label>
                  <label className="profile-field profile-field-wide"><span>Dietary restrictions (optional)</span><input value={profile.dietaryRestrictions} onChange={(e) => setProfile((p) => ({ ...p, dietaryRestrictions: e.target.value }))} placeholder="Allergies or dietary needs, if any" /></label>
                  <label className="profile-field profile-field-wide"><span>How should AURORA communicate?</span><select value={profile.assistantStyle} onChange={(e) => setProfile((p) => ({ ...p, assistantStyle: e.target.value }))}><option value="warm">Friendly — warm and encouraging</option><option value="strict">Strict — firm and focused</option><option value="concise">Short and direct</option><option value="teacher">Teacher — detailed step-by-step</option><option value="calm">Calm and structured</option></select></label>
                </div>
                <div className="profile-form-actions"><span role="status">{profileSaved ? "Preferences saved ✓" : "Changes save automatically on this device."}</span><button className="primary-action" type="submit">Save preferences <Check size={16} /></button></div>
              </form>
              <button className="primary-action profile-chat-action" onClick={() => navigate("chat")}>Talk to AURORA <ArrowUp size={16} /></button>
            </motion.section>
          )}
        </AnimatePresence>
      </main>

      {typeof document !== "undefined" && createPortal(
      <AnimatePresence>
        {attachmentOpen && (
          <motion.div className="aurora-menu-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setAttachmentOpen(false)}>
            <motion.div className="aurora-attachment-menu" role="dialog" aria-label="AURORA attachments" initial={{ opacity: 0, y: 12, scale: .97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 8, scale: .98 }} onClick={(event) => event.stopPropagation()}>
              <div className="aurora-menu-heading"><span className="aurora-menu-mark"><Plus size={17} /></span><div><strong>AURORA tools</strong><small>Choose what you want to add</small></div><button type="button" onClick={() => setAttachmentOpen(false)} aria-label="Close attachment menu"><X size={17} /></button></div>
              <button type="button" className="aurora-tool-option" onClick={() => openAttachment("camera")}><span className="aurora-tool-icon"><Camera size={21} /></span><span><strong>Camera</strong><small>Take a new photo</small></span><ChevronRight size={16} /></button>
              <button type="button" className="aurora-tool-option" onClick={() => openAttachment("gallery")}><span className="aurora-tool-icon"><ImageIcon size={21} /></span><span><strong>Gallery</strong><small>Choose photos from your device</small></span><ChevronRight size={16} /></button>
              <button type="button" className="aurora-tool-option" onClick={() => openAttachment("files")}><span className="aurora-tool-icon"><Paperclip size={21} /></span><span><strong>Files</strong><small>Add a supported document</small></span><ChevronRight size={16} /></button>
              <button type="button" className="aurora-tool-option aurora-tuner-option" onClick={() => openAttachment("tuner")}><span className="aurora-tool-icon"><SlidersHorizontal size={21} /></span><span><strong>AI Tuner</strong><small>Choose AURORA’s personality</small></span><ChevronRight size={16} /></button>
              <p className="aurora-menu-footnote">Your tools, inside AURORA.</p>
            </motion.div>
          </motion.div>
        )}
        {tunerOpen && (
          <motion.div className="aurora-menu-backdrop tuner-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setTunerOpen(false)}>
            <motion.div className="aurora-tuner-panel" role="dialog" aria-modal="true" aria-label="AURORA AI Tuner" initial={{ opacity: 0, y: 16, scale: .97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 8 }} onClick={(event) => event.stopPropagation()}>
              <div className="aurora-menu-heading"><span className="aurora-menu-mark"><SlidersHorizontal size={18} /></span><div><strong>AI Tuner</strong><small>Set AURORA’s response style</small></div><button type="button" onClick={() => setTunerOpen(false)} aria-label="Close AI tuner"><X size={17} /></button></div>
              <div className="tuner-options">{personalityOptions.map(({ id, title, description, Icon }) => <button type="button" key={id} className={profile.assistantStyle === id ? "tuner-choice tuner-choice-active" : "tuner-choice"} onClick={() => { setProfile((p) => ({ ...p, assistantStyle: id })); setTunerOpen(false); setNotice("AURORA style changed to " + title + "."); }}><span className="aurora-tool-icon"><Icon size={19} /></span><span><strong>{title}</strong><small>{description}</small></span><span className="tuner-radio">{profile.assistantStyle === id ? <Check size={13} /> : null}</span></button>)}</div>
              <p className="aurora-menu-footnote">Your choice is saved on this device.</p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>,
      document.body
      )}
      <BottomNav active={page} onNavigate={navigate} />
      <div className="desktop-footer"><span>DESIGNED FOR CLARITY</span><span className="footer-divider" /><span>POWERED BY POSSIBILITY</span></div>
    </div>
  );
}
