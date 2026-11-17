import { useCallback, useEffect, useState } from "react";
import { Activity, Bell, Check, ChevronRight, FileKey, FolderOpen, Moon, Settings2, ShieldCheck, Wifi } from "lucide-react";
import { auroraNative } from "../lib/aurora-native";

const ACCESS_ROWS = [
  { key: "modifySettings", title: "Modify system settings", detail: "Allows supported AURORA controls such as screen brightness.", icon: Settings2 },
  { key: "allFiles", title: "All files access", detail: "Optional: read shared-storage file and folder metadata when you request a scan.", icon: FolderOpen },
  { key: "doNotDisturb", title: "Do Not Disturb access", detail: "Lets you ask AURORA to enable or disable Focus mode.", icon: Moon },
  { key: "usageAccess", title: "Usage access", detail: "Optional: create a 24-hour app-usage summary when you request one.", icon: Activity },
  { key: "notificationAccess", title: "Notification access", detail: "Powers AURORA's notification summaries and notification actions.", icon: Bell },
  { key: "installUnknownApps", title: "Install unknown apps", detail: "Only used by the AURORA updater after you choose to install a verified update.", icon: FileKey },
  { key: "overlay", title: "Display over other apps", detail: "Required for the floating AURORA Pulse assistant.", icon: ShieldCheck },
  { key: "accessibility", title: "Screen Assistant accessibility", detail: "Reads on-screen text only when you explicitly request a screen reading.", icon: ShieldCheck }
];

