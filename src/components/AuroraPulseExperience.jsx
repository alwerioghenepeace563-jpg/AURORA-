import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Wrench, X, Grip, Mic, Send, Search, Camera, NotebookPen, Languages,
  FileText, CalendarDays, CheckSquare, Mail, CloudSun, AppWindow, Sparkles,
  FolderOpen
} from "lucide-react";

const TOOL_ITEMS = [
  { id: "search", label: "Web search", Icon: Search, action: "tool" },
  { id: "camera", label: "Camera", Icon: Camera, action: "attachment" },
  { id: "writing", label: "Writing", Icon: NotebookPen, action: "tool" },
  { id: "translate", label: "Translate", Icon: Languages, action: "tool" },
  { id: "files", label: "Files", Icon: FolderOpen, action: "attachment" },
  { id: "study", label: "Study tools", Icon: FileText, action: "tool" },
  { id: "calendar", label: "Calendar", Icon: CalendarDays, prompt: "Help me with my calendar" },
  { id: "tasks", label: "Tasks", Icon: CheckSquare, prompt: "Help me manage my tasks" },
  { id: "email", label: "Email", Icon: Mail, prompt: "Help me with my email" },
  { id: "weather", label: "Weather", Icon: CloudSun, prompt: "What's the current weather?" },
  { id: "apps", label: "Apps", Icon: AppWindow, prompt: "Help me open an app" },
  { id: "more", label: "More tools", Icon: Sparkles, prompt: "Show me what else you can do" }
];

function RevealingText({ text }) {
  const [visible, setVisible] = useState("");
  useEffect(() => {
    const value = String(text || "");
    setVisible("");
    if (!value) return;
    let index = 0;
    const interval = window.setInterval(() => {
      index = Math.min(value.length, index + (index < 36 ? 1 : 2));
      setVisible(value.slice(0, index));
      if (index >= value.length) window.clearInterval(interval);
    }, 26);
    return () => window.clearInterval(interval);
  }, [text]);
  return <span className="aurora-pulse-reveal">{visible}<i aria-hidden="true" /></span>;
}

