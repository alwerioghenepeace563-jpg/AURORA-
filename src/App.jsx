import { useEffect, useRef, useState } from "react";
import { Capacitor } from "@capacitor/core";
import { App as CapacitorApp } from "@capacitor/app";
import { auroraNative as AuroraNative, auroraApiUrl } from "./lib/aurora-native";
import { auroraSecureStorage } from "./lib/aurora-secure-storage";
import { auroraRuntime } from "./core/aurora-runtime";
import { connectAuroraNativeLifecycle } from "./core/aurora-native-lifecycle";
import { createPortal } from "react-dom";
import MapsWorkspace from "./MapsWorkspace";
import KnowledgeUniverseWorkspace from "./components/KnowledgeUniverseWorkspace";
import CreativeLearningWorkspace from "./components/CreativeLearningWorkspace";
import PredictiveDashboard from "./components/PredictiveDashboard";
import IntelligenceEcosystemWorkspace from "./components/IntelligenceEcosystemWorkspace";
import { buildAuroraRoutineInsights } from "./core/aurora-routine-insights";
import { buildAuroraDeviceInsights } from "./core/aurora-device-insights";
import { AnimatePresence, motion } from "framer-motion";
import {
  Activity, ArrowDown, ArrowLeft, ArrowLeftRight, ArrowUp, AudioLines, BookOpen, CalendarDays, Calculator, Copy,
  Bell, CalendarClock, Camera, Check, ChevronRight, CircleHelp, Clock3, Command, FileText, House,
  Image as ImageIcon, Mic, MoreHorizontal, NotebookPen, Paperclip, Pause, Play, Plus, Send, Settings2, ShieldCheck, RotateCcw,
  SlidersHorizontal, Sparkles, MessageCircle, Search, SquarePen, Timer, Trash2, UserRound, Volume2, VolumeX, WandSparkles, X, GraduationCap, ArrowUpRight, Languages, History, Mail, LockKeyhole, Eye, EyeOff, MapPinned
} from "lucide-react";


function makeSpeechFriendly(value) {
  let text = String(value || "");
  text = text
    .replace(/\[\[CHOICES:[\s\S]*?\]\]/g, "")
    .replace(/\$\$([\s\S]*?)\$\$/g, "$1")
    .replace(/\$([^$\n]+)\$/g, "$1")
    .replace(/\\times\b/g, " times ")
    .replace(/\\cdot\b/g, " times ")
    .replace(/\\div\b/g, " divided by ")
    .replace(/\\sqrt\s*\{([^{}]+)\}/g, " the square root of $1 ")
    .replace(/\\frac\s*\{([^{}]+)\}\s*\{([^{}]+)\}/g, "$1 over $2")
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/(^|\s)#+\s*/g, "$1")
    .replace(/\b([A-Za-z0-9]+)\s*\^\s*\{?([A-Za-z0-9+-]+)\}?/g, (_, base, power) => {
      if (power === "2") return base + " squared";
      if (power === "3") return base + " cubed";
      return base + " raised to the power of " + power;
    })
    .replace(/([A-Za-z0-9]+)Â²/g, "$1 squared")
    .replace(/([A-Za-z0-9]+)Â³/g, "$1 cubed")
    .replace(/([A-Za-z0-9]+)â´/g, "$1 to the fourth power")
    .replace(/([A-Za-z0-9]+)âµ/g, "$1 to the fifth power")
    .replace(/\s*[Ã—Â·]\s*/g, " times ")
    .replace(/\s*Ã·\s*/g, " divided by ")
    .replace(/\s*([=])\s*/g, " equals ")
    .replace(/\s*âˆš\s*(\d+(?:\.\d+)?)/g, " the square root of $1")
    .replace(/\s*â†’\s*/g, " leads to ")
    .replace(/\s*â‰¤\s*/g, " is less than or equal to ")
    .replace(/\s*â‰¥\s*/g, " is greater than or equal to ")
    .replace(/\s*â‰ \s*/g, " is not equal to ")
    .replace(/\s*\*\s*/g, " times ")
    .replace(/\s*\n\s*/g, ". ")
    .replace(/[*_#|]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return text.slice(0, 2400);
}

function renderInlineText(text, keyPrefix) {
  const parts = String(text || "").split(/(!\[[^\]]*\]\(https?:\/\/[^)\s]+\)|\[[^\]]+\]\(https?:\/\/[^)\s]+\)|\*\*[^*]+\*\*|\x60[^\x60]+\x60|\*[^*]+\*)/g).filter(Boolean);
  return parts.map((part, index) => {
    const key = keyPrefix + "-" + index;
    const markdownImage = part.match(/^!\[([^\]]*)\]\((https?:\/\/[^)\s]+)\)$/);
    if (markdownImage) return <a key={key} className="message-image-card" href={markdownImage[2]} target="_blank" rel="noreferrer"><img src={markdownImage[2]} alt={markdownImage[1] || "AURORA visual reference"} loading="lazy" referrerPolicy="no-referrer" onError={(event) => { event.currentTarget.style.display = "none"; event.currentTarget.nextElementSibling?.classList.add("image-fallback"); }}/><span>{markdownImage[1] || "Open visual reference"} <ArrowUpRight size={13}/></span></a>;
    const markdownLink = part.match(/^\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)$/);
    if (markdownLink) return <a key={key} className="message-inline-link" href={markdownLink[2]} target="_blank" rel="noreferrer">{renderInlineText(markdownLink[1], key + "-label")}</a>;
    if (part.startsWith("**") && part.endsWith("**")) return <strong key={key}>{part.slice(2, -2)}</strong>;
    if (part.startsWith("\x60") && part.endsWith("\x60")) return <code key={key}>{part.slice(1, -1)}</code>;
    if (part.startsWith("*") && part.endsWith("*")) return <em key={key}>{part.slice(1, -1)}</em>;
    return part;
  });
}
function FormattedMessage({ content, onChoice }) {
  const lines = String(content || "").split("\n");
  const choiceLine = lines.find((line) => /^\s*\[\[CHOICES:\s*.*\]\]\s*$/.test(line));
  const choices = choiceLine ? (choiceLine.match(/^\s*\[\[CHOICES:\s*(.*?)\]\]\s*$/)?.[1] || "").split("|").map((item) => item.trim()).filter(Boolean).slice(0, 4) : [];
  const visibleLines = lines.filter((line) => !/^\s*\[\[CHOICES:\s*.*\]\]\s*$/.test(line));
  const flowTitleIndex = visibleLines.findIndex((line) => /AURORA AI Fallback Flow|AI Fallback Flow|Fallback Flow/i.test(line.trim()));
  const stageNames = ["Primary Provider", "Rate-Limit Detection", "Backup Providers", "Final Response"];
  let inferredFlow = null, flowStart = -1, flowEnd = -1;
  if (flowTitleIndex >= 0) {
    const found = stageNames.map((name) => ({ name, index: visibleLines.findIndex((line, i) => i > flowTitleIndex && line.trim().toLowerCase() === name.toLowerCase()) })).filter((stage) => stage.index >= 0);
    if (found.length >= 3) {
      inferredFlow = { type: "flow", title: visibleLines[flowTitleIndex].replace(/^#+\s*/, "").trim(), steps: found.map((stage, index) => {
        const nextIndex = found[index + 1] ? found[index + 1].index : visibleLines.length;
        const description = visibleLines.slice(stage.index + 1, nextIndex).filter((line) => line.trim() && !/^\s*[â†“â†˜â†’]+\s*$/.test(line.trim()) && !/^\s*Feel free to click/i.test(line.trim())).join(" ").trim();
        return { title: stage.name, text: description, color: ["#142d46", "#183747", "#20334b", "#153b36"][index] };
      }) };
      flowStart = flowTitleIndex;
      flowEnd = found[found.length - 1].index;
    }
  }
  const blocks = [];
  let listItems = [], listType = "", codeLines = [], inCode = false, tableRows = [];
  const flushList = () => {
    if (!listItems.length) return;
    const ListTag = listType === "number" ? "ol" : "ul";
    blocks.push(<ListTag className="message-list" key={"list-" + blocks.length}>{listItems.map((item, index) => <li key={index}>{renderInlineText(item, "li-" + blocks.length + "-" + index)}</li>)}</ListTag>);
    listItems = []; listType = "";
  };
  const flushCode = () => {
    if (!codeLines.length) return;
    const raw = codeLines.join("\n");
    const structured = findStructuredBlock(raw.trim());
    if (structured) blocks.push(<StructuredVisual data={structured} key={"visual-" + blocks.length} />);
    else blocks.push(<pre className="message-code-block" key={"code-" + blocks.length}><code>{raw}</code></pre>);
    codeLines = [];
  };
  const flushTable = () => {
    if (!tableRows.length) return;
    const rows = tableRows.filter((row) => !row.every((cell) => /^:?-{3,}:?$/.test(cell)));
    const header = rows[0] || [];
    const body = rows.slice(1);
    blocks.push(<div className="message-table-wrap" key={"table-" + blocks.length}><table className="message-table"><thead><tr>{header.map((cell, i) => <th key={i}>{renderInlineText(cell, "th-" + i)}</th>)}</tr></thead><tbody>{body.map((row, ri) => <tr key={ri}>{header.map((_, ci) => <td key={ci}>{renderInlineText(row[ci] || "", "td-" + ri + "-" + ci)}</td>)}</tr>)}</tbody></table></div>);
    tableRows = [];
  };
  const parseTableRow = (line) => line.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((cell) => cell.trim());
  let skipFlow = false;
  visibleLines.forEach((line, index) => {
    if (inferredFlow && index === flowStart) {
      flushList(); flushTable();
      blocks.push(<StructuredVisual data={inferredFlow} key={"inferred-flow-" + index} />);
      skipFlow = true;
      return;
    }
    if (skipFlow && index > flowStart && index <= flowEnd) return;
    if (skipFlow && index > flowEnd) skipFlow = false;
    if (/^\s*\x60{3}/.test(line)) {
      flushList(); flushTable();
      if (inCode) { flushCode(); inCode = false; }
      else { inCode = true; codeLines = []; }
      return;
    }
    if (inCode) { codeLines.push(line); return; }
    const trimmed = line.trim();
    const isTableRow = trimmed.includes("|") && /^\|?.+\|.+\|?$/.test(trimmed);
    if (isTableRow) { flushList(); tableRows.push(parseTableRow(trimmed)); return; }
    flushTable();
    const structured = findStructuredBlock(trimmed);
    if (structured) { flushList(); blocks.push(<StructuredVisual data={structured} key={"visual-" + index} />); return; }
    const bullet = trimmed.match(/^[-*]\s+(.+)/), numbered = trimmed.match(/^\d+[.)]\s+(.+)/);
    if (bullet || numbered) {
      const nextType = numbered ? "number" : "bullet";
      if (listType && listType !== nextType) flushList();
      listType = nextType; listItems.push((bullet || numbered)[1]); return;
    }
    flushList();
    if (!trimmed) return;
    if (/^(---+|\*\*\*+|___+)$/.test(trimmed)) { blocks.push(<hr className="message-divider" key={"hr-" + index} />); return; }
    const heading = trimmed.match(/^#{1,3}\s+(.+)/);
    if (heading) blocks.push(<h4 className="message-heading" key={"heading-" + index}>{renderInlineText(heading[1], "heading-" + index)}</h4>);
    else if (/^>\s?/.test(trimmed)) blocks.push(<blockquote className="message-quote" key={"quote-" + index}>{renderInlineText(trimmed.replace(/^>\s?/, ""), "quote-" + index)}</blockquote>);
    else blocks.push(<p className="message-paragraph" key={"paragraph-" + index}>{renderInlineText(trimmed, "p-" + index)}</p>);
  });
  if (inCode) flushCode();
  flushList(); flushTable();
  return <div className="message-rich-content">{blocks}{choices.length > 0 && <div className="message-choice-group" aria-label="Suggested replies">{choices.map((choice, index) => <button type="button" className="message-choice" key={choice + index} onClick={() => onChoice(choice)}>{choice}<span>â†—</span></button>)}</div>}</div>;
}
function StructuredVisual({ data }) {
  const safeColor = (value, fallback) => typeof value === "string" && /^#[0-9a-fA-F]{6}$/.test(value) ? value : fallback;
  if (data && data.type === "flow" && Array.isArray(data.steps) && data.steps.length) {
    const steps = data.steps.slice(0, 8);
    return <div className="aurora-flow-card">{data.title && <div className="aurora-visual-title">{data.title}</div>}{steps.map((step, index) => <div className="aurora-flow-step-wrap" key={index}><div className="aurora-flow-step" style={{ background: safeColor(step.color, "#14233a") }}><div className="aurora-flow-step-title">{String(step.title || "Step " + (index + 1))}</div>{step.text && <div className="aurora-flow-step-text">{String(step.text)}</div>}</div>{index < steps.length - 1 && <div className="aurora-flow-arrow" aria-hidden="true">â†“</div>}</div>)}</div>;
  }
  if (data && data.type === "card" && typeof data.title === "string") {
    const items = Array.isArray(data.items) ? data.items.slice(0, 8) : [];
    const url = typeof data.buttonUrl === "string" && /^https?:\/\//i.test(data.buttonUrl) ? data.buttonUrl : "";
    return <div className="aurora-info-card"><div className="aurora-info-card-accent"><Sparkles size={16}/></div><div className="aurora-visual-title">{data.title}</div>{data.description && <p className="message-paragraph">{String(data.description)}</p>}{items.length > 0 && <ul className="aurora-info-items">{items.map((item, index) => <li key={index}>{typeof item === "string" ? item : String(item && (item.text || item.title) || "")}</li>)}</ul>}{url && <a className="aurora-card-link" href={url} target="_blank" rel="noreferrer">{String(data.buttonLabel || "Open link")} <span>â†—</span></a>}</div>;
  }
  return null;
}
function findStructuredBlock(line) {
  const candidate = line.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
  if (!candidate.startsWith("{") || !candidate.endsWith("}")) return null;
  try { const parsed = JSON.parse(candidate); if (parsed && (parsed.type === "flow" || parsed.type === "card")) return parsed; } catch {}
  return null;
}