export default function AndroidSpecialAccessCard() {
  const [status, setStatus] = useState(null);
  const [busy, setBusy] = useState("");
  const [notice, setNotice] = useState("");
  const [brightness, setBrightness] = useState(55);
  const [usage, setUsage] = useState([]);
  const [storage, setStorage] = useState(null);

  const refresh = useCallback(async () => {
    if (!auroraNative.isAndroid()) return;
    try { setStatus(await auroraNative.getSpecialAccessStatus()); }
    catch (error) { setNotice(error?.message || "Could not check Android access."); }
  }, []);

  useEffect(() => {
    void refresh();
    const onFocus = () => { void refresh(); };
    const onVisibility = () => { if (document.visibilityState === "visible") void refresh(); };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [refresh]);

  if (!auroraNative.isAndroid()) return null;

  const openSetting = async (key) => {
    setBusy(key); setNotice("");
    try {
      await auroraNative.openSpecialAccessSettings(key);
      setNotice("Android Settings opened. Grant access there, then return to AURORA; the status will refresh automatically.");
    } catch (error) { setNotice(error?.message || "Could not open that Android setting."); }
    finally { setBusy(""); }
  };

  const applyBrightness = async () => {
    setBusy("brightness"); setNotice("");
    try {
      const result = await auroraNative.setSystemBrightness(brightness);
      setNotice(result.changed ? "Screen brightness updated." : "Android did not apply the brightness change.");
    } catch (error) { setNotice(error?.message || "Could not change screen brightness."); }
    finally { setBusy(""); }
  };

  const setDnd = async (enabled) => {
    setBusy("dnd"); setNotice("");
    try {
      const result = await auroraNative.setDoNotDisturb(enabled);
      setNotice(result.changed ? (enabled ? "Do Not Disturb is on." : "Do Not Disturb is off.") : "Android could not change Do Not Disturb.");
    } catch (error) { setNotice(error?.message || "Could not change Do Not Disturb."); }
    finally { setBusy(""); }
  };

  const loadUsage = async () => {
    setBusy("usage-summary"); setNotice("");
    try {
      const result = await auroraNative.getRecentAppUsage();
      setUsage(Array.isArray(result.apps) ? result.apps : []);
      setNotice("Usage summary covers the last 24 hours and stays on this device.");
    } catch (error) { setNotice(error?.message || "Could not read app usage."); }
    finally { setBusy(""); }
  };

  const scanStorage = async () => {
    setBusy("storage-scan"); setNotice("");
    try {
      const result = await auroraNative.getSharedStorageOverview();
      setStorage(result);
      setNotice("Shared-storage scan returned names and file metadata only; it did not open file contents.");
    } catch (error) { setNotice(error?.message || "Could not inspect shared storage."); }
    finally { setBusy(""); }
  };

  return (
    <section className="glass-panel aurora-special-access" aria-label="AURORA Android special access" style={{ padding: 14, borderRadius: 16, marginTop: 10, display: "grid", gap: 10 }}>
      <div>
        <strong style={{ color: "#edf6ff" }}>AURORA System Integration</strong>
        <p style={{ color: "#9fb7ca", fontSize: 11, lineHeight: 1.5, margin: "5px 0 0" }}>These controls connect Android access to real assistant features. Android still asks you to approve every special permission.</p>
      </div>
      <div style={{ display: "grid", gap: 3 }}>
        {ACCESS_ROWS.map(({ key, title, detail, icon: Icon }) => {
          const granted = Boolean(status?.[key]);
          return (
            <div key={key} style={{ display: "flex", alignItems: "center", gap: 9, padding: "9px 0", borderBottom: "1px solid rgba(130,170,215,.08)" }}>
              <span className="setting-icon"><Icon size={16}/></span>
              <span className="setting-text" style={{ flex: 1, minWidth: 0 }}>
                <strong>{title}</strong><small>{detail}</small>
              </span>
              {granted ? <span style={{ color: "#77e6bd", display: "flex", alignItems: "center", gap: 4, fontSize: 10 }}><Check size={14}/> Allowed</span> : <button type="button" className="setting-row" disabled={busy === key} onClick={() => openSetting(key)} style={{ width: "auto", minHeight: 32, padding: "5px 8px", gap: 4, color: "#9feaff", fontSize: 10 }}>{busy === key ? "Opening…" : "Grant"}<ChevronRight size={13}/></button>}
            </div>
          );
        })}
      </div>
      <div style={{ border: "1px solid rgba(130,170,215,.12)", borderRadius: 12, padding: 11, display: "grid", gap: 8 }}>
        <strong style={{ fontSize: 11, color: "#dcecff" }}>Use granted access</strong>
        <label style={{ display: "grid", gap: 7, fontSize: 10, color: "#9fb7ca" }}>
          Screen brightness · {brightness}%
          <input type="range" min="5" max="100" value={brightness} onChange={event => setBrightness(Number(event.target.value))} disabled={!status?.modifySettings}/>
        </label>
        <button type="button" className="setting-row" disabled={!status?.modifySettings || busy === "brightness"} onClick={applyBrightness} style={{ justifyContent: "center", minHeight: 34, border: "1px solid rgba(110,220,255,.18)", borderRadius: 9, padding: 7 }}>Apply brightness</button>
        <div style={{ display: "flex", gap: 7 }}>
          <button type="button" className="setting-row" disabled={!status?.doNotDisturb || busy === "dnd"} onClick={() => setDnd(true)} style={{ flex: 1, justifyContent: "center", minHeight: 34, border: "1px solid rgba(110,220,255,.18)", borderRadius: 9, padding: 7 }}><Moon size={14}/> Focus on</button>
          <button type="button" className="setting-row" disabled={!status?.doNotDisturb || busy === "dnd"} onClick={() => setDnd(false)} style={{ flex: 1, justifyContent: "center", minHeight: 34, border: "1px solid rgba(110,220,255,.18)", borderRadius: 9, padding: 7 }}>Focus off</button>
        </div>
        <div style={{ display: "flex", gap: 7 }}>
          <button type="button" className="setting-row" disabled={!status?.usageAccess || busy === "usage-summary"} onClick={loadUsage} style={{ flex: 1, justifyContent: "center", minHeight: 34, border: "1px solid rgba(110,220,255,.18)", borderRadius: 9, padding: 7 }}>Usage summary</button>
          <button type="button" className="setting-row" disabled={!status?.allFiles || busy === "storage-scan"} onClick={scanStorage} style={{ flex: 1, justifyContent: "center", minHeight: 34, border: "1px solid rgba(110,220,255,.18)", borderRadius: 9, padding: 7 }}>Scan storage</button>
        </div>
        {usage.length > 0 && <div style={{ display: "grid", gap: 4 }}>{usage.map(item => <div key={item.packageName} style={{ display: "flex", justifyContent: "space-between", gap: 8, fontSize: 10, color: "#b9cce0" }}><span style={{ overflowWrap: "anywhere" }}>{item.packageName}</span><strong>{Math.round(item.foregroundMs / 60000)} min</strong></div>)}</div>}
        {storage && <p style={{ margin: 0, fontSize: 10, lineHeight: 1.5, color: "#b9cce0" }}>Found {storage.count} top-level entries. AURORA inspected metadata only, not file contents.</p>}
      </div>
      <p role="status" aria-live="polite" style={{ margin: 0, color: "#b9c8d8", fontSize: 10, lineHeight: 1.5 }}>{notice}</p>
      <button type="button" className="setting-row" onClick={refresh} style={{ justifyContent: "center", minHeight: 32, padding: 5, color: "#92dff5", fontSize: 10 }}>Refresh permission status</button>
      <p style={{ margin: 0, color: "#758ba5", fontSize: 9, lineHeight: 1.5 }}>Wi-Fi is opened through Android's own controls because modern Android versions do not let ordinary apps silently toggle Wi-Fi. Premium SMS access is not requested.</p>
      <button type="button" className="setting-row" onClick={() => openSetting("wifi")} style={{ justifyContent: "center", minHeight: 32, padding: 5, color: "#92dff5", fontSize: 10 }}><Wifi size={14}/> Open Wi-Fi settings</button>
    </section>
  );
}