export default function AuroraPulseExperience({
  messages = [], busy = false, draft = "", setDraft = () => {},
  onSend = () => {}, onMic = () => {}, listening = false, speaking = false,
  onClose = () => {}, onOpenTool = () => {}, onOpenAttachment = () => {},
  onQuickPrompt = () => {}
}) {
  const [toolsOpen, setToolsOpen] = useState(false);
  const [opacity, setOpacity] = useState(78);
  const [position, setPosition] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem("aurora-pulse-chat-position") || "null");
      if (saved && Number.isFinite(saved.x) && Number.isFinite(saved.y)) return saved;
    } catch {}
    return { x: 18, y: 132 };
  });
  const dragRef = useRef(null);

  useEffect(() => {
    try { localStorage.setItem("aurora-pulse-chat-position", JSON.stringify(position)); } catch {}
  }, [position]);

  const startDrag = (event) => {
    if (event.button !== undefined && event.button !== 0) return;
    const rect = event.currentTarget.closest(".aurora-pulse-chatbox")?.getBoundingClientRect();
    if (!rect) return;
    dragRef.current = { dx: event.clientX - rect.left, dy: event.clientY - rect.top };
    event.currentTarget.setPointerCapture?.(event.pointerId);
    event.preventDefault();
  };
  const moveDrag = (event) => {
    if (!dragRef.current) return;
    const width = Math.min(400, window.innerWidth * .9);
    const height = Math.min(560, window.innerHeight * .66);
    setPosition({
      x: Math.max(6, Math.min(window.innerWidth - width - 6, event.clientX - dragRef.current.dx)),
      y: Math.max(86, Math.min(window.innerHeight - Math.min(height, 260) - 12, event.clientY - dragRef.current.dy))
    });
  };
  const stopDrag = () => { dragRef.current = null; };

  const runTool = (item) => {
    setToolsOpen(false);
    if (item.action === "tool") onOpenTool(item.id);
    else if (item.action === "attachment") onOpenAttachment(item.id);
    else if (item.prompt) onQuickPrompt(item.prompt);
  };

  return (
    <div className="aurora-pulse-overlay" style={{ "--pulse-glass-opacity": opacity / 100 }}>
      <div className="aurora-pulse-edge-light" aria-hidden="true" />
      <div className="aurora-pulse-top-controls">
        <button type="button" className={"aurora-pulse-tools-trigger" + (toolsOpen ? " is-open" : "")} onClick={() => setToolsOpen(value => !value)} aria-expanded={toolsOpen} aria-label="Open AURORA tools">
          <Wrench size={19} /><span>Tools</span>
        </button>
        <button type="button" className="aurora-pulse-close-trigger" onClick={onClose} aria-label="Close AURORA Pulse"><X size={19}/></button>
      </div>

      <motion.div className={"aurora-pulse-floating-orb" + (listening ? " is-listening" : busy ? " is-thinking" : speaking ? " is-speaking" : "")}
        initial={{ opacity: 0, scale: .72, y: -10 }} animate={{ opacity: 1, scale: 1, y: [0, -5, 0] }}
        transition={{ opacity: { duration: .35 }, scale: { duration: .45 }, y: { duration: 4, repeat: Infinity, ease: "easeInOut" } }}
        aria-label={listening ? "AURORA listening" : busy ? "AURORA thinking" : speaking ? "AURORA speaking" : "AURORA ready"}>
        <span className="aurora-pulse-orb-core" />
        <span className="aurora-pulse-orb-aura" />
      </motion.div>

      <AnimatePresence>
        {toolsOpen && (
          <motion.section className="aurora-pulse-tools-panel" initial={{ opacity: 0, y: -12, scale: .96 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -8, scale: .97 }} aria-label="AURORA tools">
            <div className="aurora-pulse-tools-heading"><div><strong>Intelligence tools</strong><small>Choose a capability</small></div><button type="button" onClick={() => setToolsOpen(false)} aria-label="Close tools"><X size={17}/></button></div>
            <div className="aurora-pulse-tools-grid">
              {TOOL_ITEMS.map(item => <button type="button" className="aurora-pulse-tool-card" key={item.id} onClick={() => runTool(item)}>
                <item.Icon size={22}/><span>{item.label}</span><i/>
              </button>)}
            </div>
          </motion.section>
        )}
      </AnimatePresence>

      <motion.section className="aurora-pulse-chatbox" style={{ left: position.x, top: position.y, "--pulse-glass-opacity": opacity / 100 }}
        initial={{ opacity: 0, y: 18, scale: .97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 10 }}>
        <div className="aurora-pulse-chatbox-handle" onPointerDown={startDrag} onPointerMove={moveDrag} onPointerUp={stopDrag} onPointerCancel={stopDrag} onLostPointerCapture={stopDrag}>
          <Grip size={16}/><span>AURORA CONVERSATION</span><span className="aurora-pulse-live-dot"/>
        </div>
        <div className="aurora-pulse-message-list" aria-live="polite" aria-relevant="additions text">
          {messages.map((message, index) => {
            const key = message.id || index;
            const isThinking = message.status === "thinking";
            return <div className={"aurora-pulse-message-card " + (message.role === "user" ? "is-user" : "is-aurora")} key={key}>
              {message.role !== "user" && <div className="aurora-pulse-message-label"><Sparkles size={12}/> AURORA</div>}
              {isThinking ? <div className="aurora-pulse-thinking"><span/><span/><span/><small>Thinking</small></div> :
                message.role === "assistant" ? <div className="aurora-pulse-message-text"><RevealingText text={message.content}/></div> :
                <div className="aurora-pulse-message-text">{message.content}</div>}
            </div>;
          })}
          {busy && !messages.some(message => message.status === "thinking") && <div className="aurora-pulse-message-card is-aurora"><div className="aurora-pulse-message-label"><Sparkles size={12}/> AURORA</div><div className="aurora-pulse-thinking"><span/><span/><span/><small>Thinking</small></div></div>}
        </div>
        <form className="aurora-pulse-composer-glass" onSubmit={event => { event.preventDefault(); onSend(draft); }}>
          <input value={draft} onChange={event => setDraft(event.target.value)} placeholder="Message AURORA..." aria-label="Message AURORA"/>
          <button type="button" className={"aurora-pulse-mic-button" + (listening ? " is-listening" : "")} onClick={onMic} disabled={busy} aria-label={listening ? "Stop listening" : "Speak to AURORA"}><Mic size={18}/></button>
          <button type="submit" className="aurora-pulse-send-button" disabled={busy || !draft.trim()} aria-label="Send message"><Send size={17}/></button>
        </form>
        <div className="aurora-pulse-glass-settings">
          <span>GLASS</span><input type="range" min="35" max="95" step="5" value={opacity} onChange={event => setOpacity(Number(event.target.value))} aria-label="Glass transparency"/>
          <span>{opacity}%</span>
        </div>
      </motion.section>
    </div>
  );
}