function evaluateArithmetic(expression) {
  const source = String(expression || "").replace(/,/g, "").replace(/Ã—/g, "*").replace(/Ã·/g, "/").replace(/âˆ’/g, "-").trim();
  if (!source || source.length > 120 || !/^[0-9+*/().%\s^-]+$/.test(source)) throw new Error("Use numbers and basic operators (+, âˆ’, Ã—, Ã·, %, ^, parentheses).");
  let index = 0;
  const skip = () => { while (index < source.length && /\s/.test(source[index])) index++; };
  function primary() {
    skip();
    if (source[index] === "+") { index++; return primary(); }
    if (source[index] === "-") { index++; return -primary(); }
    if (source[index] === "(") { index++; const value = addSub(); skip(); if (source[index] !== ")") throw new Error("Check your parentheses."); index++; return value; }
    const match = source.slice(index).match(/^(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?/i);
    if (!match) throw new Error("Enter a valid arithmetic expression.");
    index += match[0].length;
    return Number(match[0]);
  }
  function power() { let value = primary(); skip(); if (source[index] === "^") { index++; value = Math.pow(value, power()); } return value; }
  function percent() { let value = power(); skip(); while (source[index] === "%") { value /= 100; index++; skip(); } return value; }
  function mulDiv() { let value = percent(); skip(); while (source[index] === "*" || source[index] === "/") { const op = source[index++]; const right = percent(); value = op === "*" ? value * right : value / right; skip(); } return value; }
  function addSub() { let value = mulDiv(); skip(); while (source[index] === "+" || source[index] === "-") { const op = source[index++]; const right = mulDiv(); value = op === "+" ? value + right : value - right; skip(); } return value; }
  const result = addSub(); skip();
  if (index !== source.length || !Number.isFinite(result)) throw new Error("That expression is incomplete or produces an invalid result.");
  return result;
}
function parseQuizPayload(raw) {
  const source = String(raw || "").trim().replace(/^\x60{3}(?:json)?\s*/i, "").replace(/\s*\x60{3}$/i, "").trim();
  const start = source.indexOf("{");
  const end = source.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("The quiz response was not in the expected format. Please generate the quiz again.");
  let parsed;
  try { parsed = JSON.parse(source.slice(start, end + 1)); }
  catch { throw new Error("AURORA could not read the quiz structure. Please generate it again."); }
  const questions = Array.isArray(parsed.questions) ? parsed.questions : [];
  const cleaned = questions.map((item) => {
    const options = Array.isArray(item?.options) ? item.options.map((option) => typeof option === "string" ? option.trim() : String(option?.text || option?.label || "").trim()).filter(Boolean).slice(0, 4) : [];
    let answerIndex = Number.isInteger(item?.answerIndex) ? item.answerIndex : Number.isInteger(item?.correctIndex) ? item.correctIndex : -1;
    if (answerIndex < 0 && typeof item?.answer === "string") answerIndex = options.findIndex((option) => option.toLowerCase() === item.answer.trim().toLowerCase());
    if (answerIndex < 0 && typeof item?.correctAnswer === "string") answerIndex = options.findIndex((option) => option.toLowerCase() === item.correctAnswer.trim().toLowerCase());
    return { question: String(item?.question || item?.prompt || "").trim(), options, answerIndex, explanation: String(item?.explanation || item?.feedback || "").trim() };
  }).filter((item) => item.question && item.options.length === 4 && new Set(item.options.map((option) => option.toLocaleLowerCase())).size === 4 && item.answerIndex >= 0 && item.answerIndex < 4);
  if (cleaned.length < 2) throw new Error("AURORA did not return enough valid multiple-choice questions. Try a clearer topic or generate the quiz again.");
  return { title: String(parsed.title || "CBT Practice").trim(), questions: cleaned.slice(0, 20) };
}

function convertMeasurement(input) {
  const match = String(input || "").trim().match(/^(-?\d+(?:\.\d+)?)\s*([a-zA-ZÂ°/]+)\s+(?:to|in|into)\s+([a-zA-ZÂ°/]+)$/i);
  if (!match) throw new Error("Use this format: 12 km to miles, 25 C to F, or 500 g to kg.");
  const value = Number(match[1]), from = match[2].toLowerCase(), to = match[3].toLowerCase();
  const groups = [
    { km:1000, kilometer:1000, kilometers:1000, m:1, meter:1, meters:1, cm:.01, mm:.001, mi:1609.344, mile:1609.344, miles:1609.344, ft:.3048, feet:.3048, foot:.3048, in:.0254, inch:.0254, inches:.0254, yd:.9144, yard:.9144, yards:.9144 },
    { kg:1, kilogram:1, kilograms:1, g:.001, gram:.001, grams:.001, mg:.000001, lb:.45359237, lbs:.45359237, pound:.45359237, pounds:.45359237, oz:.028349523125, ounce:.028349523125, ounces:.028349523125 },
    { l:1, liter:1, liters:1, litre:1, litres:1, ml:.001, milliliter:.001, milliliters:.001, gal:3.785411784, gallon:3.785411784, gallons:3.785411784 },
    { s:1, sec:1, second:1, seconds:1, min:60, minute:60, minutes:60, h:3600, hr:3600, hour:3600, hours:3600, day:86400, days:86400 },
    { "m/s":1, "km/h":1/3.6, mph:.44704 }
  ];
  const temp = ["c","Â°c","celsius","f","Â°f","fahrenheit","k","kelvin"];
  if (temp.includes(from) && temp.includes(to)) {
    const celsius = ["f","Â°f","fahrenheit"].includes(from) ? (value-32)*5/9 : ["k","kelvin"].includes(from) ? value-273.15 : value;
    const converted = ["f","Â°f","fahrenheit"].includes(to) ? celsius*9/5+32 : ["k","kelvin"].includes(to) ? celsius+273.15 : celsius;
    return value+" "+match[2]+" = "+Number(converted.toFixed(6))+" "+match[3];
  }
  for (const group of groups) {
    if (Object.prototype.hasOwnProperty.call(group, from) && Object.prototype.hasOwnProperty.call(group, to)) return value+" "+match[2]+" = "+Number((value*group[from]/group[to]).toPrecision(10))+" "+match[3];
  }
  throw new Error("Those units are not in the same supported category. Try length, mass, volume, time, speed, or temperature.");
}

function Orb({ compact = false, speaking = false, duration = 5 }) {
  return (
    <motion.div
      className={`orb-wrap ${compact ? "orb-wrap-compact" : ""} ${speaking ? "orb-speaking" : ""}`}
      animate={{ y: [0, -7, 0] }}
      transition={{ duration, repeat: Infinity, ease: "easeInOut" }}
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
    { id: "chat", label: "Chat", Icon: AudioLines },
    { id: "explore", label: "Explore", Icon: Sparkles },
    { id: "library", label: "Library", Icon: BookOpen },
    { id: "profile", label: "Profile", Icon: UserRound }
  ];
  return (
    <nav className="bottom-nav" aria-label="Main navigation">
      {items.map(({ id, label, Icon }) => {
        const route = id === "explore" ? "tools" : id;
        return <button key={id} type="button" className={`nav-item ${active === route ? "active" : ""} ${id === "chat" ? "nav-aurora" : ""}`} onClick={() => onNavigate(route)} aria-current={active === route ? "page" : undefined}>
          <span className="nav-icon"><Icon size={19} strokeWidth={1.8} /></span>
          <span>{label}</span>
        </button>;
      })}
    </nav>
  );
}

export default function App() {
  const [authMode, setAuthMode] = useState("signin");
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authShowPassword, setAuthShowPassword] = useState(false);
  const [authBusy, setAuthBusy] = useState(false);
  const [authMessage, setAuthMessage] = useState("");
  const [authSession, setAuthSession] = useState(() => { try { return JSON.parse(localStorage.getItem("aurora-auth-session") || "null"); } catch { return null; } });
  const [authStorageReady, setAuthStorageReady] = useState(() => !AuroraNative.isAndroid());
  const [guestMode, setGuestMode] = useState(false);
  const [authVerified, setAuthVerified] = useState(false);
  const [publicAuthConfig, setPublicAuthConfig] = useState(null);
  useEffect(() => {
    let cancelled = false;
    fetch(auroraApiUrl("/api/public-config"), { cache: "no-store" })
      .then(async response => {
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data?.error || "Public sign-in configuration is unavailable.");
        return data;
      })
      .then(data => {
        if (!cancelled && typeof data?.supabaseUrl === "string" && typeof data?.supabaseAnonKey === "string") {
          setPublicAuthConfig(data);
        }
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);
  const authUrl = (publicAuthConfig?.supabaseUrl || import.meta.env.VITE_SUPABASE_URL || import.meta.env.VITE_SUPABASE_API || "").trim().replace(/\/$/, "").replace(/\/(?:rest\/v1|auth\/v1)$/i, "");
  const authKey = publicAuthConfig?.supabaseAnonKey || import.meta.env.VITE_SUPABASE_ANON_KEY || "";
  const authConfigured = Boolean(authUrl && authKey);

  async function persistAuroraAuthSession(session) {
    const serialized = JSON.stringify(session);
    if (AuroraNative.isAndroid()) {
      await auroraSecureStorage.set("auth.session", serialized);
      try { localStorage.removeItem("aurora-auth-session"); } catch {}
    } else {
      localStorage.setItem("aurora-auth-session", serialized);
    }
  }

  async function clearAuroraAuthSession() {
    try { localStorage.removeItem("aurora-auth-session"); } catch {}
    if (AuroraNative.isAndroid()) {
      try { await auroraSecureStorage.remove("auth.session"); } catch {}
    }
  }

  useEffect(() => {
    if (!AuroraNative.isAndroid()) return;
    let cancelled = false;
    (async () => {
      try {
        const saved = await auroraSecureStorage.get("auth.session");
        if (cancelled) return;
        if (saved.found && saved.value) {
          const session = JSON.parse(saved.value);
          setAuthSession(session);
          try { localStorage.removeItem("aurora-auth-session"); } catch {}
        } else {
          const legacy = localStorage.getItem("aurora-auth-session");
          if (legacy) {
            await auroraSecureStorage.set("auth.session", legacy);
            if (cancelled) return;
            localStorage.removeItem("aurora-auth-session");
            setAuthSession(JSON.parse(legacy));
          }
        }
      } catch {
        if (!cancelled) setAuthMessage("AURORA could not unlock secure sign-in storage. Please restart the app and try again.");
      } finally {
        if (!cancelled) setAuthStorageReady(true);
      }
    })();
    return () => { cancelled = true; };
  }, []);
  const [page, setPage] = useState("home");
  const [adminData, setAdminData] = useState(null);
  const [adminLoading, setAdminLoading] = useState(false);
  const [adminError, setAdminError] = useState("");
  const [executorPrompt, setExecutorPrompt] = useState("");
  const [executorBusy, setExecutorBusy] = useState(false);
  const [executorLog, setExecutorLog] = useState([{ role: "system", text: "Executor ready. Try â€œrun system diagnosticsâ€, â€œtest live AI providersâ€, â€œopen tools workspaceâ€, or â€œopen custom schedulesâ€." }]);
  const [providerTests, setProviderTests] = useState(null);
  const [draft, setDraft] = useState("");
  const [chatSessions, setChatSessions] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem("aurora-chat-sessions") || "[]");
      if (Array.isArray(saved) && saved.length) return saved.filter((s) => s && typeof s.id === "string" && Array.isArray(s.messages));
      const legacy = JSON.parse(localStorage.getItem("aurora-chat-history") || "[]");
      if (Array.isArray(legacy) && legacy.length) return [{ id: "chat-legacy", title: String(legacy.find((m) => m?.role === "user")?.content || "Previous conversation").slice(0, 48), messages: legacy.filter((m) => m && ["user", "assistant"].includes(m.role) && typeof m.content === "string").slice(-40), updatedAt: Date.now() }];
    } catch {}
    return [];
  });
  const [activeChatId, setActiveChatId] = useState(() => { try { return localStorage.getItem("aurora-active-chat-id") || (JSON.parse(localStorage.getItem("aurora-chat-sessions") || "[]")[0]?.id) || (JSON.parse(localStorage.getItem("aurora-chat-history") || "[]").length ? "chat-legacy" : ("chat-" + Date.now())); } catch { return "chat-" + Date.now(); } });
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyQuery, setHistoryQuery] = useState("");
  const [messages, setMessages] = useState(() => {
    try {
      const sessions = JSON.parse(localStorage.getItem("aurora-chat-sessions") || "[]");
      const activeId = localStorage.getItem("aurora-active-chat-id");
      const active = Array.isArray(sessions) ? sessions.find((s) => s.id === activeId) : null;
      if (active && Array.isArray(active.messages)) return active.messages.filter((m) => m && ["user", "assistant"].includes(m.role) && typeof m.content === "string").slice(-40);
      const legacy = JSON.parse(localStorage.getItem("aurora-chat-history") || "[]");
      return Array.isArray(legacy) ? legacy.filter((m) => m && ["user", "assistant"].includes(m.role) && typeof m.content === "string").slice(-40) : [];
    } catch { return []; }
  });
  const [busy, setBusy] = useState(false);
  const [listening, setListening] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [soundOn, setSoundOn] = useState(true);
  const [selectedVoice, setSelectedVoice] = useState(() => { try { return localStorage.getItem("aurora-selected-voice") || ""; } catch { return ""; } });
  const [availableVoices, setAvailableVoices] = useState([]);
  const [voicesLoading, setVoicesLoading] = useState(false);
  const [voicesError, setVoicesError] = useState("");
  const [profile, setProfile] = useState(() => { try { return { name: "", nickname: "", wakeTime: "", sleepTime: "", priorities: "", foodPreferences: "", dietaryRestrictions: "", assistantStyle: "warm", ...JSON.parse(localStorage.getItem("aurora-profile") || "{}") }; } catch { return { name: "", nickname: "", wakeTime: "", sleepTime: "", priorities: "", foodPreferences: "", dietaryRestrictions: "", assistantStyle: "warm" }; } });
  const [profileSaved, setProfileSaved] = useState(false);
  const [pulseOpen, setPulseOpen] = useState(false);
  const [pulseDraft, setPulseDraft] = useState("");
  const [pulseMessages, setPulseMessages] = useState(() => { try { const saved = JSON.parse(localStorage.getItem("aurora-pulse-messages") || "[]"); return Array.isArray(saved) ? saved.filter(item => item && !item.pending).slice(-60) : []; } catch { return []; } });
  const [pulseBusy, setPulseBusy] = useState(false);
  const [pulseListening, setPulseListening] = useState(false);
  const [pulseToolsOpen, setPulseToolsOpen] = useState(false);
  const [pulseConversationPosition, setPulseConversationPosition] = useState({ x: 0, y: 0 });
  const pulseDragRef = useRef(null);
  const pulseRecognitionRef = useRef(null);
  const pulsePanelRef = useRef(null);
  const pulseNativeSpeechListenersRef = useRef([]);
  const pulseInterruptionReleaseRef = useRef(null);
  const [browserWakeListening, setBrowserWakeListening] = useState(false);
  const browserWakeRecognitionRef = useRef(null);
  useEffect(() => {
    try { localStorage.setItem("aurora-profile", JSON.stringify(profile)); } catch {}
  }, [profile]);
  useEffect(() => {
    try { localStorage.setItem("aurora-pulse-messages", JSON.stringify(pulseMessages.filter(item => !item.pending).slice(-60))); } catch {}
  }, [pulseMessages]);
  const [appUpdateInfo, setAppUpdateInfo] = useState(null);
  const [appUpdateBusy, setAppUpdateBusy] = useState(false);
  const [appUpdateMessage, setAppUpdateMessage] = useState("Check whether a newer AURORA build is available.");
  const [installedVersionCode, setInstalledVersionCode] = useState(Number(import.meta.env.VITE_AURORA_VERSION_CODE || 1094));
  const [installedVersionName, setInstalledVersionName] = useState(import.meta.env.VITE_AURORA_VERSION_NAME || "1.0.94");
  const [screenReadText, setScreenReadText] = useState("");
  const [screenReadBusy, setScreenReadBusy] = useState(false);
  const [screenReadMessage, setScreenReadMessage] = useState("");
  const [nativeStatus, setNativeStatus] = useState(null);
  const [nativeServiceOn, setNativeServiceOn] = useState(false);
  const [nativeBusy, setNativeBusy] = useState(false);
  const [nativeNotice, setNativeNotice] = useState("");

  useEffect(() => {
    if (!AuroraNative.isAndroid()) return;
    let stopped = false;
    AuroraNative.status().then((status) => { if (!stopped) { setNativeStatus(status); setNativeServiceOn(Boolean(status?.wakeWordListening)); } }).catch(() => {});
    const pollWakeWord = async () => {
      try {
        const pulseRequest = await AuroraNative.consumePulseOpenRequest();
        if (stopped) return;

        if (pulseRequest?.requested) {
          setPulseOpen(true);
          setNativeNotice("AURORA Pulse opened from the assistant gesture.");
        }

        const result = await AuroraNative.consumeWakeWord();
        if (stopped || !result?.detected) return;
        setPulseOpen(true);
        setNativeNotice("Hey AURORA heard you. AURORA Pulse is open.");
      } catch {}
    };
    const timer = setInterval(pollWakeWord, 1100);
    return () => { stopped = true; clearInterval(timer); };
  }, []);

  function toggleBrowserWakeWord() {
    if (browserWakeListening) {
      try { browserWakeRecognitionRef.current?.stop(); } catch {}
      browserWakeRecognitionRef.current = null;
      setBrowserWakeListening(false);
      setNativeNotice("Laptop wake-word listening is stopped.");
      return;
    }
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setNativeNotice("This browser does not support continuous speech recognition. Try Chrome or Edge and allow microphone access.");
      return;
    }
    try {
      const recognition = new SpeechRecognition();
      recognition.lang = "en-GB";
      recognition.continuous = true;
      recognition.interimResults = false;
      recognition.maxAlternatives = 3;
      recognition.onresult = (event) => {
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const alternatives = Array.from(event.results[i] || []).map((item) => String(item?.transcript || "").toLowerCase());
          if (alternatives.some((phrase) => /\bhey\s+aurora\b/.test(phrase))) {
            setPulseOpen(true);
            setNativeNotice("Hey AURORA heard you. AURORA Pulse is open.");
            try { recognition.stop(); } catch {}
            setBrowserWakeListening(false);
            browserWakeRecognitionRef.current = null;
            return;
          }
        }
      };
      recognition.onerror = (event) => {
        setBrowserWakeListening(false);
        browserWakeRecognitionRef.current = null;
        setNativeNotice("Laptop microphone listening stopped (" + String(event?.error || "speech error") + "). Check microphone permission and try again.");
      };
      recognition.onend = () => {
        setBrowserWakeListening(false);
        if (browserWakeRecognitionRef.current === recognition) browserWakeRecognitionRef.current = null;
      };
      browserWakeRecognitionRef.current = recognition;
      recognition.start();
      setBrowserWakeListening(true);
      setNativeNotice("Laptop is listening for â€œHey AURORAâ€. Keep this tab open and microphone permission enabled.");
    } catch {
      setBrowserWakeListening(false);
      browserWakeRecognitionRef.current = null;
      setNativeNotice("Could not start laptop wake-word listening. Allow microphone access and try again.");
    }
  }

  async function toggleNativeAssistant() {
    if (!AuroraNative.isAndroid() || nativeBusy) return;
    setNativeBusy(true);
    try {
      if (nativeServiceOn) {
        await AuroraNative.stopAssistantService();
        setNativeServiceOn(false);
        setNativeNotice("AURORA background listening is stopped.");
      } else {
        await AuroraNative.requestMicrophonePermission();
        const notificationPermission = await AuroraNative.requestNotificationPermission();
        if (!notificationPermission?.granted) {
          setNativeNotice("Allow notifications before enabling Hey AURORA, so Android can show the active microphone service. You can still use AURORA without wake-word listening.");
          return;
        }
        const result = await AuroraNative.startAssistantService();
        setNativeServiceOn(Boolean(result?.started));
        setNativeNotice(result?.note || "Hey AURORA listening is on. Say â€œHey AURORAâ€ to start hands-free chat.");
      }
    } catch (error) { setNativeNotice(error?.message || "Could not start the native assistant."); }
    finally { setNativeBusy(false); }
  }

  function launchNativePulseOverlay() {
    // AURORA Pulse has one UI: the in-app panel opened from Profile.
    // Invocation must reveal that same panel instead of launching a second native WebView overlay.
    setPulseOpen(true);
    setNativeNotice("AURORA Pulse opened inside the app.");
  }

  async function openNativeApp(packageName) {
    try { await AuroraNative.openApp({ packageName }); setNativeNotice("Opening appâ€¦"); }
    catch (error) { setNativeNotice(error?.message || "That app could not be opened."); }
  }

  async function readCurrentAndroidScreen() {
    if (!Capacitor.isNativePlatform()) {
      setScreenReadMessage("Read Screen requires the AURORA Android APK with the native bridge installed.");
      return;
    }
    setScreenReadBusy(true);
    setScreenReadMessage("Checking Android screen-reading permissionâ€¦");
    try {
      const status = await AuroraNative.isAccessibilityEnabled();
      if (!status?.enabled) {
        setScreenReadMessage("Enable AURORA Screen Reader in Android Accessibility settings, then return here and tap Read Screen again.");
        await AuroraNative.openAccessibilitySettings();
        return;
      }
      const contextSession = auroraRuntime.context.begin({ source: "screen", surface: "main_chat", userInitiated: true, ttlMs: 30000 });
      let snapshot;
      try {
        const result = await AuroraNative.readScreen();
        snapshot = auroraRuntime.context.consume(contextSession.id, result?.text || "");
      } catch (captureError) {
        auroraRuntime.context.revoke(contextSession.id);
        throw captureError;
      }
      const text = snapshot.text;
      if (!text) throw new Error("No readable text was found on the current screen.");
      setScreenReadText(text);
      setScreenReadMessage("Screen text captured. Review it below before sending it to AURORA AI.");
    } catch (error) {
      setScreenReadMessage(error?.message || "Could not read the current screen. Open Accessibility settings and try again.");
    } finally {
      setScreenReadBusy(false);
    }
  }
  async function checkForAppUpdate() {
    setAppUpdateBusy(true);
    setAppUpdateMessage("Checking the update serverâ€¦");
    try {
      let currentVersionCode = installedVersionCode;
      let currentVersionName = installedVersionName;
      if (Capacitor.isNativePlatform()) {
        try {
          const build = await AuroraNative.getBuildInfo();
          if (Number.isFinite(Number(build?.versionCode))) currentVersionCode = Number(build.versionCode);
          if (build?.versionName) currentVersionName = String(build.versionName);
          setInstalledVersionCode(currentVersionCode);
          setInstalledVersionName(currentVersionName);
        } catch {}
      }
      const response = await fetch("https://raw.githubusercontent.com/alwerioghenepeace563-jpg/-Lively_updates/main/aurora/version.json?check=" + Date.now(), { cache: "no-store" });
      if (!response.ok) throw new Error("Update server returned HTTP " + response.status);
      const info = await response.json();
      if (!info || !Number.isFinite(Number(info.versionCode)) || !info.apkUrl) throw new Error("The update information is incomplete.");
      setAppUpdateInfo(info);
      if (Number(info.versionCode) > currentVersionCode) setAppUpdateMessage("A new version is available: " + (info.versionName || ("build " + info.versionCode)) + ".");
      else setAppUpdateMessage("You're on the latest listed version (" + (currentVersionName || "current") + ").");
    } catch (error) {
      setAppUpdateMessage(error.message || "Could not check for updates. Try again when you're online.");
    } finally {
      setAppUpdateBusy(false);
    }
  }
  async function installAppUpdate() {
    if (!appUpdateInfo?.apkUrl) {
      setAppUpdateMessage("Check for updates first.");
      return;
    }
    if (!Capacitor.isNativePlatform()) {
      window.open(appUpdateInfo.apkUrl, "_blank", "noopener,noreferrer");
      return;
    }
    setAppUpdateBusy(true);
    setAppUpdateMessage("Downloading the verified AURORA updateâ€¦");
    try {
      const downloaded = await AuroraNative.downloadAndInstallUpdate(appUpdateInfo.apkUrl);
      if (!downloaded?.downloaded) throw new Error("AURORA could not finish downloading the update.");
      setAppUpdateMessage("Download complete. Preparing Android's installerâ€¦");
      const result = await AuroraNative.installDownloadedUpdate();
      if (result?.needsInstallPermission) {
        setAppUpdateMessage("Allow AURORA to install updates on the next Android screen, return here, then tap Install update again.");
      } else if (result?.installerLaunched) {
        setAppUpdateMessage("Android's installer opened. Confirm the update there. If Android reports a package conflict, the installed app and APK may have different signing certificates.");
      } else {
        setAppUpdateMessage("The update was downloaded. Tap Install update again to open Android's installer.");
      }
    } catch (error) {
      setAppUpdateMessage(error?.message || "Could not download or open the AURORA update.");
    } finally {
      setAppUpdateBusy(false);
    }
  }
  const [attachmentOpen, setAttachmentOpen] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraError, setCameraError] = useState("");
  const [capturedPhoto, setCapturedPhoto] = useState("");
  const cameraVideoRef = useRef(null);
  const liveCameraStreamRef = useRef(null);
  const [tunerOpen, setTunerOpen] = useState(false);
  const [showSettings, setShowSettings] = useState(true);
  const [notice, setNotice] = useState("");
  const [pendingApprovals, setPendingApprovals] = useState(() => auroraRuntime.approvals.listPending());
  const [activityTab, setActivityTab] = useState("tasks");
  const [toolKind, setToolKind] = useState("search");
  const [toolScreen, setToolScreen] = useState("home");
  const [toolQuery, setToolQuery] = useState("");
  const [toolText, setToolText] = useState("");
  const [toolImage, setToolImage] = useState(null);
  const [toolImagePreview, setToolImagePreview] = useState("");
  const [toolLanguage, setToolLanguage] = useState("English");
  const [toolSourceLanguage, setToolSourceLanguage] = useState("Auto-detect");
  const [toolMode, setToolMode] = useState("Improve and polish");
  const [toolSubject, setToolSubject] = useState("General");
  const [toolResult, setToolResult] = useState(null);
  const [quizIndex, setQuizIndex] = useState(0);
  const [quizAnswers, setQuizAnswers] = useState([]);
  const [quizFinished, setQuizFinished] = useState(false);
  const [toolBusy, setToolBusy] = useState(false);
  const [tasks, setTasks] = useState(() => { try { return JSON.parse(localStorage.getItem("aurora-tasks") || "[]"); } catch { return []; } });
  const [notes, setNotes] = useState(() => { try { return JSON.parse(localStorage.getItem("aurora-notes") || "[]"); } catch { return []; } });
  const [reminders, setReminders] = useState(() => { try { return JSON.parse(localStorage.getItem("aurora-reminders") || "[]"); } catch { return []; } });
  const [events, setEvents] = useState(() => { try { return JSON.parse(localStorage.getItem("aurora-calendar-events") || "[]"); } catch { return []; } });
  const [schedules, setSchedules] = useState(() => { try { const saved = JSON.parse(localStorage.getItem("aurora-custom-schedules") || "[]"); return Array.isArray(saved) ? saved : []; } catch { return []; } });
  const [scheduleTitle, setScheduleTitle] = useState("");
  const [scheduleInstruction, setScheduleInstruction] = useState("");
  const [scheduleStart, setScheduleStart] = useState("");
  const [scheduleEnd, setScheduleEnd] = useState("");
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
  const nativeSpeechListenersRef = useRef([]);
  const mainInterruptionReleaseRef = useRef(null);
  const audioRef = useRef(null);
  const speechReleaseRef = useRef(null);
  const speechRequestIdRef = useRef(0);
  const nativeTtsListenerRef = useRef(null);
  const browserUtteranceRef = useRef(null);
  const fileRef = useRef(null);
  const cameraRef = useRef(null);
  const galleryRef = useRef(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, busy]);

  useEffect(() => {
    if (!attachmentOpen && !cameraOpen && !tunerOpen) return undefined;
    const handleOverlayEscape = (event) => {
      if (event.key !== "Escape") return;
      if (cameraOpen) closeCameraScreen();
      else if (tunerOpen) setTunerOpen(false);
      else setAttachmentOpen(false);
    };
    window.addEventListener("keydown", handleOverlayEscape);
    return () => window.removeEventListener("keydown", handleOverlayEscape);
  }, [attachmentOpen, cameraOpen, tunerOpen]);

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return undefined;
    return connectAuroraNativeLifecycle(CapacitorApp, auroraRuntime.reliability);
  }, []);

  useEffect(() => {
    if (!pulseOpen) {
      if (pulseRecognitionRef.current || pulseInterruptionReleaseRef.current || pulseNativeSpeechListenersRef.current.length) cleanupPulseSpeech();
      return undefined;
    }
    const previousFocus = document.activeElement;
    const panel = pulsePanelRef.current;
    const focusable = () => panel?.querySelectorAll('button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])') || [];
    const first = focusable()[0];
    (first || panel)?.focus?.();
    const onKeyDown = (event) => {
      if (event.key === "Escape") { event.preventDefault(); cleanupPulseSpeech(); setPulseOpen(false); return; }
      if (event.key !== "Tab" || !panel) return;
      const items = [...focusable()];
      if (!items.length) { event.preventDefault(); panel.focus(); return; }
      const firstItem = items[0], lastItem = items[items.length - 1];
      if (event.shiftKey && document.activeElement === firstItem) { event.preventDefault(); lastItem.focus(); }
      else if (!event.shiftKey && document.activeElement === lastItem) { event.preventDefault(); firstItem.focus(); }
    };
    const onVisibility = () => { if (document.visibilityState === "hidden") cleanupPulseSpeech(); };
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("visibilitychange", onVisibility);
      if (pulseRecognitionRef.current || pulseInterruptionReleaseRef.current || pulseNativeSpeechListenersRef.current.length) cleanupPulseSpeech();
      if (previousFocus && typeof previousFocus.focus === "function") requestAnimationFrame(() => previousFocus.focus());
    };
  }, [pulseOpen]);

  useEffect(() => {
    const syncApprovals = () => setPendingApprovals(auroraRuntime.approvals.listPending());
    const unsubscribe = auroraRuntime.subscribeApprovals(syncApprovals);
    syncApprovals();
    return unsubscribe;
  }, []);

  useEffect(() => {
    try { localStorage.setItem("aurora-selected-voice", selectedVoice); } catch {}
  }, [selectedVoice]);

  useEffect(() => {
    let cancelled = false;
    setVoicesLoading(true);
    fetch(auroraApiUrl("/api/voices"), { cache: "no-store" })
      .then(async (response) => {
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error || "Could not load ElevenLabs voices.");
        return Array.isArray(data.voices) ? data.voices : [];
      })
      .then((voices) => {
        if (cancelled) return;
        setAvailableVoices(voices);
        setVoicesError("");
        const saved = (() => { try { return localStorage.getItem("aurora-selected-voice") || ""; } catch { return ""; } })();
        if (!voices.some((voice) => voice.voice_id === saved)) {
          setSelectedVoice(voices[0]?.voice_id || "");
        }
      })
      .catch((error) => { if (!cancelled) setVoicesError(error.message || "Could not load available voices."); })
      .finally(() => { if (!cancelled) setVoicesLoading(false); });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    try { localStorage.setItem("aurora-profile", JSON.stringify(profile)); } catch {}
  }, [profile]);

  useEffect(() => {
    const safeMessages = messages.slice(-40);
    try { localStorage.setItem("aurora-chat-history", JSON.stringify(safeMessages)); } catch {}
    setChatSessions((current) => {
      const id = activeChatId || ("chat-" + Date.now());
      const firstUserMessage = safeMessages.find((message) => message.role === "user")?.content || "New conversation";
      const existing = current.find((session) => session.id === id);
      const updated = { id, title: String(firstUserMessage).replace(/\s+/g, " ").slice(0, 48), messages: safeMessages, updatedAt: Date.now() };
      return existing ? current.map((session) => session.id === id ? updated : session).sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 30) : [updated, ...current].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 30);
    });
  }, [messages, activeChatId]);
  useEffect(() => {
    try {
      localStorage.setItem("aurora-chat-sessions", JSON.stringify(chatSessions));
      if (activeChatId) localStorage.setItem("aurora-active-chat-id", activeChatId);
    } catch {}
  }, [chatSessions, activeChatId]);
  useEffect(() => { try { localStorage.setItem("aurora-tasks", JSON.stringify(tasks)); } catch {} }, [tasks]);
  useEffect(() => { try { localStorage.setItem("aurora-notes", JSON.stringify(notes)); } catch {} }, [notes]);
  useEffect(() => { try { localStorage.setItem("aurora-reminders", JSON.stringify(reminders)); } catch {} }, [reminders]);
  useEffect(() => { try { localStorage.setItem("aurora-calendar-events", JSON.stringify(events)); } catch {} }, [events]);
  useEffect(() => { try { localStorage.setItem("aurora-custom-schedules", JSON.stringify(schedules)); } catch {} }, [schedules]);
  useEffect(() => {
    const refreshSchedules = () => {
      const now = Date.now();
      setSchedules((current) => current.map((item) => {
        if (item.status === "cancelled" || item.status === "completed") return item;
        const start = new Date(item.startAt).getTime();
        const end = new Date(item.endAt).getTime();
        if (now >= end) return { ...item, status: "completed" };
        if (now >= start && item.status !== "active") return { ...item, status: "active" };
        return item;
      }));
    };
    refreshSchedules();
    const id = window.setInterval(refreshSchedules, 15000);
    return () => window.clearInterval(id);
  }, []);
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

  async function handleEmailAuth(event) {
    event.preventDefault();
    setAuthMessage("");
    if (!authConfigured) {
      setAuthMessage("Login setup is not connected yet. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in Vercel, then redeploy.");
      return;
    }
    if (!authEmail.trim() || !authPassword) { setAuthMessage("Enter your email and password to continue."); return; }
    setAuthBusy(true);
    try {
      const isSignup = authMode === "signup";
      const endpoint = isSignup ? "/auth/v1/signup" : "/auth/v1/token?grant_type=password";
      const response = await fetch(authUrl + endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: authKey },
        body: JSON.stringify({ email: authEmail.trim(), password: authPassword, ...(isSignup ? { data: { app: "AURORA" } } : {}) })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.msg || data.message || data.error_description || data.error || "Authentication failed. Check your details and try again.");
      if (data.access_token) {
        const session = { access_token: data.access_token, refresh_token: data.refresh_token, expires_at: data.expires_at || (Math.floor(Date.now()/1000) + (data.expires_in || 3600)), user: data.user };
        await persistAuroraAuthSession(session);
        setAuthSession(session);
        setGuestMode(false);
        setAuthMessage("");
      } else {
        setAuthMode("signin");
        setAuthMessage("Account created. If email confirmation is enabled, verify your email before signing in.");
      }
    } catch (error) {
      setAuthMessage(error.message || "Could not sign in. Please try again.");
    } finally { setAuthBusy(false); }
  }

  async function handleOAuth(provider) {
    setAuthMessage("");
    if (!authConfigured) {
      setAuthMessage("Login setup is not connected yet. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in Vercel, then redeploy.");
      return;
    }
    try {
      // Android OAuth must return through the app deep link, not Supabaseâ€™s default Site URL (Vercel).
      const redirectTo = Capacitor.isNativePlatform() ? "com.aurora.assistant://login-callback" : window.location.origin;
      window.location.href = authUrl + "/auth/v1/authorize?provider=" + encodeURIComponent(provider) + "&redirect_to=" + encodeURIComponent(redirectTo) + "&apikey=" + encodeURIComponent(authKey);
    } catch { setAuthMessage("Could not start " + provider + " sign-in. Please try again."); }
  }

  function handleSignOut() {
    void clearAuroraAuthSession();
    setAuthSession(null);
    setGuestMode(false);
    setAuthVerified(false);
    setAdminData(null);
    setPage("home");
    setAuthEmail("");
    setAuthPassword("");
    setAuthMessage("");
  }

  useEffect(() => {
    if (!authConfigured) return;
    let cancelled = false;
    let appUrlListener = null;

    const consumeAuthCallback = async (rawUrl) => {
      if (!rawUrl) return;
      let params;
      try {
        const callbackUrl = new URL(rawUrl);
        params = new URLSearchParams(callbackUrl.hash.replace(/^#/, "") || callbackUrl.search.replace(/^\\?/, ""));
      } catch { return; }
      const accessToken = params.get("access_token");
      if (!accessToken) return;
      const refreshToken = params.get("refresh_token");
      try {
        const response = await fetch(authUrl + "/auth/v1/user", {
          headers: { apikey: authKey, Authorization: "Bearer " + accessToken }
        });
        if (!response.ok) throw new Error("Could not verify sign-in session.");
        const user = await response.json();
        if (cancelled) return;
        const session = {
          access_token: accessToken,
          refresh_token: refreshToken,
          expires_at: Number(params.get("expires_at")) || Math.floor(Date.now() / 1000) + 3600,
          user
        };
        await persistAuroraAuthSession(session);
        setAuthSession(session);
        setAuthMessage("");
        if (rawUrl === window.location.href) {
          window.history.replaceState({}, document.title, window.location.pathname + window.location.search);
        }
      } catch {
        if (!cancelled) setAuthMessage("Sign-in could not be verified. Please try again.");
      }
    };

    // Keep web sign-in working, and receive Android's registered custom-scheme callback.
    void consumeAuthCallback(window.location.href);
    if (Capacitor.isNativePlatform()) {
      CapacitorApp.addListener("appUrlOpen", ({ url }) => { void consumeAuthCallback(url); })
        .then((listener) => {
          if (cancelled) void listener.remove();
          else appUrlListener = listener;
        })
        .catch(() => {});
      CapacitorApp.getLaunchUrl()
        .then((launch) => { if (launch?.url) void consumeAuthCallback(launch.url); })
        .catch(() => {});
    }
    return () => {
      cancelled = true;
      if (appUrlListener) void appUrlListener.remove();
    };
  }, [authConfigured, authUrl, authKey]);

  useEffect(() => {
    if (!authStorageReady) return;
    if (!authConfigured || !authSession?.access_token) {
      setAuthVerified(false);
      return;
    }
    let cancelled = false;
    fetch(authUrl + "/auth/v1/user", {
      headers: { apikey: authKey, Authorization: "Bearer " + authSession.access_token },
      cache: "no-store"
    }).then(async (response) => {
      if (!response.ok) throw new Error("Session is no longer valid.");
      return response.json();
    }).then(async (user) => {
      if (cancelled) return;
      const verifiedSession = { ...authSession, user };
      await persistAuroraAuthSession(verifiedSession);
      if (cancelled) return;
      setAuthSession(verifiedSession);
      setAuthVerified(true);
    }).catch(() => {
      if (!cancelled) handleSignOut();
    });
    return () => { cancelled = true; };
  }, [authSession?.access_token, authConfigured, authUrl, authKey, authStorageReady]);

  useEffect(() => {
    if (!authStorageReady || !authSession?.access_token || !authConfigured) return;
    if (authSession.expires_at && authSession.expires_at < Math.floor(Date.now()/1000) + 60 && authSession.refresh_token) {
      fetch(authUrl + "/auth/v1/token?grant_type=refresh_token", {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: authKey },
        body: JSON.stringify({ refresh_token: authSession.refresh_token })
      }).then(async (response) => {
        const data = await response.json().catch(() => ({}));
        if (!response.ok || !data.access_token) throw new Error("Session expired");
        const session = { ...authSession, ...data, expires_at: data.expires_at || Math.floor(Date.now()/1000)+(data.expires_in || 3600) };
        await persistAuroraAuthSession(session);
        setAuthSession(session);
      }).catch(() => handleSignOut());
    }
  }, [authSession, authConfigured, authUrl, authKey, authStorageReady]);

  async function copyAssistantMessage(content) {
    const text = String(content || "").replace(/\[\[CHOICES:[\s\S]*?\]\]/g, "").trim();
    if (!text) return;
    try {
      if (navigator.clipboard?.writeText && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
      } else {
        const field = document.createElement("textarea");
        field.value = text;
        field.setAttribute("readonly", "");
        field.style.position = "fixed";
        field.style.opacity = "0";
        document.body.appendChild(field);
        field.select();
        const copied = document.execCommand("copy");
        field.remove();
        if (!copied) throw new Error("Clipboard access is unavailable.");
      }
      setNotice("AURORA's response copied.");
    } catch {
      setNotice("Couldn't copy automatically. Select and copy the response text instead.");
    }
  }

  function navigate(next) {
    if (next === "explore") next = "tools";
    if (next === "pulse") setPulseOpen(true);
    if (next === "tools") setToolScreen("home");
    if (next === "admin" && (!authVerified || !authSession?.access_token || String(authSession?.user?.email || "").toLowerCase() !== "alwerioghenepeace563@gmail.com")) {
      setNotice("Admin access is restricted.");
      setPage("home");
      return;
    }
    setPage(next);
    setNotice("");
  }

  useEffect(() => {
    if (page !== "admin") return;
    let cancelled = false;
    setAdminLoading(true);
    setAdminError("");
    fetch(auroraApiUrl("/api/admin"), { headers: { Authorization: "Bearer " + (authSession?.access_token || "") }, cache: "no-store" })
      .then(async (response) => {
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error || "Admin verification failed.");
        return data;
      })
      .then((data) => { if (!cancelled) setAdminData(data); })
      .catch((error) => { if (!cancelled) { setAdminData(null); setAdminError(error.message || "Could not load admin status."); } })
      .finally(() => { if (!cancelled) setAdminLoading(false); });
    return () => { cancelled = true; };
  }, [page, authSession?.access_token]);

  function stopSpokenOutput() {
    speechRequestIdRef.current += 1;
    if (speechReleaseRef.current) { speechReleaseRef.current(); speechReleaseRef.current = null; }
    try { audioRef.current?.pause?.(); if (audioRef.current) { audioRef.current.onended = null; audioRef.current.onerror = null; audioRef.current.src = ""; audioRef.current = null; } } catch {}
    try { window.speechSynthesis?.cancel?.(); } catch {}
    browserUtteranceRef.current = null;
    try { void auroraNative.stopTextSpeech(); } catch {}
    try { void nativeTtsListenerRef.current?.remove?.(); } catch {}
    nativeTtsListenerRef.current = null;
    setSpeaking(false);
  }

  useEffect(() => {
    if (!soundOn) stopSpokenOutput();
  }, [soundOn]);

  async function speak(text) {
    if (!soundOn || !text) return;
    stopSpokenOutput();
    const requestId = speechRequestIdRef.current;
    speechReleaseRef.current = auroraRuntime.interactions.register("voice", stopSpokenOutput);
    const isCurrent = () => requestId === speechRequestIdRef.current && !auroraRuntime.interactions.isBackground();
    const finishSpeech = () => {
      if (requestId !== speechRequestIdRef.current) return;
      if (speechReleaseRef.current) { speechReleaseRef.current(); speechReleaseRef.current = null; }
      setSpeaking(false);
    };
    try {
      setSpeaking(false);
      const response = await fetch(auroraApiUrl("/api/voice"), {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + (authSession?.access_token || "") },
        body: JSON.stringify({ text: makeSpeechFriendly(text), voiceId: selectedVoice })
      });
      if (!isCurrent()) return;
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        const diagnostic = [
          data.code,
          data.providerStatus ? "HTTP " + data.providerStatus : "",
          data.providerErrorType,
          data.providerErrorCode,
          data.providerMessage
        ].filter(Boolean).join(" / ");
        throw new Error((data.error || "Voice request failed.") + (diagnostic ? " (" + diagnostic + ")" : ""));
      }
      const contentType = (response.headers.get("content-type") || "").toLowerCase();
      if (!contentType.startsWith("audio/")) {
        const detail = contentType || "unknown content type";
        throw new Error("The voice API returned " + detail + " instead of audio (INVALID_AUDIO_RESPONSE).");
      }
      const blob = await response.blob();
      if (!isCurrent()) return;
      if (!blob.size) throw new Error("The voice API returned an empty audio file (EMPTY_AUDIO_RESPONSE).");
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      audioRef.current = audio;
      audio.onended = () => { URL.revokeObjectURL(url); finishSpeech(); };
      audio.onerror = () => { URL.revokeObjectURL(url); finishSpeech(); setNotice("Cloud voice audio was received, but this device could not decode or play it."); };
      await audio.play();
      if (!isCurrent()) { audio.pause(); URL.revokeObjectURL(url); return; }
      setSpeaking(true);
    } catch (error) {
      if (!isCurrent()) return;
      // Android devices use their native TTS engine when cloud voice is unavailable.
      // The selected ElevenLabs voice remains preferred whenever the hosted service works.
      if (auroraNative.isAndroid()) {
        let nativeListener = null;
        try {
          nativeListener = await auroraNative.addTtsStatusListener((event) => {
            if (event?.status === "done" || event?.status === "error") {
              finishSpeech();
              void nativeListener?.remove?.();
              nativeTtsListenerRef.current = null;
            }
          });
          if (!isCurrent()) { await nativeListener?.remove?.(); return; }
          nativeTtsListenerRef.current = nativeListener;
          const nativeResult = await auroraNative.speakText(makeSpeechFriendly(text));
          if (!isCurrent()) { try { await auroraNative.stopTextSpeech(); } catch {} return; }
          if (nativeResult?.started) {
            setSpeaking(true);
            setNotice("Cloud voice unavailable. Speaking with your Android system voice.");
            return;
          }
        } catch {
          try { await nativeListener?.remove?.(); } catch {}
          if (nativeTtsListenerRef.current === nativeListener) nativeTtsListenerRef.current = null;
        }
      }
      if (!isCurrent()) return;
      // Keep Read Aloud usable when the hosted voice service is unavailable.
      // Browser speech is the final fallback on supported browsers.
      try {
        if ("speechSynthesis" in window && typeof window.SpeechSynthesisUtterance === "function") {
          window.speechSynthesis.cancel();
          const utterance = new window.SpeechSynthesisUtterance(makeSpeechFriendly(text));
          browserUtteranceRef.current = utterance;
          utterance.rate = 0.96;
          utterance.pitch = 0.92;
          const availableVoices = window.speechSynthesis.getVoices();
          const preferredVoice = availableVoices.find((voice) => /female|samantha|victoria|karen|zira|aria|jenny|serena/i.test(voice.name) && /^en/i.test(voice.lang))
            || availableVoices.find((voice) => /^en/i.test(voice.lang));
          if (preferredVoice) utterance.voice = preferredVoice;
          utterance.onend = () => { browserUtteranceRef.current = null; finishSpeech(); };
          utterance.onerror = () => { browserUtteranceRef.current = null; finishSpeech(); setNotice("Read aloud is unavailable on this device right now."); };
          setSpeaking(true);
          window.speechSynthesis.speak(utterance);
          setNotice("Cloud voice failed: " + (error?.message || "unknown error") + ". Using this device voice for now.");
          return;
        }
      } catch {}
      finishSpeech();
      setNotice(error.message || "Voice could not play. Check the voice settings.");
    }
  }

  async function sendMessage(textOverride, attachmentOverride = null) {
    const text = (textOverride ?? draft).trim();
    if (!text || busy) return;
    const nextMessages = [...messages, { role: "user", content: text }];
    setMessages(nextMessages);
    setDraft("");
    setPage("chat");
    setBusy(true);
    setNotice("");
    try {
      const visualIntent = !attachmentOverride && (/\b(?:show|find|get|pull|bring|display|give me)\b.{0,65}\b(?:pictures?|photos?|images?|diagrams?|visual references?|illustrations?)\b|\b(?:pictures?|photos?|images?|diagrams?)\s+(?:of|for)\b|\b(?:i was told to draw|i was asked to draw|they asked me to draw|my teacher told me to draw|i have to draw|i need to draw|need to draw|help me draw|how do i draw|draw (?:a|an|the)?\s*(?:diagram|picture|sketch)?\s*(?:of)?|drawing of|sketch of)\b/i.test(text));
      if (visualIntent) {
        const visualQuery = text
          .replace(/^\s*(?:aurora[, ]*)?(?:please\s+)?(?:i was told to draw|i was asked to draw|they asked me to draw|my teacher told me to draw|i have to draw|i need to draw|need to draw|help me draw|how do i draw|draw)\s+(?:(?:a|an|the)\s+)?(?:(?:diagram|picture|sketch)\s+(?:of\s+)?)?/i, "")
          .replace(/^\s*(?:aurora[, ]*)?(?:please\s+)?(?:can you\s+)?(?:show|find|get|pull|bring|display|give me|i need|i want|can i see|let me see|draw)\s+/i, "")
          .replace(/^\s*(?:a|an|the)\s+/i, "")
          .replace(/^\s*(?:me\s+)?(?:some\s+)?(?:a\s+)?(?:pictures?|photos?|images?|diagrams?|visual references?|illustrations?)\s+(?:of|for)\s+/i, "")
          .replace(/^\s*(?:some\s+)?(?:pictures?|photos?|images?|diagrams?)\s+(?:of|for)\s+/i, "")
          .replace(/^\s*(?:a|an|the)\s+/i, "")
          .replace(/\b(?:pictures?|photos?|images?|diagrams?|visual references?|illustrations?)\b/ig, " ")
          .replace(/\b(?:please|for me|thanks?|abeg|oo|na)\b/ig, " ")
          .replace(/\s+/g, " ").trim() || text;
        let searchData = {};
        let imageSearchResponse = await fetch(auroraApiUrl("/api/search?type=images&q=" + encodeURIComponent(visualQuery)), { method: "GET", headers: { Accept: "application/json" }, cache: "no-store" });
        searchData = await imageSearchResponse.json().catch(() => ({}));
        let results = Array.isArray(searchData.results) ? searchData.results.slice(0, 8) : [];
        let visualResults = results.filter(item => typeof item.image === "string" && /^https:\/\//i.test(item.image));
        if (!visualResults.length) {
          const searchResponse = await fetch(auroraApiUrl("/api/search?q=" + encodeURIComponent(visualQuery)), { method: "GET", headers: { Accept: "application/json" }, cache: "no-store" });
          const webData = await searchResponse.json().catch(() => ({}));
          if (!searchResponse.ok && !imageSearchResponse.ok) throw new Error(webData.error || searchData.error || "Visual search could not complete.");
          results = Array.isArray(webData.results) ? webData.results.slice(0, 5) : [];
          visualResults = results.filter(item => typeof item.image === "string" && /^https:\/\//i.test(item.image));
        }
        const cleanLabel = value => String(value || "Visual reference").replace(/[\[\]()]/g, "").replace(/\s+/g, " ").slice(0, 100);
        const visualCards = visualResults.slice(0, 4).map(item =>
          "![" + cleanLabel(item.title) + "](" + item.image + ")\n[Open original source](" + item.url + ")"
        );
        const sourceList = results.slice(0, 5).map((item, index) => (index + 1) + ". [" + cleanLabel(item.title) + "](" + item.url + ")" + (item.snippet ? "\n   " + String(item.snippet).slice(0, 220) : "")).join("\n\n");
        const visualReply = visualCards.length
          ? "I found these visual references online for **" + visualQuery + "**. These are retrieved images from the linked websites, not AI-generated pictures.\n\n" + visualCards.join("\n\n") + "\n\n**Sources**\n" + sourceList
          : "I found web pages about **" + visualQuery + "**, but they did not provide a safe, usable image preview. I won't invent one. You can open the original results here:\n\n" + sourceList;
        setMessages(current => [...current, { role: "assistant", content: visualReply }]);
        if (soundOn) speak(visualReply);
        return;
      }
      if (!attachmentOverride && /^(?:aurora[, ]*)?(?:review my (?:saved )?routine|review my predictive suggestions|what should i focus on|show predictive suggestions|pause predictive intelligence|resume predictive intelligence|clear predictive history|review my device health|check my device health|show connected predictive sources|snooze latest predictive suggestion|dismiss latest predictive suggestion)$/i.test(text)) {
        const predictive = auroraRuntime.predictive;
        let predictiveReply = "";
        if (/snooze latest predictive/i.test(text)) {
          const latest = predictive.listSuggestions()[0];
          predictiveReply = latest && predictive.snooze(latest.id) ? "The latest suggestion has been snoozed for one hour." : "There is no current suggestion to snooze.";
        } else if (/dismiss latest predictive/i.test(text)) {
          const latest = predictive.listSuggestions()[0];
          predictiveReply = latest && predictive.dismiss(latest.id) ? "The latest suggestion has been dismissed." : "There is no current suggestion to dismiss.";
        } else if (/pause predictive/i.test(text)) {
          predictive.pause();
          predictiveReply = "Predictive intelligence is paused. No new sensor readings will be accepted.";
        } else if (/resume predictive/i.test(text)) {
          predictive.resume(true);
          predictiveReply = "Predictive intelligence is resumed. Motion sensing itself still requires its separate opt-in control in the Predictive dashboard.";
        } else if (/clear predictive/i.test(text)) {
          predictive.clear();
          predictiveReply = "Predictive history and saved suggestions have been cleared.";
        } else if (/connected predictive sources/i.test(text)) {
          const sources = predictive.listSources();
          predictiveReply = sources.length ? "Connected predictive sources:\n" + sources.map(source => "- " + source.label + " (" + source.signal + ")").join("\n") : "There are no connected predictive sensor sources.";
        } else if (/device health/i.test(text)) {
          if (!AuroraNative.isAndroid()) predictiveReply = "One-shot device health review is currently available through the Android bridge only.";
          else {
            const snapshot = await AuroraNative.getDeviceStatus();
            const insights = buildAuroraDeviceInsights(snapshot || {});
            if (!insights.length) predictiveReply = "The one-time device health check found no warning. Raw battery, thermal and memory metrics were not saved.";
            else {
              if (!predictive.getStatus().enabled) predictive.configure({ enabled: true, consent: true });
              insights.forEach(item => predictive.suggest(item));
              predictiveReply = "Device health review:\n" + insights.map(item => "- " + item.title + ": " + item.reason).join("\n") + "\nOnly the explanations were retained; raw device metrics were not saved.";
            }
          }
        } else if (/show predictive suggestions/i.test(text)) {
          const items = predictive.listSuggestions();
          predictiveReply = items.length ? "Your current suggestions:\n" + items.map(item => "- " + item.title + ": " + item.reason).join("\n") : "There are no predictive suggestions yet. Say “review my routine” to analyse your saved tasks, reminders and events.";
        } else {
          const insights = buildAuroraRoutineInsights({ tasks, reminders, events });
          if (!insights.length) predictiveReply = "I couldn't find an upcoming routine insight. Add a task, reminder or event, then ask me to review your routine.";
          else {
            if (!predictive.getStatus().enabled) predictive.configure({ enabled: true, consent: true });
            insights.forEach(item => predictive.suggest(item));
            predictiveReply = "Here are your routine insights:\n" + insights.map(item => "- " + item.title + ": " + item.reason).join("\n") + "\nI only reviewed the saved items you asked me to check. Nothing was scheduled or executed.";
          }
        }
        setMessages(current => [...current, { role: "assistant", content: predictiveReply }]);
        if (soundOn) speak(predictiveReply);
        return;
      }
      if (!attachmentOverride && /^Search the web for\s+/i.test(text)) {
        const query = text.replace(/^Search the web for\s+/i, "").trim();
        const searchResponse = await fetch(auroraApiUrl("/api/search"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query })
        });
        const searchData = await searchResponse.json().catch(() => ({}));
        if (!searchResponse.ok) throw new Error(searchData.error || "Web search could not complete.");
        const results = Array.isArray(searchData.results) ? searchData.results : [];
        const searchReply = results.length
          ? "Web results for: " + query + "\\n\\n" + results.map((item, index) => (index + 1) + ". " + item.title + "\\n" + (item.snippet || "Open the source to read more.") + "\\nSource: " + item.url).join("\\n\\n") + "\\n\\nThese are search results, so check the linked sources for full context."
          : "I couldn't find matching results for â€œ" + query + "â€. Try a more specific search.";
        setMessages((current) => [...current, { role: "assistant", content: searchReply }]);
        if (soundOn) speak(searchReply);
        return;
      }
      let preferredProvider;
      try { preferredProvider = localStorage.getItem("aurora-active-ai-provider") || undefined; } catch {}
      const activeScheduleInstructions = schedules.filter((item) => item.status !== "cancelled" && new Date(item.startAt).getTime() <= Date.now() && Date.now() < new Date(item.endAt).getTime()).map((item) => "- " + item.title + ": " + item.instruction).join("\n");
      // Route clearly relevant requests through the shared AURORA capability tree before asking the AI.
      const liveToolResult = await auroraRuntime.surfaces.route(text, { surface: "main_chat" });
      if (liveToolResult?.error) {
        setMessages((current) => [...current, { role: "assistant", content: liveToolResult.error }]);
        if (soundOn) speak(liveToolResult.error);
        return;
      }
      const response = await fetch(auroraApiUrl("/api/chat"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: (() => { const items = nextMessages.slice(-20); if (attachmentOverride && items.length) items[items.length - 1] = { ...items[items.length - 1], ...(attachmentOverride.mimeType?.startsWith("image/") ? { image: attachmentOverride } : { document: attachmentOverride }) }; return items; })(), profile: { ...profile, activeScheduleInstructions }, preferredProvider, toolContext: liveToolResult?.context || "" })
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
      if (["groq", "openrouter", "gemini"].includes(data.provider)) { try { localStorage.setItem("aurora-active-ai-provider", data.provider); } catch {} }
      setMessages((current) => [...current, { role: "assistant", content: reply }]);
      if (soundOn) speak(reply);
    } catch (error) {
      setNotice(error.message || "Couldn't reach AURORA's AI service. Check the Vercel environment variables.");
    } finally {
      setBusy(false);
    }
  }

  function openTool(kind) {
    setToolKind(kind);
    setToolScreen("detail");
    setToolQuery("");
    setToolText("");
    setToolImage(null);
    setToolImagePreview("");
    setToolResult(null);
    setQuizIndex(0);
    setQuizAnswers([]);
    setQuizFinished(false);
    setNotice("");
    setAttachmentOpen(false);
    setPage("tools");
  }

  function openToolsHome() {
    setToolScreen("home");
    setToolResult(null);
    setQuizIndex(0);
    setQuizAnswers([]);
    setQuizFinished(false);
    setNotice("");
    setPage("tools");
  }

  async function runTool(event) {
    event?.preventDefault?.();
    if (toolBusy) return;
    const kind = toolKind;
    const value = ["search", "weather"].includes(kind) ? toolQuery.trim() : toolText.trim();
    if (!value && !(kind === "image" && toolImage)) { setNotice(["search"].includes(kind) ? "Enter something to search for." : kind === "weather" ? "Enter a city or town." : "Add some text or a topic first."); return; }
    setToolBusy(true);
    setToolResult(null);
    setNotice("");
    try {
      if (kind === "calculator") {
        const result = evaluateArithmetic(value);
        setToolResult({ kind, input: value, reply: value + " = " + Number(result.toPrecision(12)) });
        return;
      }
      if (kind === "convert") {
        setToolResult({ kind, input: value, reply: convertMeasurement(value) });
        return;
      }
      if (kind === "weather") {
        const response = await fetch(auroraApiUrl("/api/weather?city=") + encodeURIComponent(value));
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error || "Weather could not be loaded.");
        const current = data.current || {};
        const units = data.units || {};
        const forecast = Array.isArray(data.forecast) ? data.forecast : [];
        const lines = [
          "Weather for " + (data.location || value),
          "Now: " + (current.temperature ?? "â€”") + (units.temperature || "Â°C") + " Â· feels like " + (current.apparentTemperature ?? "â€”") + (units.temperature || "Â°C"),
          "Conditions: " + (current.description || "Conditions unavailable"),
          "Humidity: " + (current.humidity ?? "â€”") + "% Â· Wind: " + (current.windSpeed ?? "â€”") + " " + (units.wind || "km/h"),
          ...forecast.map(day => day.date + ": " + day.description + ", high " + day.high + (units.temperature || "Â°C") + ", low " + day.low + (units.temperature || "Â°C") + ", rain chance " + (day.rainChance ?? "â€”") + "%")
        ];
        setToolResult({ kind, query: value, reply: lines.join("\n") });
        return;
      }
      if (kind === "search") {
        const response = await fetch(auroraApiUrl("/api/search"), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ query: value }) });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error || "Web search could not complete.");
        setToolResult({ kind, query: value, source: data.source || "Web search", results: Array.isArray(data.results) ? data.results : [] });
        return;
      }
      const prompts = {
        translate: "You are AURORA's careful translator. Source language: " + toolSourceLanguage + ". Target language: " + toolLanguage + ". Translate accurately and naturally. Preserve meaning, names, numbers, tone and paragraph structure. For Nigerian Pidgin, use natural everyday Nigerian Pidgin, not stiff formal phrasing. If the source is ambiguous, briefly flag it rather than guessing. Output the translation first and avoid unnecessary commentary.\n\nTEXT TO TRANSLATE:\n" + value,
        writing: "Act as AURORA's writing studio. Task: " + toolMode + ". Follow the selected task precisely. Preserve meaning and important details, match the requested audience and tone, and never invent facts, dates or promises. For a draft request, create a complete ready-to-use draft. For proofreading or polishing, preserve the original voice while correcting issues. Return the finished writing first.\n\nTEXT / BRIEF:\n" + value,
        study: "Act as AURORA study tutor. Subject: " + toolSubject + ". Teach the topic first, step by step, starting with the foundation and building toward deeper understanding. Explain why each step works and include a fully worked example when useful. Do not add a quiz, assignment or practice questions unless the user asks for them. Keep the lesson focused and manageable.\n\nTOPIC / QUESTION:\n" + value,
        summarize: "Act as AURORA's summarizer. Produce a clear title, a short plain-language overview, the most important points, key names/dates/numbers, and any actions or conclusions. Keep facts faithful to the supplied text and do not invent missing details.\n\nTEXT TO SUMMARIZE:\n" + value,
        quiz: "Act as AURORA's CBT question writer. Create 10 exam-style multiple-choice questions about the requested topic/source, using exactly four options per question. Return ONLY valid JSON with this exact structure: {\"title\":\"short quiz title\",\"questions\":[{\"question\":\"question text\",\"options\":[\"option A\",\"option B\",\"option C\",\"option D\"],\"answerIndex\":0,\"explanation\":\"brief explanation\"}]}. answerIndex must be a zero-based integer from 0 to 3 matching the correct option. Do not include markdown fences, answer keys outside JSON, or any text before/after the JSON. Use only clear, objectively answerable questions and plausible distractors.\n\nTOPIC OR SOURCE TEXT:\n" + value,
        brainstorm: "Act as AURORA's Idea Studio. Help develop the user's idea with practical, distinct options. Start by clarifying the goal in one sentence, then give 8 varied ideas with a short explanation and one concrete next step. Avoid generic repetition.\n\nIDEA / CHALLENGE:\n" + value,
        image: "Act as AURORA's visual understanding assistant. Inspect the image attached to this message directly. Answer the user's question about what is visible, read clearly legible text when possible, distinguish observations from guesses, and say when a detail cannot be determined from the image. Do not tell the user to upload the image again when it is already attached.\n\nUSER REQUEST:\n" + (value || "Describe the image and explain its important details.")
      };
      const userMessage = { role: "user", content: kind === "image" ? (value || "Please describe this image and explain its important details.") : (prompts[kind] || value) };
      if (kind === "image" && toolImage) userMessage.image = toolImage;
      const response = await fetch(auroraApiUrl("/api/chat"), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ messages: [userMessage], profile }) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "This tool could not reach AURORA's AI service.");
      const reply = String(data.reply || "").trim();
      if (!reply) throw new Error("AURORA returned an empty result.");
      if (kind === "quiz") {
        const quizData = parseQuizPayload(reply);
        setQuizIndex(0);
        setQuizAnswers([]);
        setQuizFinished(false);
        setToolResult({ kind, input: value, reply, quizData });
      } else {
        setToolResult({ kind, input: value, reply });
      }
    } catch (error) {
      setNotice(error.message || "The tool couldn't complete. Please try again.");
    } finally {
      setToolBusy(false);
    }
  }

  async function onToolImageSelected(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) { setNotice("Choose a JPEG, PNG, or WebP image."); return; }
    if (file.size > 3200000) { setNotice("Choose an image smaller than 3.2 MB."); return; }
    try {
      const dataUrl = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ""));
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      const data = String(dataUrl).split(",")[1] || "";
      if (!data) throw new Error("Could not read that image.");
      setToolImage({ mimeType: file.type, data });
      setToolImagePreview(String(dataUrl));
      setNotice("");
      setToolResult(null);
    } catch {
      setNotice("Could not read that image. Please try another file.");
    }
  }

  async function sendPulseMessage(rawText) {
    const text = String(rawText || "").trim();
    if (!text || pulseBusy) return;
    const searchMatch = text.match(/^(?:hey aurora[, ]*)?(?:search(?: the web)? for|look up on the web)\s+(.+)$/i);
    if (searchMatch) { setPulseDraft(""); setPulseToolsOpen(false); setPulseOpen(false); openTool("search"); setToolQuery(searchMatch[1].trim()); return; }
    const next = [...pulseMessages, { role: "user", content: text }];
    const pendingId = "pulse-answer-" + Date.now();
    setPulseMessages([...next, { id: pendingId, role: "assistant", content: "AURORA is thinking…", pending: true }]);
    setPulseDraft("");
    setPulseBusy(true);
    try {
      const liveToolResult = await auroraRuntime.surfaces.route(text, { surface: "pulse" });
      if (liveToolResult?.error) {
        setPulseMessages(items => items.map(item => item.id === pendingId ? { ...item, content: String(liveToolResult.error), pending: false } : item));
        return;
      }
      const response = await fetch(auroraApiUrl("/api/chat"), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ messages: next.slice(-12), profile, toolContext: liveToolResult?.context || "" }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error || "AURORA could not respond right now.");
      const reply = data?.reply || data?.message || data?.content || data?.choices?.[0]?.message?.content || "I received that, but no text reply came back.";
      setPulseMessages(items => items.map(item => item.id === pendingId ? { ...item, content: String(reply), pending: false } : item));
      if (soundOn) speak(String(reply));
    } catch (error) {
      setPulseMessages(items => items.map(item => item.id === pendingId ? { ...item, content: error?.message || "I couldn't connect just now. Please try again.", pending: false } : item));
    } finally { setPulseBusy(false); }
  }

  function cleanupPulseSpeech() {
    if (pulseInterruptionReleaseRef.current) { pulseInterruptionReleaseRef.current(); pulseInterruptionReleaseRef.current = null; }
    try { if (auroraNative.isAndroid()) void auroraNative.stopSpeechRecognition(); else pulseRecognitionRef.current?.stop?.(); } catch {}
    pulseRecognitionRef.current = null;
    pulseNativeSpeechListenersRef.current.forEach(handle => handle?.remove?.());
    pulseNativeSpeechListenersRef.current = [];
    setPulseListening(false);
  }

  async function togglePulseMic() {
    if (pulseListening) {
      if (auroraNative.isAndroid()) try { await auroraNative.stopSpeechRecognition(); } catch {}
      cleanupPulseSpeech(); return;
    }
    if (pulseBusy) return;
    if (auroraNative.isAndroid()) {
      try {
        const permission = await auroraNative.requestMicrophonePermission();
        if (!permission?.granted) { setPulseMessages(items => [...items, { role: "assistant", content: "Please allow microphone permission in Android Settings, then try again." }]); return; }
        pulseNativeSpeechListenersRef.current.forEach(handle => handle?.remove?.());
        pulseNativeSpeechListenersRef.current = [];
        const cleanup = () => cleanupPulseSpeech();
        pulseInterruptionReleaseRef.current = auroraRuntime.interactions.register("pulse", cleanupPulseSpeech);
        pulseNativeSpeechListenersRef.current.push(await auroraNative.addSpeechResultListener(event => {
          const spoken = event?.transcript?.trim() || ""; cleanup();
          if (spoken) void sendPulseMessage(spoken);
          else setPulseMessages(items => [...items, { role: "assistant", content: "I didn't catch that. Please try again." }]);
        }));
        pulseNativeSpeechListenersRef.current.push(await auroraNative.addSpeechErrorListener(event => {
          cleanup(); setPulseMessages(items => [...items, { role: "assistant", content: "Speech recognition failed: " + (event?.message || "check your phone's speech service") }]);
        }));
        pulseNativeSpeechListenersRef.current.push(await auroraNative.addSpeechStatusListener(event => { if (event?.status === "listening") setPulseListening(true); }));
        await auroraNative.startSpeechRecognition(); setPulseListening(true);
      } catch (error) {
        cleanupPulseSpeech(); setPulseMessages(items => [...items, { role: "assistant", content: error instanceof Error ? error.message : "Could not start speech recognition." }]);
      }
      return;
    }
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) { setPulseMessages(items => [...items, { role: "assistant", content: "Speech recognition isn't supported here. Please use text input." }]); return; }
    const recognition = new SpeechRecognition();
    recognition.lang = "en-GB"; recognition.interimResults = false; recognition.maxAlternatives = 1;
    recognition.onresult = event => { const spoken = event.results?.[0]?.[0]?.transcript?.trim() || ""; cleanupPulseSpeech(); if (spoken) void sendPulseMessage(spoken); };
    recognition.onerror = event => { cleanupPulseSpeech(); setPulseMessages(items => [...items, { role: "assistant", content: "Speech recognition failed (" + (event?.error || "unknown error") + ")." }]); };
    pulseInterruptionReleaseRef.current = auroraRuntime.interactions.register("pulse", cleanupPulseSpeech);
    recognition.onend = () => { pulseRecognitionRef.current = null; if (pulseInterruptionReleaseRef.current) { pulseInterruptionReleaseRef.current(); pulseInterruptionReleaseRef.current = null; } setPulseListening(false); };
    pulseRecognitionRef.current = recognition;
    try { recognition.start(); setPulseListening(true); } catch (error) { cleanupPulseSpeech(); setPulseMessages(items => [...items, { role: "assistant", content: error instanceof Error ? error.message : "Could not start microphone." }]); }
  }

  async function toggleMic() {
    if (listening) {
      try {
        if (auroraNative.isAndroid()) {
          await auroraNative.stopSpeechRecognition();
          if (mainInterruptionReleaseRef.current) { mainInterruptionReleaseRef.current(); mainInterruptionReleaseRef.current = null; }
          nativeSpeechListenersRef.current.forEach((handle) => handle?.remove?.());
          nativeSpeechListenersRef.current = [];
        } else {
          recognitionRef.current?.stop();
        }
      } catch {}
      setListening(false);
      return;
    }

    if (auroraNative.isAndroid()) {
      try {
        const permission = await auroraNative.requestMicrophonePermission();
        if (!permission?.granted) {
          setNotice("AURORA needs microphone permission to hear you. Allow it in Android Settings and try again.");
          return;
        }
        nativeSpeechListenersRef.current.forEach((handle) => handle?.remove?.());
        nativeSpeechListenersRef.current = [];
        let releaseInterruption = () => {};
        const cleanup = () => {
          releaseInterruption(); releaseInterruption = () => {}; mainInterruptionReleaseRef.current = null;
          try { void auroraNative.stopSpeechRecognition(); } catch {}
          nativeSpeechListenersRef.current.forEach((handle) => handle?.remove?.());
          nativeSpeechListenersRef.current = [];
          setListening(false);
        };
        releaseInterruption = auroraRuntime.interactions.register("main_chat", cleanup);
        mainInterruptionReleaseRef.current = releaseInterruption;
        nativeSpeechListenersRef.current.push(await auroraNative.addSpeechResultListener((event) => {
          const spokenText = event?.transcript?.trim() || "";
          cleanup();
          if (spokenText) {
            setDraft(spokenText);
            sendMessage(spokenText);
          } else {
            setNotice("I didn't catch that. Please try speaking again.");
          }
        }));
        nativeSpeechListenersRef.current.push(await auroraNative.addSpeechErrorListener((event) => {
          cleanup();
          setNotice("Android speech recognition: " + (event?.message || "could not hear speech") + ". Check that a speech service is enabled on your phone.");
        }));
        nativeSpeechListenersRef.current.push(await auroraNative.addSpeechStatusListener((event) => {
          if (event?.status === "listening") setNotice("Listeningâ€¦ speak now.");
          if (event?.status === "processing") setNotice("Processing your speechâ€¦");
        }));
        await auroraNative.startSpeechRecognition();
        setListening(true);
        setNotice("Listeningâ€¦ speak now.");
      } catch (error) {
        if (mainInterruptionReleaseRef.current) { mainInterruptionReleaseRef.current(); mainInterruptionReleaseRef.current = null; }
        nativeSpeechListenersRef.current.forEach((handle) => handle?.remove?.());
        nativeSpeechListenersRef.current = [];
        setListening(false);
        setNotice(error instanceof Error ? error.message : "Could not start Android speech recognition.");
      }
      return;
    }

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setNotice("Speech recognition is not supported in this browser. Try AURORA on Android or use text input.");
      return;
    }
    const recognition = new SpeechRecognition();
    recognition.lang = "en-GB";
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    mainInterruptionReleaseRef.current = auroraRuntime.interactions.register("main_chat", () => { try { recognition.stop(); } catch {} setListening(false); });
    recognition.onresult = (event) => {
      const spokenText = event.results?.[0]?.[0]?.transcript || "";
      if (mainInterruptionReleaseRef.current) { mainInterruptionReleaseRef.current(); mainInterruptionReleaseRef.current = null; }
      setDraft(spokenText);
      setListening(false);
      if (spokenText.trim()) sendMessage(spokenText);
    };
    recognition.onerror = (event) => {
      if (mainInterruptionReleaseRef.current) { mainInterruptionReleaseRef.current(); mainInterruptionReleaseRef.current = null; }
      setListening(false);
      const reason = event?.error ? String(event.error) : "unknown error";
      setNotice("Speech recognition failed (" + reason + "). Check microphone permission and speech services.");
    };
    recognition.onend = () => { if (mainInterruptionReleaseRef.current) { mainInterruptionReleaseRef.current(); mainInterruptionReleaseRef.current = null; } setListening(false); };
    recognitionRef.current = recognition;
    try {
      recognition.start();
      setListening(true);
      setNotice("");
    } catch {
      if (mainInterruptionReleaseRef.current) { mainInterruptionReleaseRef.current(); mainInterruptionReleaseRef.current = null; }
      setListening(false);
      setNotice("Speech recognition could not start. Close other microphone apps and try again.");
    }
  }

  async function onFileSelected(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    setAttachmentOpen(false);
    if (!file) return;
    if (file.type.startsWith("image/")) {
      if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) { setNotice("Please choose a JPEG, PNG, or WebP image."); return; }
      if (file.size > 3200000) { setNotice("Please choose an image smaller than 3.2 MB."); return; }
      try {
        const dataUrl = await new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result || "")); reader.onerror = reject; reader.readAsDataURL(file); });
        const encoded = String(dataUrl).split(",")[1] || "";
        if (!encoded) throw new Error("empty image");
        sendMessage("Please examine this image and describe what is important. Read any visible text and help me understand it. Image: " + file.name, { mimeType: file.type, data: encoded });
      } catch { setNotice("I couldn't prepare that image. Please try another JPEG, PNG, or WebP file."); }
      return;
    }
    if (file.type === "application/pdf" || /\.pdf$/i.test(file.name)) {
      if (file.size > 6500000) { setNotice("Please choose a PDF smaller than 6.5 MB."); return; }
      try {
        const dataUrl = await new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result || "")); reader.onerror = reject; reader.readAsDataURL(file); });
        const encoded = String(dataUrl).split(",")[1] || "";
        if (!encoded) throw new Error("empty PDF");
        sendMessage("Please read this PDF document: " + file.name + ". Summarise its key points, explain difficult parts, and answer questions using the document.", { mimeType: "application/pdf", data: encoded });
      } catch { setNotice("I couldn't prepare that PDF. Please try another file."); }
      return;
    }
    const allowedTypes = ["text/plain", "text/markdown", "text/csv", "application/json"];
    const allowedExtensions = /\.(txt|md|csv|json)$/i;
    if (!allowedTypes.includes(file.type) && !allowedExtensions.test(file.name)) {
      setNotice("AURORA can read PDF, TXT, Markdown, CSV and JSON files.");
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
      setNotice("Attached â€œ" + file.name + "â€. Review the message and tap send when you're ready.");
    } catch {
      setNotice("I couldn't read that file. Please try a text, Markdown, CSV or JSON file.");
    }
  }

  async function openCameraScreen() {
    setAttachmentOpen(false); setCameraError(""); setCapturedPhoto(""); setCameraOpen(true);
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error("In-app camera needs a secure HTTPS connection and a supported browser.");
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false });
      liveCameraStreamRef.current = stream;
      if (cameraVideoRef.current) { cameraVideoRef.current.srcObject = stream; await cameraVideoRef.current.play().catch(() => {}); }
    } catch (error) {
      setCameraError(error.name === "NotAllowedError" ? "Camera permission was denied. Allow camera access in your browser settings, then try again." : error.message || "Could not open the camera.");
    }
  }
  function closeCameraScreen() {
    liveCameraStreamRef.current?.getTracks().forEach((track) => track.stop());
    liveCameraStreamRef.current = null; setCameraOpen(false);
  }
  function captureCameraPhoto() {
    const video = cameraVideoRef.current;
    if (!video || !video.videoWidth) { setCameraError("Camera is still starting. Try again in a moment."); return; }
    const scale = Math.min(1, 1600 / Math.max(video.videoWidth, video.videoHeight));
    const canvas = document.createElement("canvas"); canvas.width = Math.round(video.videoWidth * scale); canvas.height = Math.round(video.videoHeight * scale);
    canvas.getContext("2d")?.drawImage(video, 0, 0, canvas.width, canvas.height);
    setCapturedPhoto(canvas.toDataURL("image/jpeg", .82));
    liveCameraStreamRef.current?.getTracks().forEach((track) => track.stop()); liveCameraStreamRef.current = null;
  }
  function retakeCameraPhoto() { setCapturedPhoto(""); openCameraScreen(); }
  function useCameraPhoto() {
    if (!capturedPhoto) return;
    const encoded = capturedPhoto.split(",")[1] || "";
    closeCameraScreen();
    if (!encoded) { setNotice("I couldn't prepare that photo. Please take it again."); return; }
    sendMessage("Please examine this photo carefully. Describe the important details, read any visible text, and help me understand what it shows.", { mimeType: "image/jpeg", data: encoded });
  }
  function openAttachment(kind) {
    setAttachmentOpen(false);
    if (kind === "camera") openCameraScreen();
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

  // Require sign-in on first launch, while keeping a clear guest route.
  if (!authSession && !guestMode) {
    return (
      <div className="auth-screen">
        <div className="auth-orbit auth-orbit-one" />
        <div className="auth-orbit auth-orbit-two" />
        <div className="auth-layout">
          <aside className="auth-showcase">
            <div className="auth-showcase-top">
              <span className="auth-symbol"><span /></span>
              <span className="auth-wordmark">AURORA<span>.</span></span>
            </div>
            <div className="auth-showcase-copy">
              <p className="auth-overline">PERSONAL INTELLIGENCE</p>
              <h1>Make space for<br/><span>what matters.</span></h1>
              <p>Your ideas, plans and conversations — brought together in one intelligent space.</p>
            </div>
            <div className="auth-showcase-orb"><Orb compact /></div>
            <div className="auth-showcase-foot"><span className="auth-live-dot" /> YOUR SPACE. YOUR INTELLIGENCE.</div>
          </aside>
          <main className="auth-panel">
            <section className="auth-card">
              <div className="auth-mobile-brand"><span className="auth-symbol"><span /></span><span className="auth-wordmark">AURORA<span>.</span></span></div>
              <div className="auth-heading">
                <p className="auth-overline">{authMode === "signup" ? "CREATE YOUR SPACE" : "WELCOME BACK"}</p>
                <h2>{authMode === "signup" ? "Your next chapter starts here." : "Good to have you back."}</h2>
                <p>{authMode === "signup" ? "Create an account to keep your AURORA space in sync." : "Sign in and pick up right where you left off."}</p>
              </div>
              <button className="auth-google-button" type="button" onClick={() => handleOAuth("google")}>
                <span className="auth-google-mark">G</span><span>Continue with Google</span><ArrowUpRight size={17}/>
              </button>
              <div className="auth-divider"><span /> <small>OR USE YOUR EMAIL</small> <span /></div>
              <form className="auth-form" onSubmit={handleEmailAuth}>
                <label>Email address
                  <div className="auth-input-wrap"><Mail size={17}/><input type="email" autoComplete="email" value={authEmail} onChange={(e)=>setAuthEmail(e.target.value)} placeholder="name@example.com" required/></div>
                </label>
                <label>Password
                  <div className="auth-input-wrap"><LockKeyhole size={17}/><input type={authShowPassword ? "text" : "password"} autoComplete={authMode === "signup" ? "new-password" : "current-password"} minLength={6} value={authPassword} onChange={(e)=>setAuthPassword(e.target.value)} placeholder="Enter your password" required/><button type="button" onClick={()=>setAuthShowPassword(v=>!v)} aria-label={authShowPassword ? "Hide password" : "Show password"}>{authShowPassword ? <EyeOff size={17}/> : <Eye size={17}/>}</button></div>
                </label>
                {authMessage && <p className="auth-message" role="status">{authMessage}</p>}
                {!authConfigured && <p className="auth-setup-note"><ShieldCheck size={15}/> Sign-in configuration is still loading or unavailable. Please try again shortly.</p>}
                <button className="auth-submit" type="submit" disabled={authBusy || !authConfigured}>{authBusy ? <span className="mini-loader"/> : null}{authBusy ? "Please wait…" : authMode === "signup" ? "Create account" : "Sign in"} <ArrowUpRight size={18}/></button>
              </form>
              <p className="auth-switch">{authMode === "signup" ? "Already have an account?" : "New to AURORA?"}<button type="button" onClick={()=>{setAuthMode(v=>v==="signup"?"signin":"signup");setAuthMessage("");}}>{authMode === "signup" ? "Sign in" : "Create an account"}</button></p>
              <button className="auth-guest-button" type="button" onClick={() => { setGuestMode(true); setAuthMessage(""); }}>Continue as guest <ArrowUpRight size={16}/></button>
              <p className="auth-legal"><ShieldCheck size={13}/> Your space stays on this device when you use guest mode.</p>
            </section>
            <p className="auth-footer">AURORA <span>·</span> BUILT FOR YOUR EVERY DAY</p>
          </main>
        </div>
      </div>
    );
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
          {authVerified && String(authSession?.user?.email || "").toLowerCase() === "alwerioghenepeace563@gmail.com" && <button className="auth-signout-button" onClick={() => navigate("admin")} aria-label="Open Admin"><ShieldCheck size={15}/><span>Admin</span></button>}
          {authVerified && <button className="auth-signout-button" onClick={handleSignOut} title={"Signed in as " + (authSession?.user?.email || "your account")} aria-label="Sign out"><UserRound size={15}/><span>Sign out</span></button>}
        </div>
      </header>

      <main className={`main-layout page-${page}`}>
        <AnimatePresence mode="wait">
          {page === "home" && (
            <motion.section key="home" className="home-screen" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.25 }}>
              <div className="home-eyebrow"><span className="eyebrow-line" /> YOUR SPACE. YOUR INTELLIGENCE. <span className="eyebrow-line" /></div>
              <div className="hero-orb"><Orb speaking={speaking} duration={5.5} /></div>
              <div className="home-copy">
                <p className="welcome-kicker">GOOD TO HAVE YOU HERE</p>
                <h1>Hello<span>,</span> there.</h1>
                <p className="hero-subtitle">Your AI, your world.</p>
                <div className="availability"><span className="live-dot" /> AURORA IS READY WHEN YOU ARE</div>
              </div>
              <form className="home-composer glass-panel" onSubmit={(e) => { e.preventDefault(); sendMessage(); }}>
                <button type="button" className="composer-tool" aria-label="Attach a file" onClick={() => setAttachmentOpen((v) => !v)} aria-expanded={attachmentOpen}><Plus size={20} /></button>
                <input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Ask AURORA anything..." aria-label="Ask AURORA anything" />
                <button type="button" className={`composer-tool mic-tool ${listening ? "is-listening" : ""}`} aria-label="Use microphone" onClick={toggleMic}><Mic size={19} /></button>
                <button className="send-button" type="submit" disabled={!draft.trim() || busy} aria-label="Send message">{busy ? <span className="mini-loader" /> : <ArrowUp size={20} />}</button>
              </form>

              {notice && <div className="notice" role="status">{notice}<button onClick={() => setNotice("")} aria-label="Dismiss message"><X size={14} /></button></div>}
              <div className="suggestion-row">
                <button onClick={() => sendMessage("Help me plan my day.")}><CalendarDays size={15} /> Plan my day</button>
                <button onClick={() => sendMessage("Help me think through an idea.")}><Sparkles size={15} /> Explore an idea</button>
                <button onClick={() => sendMessage("Help me organise my tasks.")}><Check size={15} /> Organise tasks</button>
              </div>

              <section className="home-overview">
                <div className="home-section-heading"><div><span className="panel-eyebrow">YOUR WORKSPACE</span><h2>Pick up where you left off</h2></div><button type="button" className="text-action" onClick={() => navigate("chat")}>Open chat <ArrowUpRight size={15}/></button></div>
                <div className="home-quick-grid">
                  <button type="button" className="home-quick-card" onClick={() => navigate("chat")}><span className="home-quick-icon violet"><AudioLines size={19}/></span><strong>Start a conversation</strong><small>Ask, learn or think something through</small></button>
                  <button type="button" className="home-quick-card" onClick={() => navigate("tools")}><span className="home-quick-icon cyan"><Sparkles size={19}/></span><strong>Explore capabilities</strong><small>Research, writing, learning and more</small></button>
                  <button type="button" className="home-quick-card" onClick={() => navigate("library")}><span className="home-quick-icon blue"><BookOpen size={19}/></span><strong>Your library</strong><small>Saved notes and knowledge</small></button>
                </div>
                <div className="home-section-heading home-recent-heading"><div><span className="panel-eyebrow">RECENT CONVERSATIONS</span><h2>Your recent work</h2></div><button type="button" className="text-action" onClick={() => navigate("chat")}>View all <ArrowUpRight size={15}/></button></div>
                {chatSessions.length ? <div className="home-recent-list">{chatSessions.slice().sort((a,b)=>(b.updatedAt||0)-(a.updatedAt||0)).slice(0,3).map(session => <button type="button" className="home-recent-item" key={session.id} onClick={() => { setActiveChatId(session.id); setMessages(Array.isArray(session.messages) ? session.messages : []); navigate("chat"); }}><span className="home-recent-icon"><MessageCircle size={17}/></span><span><strong>{session.title || "Conversation"}</strong><small>{new Date(session.updatedAt || Date.now()).toLocaleDateString()}</small></span><ChevronRight size={17}/></button>)}</div> : <p className="home-recent-empty">Your conversations will appear here when you start chatting.</p>}
              </section>
              <div className="home-footer-note"><ShieldCheck size={13} /> PRIVATE BY DESIGN <span /> BUILT AROUND YOU</div>
            </motion.section>
          )}

          {page === "chat" && (
            <motion.section key="chat" className="chat-screen" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.22 }}>
              <div className="chat-column">
                <div className="chat-heading">
                  <div className="chat-title-wrap"><span className="mini-orb"><Orb compact speaking={speaking} /></span><div><h1>AURORA <span>CHAT</span></h1><p><span className="live-dot" /> Your assistant is here</p></div></div>
                  <div className="chat-heading-actions">
                    <button className="icon-button" onClick={() => setHistoryOpen((open) => !open)} aria-label="Chat history" title="Chat history"><History size={18} /></button>
                    <button className="icon-button" onClick={() => { const id = "chat-" + Date.now(); setActiveChatId(id); setMessages([]); setDraft(""); setHistoryOpen(false); setNotice(""); }} aria-label="New conversation" title="New conversation"><SquarePen size={18} /></button>
                  </div>
                </div>
                {historyOpen && <div className="chat-history-panel"><div className="chat-history-title"><strong>Previous chats</strong><span>{chatSessions.length} saved</span></div><label className="chat-history-search"><Search size={15}/><input value={historyQuery} onChange={event => setHistoryQuery(event.target.value)} placeholder="Search conversations..." aria-label="Search previous conversations"/>{historyQuery && <button type="button" onClick={() => setHistoryQuery("")} aria-label="Clear search"><X size={13}/></button>}</label>{chatSessions.length === 0 ? <p className="chat-history-empty">Your conversations will appear here as you chat.</p> : (() => { const query = historyQuery.trim().toLowerCase(); const filtered = chatSessions.filter(session => !query || String(session.title || "").toLowerCase().includes(query) || session.messages?.some(message => String(message.content || "").toLowerCase().includes(query))).sort((a,b)=>(b.updatedAt||0)-(a.updatedAt||0)); return filtered.length ? filtered.map(session => <button type="button" className={"chat-history-item " + (session.id === activeChatId ? "chat-history-item-active" : "")} key={session.id} onClick={() => { setActiveChatId(session.id); setMessages(Array.isArray(session.messages) ? session.messages : []); setDraft(""); setHistoryOpen(false); setHistoryQuery(""); setNotice(""); }}>{session.title || "Conversation"}<small>{new Date(session.updatedAt || Date.now()).toLocaleDateString()}</small></button>) : <p className="chat-history-empty">No conversations match “{historyQuery}”.</p>; })()}</div>}
                <div className="messages-area">
                  {messages.length === 0 && <div className="empty-chat"><Orb compact /><span className="empty-chat-kicker">YOUR INTELLIGENT WORKSPACE</span><h2>What shall we work on?</h2><p>Ask a question, explore an idea, share a picture or bring in a document. AURORA can help you work through it.</p><div className="chat-starter-grid"><button type="button" onClick={() => setDraft("Explain a difficult topic to me step by step.")}><GraduationCap size={17}/><span><strong>Help me learn</strong><small>Understand a topic</small></span></button><button type="button" onClick={() => setDraft("Research this topic and show me reliable sources: ")}><Search size={17}/><span><strong>Research something</strong><small>Find information online</small></span></button><button type="button" onClick={() => setAttachmentOpen(true)}><ImageIcon size={17}/><span><strong>Understand an image</strong><small>Share a visual or document</small></span></button></div></div>}
                  {messages.map((message, index) => (
                    <div key={index} className={`message-row ${message.role === "user" ? "message-user" : "message-assistant"}`}>
                      {message.role === "assistant" && <span className="message-avatar"><Sparkles size={15} /></span>}
                      <div className="message-bubble"><div className="message-label">{message.role === "user" ? "YOU" : "AURORA"}</div>{message.role === "assistant" ? <FormattedMessage content={message.content} onChoice={(choice) => sendMessage(choice)} /> : <p className="message-paragraph">{message.content}</p>}{message.role === "assistant" && <div className="message-actions"><button type="button" className="message-action" onClick={() => copyAssistantMessage(message.content)}><Copy size={13}/> Copy</button><button type="button" className="speak-message" onClick={() => speak(message.content.replace(/\[\[CHOICES:[\s\S]*?\]\]/g, ""))}><Volume2 size={14}/> Read aloud</button></div>}</div>
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

                <p className="composer-footnote">AURORA can make mistakes. Check important information.</p>
              </div>
              {showSettings && <aside className="settings-panel">
                <div className="settings-header"><div><p className="panel-eyebrow">PERSONALISE</p><h2>Assistant settings</h2></div><button className="icon-button settings-close" onClick={() => setShowSettings(false)} aria-label="Close settings"><X size={16} /></button></div>
                <div className="orb-status-card"><div className="status-orb"><Orb compact speaking={speaking} /></div><div><strong>{speaking ? "Speaking now" : "AURORA is online"}</strong><span>{listening ? "Listening to you" : "Ready to assist"}</span></div><span className="live-dot" /></div>
                <div className="setting-group"><p className="setting-label">VOICE EXPERIENCE</p><button className="setting-row" onClick={() => setSoundOn((v) => !v)}><span className="setting-icon"><Volume2 size={17} /></span><span className="setting-text"><strong>Voice responses</strong><small>Spoken answers from AURORA</small></span><span className={`toggle ${soundOn ? "toggle-on" : ""}`}><i /></span></button><div style={{ margin: "10px 0 12px", padding: "12px", border: "1px solid rgba(107, 192, 255, 0.18)", borderRadius: "14px", background: "rgba(20, 48, 75, 0.28)" }}><label htmlFor="aurora-voice-choice" className="setting-label" style={{ display: "block", marginBottom: "8px" }}>AURORA VOICE</label><select id="aurora-voice-choice" value={selectedVoice} onChange={(event) => setSelectedVoice(event.target.value)} disabled={voicesLoading || availableVoices.length === 0} style={{ width: "100%", padding: "11px 12px", color: "#eaf7ff", background: "#101e30", border: "1px solid rgba(107, 192, 255, 0.3)", borderRadius: "10px", font: "inherit" }}><option value="">{voicesLoading ? "Loading voices from ElevenLabs…" : availableVoices.length ? "Choose a voice" : "No voices available"}</option>{availableVoices.map((voice) => <option key={voice.voice_id} value={voice.voice_id}>{voice.name}{voice.labels?.accent ? " · " + voice.labels.accent : ""}{voice.labels?.gender ? " · " + voice.labels.gender : ""}</option>)}</select><div style={{ display: "flex", alignItems: "center", gap: "8px", marginTop: "8px" }}><button type="button" className="setting-row" style={{ flex: 1, justifyContent: "center", minHeight: "38px" }} disabled={!availableVoices.find((voice) => voice.voice_id === selectedVoice)?.preview_url} onClick={() => { const voice = availableVoices.find((item) => item.voice_id === selectedVoice); if (voice?.preview_url) { const preview = new Audio(voice.preview_url); preview.play().catch(() => setNotice("This voice preview could not be played on this device.")); } }}>Preview selected voice</button><button type="button" className="setting-row" style={{ minHeight: "38px", padding: "0 12px" }} disabled={voicesLoading} onClick={() => { setVoicesError(""); setVoicesLoading(true); fetch(auroraApiUrl("/api/voices"), { cache: "no-store" }).then(async (response) => { const data = await response.json().catch(() => ({})); if (!response.ok) throw new Error(data.error || "Could not refresh voices."); return Array.isArray(data.voices) ? data.voices : []; }).then(setAvailableVoices).catch((error) => setVoicesError(error.message || "Could not refresh voices.")).finally(() => setVoicesLoading(false)); }}>Refresh</button></div><small style={{ display: "block", marginTop: "7px", color: "#9fb7ca", lineHeight: 1.5 }}>{voicesError || (availableVoices.length ? "Choose a voice and AURORA will use that exact voice for spoken answers. Your selection is saved on this device." : "AURORA loads voices directly from the ElevenLabs account connected to its server.")}</small></div><button className="setting-row" onClick={toggleMic}><span className="setting-icon"><Mic size={17} /></span><span className="setting-text"><strong>Voice input</strong><small>{listening ? "Tap to stop listening" : "Speak instead of typing"}</small></span><ChevronRight size={16} className="setting-chevron" /></button></div>
                <div className="setting-group"><p className="setting-label">QUICK ACCESS</p><button className="setting-row" onClick={() => navigate("activities")}><span className="setting-icon"><CalendarDays size={17} /></span><span className="setting-text"><strong>Daily activities</strong><small>Tasks, notes and plans</small></span><ChevronRight size={16} className="setting-chevron" /></button><button className="setting-row" onClick={() => navigate("profile")}><span className="setting-icon"><UserRound size={17} /></span><span className="setting-text"><strong>Your profile</strong><small>Personalise your experience</small></span><ChevronRight size={16} className="setting-chevron" /></button></div>
                <div className="setting-group"><p className="setting-label">APP UPDATES</p>              <section id="aurora-updater-settings" aria-label="AURORA app updater" className="glass-panel" style={{ width: "min(610px,100%)", marginTop: 24, padding: "16px 18px", borderRadius: 18, textAlign: "left", display: "grid", gap: 10 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 11 }}>
                    <div style={{ width: 38, height: 38, borderRadius: 12, display: "grid", placeItems: "center", background: "rgba(73,155,255,.12)", border: "1px solid rgba(110,231,255,.2)" }}><RotateCcw size={18} /></div>
                    <div><strong style={{ display: "block", fontSize: 13 }}>AURORA Updater</strong><span style={{ color: "#91a8c3", fontSize: 11 }}>Installed: {installedVersionName}</span></div>
                  </div>
                  <button type="button" className="outline-action" disabled={appUpdateBusy} onClick={checkForAppUpdate}>{appUpdateBusy ? <span className="mini-loader" /> : <RotateCcw size={14} />} {appUpdateBusy ? "Checkingâ€¦" : "Check for updates"}</button>
                </div>
                <p role="status" style={{ margin: 0, color: "#a9bdd2", fontSize: 12, lineHeight: 1.5 }}>{appUpdateMessage}</p>
                {appUpdateInfo && Number(appUpdateInfo.versionCode) > installedVersionCode && <div style={{ border: "1px solid rgba(95,185,255,.28)", background: "rgba(34,120,190,.09)", borderRadius: 12, padding: 12, display: "grid", gap: 9 }}>
                  <strong style={{ fontSize: 13 }}>{appUpdateInfo.versionName || ("Build " + appUpdateInfo.versionCode)} is ready</strong>
                  {appUpdateInfo.releaseNotes && <p style={{ margin: 0, color: "#a9bdd2", fontSize: 12 }}>{appUpdateInfo.releaseNotes}</p>}
                  {Capacitor.isNativePlatform()
                    ? <button type="button" className="primary-action" onClick={installAppUpdate} disabled={appUpdateBusy}>{appUpdateBusy ? "Preparing updateâ€¦" : "Download and install update"} <ArrowUpRight size={15}/></button>
                    : <a className="primary-action" href={appUpdateInfo.apkUrl} target="_blank" rel="noreferrer" style={{ textDecoration: "none", textAlign: "center" }}>Get AURORA update <ArrowUpRight size={15}/></a>}
                </div>}
              </section></div>
                <div className="privacy-note"><ShieldCheck size={17} /><div><strong>Your privacy matters</strong><p>Your API keys stay on the server, never in the browser.</p></div></div>
                <div className="panel-bottom"><span>AURORA INTERFACE</span><span>V 0.2</span></div>
              </aside>}
            </motion.section>
          )}


          {page === "tools" && (
            <motion.section key={toolScreen === "home" ? "tools-home" : "tool-detail-" + toolKind} className={"utility-page aurora-tools-page " + (toolScreen === "detail" ? "aurora-tool-detail-page" : "aurora-tool-home-page")} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: .22 }}>
              {toolScreen === "home" ? <>
                <div className="tools-page-heading">
                  <p className="panel-eyebrow"><Sparkles size={13}/> DISCOVER AURORA</p>
                  <h1>Explore<span>.</span></h1>
                  <p className="utility-intro">Choose the right workspace for what you want to learn, find, create or get done.</p>
                </div>
                <div className="tools-category-heading"><span>01</span><div><h2>Explore AURORA</h2><p>Choose a workspace for what you want to accomplish.</p></div></div>
                <div className="explore-shortcuts">
                  <button type="button" onClick={() => navigate("activities")}><CalendarDays size={18}/><span><strong>Activities</strong><small>Tasks, reminders and calendar</small></span><ChevronRight size={16}/></button>
                  <button type="button" onClick={() => navigate("maps")}><MapPinned size={18}/><span><strong>Maps & places</strong><small>Explore locations and plan journeys</small></span><ChevronRight size={16}/></button>
                  <button type="button" onClick={() => navigate("library")}><BookOpen size={18}/><span><strong>Knowledge library</strong><small>Your saved information and notes</small></span><ChevronRight size={16}/></button>
                </div>
                <div className="tool-launch-grid">
                  {[
                    { id: "search", icon: <Sparkles size={21}/>, title: "Web Search", desc: "Explore the web with source links", tint: "cyan" },
                    { id: "writing", icon: <NotebookPen size={21}/>, title: "Writing Assistant", desc: "Draft, polish and organise writing", tint: "violet" },
                    { id: "translate", icon: <WandSparkles size={21}/>, title: "Translation", desc: "Translate into your chosen language", tint: "blue" },
                    { id: "study", icon: <GraduationCap size={21}/>, title: "Study Assistant", desc: "Learn step by step and practise", tint: "purple" },
                    { id: "calculator", icon: <Calculator size={21}/>, title: "Calculator", desc: "Calculate expressions safely", tint: "cyan" },
                    { id: "convert", icon: <ArrowLeftRight size={21}/>, title: "Unit Converter", desc: "Convert common measurements", tint: "blue" },
                    { id: "weather", icon: <Activity size={21}/>, title: "Weather", desc: "Current conditions and a 3-day forecast", tint: "cyan" },
                    { id: "creative", icon: <BookOpen size={21}/>, title: "Creative + Learning Studio", desc: "Manage projects, captions, study plans and flashcards", tint: "purple" }
                  ].map((item) => <button type="button" key={item.id} className={"tool-launch-card tool-tint-" + item.tint} onClick={() => openTool(item.id)}>
                    <span className="tool-launch-icon">{item.icon}</span><span className="tool-launch-copy"><strong>{item.title}</strong><small>{item.desc}</small></span><span className="tool-card-arrow"><ArrowUpRight size={17}/></span>
                  </button>)}
                </div>
                <div className="tools-category-heading"><span>02</span><div><h2>Read & understand</h2><p>Bring your documents and images into AURORA.</p></div></div>
                <div className="tool-launch-grid">
                  <button type="button" className="tool-launch-card tool-tint-blue" onClick={() => openAttachment("files")}><span className="tool-launch-icon"><FileText size={21}/></span><span className="tool-launch-copy"><strong>Document Reader</strong><small>Summarise and ask questions about files</small></span><span className="tool-card-arrow"><ArrowUpRight size={17}/></span></button>
                  <button type="button" className="tool-launch-card tool-tint-pink" onClick={() => openTool("image")}><span className="tool-launch-icon"><ImageIcon size={21}/></span><span className="tool-launch-copy"><strong>Image Understanding</strong><small>Choose an image and ask AURORA about it</small></span><span className="tool-card-arrow"><ArrowUpRight size={17}/></span></button>
                  <button type="button" className="tool-launch-card tool-tint-cyan" onClick={readCurrentAndroidScreen} disabled={screenReadBusy}><span className="tool-launch-icon"><Eye size={21}/></span><span className="tool-launch-copy"><strong>{screenReadBusy ? "Reading screenâ€¦" : "Read Screen"}</strong><small>Read visible Android app text with your permission</small></span><span className="tool-card-arrow"><ArrowUpRight size={17}/></span></button>
                  {screenReadMessage && <div className="tools-note glass-panel" role="status"><span className="tools-note-icon"><Eye size={17}/></span><div><strong>Android Screen Reader</strong><p>{screenReadMessage}</p>{screenReadText && <><textarea aria-label="Captured screen text" readOnly value={screenReadText} rows={6} style={{width:"100%",marginTop:8,resize:"vertical"}}/><button type="button" className="primary-action" style={{marginTop:10}} onClick={() => { setPage("chat"); sendMessage("Please read and explain the text captured from my current Android screen. Clearly summarise what it says and help me with it.\n\nSCREEN TEXT:\n" + screenReadText); }}>Ask AURORA about this screen <ArrowUpRight size={16}/></button></>}</div></div>}
                </div>
                <div className="tools-category-heading"><span>03</span><div><h2>Create & practise</h2><p>Turn a topic into a useful result in one step.</p></div></div>
                <div className="tool-launch-grid">
                  <button type="button" className="tool-launch-card tool-tint-violet" onClick={() => openTool("summarize")}><span className="tool-launch-icon"><FileText size={21}/></span><span className="tool-launch-copy"><strong>Summarizer</strong><small>Condense long text into key points</small></span><span className="tool-card-arrow"><ArrowUpRight size={17}/></span></button>
                  <button type="button" className="tool-launch-card tool-tint-purple" onClick={() => openTool("quiz")}><span className="tool-launch-icon"><GraduationCap size={21}/></span><span className="tool-launch-copy"><strong>Quiz Maker</strong><small>Generate questions from any topic</small></span><span className="tool-card-arrow"><ArrowUpRight size={17}/></span></button>
                  <button type="button" className="tool-launch-card tool-tint-blue" onClick={() => openTool("brainstorm")}><span className="tool-launch-icon"><Sparkles size={21}/></span><span className="tool-launch-copy"><strong>Idea Studio</strong><small>Explore ideas, names and solutions</small></span><span className="tool-card-arrow"><ArrowUpRight size={17}/></span></button>
                </div>
                <div className="tools-note glass-panel"><span className="tools-note-icon"><Sparkles size={17}/></span><div><strong>One toolkit. Many possibilities.</strong><p>Every tool has its own workspace, controls and results. Your main AURORA chat stays separate.</p></div></div>
              </> : <>
                <div className="tool-detail-topline"><button type="button" className="tool-back-button" onClick={openToolsHome}><ArrowLeft size={16}/> All tools</button><span className="tool-detail-breadcrumb">TOOLS <ChevronRight size={12}/> {toolKind.toUpperCase()}</span></div>
                <div className="tool-detail-hero">
                  <div className={"tool-detail-orb tool-tint-" + (toolKind === "search" ? "cyan" : toolKind === "translate" ? "blue" : toolKind === "writing" ? "violet" : "purple")}>
                    {toolKind === "search" ? <Sparkles size={26}/> : toolKind === "translate" ? <Languages size={26}/> : toolKind === "writing" ? <NotebookPen size={26}/> : <GraduationCap size={26}/>}
                  </div>
                  <div><p className="panel-eyebrow">AURORA TOOL / WORKSPACE</p><h1>{({search:"Web Search",weather:"Weather",calculator:"Calculator",convert:"Unit Converter",translate:"Translation",writing:"Writing Assistant",study:"Study Assistant",summarize:"Summarizer",quiz:"Quiz Maker",brainstorm:"Idea Studio",image:"Image Understanding"})[toolKind] || "AURORA Tool"}<span>.</span></h1><p>{({search:"Discover information and follow it back to its sources.",weather:"Current conditions and a short forecast for a city or town.",calculator:"Calculate arithmetic expressions without sending them to an AI provider.",convert:"Convert length, mass, volume, time, speed and temperature.",translate:"Carry your meaning across languages, naturally.",writing:"Shape a rough idea into clear, confident writing.",study:"Understand the idea first. Build confidence one step at a time.",summarize:"Turn long material into a clear, useful summary.",quiz:"Build a practice quiz from a topic or source text.",brainstorm:"Explore creative options and turn ideas into next steps.",image:"Upload an image here and ask AURORA to inspect it directly."})[toolKind] || "A dedicated AURORA workspace."}</p></div>
                </div>
                {toolKind === "creative" && <CreativeLearningWorkspace authSession={authSession}/>}
                <div className={"tool-workspace glass-panel" + (toolKind === "creative" ? " clw-hidden" : "")}>
                  <div className="tool-workspace-header"><span className="tool-workspace-symbol">{toolKind === "search" ? <Sparkles size={19}/> : toolKind === "translate" ? <Languages size={19}/> : toolKind === "writing" ? <NotebookPen size={19}/> : <GraduationCap size={19}/>}</span><div><h2>{({search:"What are we looking for?",weather:"Weather near you or anywhere",calculator:"Enter a calculation",convert:"Enter a measurement to convert",translate:"Your translation",writing:"Letâ€™s work on your writing",study:"What would you like to learn?",summarize:"What should we summarize?",quiz:"What should your quiz cover?",brainstorm:"What are we creating today?",image:"What do you want to understand?"})[toolKind] || "What would you like to do?"}</h2><p>{({search:"Try a question, topic, or something you want to verify.",weather:"Enter a city or town, for example Benin City or Lagos.",calculator:"Use +, âˆ’, Ã—, Ã·, %, powers and parentheses.",convert:"Use a format such as 12 km to miles or 25 C to F.",translate:"Choose the language, then enter the text below.",writing:"Pick a writing task and add your draft or brief.",study:"Choose a subject and enter a topic or question.",summarize:"Paste an article, notes, or long text to condense.",quiz:"Enter a topic or paste notes to turn into questions.",brainstorm:"Describe your goal, project, or problem.",image:"Attach an image above, then ask what you want AURORA to inspect."})[toolKind] || "Enter your request below."}</p></div></div>
                  <form className="tool-run-form" onSubmit={runTool}>
                    {["search", "weather"].includes(toolKind) ? <label className="tool-field"><span>{toolKind === "weather" ? "City or town" : "Search the web"}</span><input value={toolQuery} onChange={(e) => setToolQuery(e.target.value)} placeholder={toolKind === "weather" ? "e.g. Benin City" : "e.g. Latest UNIBEN admission updatesâ€¦"} required/></label> : <>
                      {toolKind === "translate" && <div className="tool-language-row"><label className="tool-field"><span>From</span><select value={toolSourceLanguage} onChange={(e) => setToolSourceLanguage(e.target.value)}>{["Auto-detect","English","Nigerian Pidgin","Yoruba","Igbo","Hausa","French","Spanish","Portuguese","Arabic","Chinese (Simplified)","Japanese","German"].map((language) => <option key={language}>{language}</option>)}</select></label><button type="button" className="tool-swap-languages" aria-label="Swap source and target languages" onClick={() => { if (toolSourceLanguage === "Auto-detect") { setNotice("Choose a source language first to swap languages."); return; } setToolSourceLanguage(toolLanguage); setToolLanguage(toolSourceLanguage); setToolResult(null); setNotice("Languages swapped. Translate again to refresh the result."); }}><ArrowLeftRight size={17}/></button><label className="tool-field"><span>To</span><select value={toolLanguage} onChange={(e) => setToolLanguage(e.target.value)}>{["English","Nigerian Pidgin","Yoruba","Igbo","Hausa","French","Spanish","Portuguese","Arabic","Chinese (Simplified)","Japanese","German"].map((language) => <option key={language}>{language}</option>)}</select></label></div>}
                      {toolKind === "writing" && <label className="tool-field"><span>What should I do?</span><select value={toolMode} onChange={(e) => setToolMode(e.target.value)}>{["Improve and polish","Draft from my brief","Proofread grammar","Summarise","Make it formal","Make it simpler","Create an outline"].map((mode) => <option key={mode}>{mode}</option>)}</select></label>}
                      {toolKind === "study" && <label className="tool-field"><span>Choose a subject</span><select value={toolSubject} onChange={(e) => setToolSubject(e.target.value)}>{["General","Mathematics","English","Biology","Chemistry","Physics","Agricultural Science","Geography","Civic Education","Computer Science"].map((subject) => <option key={subject}>{subject}</option>)}</select></label>}
                      {toolKind === "image" && <div className="tool-image-upload"><label className="tool-image-pick"><ImageIcon size={18}/><span>{toolImage ? "Choose a different image" : "Upload an image"}</span><input type="file" accept="image/jpeg,image/png,image/webp" onChange={onToolImageSelected}/></label>{toolImagePreview && <div className="tool-image-preview"><img src={toolImagePreview} alt="Selected image preview"/><button type="button" onClick={() => {setToolImage(null);setToolImagePreview("");}}>Remove image</button></div>}</div>}
                      <label className="tool-field"><span>{({study:"Topic or question",writing:"Your text or brief",summarize:"Text to summarize",quiz:"Topic or source text",brainstorm:"Idea or challenge",image:"What should I look for? (optional if an image is attached)",calculator:"Expression",convert:"Measurement (e.g. 12 km to miles)"})[toolKind] || "Text to translate"}</span><textarea value={toolText} onChange={(e) => setToolText(e.target.value)} rows={6} placeholder={({study:"Tell me what you want to understandâ€¦",writing:"Paste a draft or describe what you needâ€¦",summarize:"Paste the text you want summarizedâ€¦",quiz:"e.g. Cell biology, photosynthesis, or paste your notesâ€¦",brainstorm:"e.g. Help me plan a school project or name a brandâ€¦",image:"Ask about objects, text, details, or what is happening in the imageâ€¦",calculator:"e.g. (24 + 16) / 4",convert:"e.g. 12 km to miles"})[toolKind] || "Paste the text you want translatedâ€¦"} required={toolKind !== "image"}/></label>
                    </>}
                    <button className="primary-action tool-run-button" type="submit" disabled={toolBusy}>{toolBusy ? <><span className="mini-loader"/> Workingâ€¦</> : <><Sparkles size={16}/> {({search:"Search the web",weather:"Check weather",calculator:"Calculate",convert:"Convert units",translate:"Translate text",writing:"Improve my writing",study:"Start learning",summarize:"Summarize text",quiz:"Create my quiz",brainstorm:"Generate ideas",image:"Analyse image"})[toolKind] || "Run tool"}</>}</button>
                  </form>
                  {!toolResult && !toolBusy && <div className="tool-quick-prompts"><span>QUICK START</span><div>{(toolKind === "search" ? ["Latest news in Nigeria","UNIBEN admission updates","Explain how AI works"] : toolKind === "weather" ? ["Benin City","Lagos","Abuja"] : toolKind === "calculator" ? ["125 * 8 + 45","(24 + 16) / 4","2^10"] : toolKind === "convert" ? ["12 km to miles","25 C to F","500 g to kg"] : toolKind === "translate" ? ["Good morning, how are you?","Thank you for your help.","I will be there soon."] : toolKind === "writing" ? ["Write a professional email","Improve my introduction","Create a clear outline"] : ["Explain this topic step by step","Give me a worked example","Help me revise for an exam"]).map((prompt) => <button type="button" key={prompt} onClick={() => { if (toolKind === "search" || toolKind === "weather") setToolQuery(prompt); else setToolText(prompt); setNotice(""); }}>{prompt}<span>â†—</span></button>)}</div></div>}
                  {notice && <div className="tool-notice" role="status">{notice}</div>}
                  {toolBusy && <div className="tool-loading"><span className="mini-loader"/><span>AURORA is working on your requestâ€¦</span></div>}
                  {toolResult && <div className="tool-result-panel"><div className="tool-result-heading"><div><span className="panel-eyebrow">YOUR RESULT</span><h3>{({search:"Search results",weather:"Current weather and forecast",translate:"Translation",writing:"Your writing",study:"Study session",summarize:"Your summary",quiz:"Your quiz",brainstorm:"Your ideas",image:"Image guidance"})[toolResult.kind] || "Tool result"}</h3></div><div className="tool-result-actions"><button type="button" className="outline-action" onClick={async () => { const text = toolResult.reply || (toolResult.results || []).map((item) => [item.title, item.snippet, item.url].filter(Boolean).join("\n")).join("\n\n"); try { if (!text || !navigator.clipboard?.writeText) throw new Error("Clipboard unavailable"); await navigator.clipboard.writeText(text); setNotice("Result copied."); } catch { setNotice("Copy is unavailable in this browser."); } }}>Copy result</button>{toolResult.reply && <button type="button" className="outline-action" onClick={() => speak(toolResult.reply)}><Volume2 size={14}/> Read aloud</button>}</div></div>
                    {toolResult.kind === "search" ? <div className={/\b(news|headlines|latest|breaking|updates)\b/i.test(toolResult.query || "") ? "tool-search-results tool-news-feed" : "tool-search-results"}><div className="tool-search-summary"><span>{toolResult.results?.length || 0} stories for â€œ{toolResult.query}â€</span><small>Live search Â· {toolResult.source || "Web search"}</small></div>{(toolResult.results || []).map((item, index) => { const newsMode = /\b(news|headlines|latest|breaking|updates)\b/i.test(toolResult.query || ""); const host = (() => { try { return new URL(item.url).hostname.replace(/^www\./,""); } catch { return "Source"; } })(); const headline = (item.title || "").replace(/\s+-\s+[^-]+$/, ""); const category = /fuel|petrol|naira|econom|business|refinery|price/i.test(headline) ? "Economy & business" : /army|kidnap|security|attack|police|crash|military/i.test(headline) ? "Security" : /football|super eagles|goal|league|sports/i.test(headline) ? "Sports" : /election|president|government|minister|senate|politic/i.test(headline) ? "Politics" : "Top story"; return <article className={newsMode ? "tool-search-result tool-news-story" : "tool-search-result"} key={item.url || index}>{newsMode && <a className="tool-news-image" href={item.url} target="_blank" rel="noreferrer" aria-label={"Read "+headline}><span className="tool-news-image-placeholder"><Sparkles size={22}/><small>AURORA NEWS</small></span>{item.image && <img src={item.image} alt="" loading="lazy" referrerPolicy="no-referrer" onLoad={(e)=>{const fallback=e.currentTarget.parentElement?.querySelector(".tool-news-image-placeholder");if(fallback)fallback.style.display="none";}} onError={(e)=>{e.currentTarget.style.display="none";}}/>}</a>}<div className="tool-news-copy"><h4><a href={item.url} target="_blank" rel="noreferrer">{headline || item.url}</a></h4>{newsMode && <span className="tool-news-category">{category}</span>}{item.snippet && <p>{item.snippet}</p>}<a className="tool-search-url" href={item.url} target="_blank" rel="noreferrer">{host} â†—</a></div></article>;})}{!toolResult.results?.length && <p>No readable results came back. Try a more specific search.</p>}<div className="tool-news-more"><strong>More stories worth knowing</strong><p>Open any headline to read the full report from its publisher.</p><div>{["Politics & government","Fuel prices & cost of living","Security updates","Education & admissions","Football & entertainment"].map(topic=><button type="button" key={topic} onClick={()=>{setToolQuery(topic+" in Nigeria");setToolResult(null);setNotice("Topic added to the search field. Tap Search the web to load these results.");}}>{topic} <span>â†—</span></button>)}</div></div></div> : toolResult.kind === "quiz" && toolResult.quizData ? <div className="cbt-practice" style={{ display: "grid", gap: 16 }}>
                    {!quizFinished ? (() => {
                      const quiz = toolResult.quizData;
                      const question = quiz.questions[quizIndex];
                      const progress = ((quizIndex + 1) / quiz.questions.length) * 100;
                      return <div style={{ display: "grid", gap: 16 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
                          <div><span className="panel-eyebrow">CBT PRACTICE</span><h3 style={{ margin: "6px 0 0" }}>{quiz.title}</h3></div>
                          <span style={{ color: "#9bdcff", fontSize: 13, fontWeight: 700 }}>Question {quizIndex + 1} of {quiz.questions.length}</span>
                        </div>
                        <div style={{ height: 6, borderRadius: 999, background: "rgba(148,163,184,.18)", overflow: "hidden" }}><div style={{ width: progress + "%", height: "100%", borderRadius: 999, background: "linear-gradient(90deg,#36d7ff,#8b7cff)", transition: "width .2s ease" }} /></div>
                        <div style={{ border: "1px solid rgba(125,190,255,.2)", borderRadius: 18, padding: 18, background: "rgba(7,18,36,.5)" }}>
                          <p style={{ color: "#8ccfff", fontSize: 12, fontWeight: 700, letterSpacing: ".12em", margin: "0 0 10px" }}>QUESTION {quizIndex + 1}</p>
                          <h3 style={{ fontSize: 18, lineHeight: 1.55, margin: 0 }}>{question.question}</h3>
                        </div>
                        <div style={{ display: "grid", gap: 10 }}>
                          {question.options.map((option, optionIndex) => <button key={optionIndex} type="button" onClick={() => {
                            if (quizAnswers[quizIndex] !== undefined) return;
                            const updated = [...quizAnswers];
                            updated[quizIndex] = optionIndex;
                            setQuizAnswers(updated);
                            if (quizIndex + 1 >= quiz.questions.length) setQuizFinished(true);
                            else setQuizIndex(quizIndex + 1);
                          }} style={{ display: "flex", alignItems: "center", gap: 12, width: "100%", textAlign: "left", padding: "14px 15px", borderRadius: 14, border: "1px solid rgba(125,190,255,.22)", background: "rgba(12,27,49,.72)", color: "#e9f4ff", cursor: "pointer", fontSize: 14, lineHeight: 1.5 }}>
                            <span style={{ flex: "0 0 30px", width: 30, height: 30, display: "grid", placeItems: "center", borderRadius: 9, background: "rgba(66,190,255,.12)", color: "#9bdcff", fontWeight: 800 }}>{String.fromCharCode(65 + optionIndex)}</span><span>{option}</span>
                          </button>)}
                        </div>
                        <p style={{ margin: 0, color: "#8ea6c1", fontSize: 12 }}>Choose one option to save your answer and move automatically to the next question.</p>
                      </div>;
                    })() : (() => {
                      const quiz = toolResult.quizData;
                      const score = quiz.questions.reduce((total, question, index) => total + (quizAnswers[index] === question.answerIndex ? 1 : 0), 0);
                      return <div style={{ display: "grid", gap: 14 }}>
                        <div style={{ padding: 20, borderRadius: 18, border: "1px solid rgba(91,211,255,.24)", background: "linear-gradient(145deg,rgba(17,45,73,.78),rgba(21,24,52,.78))" }}>
                          <span className="panel-eyebrow">PRACTICE COMPLETE</span><h3 style={{ margin: "8px 0", fontSize: 25 }}>{score} / {quiz.questions.length}</h3><p style={{ margin: 0, color: "#b7c9dd" }}>You scored {Math.round((score / quiz.questions.length) * 100)}%. Review each answer and explanation below.</p>
                        </div>
                        {quiz.questions.map((question, index) => {
                          const chosen = quizAnswers[index];
                          const correct = chosen === question.answerIndex;
                          return <div key={index} style={{ padding: 15, borderRadius: 14, border: "1px solid " + (correct ? "rgba(74,222,128,.25)" : "rgba(251,113,133,.25)"), background: "rgba(7,18,36,.45)", display: "grid", gap: 8 }}>
                            <strong style={{ fontSize: 14 }}>Q{index + 1}. {question.question}</strong>
                            <p style={{ margin: 0, color: correct ? "#86efac" : "#fda4af", fontSize: 13 }}>Your answer: {question.options[chosen] || "Not answered"} {correct ? "â€” Correct" : "â€” Incorrect"}</p>
                            {!correct && <p style={{ margin: 0, color: "#9bdcff", fontSize: 13 }}>Correct answer: {question.options[question.answerIndex]}</p>}
                            {question.explanation && <p style={{ margin: 0, color: "#b7c9dd", fontSize: 13, lineHeight: 1.55 }}>{question.explanation}</p>}
                          </div>;
                        })}
                        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                          <button type="button" className="primary-action" onClick={() => { setQuizIndex(0); setQuizAnswers([]); setQuizFinished(false); }}>Retry this quiz</button>
                          <button type="button" className="outline-action" onClick={() => { setToolResult(null); setQuizIndex(0); setQuizAnswers([]); setQuizFinished(false); }}>Create another quiz</button>
                        </div>
                      </div>;
                    })()}
                  </div> : toolResult.kind === "translate" ? <div className="tool-ai-result"><div className="tool-translation-result-label"><Languages size={15}/> {toolLanguage} translation</div><FormattedMessage content={toolResult.reply}/><div className="tool-result-actions"><button type="button" className="outline-action" onClick={async () => { try { if (!navigator.clipboard?.writeText) throw new Error("Clipboard unavailable"); await navigator.clipboard.writeText(toolResult.reply); setNotice("Result copied."); } catch { setNotice("Copy is unavailable in this browser."); } }}><Copy size={15}/> Copy text</button><button type="button" className="outline-action" onClick={() => speak(toolResult.reply)}><Volume2 size={15}/> Read aloud</button></div></div> : <div className="tool-ai-result"><FormattedMessage content={toolResult.reply}/><button type="button" className="outline-action" onClick={() => speak(toolResult.reply)}><Volume2 size={15}/> Read aloud</button></div>}
                  </div>}
                </div>
                <div className="tool-workspace-foot"><ShieldCheck size={15}/><span>Powered by AURORA's configured AI services. Results may vary with provider availability.</span></div>
              </>}
            </motion.section>
          )}

          {page === "activities" && (
            <motion.section key="activities" className="utility-page aurora-activities-page" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}>
              <p className="panel-eyebrow">YOUR DAY, IN FOCUS</p><h1>Activities<span>.</span></h1><p className="utility-intro">Tasks, notes, reminders, calendar and focus timer â€” all saved inside AURORA on this device.</p>
              <div className="activity-summary-row"><div><Check size={16}/><strong>{tasks.filter((t) => !t.done).length}</strong><span>tasks left</span></div><div><Bell size={16}/><strong>{reminders.filter((r) => !r.done).length}</strong><span>reminders</span></div><div><CalendarDays size={16}/><strong>{events.length}</strong><span>events</span></div></div>
              <div className="activity-tabs" role="tablist" aria-label="Activity tools">
                <button type="button" role="tab" aria-selected={activityTab==="tasks"} className={activityTab==="tasks"?"activity-tab activity-tab-active":"activity-tab"} onClick={()=>setActivityTab("tasks")}><Check size={16}/>Tasks</button>
                <button type="button" role="tab" aria-selected={activityTab==="notes"} className={activityTab==="notes"?"activity-tab activity-tab-active":"activity-tab"} onClick={()=>setActivityTab("notes")}><NotebookPen size={16}/>Notes</button>
                <button type="button" role="tab" aria-selected={activityTab==="reminders"} className={activityTab==="reminders"?"activity-tab activity-tab-active":"activity-tab"} onClick={()=>setActivityTab("reminders")}><Bell size={16}/>Reminders</button>
                <button type="button" role="tab" aria-selected={activityTab==="calendar"} className={activityTab==="calendar"?"activity-tab activity-tab-active":"activity-tab"} onClick={()=>setActivityTab("calendar")}><CalendarClock size={16}/>Calendar</button>
                <button type="button" role="tab" aria-selected={activityTab==="timer"} className={activityTab==="timer"?"activity-tab activity-tab-active":"activity-tab"} onClick={()=>setActivityTab("timer")}><Timer size={16}/>Timer</button>
                <button type="button" role="tab" aria-selected={activityTab==="schedules"} className={activityTab==="schedules"?"activity-tab activity-tab-active":"activity-tab"} onClick={()=>setActivityTab("schedules")}><CalendarDays size={16}/>Schedules</button>
                <button type="button" role="tab" aria-selected={activityTab==="knowledge"} className={activityTab==="knowledge"?"activity-tab activity-tab-active":"activity-tab"} onClick={()=>setActivityTab("knowledge")}><BookOpen size={16}/>Knowledge</button>
                <button type="button" role="tab" aria-selected={activityTab==="predictive"} className={activityTab==="predictive"?"activity-tab activity-tab-active":"activity-tab"} onClick={()=>setActivityTab("predictive")}><Activity size={16}/>Predictive</button>
                <button type="button" role="tab" aria-selected={activityTab==="intelligence"} className={activityTab==="intelligence"?"activity-tab activity-tab-active":"activity-tab"} onClick={()=>setActivityTab("intelligence")}><Sparkles size={16}/>Intelligence</button>
              </div>
              {activityTab === "knowledge" && <KnowledgeUniverseWorkspace/>}
              {activityTab === "predictive" && <PredictiveDashboard tasks={tasks} reminders={reminders} events={events}/> }
              {activityTab === "intelligence" && <IntelligenceEcosystemWorkspace/>}
              {activityTab === "tasks" && <div className="activity-tool-panel"><div className="activity-panel-title"><div><h2>My tasks</h2><p>Small steps, saved on this device.</p></div></div><form className="activity-inline-form" onSubmit={(e)=>{e.preventDefault();if(!taskDraft.trim())return;setTasks((old)=>[{id:Date.now(),title:taskDraft.trim(),done:false},...old]);setTaskDraft("");}}><input value={taskDraft} onChange={e=>setTaskDraft(e.target.value)} placeholder="What do you need to do?"/><button className="primary-action" type="submit"><Plus size={16}/> Add</button></form><div className="activity-record-list">{tasks.length===0?<p className="activity-muted">Your task list is empty. Add your first task above.</p>:tasks.map(task=><div className={"activity-record "+(task.done?"activity-record-done":"")} key={task.id}><button type="button" className="record-check" onClick={()=>setTasks(old=>old.map(t=>t.id===task.id?{...t,done:!t.done}:t))} aria-label="Toggle task">{task.done&&<Check size={14}/>}</button><span className="record-main">{task.title}</span><button type="button" className="record-delete" onClick={()=>setTasks(old=>old.filter(t=>t.id!==task.id))} aria-label="Delete task"><Trash2 size={15}/></button></div>)}</div></div>}
              {activityTab === "notes" && <div className="activity-tool-panel"><div className="activity-panel-title"><div><h2>Notes & ideas</h2><p>Quick thoughts and things to remember.</p></div></div><form className="activity-note-form" onSubmit={e=>{e.preventDefault();if(!noteTitle.trim()&&!noteBody.trim())return;setNotes(old=>[{id:Date.now(),title:noteTitle.trim()||"Untitled note",body:noteBody.trim(),updatedAt:new Date().toISOString()},...old]);setNoteTitle("");setNoteBody("");}}><input value={noteTitle} onChange={e=>setNoteTitle(e.target.value)} placeholder="Note title (optional)"/><textarea value={noteBody} onChange={e=>setNoteBody(e.target.value)} placeholder="Write your note here..." rows={4}/><button className="primary-action" type="submit"><Plus size={16}/> Save note</button></form><div className="activity-note-grid">{notes.map(note=><article className="activity-note-card" key={note.id}><button className="record-delete" type="button" onClick={()=>setNotes(old=>old.filter(n=>n.id!==note.id))} aria-label="Delete note"><Trash2 size={15}/></button><h3>{note.title}</h3><p>{note.body}</p><small>{new Date(note.updatedAt).toLocaleString()}</small></article>)}{notes.length===0&&<p className="activity-muted">Your saved notes will appear here.</p>}</div></div>}
              {activityTab === "reminders" && <div className="activity-tool-panel"><div className="activity-panel-title"><div><h2>Reminders</h2><p>Alerts run while AURORA is open. Browser notifications depend on permission.</p></div></div><form className="activity-note-form" onSubmit={async e=>{e.preventDefault();if(!reminderTitle.trim()||!reminderAt)return;if(new Date(reminderAt).getTime()<=Date.now()){setNotice("Choose a reminder time in the future.");return;}if("Notification" in window && Notification.permission==="default"){try{await Notification.requestPermission();}catch{}}setReminders(old=>[{id:Date.now(),title:reminderTitle.trim(),at:new Date(reminderAt).toISOString(),done:false,notified:false},...old].sort((a,b)=>new Date(a.at)-new Date(b.at)));setReminderTitle("");setReminderAt("");}}><input value={reminderTitle} onChange={e=>setReminderTitle(e.target.value)} placeholder="What should AURORA remind you?"/><label className="activity-date-field"><span>Date and time</span><input type="datetime-local" value={reminderAt} onChange={e=>setReminderAt(e.target.value)} required/></label><button className="primary-action" type="submit"><Bell size={16}/> Set reminder</button></form><div className="activity-record-list">{reminders.map(reminder=><div className={"activity-record "+(reminder.done?"activity-record-done":"")} key={reminder.id}><span className="record-main"><strong>{reminder.title}</strong><small>{new Date(reminder.at).toLocaleString()}</small></span><button type="button" className="record-check" onClick={()=>setReminders(old=>old.map(r=>r.id===reminder.id?{...r,done:!r.done}:r))} aria-label="Mark reminder done">{reminder.done?<Check size={14}/>:null}</button><button type="button" className="record-delete" onClick={()=>setReminders(old=>old.filter(r=>r.id!==reminder.id))} aria-label="Delete reminder"><Trash2 size={15}/></button></div>)}{reminders.length===0&&<p className="activity-muted">No reminders yet.</p>}</div></div>}
              {activityTab === "calendar" && <div className="activity-tool-panel"><div className="activity-panel-title"><div><h2>My calendar</h2><p>Keep upcoming plans together in AURORA.</p></div></div><form className="activity-note-form" onSubmit={e=>{e.preventDefault();if(!eventTitle.trim()||!eventAt)return;if(new Date(eventAt).getTime()<=Date.now()){setNotice("Choose an event time in the future.");return;}setEvents(old=>[{id:Date.now(),title:eventTitle.trim(),at:new Date(eventAt).toISOString()},...old].sort((a,b)=>new Date(a.at)-new Date(b.at)));setEventTitle("");setEventAt("");}}><input value={eventTitle} onChange={e=>setEventTitle(e.target.value)} placeholder="Event name"/><label className="activity-date-field"><span>Date and time</span><input type="datetime-local" value={eventAt} onChange={e=>setEventAt(e.target.value)} required/></label><button className="primary-action" type="submit"><Plus size={16}/> Add event</button></form><div className="activity-record-list">{events.map(event=><div className="activity-record" key={event.id}><span className="record-main"><strong>{event.title}</strong><small>{new Date(event.at).toLocaleString()}</small></span><button type="button" className="record-delete" onClick={()=>setEvents(old=>old.filter(item=>item.id!==event.id))} aria-label="Delete event"><Trash2 size={15}/></button></div>)}{events.length===0&&<p className="activity-muted">No events yet. Add one above.</p>}</div></div>}
              {activityTab === "schedules" && <div className="activity-tool-panel"><div className="activity-panel-title"><div><h2>Custom schedules</h2><p>Temporarily change how AURORA responds, then return to normal automatically.</p></div><span className="coming-pill">{schedules.filter(item => item.status === "active").length} ACTIVE</span></div><form className="activity-note-form" onSubmit={(e)=>{e.preventDefault();if(!scheduleTitle.trim()||!scheduleInstruction.trim()||!scheduleStart||!scheduleEnd)return;const startAt=new Date(scheduleStart);const endAt=new Date(scheduleEnd);if(Number.isNaN(startAt.getTime())||Number.isNaN(endAt.getTime())||startAt.getTime()<=Date.now()||endAt.getTime()<=startAt.getTime()){setNotice("Choose a future start time and an end time after it.");return;}setSchedules(old=>[{id:Date.now(),title:scheduleTitle.trim(),instruction:scheduleInstruction.trim(),startAt:startAt.toISOString(),endAt:endAt.toISOString(),status:"scheduled"},...old].sort((a,b)=>new Date(a.startAt)-new Date(b.startAt)));setScheduleTitle("");setScheduleInstruction("");setScheduleStart("");setScheduleEnd("");setNotice("Custom schedule saved.");}}><label className="timer-label-field"><span>Schedule name</span><input value={scheduleTitle} onChange={e=>setScheduleTitle(e.target.value)} placeholder="e.g. Study focus" maxLength={80} required/></label><label className="timer-label-field"><span>What should AURORA do differently?</span><textarea value={scheduleInstruction} onChange={e=>setScheduleInstruction(e.target.value)} placeholder="e.g. Keep answers focused on chemistry revision, use step-by-step explanations, and avoid unrelated suggestions." maxLength={600} rows={3} required/></label><label className="activity-date-field"><span>Start date and time</span><input type="datetime-local" value={scheduleStart} onChange={e=>setScheduleStart(e.target.value)} required/></label><label className="activity-date-field"><span>End date and time (auto-reset)</span><input type="datetime-local" value={scheduleEnd} onChange={e=>setScheduleEnd(e.target.value)} required/></label><button className="primary-action" type="submit"><CalendarClock size={16}/> Save schedule</button></form><p className="activity-muted">Schedules apply as temporary instructions to AURORA chat responses only. They are saved on this device and evaluated while the app is open or when it is reopened; they cannot control external apps or guarantee background alerts when closed.</p><div className="activity-record-list">{schedules.map(item=><div className="activity-record" key={item.id}><span className="record-main"><strong>{item.title}</strong><small>{new Date(item.startAt).toLocaleString()} â†’ {new Date(item.endAt).toLocaleString()}</small><small>{item.instruction}</small><small className="schedule-status">{item.status==="active"?"â— ACTIVE":item.status==="completed"?"âœ“ COMPLETED":item.status==="cancelled"?"CANCELLED":"â—· SCHEDULED"}</small></span>{item.status!=="completed"&&item.status!=="cancelled"&&<button type="button" className="record-delete" onClick={()=>setSchedules(old=>old.map(schedule=>schedule.id===item.id?{...schedule,status:"cancelled"}:schedule))} aria-label="Cancel schedule"><X size={15}/></button>}</div>)}{schedules.length===0&&<p className="activity-muted">No custom schedules yet. Create one above.</p>}</div></div>}
              {activityTab === "timer" && <div className="activity-tool-panel activity-timer-panel"><div className="activity-panel-title"><div><h2>Focus timer</h2><p>For study sessions, breaks and everyday tasks.</p></div></div><div className="timer-display"><span>{String(Math.floor(timerSecondsLeft/60)).padStart(2,"0")}:{String(timerSecondsLeft%60).padStart(2,"0")}</span><small>{timerRunning?"COUNTDOWN IN PROGRESS":timerSecondsLeft===0?"READY WHEN YOU ARE":"PAUSED"}</small></div><label className="timer-label-field"><span>Timer name</span><input value={timerLabel} onChange={e=>setTimerLabel(e.target.value)} disabled={timerRunning}/></label><label className="timer-label-field"><span>Duration (minutes)</span><input type="number" min="1" max="180" value={timerMinutes} disabled={timerRunning||timerSecondsLeft>0} onChange={e=>setTimerMinutes(e.target.value)}/></label><div className="timer-presets">{[5,10,15,25,45].map(n=><button type="button" key={n} onClick={()=>{setTimerMinutes(String(n));setTimerSecondsLeft(0);setTimerRunning(false);}} disabled={timerRunning}>{n} min</button>)}</div><div className="timer-actions">{timerRunning?<button type="button" className="primary-action" onClick={()=>setTimerRunning(false)}><Pause size={16}/> Pause</button>:timerSecondsLeft>0?<button type="button" className="primary-action" onClick={()=>setTimerRunning(true)}><Play size={16}/> Resume</button>:<button type="button" className="primary-action" onClick={()=>{setTimerSecondsLeft(Math.max(1,Math.min(180,Number(timerMinutes)||10))*60);setTimerRunning(true);}}><Play size={16}/> Start timer</button>}<button type="button" className="outline-action" onClick={()=>{setTimerRunning(false);setTimerSecondsLeft(0);}}>Reset</button></div><p className="activity-muted">Keep AURORA open for the countdown. Background alarms need native Android notification support.</p></div>}
              <div className="utility-orb"><Orb compact/><div><strong>Plan your next step</strong><p>AURORA can help organise your day.</p><button className="outline-action" onClick={()=>sendMessage("Help me plan my day using my saved tasks, reminders and events.")}>Plan with AURORA <ArrowUp size={15}/></button></div></div>
            </motion.section>
          )}

          <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="visually-hidden" onChange={onFileSelected} /><input ref={galleryRef} type="file" accept="image/*" multiple className="visually-hidden" onChange={onFileSelected} /><input ref={fileRef} type="file" accept=".txt,.md,.csv,.json,.pdf,text/plain,text/markdown,text/csv,application/json,application/pdf" className="visually-hidden" onChange={onFileSelected} />
          {page === "admin" && (
            <motion.section key="admin" className="utility-page admin-command-page" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}>
              <div className="admin-hero-head">
                <div><p className="panel-eyebrow"><span className="admin-live-dot" /> AURORA // ROOT ACCESS</p><h1>Command<span> Centre.</span></h1><p className="utility-intro">System intelligence, provider telemetry and controlled app execution.</p></div>
                <div className="admin-orbit-mark"><div className="admin-orbit-ring" /><div className="admin-orbit-core"><Sparkles size={24}/></div></div>
              </div>
              <div className="admin-session-strip"><div className="admin-session-icon"><ShieldCheck size={20}/></div><div><strong>Administrator session verified</strong><small>{authSession?.user?.email || "Verified administrator"} Â· private control channel</small></div><span className="admin-status-chip">{adminLoading ? "CHECKING" : adminError ? "ATTENTION" : "SECURE"}</span></div>
              {adminLoading && <div className="admin-panel"><p>Establishing secure telemetry linkâ€¦</p></div>}
              {adminError && <div className="admin-panel admin-error-panel"><h2>Telemetry link failed</h2><p>{adminError}</p><button className="primary-action" type="button" onClick={() => { setAdminData(null); setPage("home"); setTimeout(() => setPage("admin"), 0); }}>Reconnect <RotateCcw size={15}/></button></div>}
              {adminData && !adminLoading && <>
                {(() => {
                  const providers = Object.entries(adminData.providers || {});
                  const configuredCount = providers.filter(([, configured]) => configured).length;
                  const providerName = (provider) => provider === "openrouter" ? "OpenRouter" : provider === "groq" ? "Groq" : "Gemini";
                  const percent = providers.length ? Math.round(configuredCount / providers.length * 100) : 0;
                  return <>
                    <div className="admin-metric-grid">
                      <div className="admin-metric-card"><span>AI PROVIDERS</span><strong>{configuredCount}<small> / {providers.length}</small></strong><div className="admin-metric-foot"><span className="admin-mini-dot" /> Keys detected</div></div>
                      <div className="admin-metric-card"><span>FALLBACK ROUTES</span><strong>{configuredCount > 1 ? configuredCount - 1 : 0}<small> standby</small></strong><div className="admin-metric-foot">Provider presence only</div></div>
                      <div className="admin-metric-card"><span>AUTH CHANNEL</span><strong className="admin-metric-word">ONLINE</strong><div className="admin-metric-foot"><span className="admin-mini-dot" /> Token verified</div></div>
                    </div>
                    <div className="admin-visual-grid">
                      <div className="admin-panel admin-chart-panel"><div className="admin-panel-head"><div><span className="admin-section-kicker">01 / AVAILABILITY</span><h2>Provider coverage</h2></div><span className="admin-panel-badge">CONFIG</span></div>
                        <div className="admin-donut-row"><div className="admin-donut" style={{ "--coverage": percent + "%" }}><div><strong>{percent}%</strong><small>configured</small></div></div><div className="admin-legend">{providers.map(([provider, configured]) => <div className="admin-legend-row" key={provider}><i className={"admin-legend-dot " + provider} /><span>{providerName(provider)}</span><strong>{configured ? "READY" : "MISSING"}</strong></div>)}</div></div>
                        <p className="admin-chart-note">{providerTests ? "Live status reflects the last test run. A successful test is a point-in-time check, not a quota guarantee." : "This chart reports key presence only. Ask the Executor to test live AI providers for a real connectivity check."}</p>
                      </div>
                      <div className="admin-panel admin-chart-panel"><div className="admin-panel-head"><div><span className="admin-section-kicker">02 / ROUTING</span><h2>Provider matrix</h2></div><Activity size={17}/></div>
                        <div className="admin-bars">{providers.map(([provider, configured], index) => { const test = providerTests?.[provider]; const healthy = test?.status === "online"; const label = test ? (test.status === "online" ? "Live Â· " + test.latencyMs + " ms" : test.status === "missing" ? "Key missing" : "Test failed") : (configured ? "Configured Â· not tested" : "Unavailable"); const width = test ? (healthy ? "100%" : test.status === "missing" ? "5%" : "38%") : (configured ? "72%" : "5%"); return <div className="admin-bar-row" key={provider}><div><span>{providerName(provider)}</span><strong className={test && !healthy ? "admin-test-warning" : ""}>{label}</strong></div><div className="admin-bar-track"><span className={healthy || (!test && configured) ? "is-configured" : ""} style={{ width, animationDelay: (index * 100) + "ms" }} /></div></div>; })}</div>
                        <div className="admin-route-flow"><span>REQUEST</span><i>â†’</i><span>PRIMARY AI</span><i>â†’</i><span>FALLBACK</span></div>
                      </div>
                    </div>
                    <div className="admin-panel"><div className="admin-panel-head"><div><span className="admin-section-kicker">03 / LIVE CONFIGURATION</span><h2>System services</h2></div><button className="admin-refresh-button" type="button" onClick={() => { setAdminData(null); setPage("home"); setTimeout(() => setPage("admin"), 0); }}><RotateCcw size={14}/> Refresh</button></div>
                      <div className="admin-service-list"><div className="admin-service-row"><div className="admin-service-icon"><ShieldCheck size={17}/></div><div><strong>Supabase authentication</strong><small>Server verified the current access token</small></div><span className="admin-status-chip">SECURE</span></div>
                      {providers.map(([provider, configured]) => <div className="admin-service-row" key={provider}><div className="admin-service-icon"><Activity size={17}/></div><div><strong>{providerName(provider)}</strong><small>{configured ? "Server credential detected" : "Credential not detected"}</small></div><span className={"admin-status-chip " + (configured ? "" : "is-warning")}>{configured ? "CONFIGURED" : "MISSING"}</span></div>)}</div>
                    </div>
                  </>;
                })()}
                <div className="admin-panel admin-executor-panel"><div className="admin-panel-head"><div><span className="admin-section-kicker">04 / NATURAL-LANGUAGE CONTROL</span><h2><Sparkles size={20}/> AI Executor</h2><p>Describe a task. AURORA can run live provider checks, refresh diagnostics, open app workspaces, or prepare a plan for actions not yet connected.</p></div><span className="admin-executor-pulse">EXECUTOR READY</span></div>
                  <div className="admin-executor-log" aria-live="polite">{executorLog.slice(-5).map((entry, index) => <div className={"admin-executor-entry " + entry.role} key={index}><span>{entry.role === "user" ? "YOU" : entry.role === "system" ? "SYSTEM" : "AURORA"}</span><FormattedMessage content={entry.text} onChoice={(choice) => setExecutorPrompt(choice)} /></div>)}</div>
                  <form className="admin-executor-form" onSubmit={async (event) => {
                    event.preventDefault();
                    const prompt = executorPrompt.trim();
                    if (!prompt || executorBusy) return;
                    setExecutorLog((items) => [...items, { role: "user", text: prompt }]);
                    setExecutorPrompt("");
                    setExecutorBusy(true);
                    const command = prompt.toLowerCase();
                    try {
                      if (/(test|probe|ping|check).*(live|all|provider|ai|model)|^(test providers|test ai providers|live provider test|live ai health|check live ai)$/i.test(command)) {
                        const response = await fetch(auroraApiUrl("/api/admin-execute"), {
                          method: "POST",
                          headers: { "Content-Type": "application/json", Authorization: "Bearer " + (authSession?.access_token || "") },
                          body: JSON.stringify({ action: "test_providers" })
                        });
                        const data = await response.json().catch(() => ({}));
                        if (!response.ok) throw new Error(data.error || "Live provider test could not complete.");
                        setProviderTests(data.providers || {});
                        const label = (name) => name === "openrouter" ? "OpenRouter" : name === "groq" ? "Groq" : "Gemini";
                        const report = Object.entries(data.providers || {}).map(([name, result]) => "- **" + label(name) + ":** " + String(result.status || "unknown").replace(/_/g, " ").toUpperCase() + (Number.isFinite(result.latencyMs) ? " Â· " + result.latencyMs + " ms" : "") + (result.message ? " â€” " + result.message : "")).join("\n");
                        setExecutorLog((items) => [...items, { role: "assistant", text: "## Live Provider Test\n\n**Status:** Completed\n\n### Results\n" + (report || "- No provider results were returned.") + "\n\n### Note\nThis test sent a tiny request to configured providers and may use a small amount of API quota." }]);
                      } else if (/(run|start|check|refresh|inspect|diagnos).*(diagnostic|system|provider|status|health)|^(diagnostics|provider status|system status|check ai)$/i.test(command)) {
                        const response = await fetch(auroraApiUrl("/api/admin"), { headers: { Authorization: "Bearer " + (authSession?.access_token || "") }, cache: "no-store" });
                        const data = await response.json().catch(() => ({}));
                        if (!response.ok) throw new Error(data.error || "Diagnostics could not complete.");
                        setAdminData(data);
                        const label = (name) => name === "openrouter" ? "OpenRouter" : name === "groq" ? "Groq" : "Gemini";
                        const ready = Object.entries(data.providers || {}).filter(([, value]) => value).map(([name]) => label(name));
                        setExecutorLog((items) => [...items, { role: "assistant", text: "## System Diagnostics\n\n**Status:** Completed\n\n### Provider Configuration\n" + (ready.length ? ready.map((name) => "- **" + name + ":** Configured").join("\n") : "- No provider keys detected.") + "\n\n### What this means\nThis checks whether server credentials are configured. It does not send a live request to the AI models." }]);
                      } else if (/(open|launch|go to|navigate to).*(tools|tool workspace|home|dashboard|activities|activity|profile|settings|chat|assistant|schedules|schedule workspace|custom schedule)/i.test(command)) {
                        const target = /tools|tool workspace/i.test(command) ? "tools"
                          : /schedules|schedule workspace|custom schedule/i.test(command) ? "schedules"
                          : /activities|activity/i.test(command) ? "activities"
                          : /profile|settings/i.test(command) ? "profile"
                          : /chat|assistant/i.test(command) ? "chat" : "home";
                        const targetLabel = { tools: "Tools workspace", schedules: "Custom schedules", activities: "Activities", profile: "Profile and settings", chat: "Chat", home: "Home dashboard" }[target];
                        setExecutorLog((items) => [...items, { role: "assistant", text: "Executing command: opening " + targetLabel + "." }]);
                        if (target === "schedules") { setActivityTab("schedules"); navigate("activities"); }
                        else navigate(target);
                      } else if (/(change|edit|modify|redesign|restyle|update|add|remove|build|implement|fix|create|make|improve).*(code|ui|layout|theme|color|orb|page|component|feature|button|style|design|bug|app|screen|dashboard|font|spacing|animation|header|footer)|^(change|edit|redesign|restyle|fix|build|implement|create)\b/i.test(command)) {
                        const response = await fetch(auroraApiUrl("/api/admin-code"), {
                          method: "POST",
                          headers: { "Content-Type": "application/json", Authorization: "Bearer " + (authSession?.access_token || "") },
                          body: JSON.stringify({ action: "edit_code", prompt })
                        });
                        const responseText = await response.text();
                        let data = {};
                        try { data = responseText ? JSON.parse(responseText) : {}; } catch {}
                        if (!response.ok) {
                          const detail = data.error || (responseText && !responseText.trim().startsWith("<") ? responseText.slice(0, 220) : "");
                          throw new Error((detail || "Server returned a non-JSON error response.") + " (HTTP " + response.status + ")");
                        }
                        const fileList = (data.filesChanged || []).map((path) => "- " + path).join("\n");
                        setExecutorLog((items) => [...items, { role: "assistant", text: "## Code Change Prepared\n\n**Status:** Review required\n\n### Summary\n" + (data.summary || "AURORA code changes prepared.") + "\n\n### Files changed\n" + (fileList || "- No file list returned.") + "\n\n### Pull request\n" + (data.pullRequest?.url ? "[" + (data.pullRequest.title || "Review code changes") + "](" + data.pullRequest.url + ")" : "Pull request link was not returned.") + "\n\n**Next step:** Review and merge the pull request before expecting the live app to change.\n\n" + (Array.isArray(data.checks) && data.checks.length ? "### Validation notes\n" + data.checks.map((item) => "- " + item).join("\n") : "") }]);
                      } else {
                        const response = await fetch(auroraApiUrl("/api/chat"), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ messages: [{ role: "user", content: "You are AURORA's administrator-side AI Executor. The administrator asked: " + prompt + "\n\nRespond in polished, concise Markdown with a clear ## heading, short sections, bullets, and a clear status label such as **Completed**, **Plan**, or **Needs setup**. Start by answering the administrator directly. You may only claim a task was executed if the app has a direct supported action for it. Supported direct actions in this console are: live AI provider tests, refresh provider configuration diagnostics, and navigate to app workspaces. For all other requests, clearly label your answer as a proposed plan and explain which app integration or explicit confirmation is needed. Never claim to change app data, secrets, deployments, users, schedules, or settings without an actual tool that did so. Do not ask for or reveal API keys." }] }) });
                        const data = await response.json().catch(() => ({}));
                        if (!response.ok) throw new Error(data.error || "The AI executor could not reach the AI service.");
                        setExecutorLog((items) => [...items, { role: "assistant", text: data.reply || "I couldn't produce an execution plan." }]);
                      }
                    } catch (error) {
                      setExecutorLog((items) => [...items, { role: "assistant", text: "Execution stopped: " + (error.message || "Unknown error") }]);
                    } finally { setExecutorBusy(false); }
                  }}>
                    <input value={executorPrompt} onChange={(event) => setExecutorPrompt(event.target.value)} placeholder="Try: run system diagnostics or open tools workspaceâ€¦" aria-label="AI Executor command" maxLength={1200} />
                    <button type="submit" disabled={executorBusy || !executorPrompt.trim()}>{executorBusy ? <RotateCcw size={17} className="admin-spinning"/> : <ArrowUpRight size={17}/>}<span>{executorBusy ? "Working" : "Execute"}</span></button>
                  </form>
                  <div className="admin-executor-foot"><span><LockKeyhole size={13}/> Admin session required</span><span>Only verified actions are executed</span></div>
                </div>
              </>}
              <button className="outline-action" type="button" onClick={() => navigate("home")}><ArrowLeft size={16}/> Back to AURORA</button>
            </motion.section>
          )}

          {page === "library" && (
            <motion.section key="library" className="utility-page aurora-library-page" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}>
              <div className="library-page-heading"><p className="panel-eyebrow"><BookOpen size={14}/> YOUR PERSONAL KNOWLEDGE</p><h1>Library<span>.</span></h1><p className="utility-intro">Keep your notes, documents, saved sources and useful knowledge together.</p></div>
              <KnowledgeUniverseWorkspace />
            </motion.section>
          )}
          {page === "maps" && <motion.div key="maps" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}><MapsWorkspace /></motion.div>}

          {page === "profile" && (
            <motion.section key="profile" className="utility-page profile-page" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}>
              <p className="panel-eyebrow">MADE TO WORK WITH YOU</p><h1>Your space<span>.</span></h1><p className="utility-intro">Your AURORA experience will grow around your preferences.</p>
              <button type="button" className="pulse-launch-card" onClick={() => setPulseOpen(true)}><span className="pulse-launch-orb" /><span className="pulse-launch-copy"><strong>Open AURORA Pulse</strong><small>Your in-app AI assistant panel</small></span><span className="pulse-launch-arrow">â†—</span></button>

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
                  <label className="profile-field profile-field-wide"><span>How should AURORA communicate?</span><select value={profile.assistantStyle} onChange={(e) => setProfile((p) => ({ ...p, assistantStyle: e.target.value }))}><option value="warm">Friendly â€” warm and encouraging</option><option value="strict">Strict â€” firm and focused</option><option value="concise">Short and direct</option><option value="teacher">Teacher â€” detailed step-by-step</option><option value="calm">Calm and structured</option></select></label>
                </div>
                <div className="profile-form-actions"><span role="status">{profileSaved ? "Preferences saved âœ“" : "Changes save automatically on this device."}</span><button className="primary-action" type="submit">Save preferences <Check size={16} /></button></div>
              </form>
              <section id="aurora-native-assistant" aria-label="Hey AURORA native assistant" className="profile-card" style={{ marginTop: 18, display: "block", scrollMarginTop: 24 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                  <div><p className="panel-eyebrow">NATIVE ANDROID ASSISTANT</p><h2 style={{ margin: "4px 0" }}>Hey AURORA</h2><p style={{ margin: 0, color: "#9fb3ca", fontSize: 13 }}>{nativeStatus?.backgroundServiceFoundation ? "Native assistant foundation detected." : "Background voice service and app launching."}</p></div>
                  <button type="button" className="outline-action" onClick={toggleNativeAssistant} disabled={nativeBusy || !AuroraNative.isAndroid()}>{nativeBusy ? "Startingâ€¦" : nativeServiceOn ? "Stop service" : "Start Hey AURORA"}</button>
                  {!AuroraNative.isAndroid() && <button type="button" className="outline-action" onClick={toggleBrowserWakeWord}>{browserWakeListening ? "Stop laptop listening" : "Enable Hey AURORA on laptop"}</button>}
                </div>
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 12 }}>
                  <button type="button" className="outline-action" onClick={() => openNativeApp("com.whatsapp")} disabled={!AuroraNative.isAndroid()}>Open WhatsApp <ArrowUpRight size={15}/></button>
                  {nativeNotice && <span role="status" style={{ color: "#a9bdd2", fontSize: 13 }}>{nativeNotice}</span>}
                </div>
              </section>
              <section className="profile-card" style={{ marginTop: 14, display: "block" }}>
                <p className="panel-eyebrow">ANDROID ACCESSIBILITY</p>
                <h2 style={{ margin: "4px 0 8px" }}>Screen Reading</h2>
                <p style={{ color: "#9fb3ca", fontSize: 13, lineHeight: 1.6, margin: "0 0 12px" }}>To let AURORA read text from another app, enable â€œAURORA Screen Assistantâ€ in Android Accessibility settings. Return here and tap Read Screen again. AURORA only sends captured text to AI when you choose to ask about it.</p>
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                  <button type="button" className="outline-action" onClick={readCurrentAndroidScreen} disabled={screenReadBusy}>{screenReadBusy ? "Reading screenâ€¦" : "Read current screen"} <Eye size={15}/></button>
                  <button type="button" className="outline-action" onClick={() => AuroraNative.openAccessibilitySettings().catch((error) => setScreenReadMessage(error?.message || "Could not open Accessibility settings."))} disabled={!AuroraNative.isAndroid()}>Accessibility settings <ArrowUpRight size={15}/></button>
                </div>
                {screenReadMessage && <p role="status" style={{ color: "#b9d9ec", fontSize: 12, lineHeight: 1.6, margin: "12px 0 0" }}>{screenReadMessage}</p>}
                {screenReadText && <><textarea aria-label="Captured screen text" readOnly value={screenReadText} rows={5} style={{ width: "100%", marginTop: 10, resize: "vertical" }}/><button type="button" className="primary-action" style={{ marginTop: 10 }} onClick={() => { setPage("chat"); sendMessage("Please read and explain the text captured from my current Android screen. Clearly summarise what it says and help me with it.\n\nSCREEN TEXT:\n" + screenReadText); }}>Ask AURORA about this screen <ArrowUpRight size={16}/></button></>}
              </section>
              <button className="primary-action profile-chat-action" onClick={() => navigate("chat")}>Talk to AURORA <ArrowUp size={16} /></button>
            </motion.section>
          )}
        </AnimatePresence>
      </main>

      {typeof document !== "undefined" && createPortal(
        <AnimatePresence>
          {(pulseOpen || page === "pulse") && (
            <motion.div className="aurora-pulse-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} aria-label="AURORA Pulse">
              <motion.section ref={pulsePanelRef} tabIndex={-1} className="aurora-pulse-panel" aria-label="AURORA Pulse assistant" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 12 }}>
                <style>{`
                  .aurora-pulse-backdrop{position:fixed!important;inset:0!important;z-index:9999!important;display:block!important;padding:0!important;background:transparent!important;backdrop-filter:none!important;-webkit-backdrop-filter:none!important;pointer-events:none!important}
                  .aurora-pulse-panel{position:fixed!important;inset:0!important;width:100%!important;height:100%!important;max-width:none!important;max-height:none!important;min-height:0!important;margin:0!important;padding:0!important;display:block!important;overflow:visible!important;border:0!important;border-radius:0!important;background:transparent!important;box-shadow:none!important;color:#f5f7ff!important;pointer-events:none!important;isolation:isolate}
                  .aurora-pulse-panel:before{content:"";position:fixed;inset:5px;border-radius:22px;pointer-events:none;border:1px solid transparent;background:linear-gradient(120deg,#ff5bc8,#55dcff,#b38aff,#ffe18a,#69efc2,#ff5bc8) border-box;mask:linear-gradient(#000 0 0) padding-box,linear-gradient(#000 0 0);mask-composite:exclude;opacity:.34;animation:auroraPulseFrame 12s linear infinite}
                  .aurora-pulse-head{position:fixed!important;top:12px!important;left:50%!important;transform:translateX(-50%)!important;width:min(520px,calc(100vw - 24px))!important;height:76px!important;display:flex!important;align-items:center!important;justify-content:center!important;pointer-events:none!important;z-index:10002!important}
                  .aurora-pulse-head .aurora-pulse-orb{position:relative!important;inset:auto!important;transform:none!important;width:68px!important;height:68px!important;flex:0 0 68px!important;border-radius:50%!important;background:radial-gradient(circle at 30% 22%,#fff 0,#b9f8ff 12%,#5bdcff 28%,#7c67ff 54%,#ec70e8 76%,#ffe5a5 100%)!important;box-shadow:0 0 16px #71eaffaa,0 0 38px #a47bff88,0 0 70px #ff6bc955!important;pointer-events:none!important;animation:auroraPulseOrb 4.4s ease-in-out infinite!important}
                  .aurora-pulse-head .aurora-pulse-brand{display:none!important}
                  .aurora-pulse-tools-toggle,.aurora-pulse-close{position:absolute!important;top:16px!important;width:40px!important;height:40px!important;display:grid!important;place-items:center!important;border:1px solid rgba(255,255,255,.16)!important;border-radius:14px!important;background:rgba(15,19,31,.22)!important;color:#fff!important;backdrop-filter:blur(14px)!important;-webkit-backdrop-filter:blur(14px)!important;pointer-events:auto!important;cursor:pointer!important}
                  .aurora-pulse-tools-toggle{left:0!important}.aurora-pulse-close{right:0!important;font-size:22px!important}
                  .aurora-pulse-conversation{position:fixed!important;top:112px!important;left:50%!important;width:min(540px,calc(100vw - 28px))!important;max-height:calc(100dvh - 132px)!important;display:flex!important;flex-direction:column!important;align-items:stretch!important;gap:14px!important;padding:0!important;border:0!important;border-radius:0!important;background:transparent!important;backdrop-filter:none!important;-webkit-backdrop-filter:none!important;box-shadow:none!important;pointer-events:auto!important;overflow:visible!important;will-change:transform}
                  .aurora-pulse-conversation:before{display:none!important}
                  .aurora-pulse-drag-handle{position:relative;z-index:1;display:flex!important;align-items:center!important;justify-content:center!important;gap:8px!important;width:100%!important;height:22px!important;border:0!important;background:transparent!important;color:rgba(255,255,255,.46)!important;font-size:10px!important;letter-spacing:.18em!important;cursor:grab!important;touch-action:none!important}
                  .aurora-pulse-drag-handle:active{cursor:grabbing!important}
                  .aurora-pulse-tools-grid{display:grid!important;grid-template-columns:repeat(3,minmax(0,1fr))!important;gap:8px!important;max-height:220px!important;overflow:auto!important}
                  .aurora-pulse-tool-card{min-height:68px!important;display:flex!important;flex-direction:column!important;align-items:flex-start!important;justify-content:center!important;gap:7px!important;padding:10px!important;border:1px solid rgba(255,255,255,.12)!important;border-radius:14px!important;background:rgba(255,255,255,.055)!important;color:#f4f7ff!important;text-align:left!important;font-size:11px!important;cursor:pointer!important;box-shadow:inset 0 0 14px rgba(255,255,255,.025),0 0 14px rgba(124,168,255,.07)!important}
                  .aurora-pulse-tool-card svg{color:#9ceaff!important}
                  .aurora-pulse-chat{position:relative!important;display:flex!important;flex:1 1 auto!important;flex-direction:column!important;gap:11px!important;min-height:110px!important;max-height:min(52dvh,460px)!important;overflow:auto!important;padding:16px!important;border:1px solid rgba(255,255,255,.13)!important;border-radius:22px!important;background:linear-gradient(145deg,rgba(22,25,40,.42),rgba(11,14,27,.34))!important;backdrop-filter:blur(18px) saturate(125%)!important;-webkit-backdrop-filter:blur(18px) saturate(125%)!important;box-shadow:0 16px 44px rgba(0,0,0,.12),inset 0 1px rgba(255,255,255,.08)!important;overscroll-behavior:contain}
                  .aurora-pulse-message{position:relative!important;max-width:92%!important;padding:10px 13px!important;border:1px solid transparent!important;border-radius:15px!important;background:rgba(255,255,255,.065)!important;color:rgba(255,255,255,.94)!important;font-size:13px!important;line-height:1.55!important;white-space:pre-wrap!important;overflow-wrap:anywhere!important}
                  .aurora-pulse-message:after{content:"";position:absolute;inset:0;border-radius:inherit;padding:1px;background:linear-gradient(125deg,rgba(255,99,204,.44),rgba(93,223,255,.36),rgba(173,130,255,.4));-webkit-mask:linear-gradient(#000 0 0) content-box,linear-gradient(#000 0 0);-webkit-mask-composite:xor;mask-composite:exclude;pointer-events:none}
                  .aurora-pulse-message.user{align-self:flex-end;background:rgba(74,132,177,.13)!important}
                  .aurora-pulse-message.assistant{align-self:flex-start}
                  .aurora-pulse-message.pending{color:#b9eaff!important}
                  .aurora-pulse-letter{display:inline;opacity:0;animation:auroraPulseLetter .12s ease forwards}
                  .aurora-pulse-composer{position:relative!important;inset:auto!important;display:flex!important;align-items:center!important;gap:8px!important;width:100%!important;flex:0 0 auto!important;margin:0!important;padding:9px 11px!important;border:1px solid rgba(255,255,255,.17)!important;border-radius:20px!important;background:linear-gradient(135deg,rgba(30,31,48,.52),rgba(13,17,31,.42))!important;backdrop-filter:blur(20px) saturate(130%)!important;-webkit-backdrop-filter:blur(20px) saturate(130%)!important;box-shadow:0 14px 36px rgba(0,0,0,.13),inset 0 1px rgba(255,255,255,.09)!important}
                  .aurora-pulse-composer input{flex:1!important;min-width:0!important;border:0!important;outline:0!important;background:transparent!important;color:#fff!important;padding:10px 8px!important;font-size:13px!important}
                  .aurora-pulse-composer input::placeholder{color:rgba(255,255,255,.48)!important}
                  .aurora-pulse-mic{width:38px!important;min-width:38px!important;height:38px!important;border:1px solid rgba(255,255,255,.12)!important;border-radius:12px!important;background:rgba(255,255,255,.06)!important;color:#9ceaff!important}
                  .aurora-pulse-send{width:38px!important;height:38px!important;border:0!important;border-radius:12px!important;background:linear-gradient(135deg,#50cce8,#8d72f3)!important;color:#fff!important}
                  .aurora-pulse-empty{padding:20px 10px!important;text-align:center!important;color:rgba(255,255,255,.48)!important;font-size:12px!important;line-height:1.6!important}
                  @keyframes auroraPulseOrb{0%,100%{filter:hue-rotate(0deg);transform:scale(1)}50%{filter:hue-rotate(32deg);transform:scale(1.07)}}
                  @keyframes auroraPulseFrame{to{filter:hue-rotate(360deg)}}
                  @keyframes auroraPulseLetter{to{opacity:1}}
                  @media(max-width:480px){.aurora-pulse-head{top:8px!important;height:68px!important}.aurora-pulse-head .aurora-pulse-orb{width:60px!important;height:60px!important;flex-basis:60px!important}.aurora-pulse-conversation{top:94px!important;width:calc(100vw - 20px)!important;max-height:calc(100dvh - 112px)!important;gap:12px!important}.aurora-pulse-chat{max-height:48dvh!important;padding:13px!important}.aurora-pulse-tools-grid{grid-template-columns:repeat(2,minmax(0,1fr))!important}.aurora-pulse-panel:before{inset:3px}}
                  @media(prefers-reduced-motion:reduce){.aurora-pulse-panel:before,.aurora-pulse-head .aurora-pulse-orb,.aurora-pulse-letter{animation:none!important;opacity:1!important}}
                `}</style>
                <header className="aurora-pulse-head">
                  <button type="button" className="aurora-pulse-tools-toggle" onClick={() => setPulseToolsOpen(value => !value)} aria-expanded={pulseToolsOpen} aria-label={pulseToolsOpen ? "Hide AURORA tools" : "Show AURORA tools"}><Sparkles size={19}/></button>
                  <span className={"aurora-pulse-orb" + (pulseListening ? " is-listening" : pulseBusy ? " is-thinking" : speaking ? " is-speaking" : "")} role="img" aria-label={pulseListening ? "AURORA is listening" : pulseBusy ? "AURORA is thinking" : speaking ? "AURORA is speaking" : "AURORA is ready"} />
                  <button type="button" className="aurora-pulse-close" aria-label="Close AURORA Pulse" onClick={() => { setPulseOpen(false); setPulseToolsOpen(false); setPulseConversationPosition({ x: 0, y: 0 }); if (page === "pulse") setPage("home"); }}>×</button>
                </header>
                <section className="aurora-pulse-conversation" style={{ transform: "translate(calc(-50% + " + pulseConversationPosition.x + "px), " + pulseConversationPosition.y + "px)" }} onPointerMove={event => {
                  const drag = pulseDragRef.current;
                  if (!drag || drag.pointerId !== event.pointerId) return;
                  const deltaX = event.clientX - drag.startX;
                  const deltaY = event.clientY - drag.startY;
                  const minX = 10 - drag.bounds.left;
                  const maxX = window.innerWidth - 10 - drag.bounds.right;
                  const minY = 10 - drag.bounds.top;
                  const maxY = window.innerHeight - 10 - drag.bounds.bottom;
                  const clamp = (value, min, max) => Math.min(Math.max(value, min), max);
                  const nextX = drag.originX + clamp(deltaX, minX, maxX);
                  const nextY = drag.originY + clamp(deltaY, minY, maxY);
                  drag.nextX = nextX;
                  drag.nextY = nextY;
                  event.currentTarget.style.transform = "translate(calc(-50% + " + nextX + "px), " + nextY + "px)";
                }} onPointerUp={event => {
                  const drag = pulseDragRef.current;
                  if (drag?.pointerId === event.pointerId) {
                    setPulseConversationPosition({ x: drag.nextX ?? drag.originX, y: drag.nextY ?? drag.originY });
                    pulseDragRef.current = null;
                  }
                }} onPointerCancel={() => { pulseDragRef.current = null; }} onLostPointerCapture={() => { pulseDragRef.current = null; }}>
                  <button type="button" className="aurora-pulse-drag-handle" aria-label="Move chat panel" onPointerDown={event => {
                     const bounds = pulsePanelRef.current?.querySelector(".aurora-pulse-conversation")?.getBoundingClientRect();
                     if (!bounds) return;
                     pulseDragRef.current = { pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, originX: pulseConversationPosition.x, originY: pulseConversationPosition.y, nextX: pulseConversationPosition.x, nextY: pulseConversationPosition.y, bounds };
                     event.currentTarget.setPointerCapture(event.pointerId);
                   }}>••• <span>DRAG CHAT PANEL</span> •••</button>
                  {pulseToolsOpen && <div className="aurora-pulse-tools-grid">
                    <button type="button" className="aurora-pulse-tool-card" onClick={() => { setPulseToolsOpen(false); setPulseOpen(false); openTool("search"); }}><Sparkles size={19}/> Web search</button>
                    <button type="button" className="aurora-pulse-tool-card" onClick={() => { setPulseToolsOpen(false); setPulseOpen(false); openTool("calculator"); }}><Calculator size={19}/> Calculator</button>
                    <button type="button" className="aurora-pulse-tool-card" onClick={() => { setPulseToolsOpen(false); setPulseOpen(false); openTool("study"); }}><GraduationCap size={19}/> Study</button>
                    <button type="button" className="aurora-pulse-tool-card" onClick={() => { setPulseToolsOpen(false); setPulseOpen(false); openTool("writing"); }}><NotebookPen size={19}/> Writing</button>
                    <button type="button" className="aurora-pulse-tool-card" onClick={() => { setPulseToolsOpen(false); setPulseOpen(false); openAttachment("camera"); }}><Camera size={19}/> Camera</button>
                    <button type="button" className="aurora-pulse-tool-card" onClick={() => { setPulseToolsOpen(false); setPulseOpen(false); navigate("tools"); }}><MoreHorizontal size={19}/> More tools</button>
                  </div>}
                  <div className="aurora-pulse-chat" aria-live="polite" aria-relevant="additions text">
                    {pulseMessages.length === 0 && <div className="aurora-pulse-empty">Your AURORA conversation starts here.<br/>Ask anything or use the microphone.</div>}
                    {pulseMessages.map((message, index) => <div key={message.id || index} className={"aurora-pulse-message " + message.role + (message.pending ? " pending" : "")}>{message.role === "assistant" && !message.pending ? Array.from(String(message.content || "")).map((character, charIndex) => <span key={charIndex} className="aurora-pulse-letter" style={{ animationDelay: Math.min(charIndex * 0.012, 1.6) + "s" }}>{character}</span>) : message.content}</div>)}
                  </div>
                  <form className="aurora-pulse-composer" onSubmit={async event => { event.preventDefault(); await sendPulseMessage(pulseDraft); }}>
                    <input value={pulseDraft} onChange={event => setPulseDraft(event.target.value)} placeholder="Message AURORA…" aria-label="Message AURORA Pulse" />
                    <button className={"aurora-pulse-mic" + (pulseListening ? " is-listening" : "")} type="button" onClick={togglePulseMic} aria-label={pulseListening ? "Stop listening" : "Speak to AURORA Pulse"} disabled={pulseBusy}><Mic size={18}/></button>
                    <button className="aurora-pulse-send" type="submit" aria-label="Send message" disabled={pulseBusy || !pulseDraft.trim()}>↑</button>
                  </form>
                </section>
              </motion.section>
            </motion.div>
          )}
        </AnimatePresence>,
        document.body
      )}

      {typeof document !== "undefined" && createPortal(
        <AnimatePresence>
          {pendingApprovals.length > 0 && (
            <motion.div className="aurora-menu-backdrop" role="presentation" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} style={{ zIndex: 10020 }}>
              <motion.section role="dialog" aria-modal="true" aria-label="Approve AURORA action" initial={{ opacity: 0, y: 14, scale: .98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 8 }} style={{ width: "min(440px, calc(100vw - 32px))", padding: 22, borderRadius: 22, background: "rgba(12,18,32,.97)", border: "1px solid rgba(130,180,255,.22)", color: "#f4f7ff", boxShadow: "0 24px 80px rgba(0,0,0,.5)" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}><span style={{ width: 38, height: 38, display: "grid", placeItems: "center", borderRadius: 13, background: "rgba(255,190,90,.12)", color: "#ffd18a" }}><ShieldCheck size={19}/></span><div><strong style={{ display: "block" }}>AURORA needs your approval</strong><small style={{ color: "#9eabc2" }}>Nothing happens until you choose</small></div></div>
                <h3 style={{ margin: "0 0 8px", fontSize: 18 }}>{pendingApprovals[0].label}</h3>
                <p style={{ margin: "0 0 12px", color: "#c1cada", lineHeight: 1.55 }}>{pendingApprovals[0].description || "A capability wants to perform an action."}</p>
                <div style={{ padding: 12, borderRadius: 12, background: "rgba(255,255,255,.045)", color: "#aebbd0", fontSize: 12, overflowWrap: "anywhere" }}>Risk: {String(pendingApprovals[0].risk || "unknown").toUpperCase()} · Capability: {pendingApprovals[0].capabilityId}</div>
                <div style={{ display: "flex", gap: 10, marginTop: 18 }}>
                  <button type="button" onClick={() => auroraRuntime.approvals.reject(pendingApprovals[0].id, "Declined by the user.")} style={{ flex: 1, padding: "12px 14px", borderRadius: 12, border: "1px solid rgba(255,255,255,.16)", background: "transparent", color: "#e5eaf4", fontWeight: 650 }}>Not now</button>
                  <button type="button" onClick={() => auroraRuntime.approvals.approve(pendingApprovals[0].id)} style={{ flex: 1, padding: "12px 14px", borderRadius: 12, border: 0, background: "linear-gradient(110deg,#5bd8ed,#8d9cff)", color: "#07111d", fontWeight: 750 }}>Approve action</button>
                </div>
              </motion.section>
            </motion.div>
          )}
        </AnimatePresence>,
        document.body
      )}

      {typeof document !== "undefined" && createPortal(
      <AnimatePresence>
        {attachmentOpen && (
          <motion.div className="aurora-menu-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setAttachmentOpen(false)}>
            <motion.div className="aurora-attachment-menu" role="dialog" aria-modal="true" aria-label="AURORA attachments" initial={{ opacity: 0, y: 12, scale: .97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 8, scale: .98 }} onClick={(event) => event.stopPropagation()}>
              <div className="aurora-menu-heading"><span className="aurora-menu-mark"><Plus size={17} /></span><div><strong>AURORA tools</strong><small>Choose what you want to add</small></div><button type="button" onClick={() => setAttachmentOpen(false)} aria-label="Close attachment menu"><X size={17} /></button></div>
              <button type="button" className="aurora-tool-option aurora-tool-hub-option" onClick={() => { setAttachmentOpen(false); navigate("tools"); }}><span className="aurora-tool-icon"><Sparkles size={21} /></span><span><strong>Open Tools Workspace</strong><small>Dedicated interfaces for every tool</small></span><ChevronRight size={16} /></button>
              <button type="button" className="aurora-tool-option" onClick={() => openAttachment("camera")}><span className="aurora-tool-icon"><Camera size={21} /></span><span><strong>Camera</strong><small>Take a new photo</small></span><ChevronRight size={16} /></button>
              <button type="button" className="aurora-tool-option" onClick={() => openAttachment("gallery")}><span className="aurora-tool-icon"><ImageIcon size={21} /></span><span><strong>Gallery</strong><small>Choose photos from your device</small></span><ChevronRight size={16} /></button>
              <button type="button" className="aurora-tool-option" onClick={() => openAttachment("files")}><span className="aurora-tool-icon"><Paperclip size={21} /></span><span><strong>Files</strong><small>Add a supported document</small></span><ChevronRight size={16} /></button>
              <button type="button" className="aurora-tool-option aurora-tuner-option" onClick={() => openAttachment("tuner")}><span className="aurora-tool-icon"><SlidersHorizontal size={21} /></span><span><strong>AI Tuner</strong><small>Choose AURORAâ€™s personality</small></span><ChevronRight size={16} /></button>
              <button type="button" className="aurora-tool-option" onClick={() => openTool("search")}><span className="aurora-tool-icon"><Sparkles size={21} /></span><span><strong>Web Search</strong><small>Find current information with sources</small></span><ChevronRight size={16} /></button>
              <button type="button" className="aurora-tool-option" onClick={() => openTool("translate")}><span className="aurora-tool-icon"><WandSparkles size={21} /></span><span><strong>Translate</strong><small>Translate text into another language</small></span><ChevronRight size={16} /></button>
              <button type="button" className="aurora-tool-option" onClick={() => openTool("writing")}><span className="aurora-tool-icon"><NotebookPen size={21} /></span><span><strong>Writing Assistant</strong><small>Draft, rewrite or summarise text</small></span><ChevronRight size={16} /></button>
              <button type="button" className="aurora-tool-option" onClick={() => openTool("study")}><span className="aurora-tool-icon"><FileText size={21} /></span><span><strong>Study Tools</strong><small>Learn concepts and practise questions</small></span><ChevronRight size={16} /></button>
              <p className="aurora-menu-footnote">Your tools, inside AURORA.</p>
            </motion.div>
          </motion.div>
        )}
        {cameraOpen && (
          <motion.div className="aurora-camera-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={closeCameraScreen}>
            <motion.section className="aurora-camera-screen" role="dialog" aria-modal="true" aria-label="AURORA camera" initial={{ opacity: 0, scale: .98, y: 10 }} animate={{ opacity: 1, scale: 1, y: 0 }} onClick={(event) => event.stopPropagation()}>
              <header className="aurora-camera-header"><button type="button" onClick={closeCameraScreen} aria-label="Close camera"><ArrowLeft size={20}/></button><div><strong>AURORA CAMERA</strong><small>CAPTURE â€¢ REVIEW â€¢ CONTINUE</small></div><span className="camera-live-pill"><i/> {capturedPhoto ? "PHOTO READY" : "CAMERA"}</span></header>
              <div className="aurora-camera-view">{capturedPhoto ? <img src={capturedPhoto} alt="Captured preview"/> : <><video ref={cameraVideoRef} autoPlay playsInline muted/><div className="camera-crosshair camera-crosshair-a"/><div className="camera-crosshair camera-crosshair-b"/><span className="camera-view-label">AURORA / OPTICAL INPUT</span>{cameraError && <div className="camera-error"><Camera size={24}/><p>{cameraError}</p><button type="button" onClick={openCameraScreen}>Try camera again</button></div>}</>}</div>
              <div className="aurora-camera-controls">{capturedPhoto ? <><button type="button" className="camera-secondary-action" onClick={retakeCameraPhoto}><RotateCcw size={17}/> Retake</button><button type="button" className="camera-confirm-action" onClick={useCameraPhoto}><Check size={18}/> Use photo</button></> : <><span className="camera-control-hint">Hold steady for a clear image</span><button type="button" className="camera-shutter" onClick={captureCameraPhoto} aria-label="Take photo"><span/></button><span className="camera-control-hint">REAR CAMERA</span></>}</div>
            </motion.section>
          </motion.div>
        )}
        {tunerOpen && (
          <motion.div className="aurora-menu-backdrop tuner-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setTunerOpen(false)}>
            <motion.div className="aurora-tuner-panel" role="dialog" aria-modal="true" aria-label="AURORA AI Tuner" initial={{ opacity: 0, y: 16, scale: .97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 8 }} onClick={(event) => event.stopPropagation()}>
              <div className="aurora-menu-heading"><span className="aurora-menu-mark"><SlidersHorizontal size={18} /></span><div><strong>AI Tuner</strong><small>Set AURORAâ€™s response style</small></div><button type="button" onClick={() => setTunerOpen(false)} aria-label="Close AI tuner"><X size={17} /></button></div>
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
