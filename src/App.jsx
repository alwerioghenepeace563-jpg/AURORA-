import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Activity, ArrowDown, ArrowLeft, ArrowUp, AudioLines, CalendarDays,
  Check, ChevronRight, CircleHelp, Clock3, Command, FileText, House,
  Mic, MoreHorizontal, Paperclip, Pause, Plus, Send, Settings2, ShieldCheck,
  Sparkles, SquarePen, UserRound, Volume2, VolumeX, WandSparkles, X
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
  const [messages, setMessages] = useState([]);
  const [busy, setBusy] = useState(false);
  const [listening, setListening] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [soundOn, setSoundOn] = useState(true);
  const [selectedVoice, setSelectedVoice] = useState(() => { try { return localStorage.getItem("aurora-selected-voice") || "jessica"; } catch { return "jessica"; } });
  const [showSettings, setShowSettings] = useState(true);
  const [notice, setNotice] = useState("");
  const chatEndRef = useRef(null);
  const recognitionRef = useRef(null);
  const audioRef = useRef(null);
  const fileRef = useRef(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, busy]);

  useEffect(() => {
    try { localStorage.setItem("aurora-selected-voice", selectedVoice); } catch {}
  }, [selectedVoice]);

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
        body: JSON.stringify({ messages: nextMessages.slice(-20) })
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

  function onFileSelected(event) {
    const file = event.target.files?.[0];
    if (file) setNotice(`“${file.name}” selected. File analysis will be added after the core chat is verified.`);
    event.target.value = "";
  }

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
                <button type="button" className="composer-tool" aria-label="Attach a file" onClick={() => fileRef.current?.click()}><Plus size={20} /></button>
                <input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Ask AURORA anything..." aria-label="Ask AURORA anything" />
                <button type="button" className={`composer-tool mic-tool ${listening ? "is-listening" : ""}`} aria-label="Use microphone" onClick={toggleMic}><Mic size={19} /></button>
                <button className="send-button" type="submit" disabled={!draft.trim() || busy} aria-label="Send message">{busy ? <span className="mini-loader" /> : <ArrowUp size={20} />}</button>
              </form>
              <input ref={fileRef} type="file" className="visually-hidden" onChange={onFileSelected} />
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
                  <button type="button" className="composer-tool" aria-label="Attach a file" onClick={() => fileRef.current?.click()}><Paperclip size={18} /></button>
                  <input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Message AURORA..." aria-label="Message AURORA" />
                  <button type="button" className={`composer-tool mic-tool ${listening ? "is-listening" : ""}`} onClick={toggleMic} aria-label="Use microphone"><Mic size={18} /></button>
                  <button className="send-button" type="submit" disabled={!draft.trim() || busy} aria-label="Send message">{busy ? <span className="mini-loader" /> : <ArrowUp size={20} />}</button>
                </form>
                <input ref={fileRef} type="file" className="visually-hidden" onChange={onFileSelected} />
                <p className="composer-footnote">AURORA can make mistakes. Check important information.</p>
              </div>
              <section className="orb-stage" aria-label="AURORA assistant status">
                <div className="stage-topline"><span className="stage-overline">NEURAL INTERFACE</span><span className="stage-status"><i /> SYSTEM ONLINE</span></div>
                <div className="stage-orb"><Orb speaking={speaking} /></div>
                <div className="stage-identity"><p>{speaking ? "VOICE TRANSMISSION ACTIVE" : listening ? "VOICE INPUT ACTIVE" : busy ? "PROCESSING YOUR REQUEST" : "PERSONAL INTELLIGENCE SYSTEM"}</p><h2>{speaking ? "Speaking to you" : listening ? "I'm listening." : busy ? "One moment." : "AURORA is here."}</h2><span>{speaking ? "Your assistant is responding aloud" : listening ? "Go ahead — I'm ready to hear you" : busy ? "Connecting your thoughts to intelligence" : "Ready when you are. Let's make it happen."}</span></div>
                <div className="stage-metrics"><div><span className="metric-dot" /><strong>CORE</strong><small>ACTIVE</small></div><div><span className="metric-dot metric-dot-blue" /><strong>VOICE</strong><small>{soundOn ? "ENABLED" : "MUTED"}</small></div><div><span className="metric-dot metric-dot-violet" /><strong>LINK</strong><small>SECURE</small></div></div>
                <div className="stage-actions"><button onClick={() => setSoundOn((v) => !v)}><span>{soundOn ? <Volume2 size={16} /> : <VolumeX size={16} />}</span>{soundOn ? "Sound on" : "Sound off"}</button><button onClick={toggleMic} className={listening ? "stage-listening" : ""}><span><Mic size={16} /></span>{listening ? "Listening..." : "Talk to AURORA"}</button></div>
                <div className="stage-footnote"><span>AU / CORE-01</span><span>ADAPTIVE INTELLIGENCE <i /></span></div>
              </section>
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
              <div className="profile-card"><div className="profile-avatar"><UserRound size={30} /></div><div><h2>Your profile</h2><p>Personal details and preferences</p></div><span className="coming-pill">SETUP NEXT</span></div>
              <div className="profile-options"><div><span className="setting-icon"><Clock3 size={18} /></span><div><strong>Daily routine</strong><small>Wake-up time, sleep time and priorities</small></div><ChevronRight /></div><div><span className="setting-icon"><Sparkles size={18} /></span><div><strong>Assistant style</strong><small>Choose how AURORA communicates</small></div><ChevronRight /></div><div><span className="setting-icon"><ShieldCheck size={18} /></span><div><strong>Privacy & security</strong><small>Keep your account and API access safe</small></div><ChevronRight /></div></div>
              <button className="primary-action" onClick={() => navigate("chat")}>Talk to AURORA <ArrowUp size={16} /></button>
            </motion.section>
          )}
        </AnimatePresence>
      </main>

      <BottomNav active={page} onNavigate={navigate} />
      <div className="desktop-footer"><span>DESIGNED FOR CLARITY</span><span className="footer-divider" /><span>POWERED BY POSSIBILITY</span></div>
    </div>
  );
}
