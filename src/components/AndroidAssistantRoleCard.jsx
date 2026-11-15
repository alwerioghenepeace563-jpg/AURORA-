import { useCallback, useEffect, useState } from "react";
import { auroraNative } from "../lib/aurora-native";

export default function AndroidAssistantRoleCard() {
  if (!auroraNative.isAndroid()) return null;
  const [status, setStatus] = useState(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  const refresh = useCallback(async () => {
    if (!auroraNative.isAndroid()) return;
    setBusy(true);
    try {
      const next = await auroraNative.getAssistantRoleStatus();
      setStatus(next);
      setMessage(next.selected
        ? next.serviceReady ? "AURORA is selected and Android reports the service ready." : "AURORA is selected. Android has not activated the service yet."
        : next.available ? "AURORA can request the Android assistant role. Android will ask you to confirm." : "This Android version does not expose assistant-role selection to apps.");
    } catch (error) {
      setMessage(error?.message || "Could not check Android assistant status.");
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  const openSetup = async () => {
    setBusy(true);
    setMessage("");
    try {
      const result = await auroraNative.openAssistantRoleSettings();
      setMessage(result.userMustConfirm
        ? "Android assistant selection opened. Choose AURORA there, then return and tap Refresh status."
        : "Android assistant selection could not be opened.");
    } catch (error) {
      setMessage(error?.message || "Could not open Android assistant selection.");
    } finally {
      setBusy(false);
    }
  };

  return <section className="glass-panel" aria-label="Android default assistant" style={{ padding: 14, borderRadius: 16, marginTop: 10 }}>
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
      <div><strong style={{ color: "#edf6ff" }}>Android assistant integration</strong><p style={{ color: "#9fb7ca", fontSize: 12, lineHeight: 1.5, margin: "4px 0 0" }}>Let Android offer AURORA as your default assistant. You stay in control of the selection.</p></div>
      <span aria-label={status?.selected ? "Selected" : "Not selected"} style={{ color: status?.selected ? "#79e0bb" : "#a9bbce", fontSize: 11, whiteSpace: "nowrap" }}>{status?.selected ? "SELECTED" : status ? "NOT SELECTED" : "CHECKING"}</span>
    </div>
    <p role="status" aria-live="polite" style={{ color: "#b9c8d8", fontSize: 12, lineHeight: 1.5, margin: "10px 0" }}>{message || "Checking Android assistant-role availability…"}</p>
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
      <button type="button" className="setting-row" disabled={busy || !status?.available || status?.selected} onClick={openSetup} style={{ flex: 1, justifyContent: "center", minHeight: 40 }}>{busy ? "Please wait…" : "Choose AURORA"}</button>
      <button type="button" className="setting-row" disabled={busy} onClick={refresh} style={{ minHeight: 40, padding: "0 12px" }}>Refresh status</button>
    </div>
    <small style={{ display: "block", color: "#829bb2", fontSize: 11, lineHeight: 1.45, marginTop: 8 }}>Android may not support this role on every device. Choosing AURORA does not silently grant microphone, notification or accessibility access.</small>
  </section>;
}
