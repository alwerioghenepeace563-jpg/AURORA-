import { useCallback, useEffect, useState } from "react";
import { auroraNative } from "../lib/aurora-native";

export default function AndroidAssistantRoleCard() {
  const [role, setRole] = useState(null);
  const [overlayAllowed, setOverlayAllowed] = useState(null);
  const [wakeListening, setWakeListening] = useState(false);
  const [notificationsAllowed, setNotificationsAllowed] = useState(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  const refresh = useCallback(async () => {
    if (!auroraNative.isAndroid()) return;
    setBusy(true);
    try {
      const [nextRole, overlay, nativeStatus] = await Promise.all([
        auroraNative.getAssistantRoleStatus(),
        auroraNative.hasOverlayPermission(),
        auroraNative.status()
      ]);
      setRole(nextRole);
      setOverlayAllowed(Boolean(overlay?.granted));
      setWakeListening(Boolean(nativeStatus?.wakeWordListening));
      setNotificationsAllowed(Boolean(nativeStatus?.notificationsPermissionGranted));
      if (!message) {
        setMessage(nextRole.selected
          ? "AURORA is selected as Android's assistant. Pulse will handle the assistant gesture."
          : "Complete the steps below. Android will ask you to confirm the default-assistant choice.");
      }
    } catch (error) {
      setMessage(error?.message || "Could not read Android assistant setup status.");
    } finally {
      setBusy(false);
    }
  }, [message]);

  useEffect(() => { void refresh(); }, [refresh]);

  if (!auroraNative.isAndroid()) return null;

  const chooseAssistant = async () => {
    setBusy(true);
    try {
      const result = await auroraNative.openAssistantRoleSettings();
      setMessage(result?.opened
        ? "Android's assistant selector is open. Choose AURORA, then return here and refresh."
        : "Android did not open its assistant selector.");
    } catch (error) {
      setMessage(error?.message || "Could not open Android assistant selection.");
    } finally { setBusy(false); }
  };

  const allowOverlay = async () => {
    setBusy(true);
    try {
      const result = await auroraNative.requestOverlayPermission();
      setOverlayAllowed(Boolean(result?.granted));
      setMessage(result?.granted
        ? "Pulse is allowed to appear over other apps."
        : "Android opened Display over other apps. Enable AURORA there, return here, and refresh.");
    } catch (error) {
      setMessage(error?.message || "Could not open overlay permission settings.");
    } finally { setBusy(false); }
  };

  const toggleWakeListener = async () => {
    setBusy(true);
    try {
      if (wakeListening) {
        await auroraNative.stopAssistantService();
        setWakeListening(false);
        setMessage("Hey AURORA background listening is stopped. Pulse and the Android assistant gesture remain available.");
        return;
      }
      const overlay = await auroraNative.hasOverlayPermission();
      if (!overlay?.granted) {
        setOverlayAllowed(false);
        setMessage("Allow Display over other apps first. Android needs this permission to show Pulse above your current app.");
        return;
      }
      await auroraNative.requestMicrophonePermission();
      const notification = await auroraNative.requestNotificationPermission();
      if (!notification?.granted) {
        setNotificationsAllowed(false);
        setMessage("Allow notifications so Android can show the active microphone service and its Stop control.");
        return;
      }
      const result = await auroraNative.startAssistantService();
      setWakeListening(Boolean(result?.started));
      setNotificationsAllowed(true);
      setMessage(result?.note || "Hey AURORA is listening. Say the wake phrase to open Pulse hands-free.");
    } catch (error) {
      setMessage(error?.message || "Could not enable Hey AURORA. Check microphone and notification permissions.");
    } finally {
      setBusy(false);
      try {
        const [nextRole, overlay, nativeStatus] = await Promise.all([
          auroraNative.getAssistantRoleStatus(), auroraNative.hasOverlayPermission(), auroraNative.status()
        ]);
        setRole(nextRole);
        setOverlayAllowed(Boolean(overlay?.granted));
        setWakeListening(Boolean(nativeStatus?.wakeWordListening));
        setNotificationsAllowed(Boolean(nativeStatus?.notificationsPermissionGranted));
      } catch {}
    }
  };

  const stepStyle = { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "10px 0", borderTop: "1px solid rgba(160,190,220,.12)" };
  const statusStyle = (ok) => ({ color: ok ? "#79e0bb" : "#d7b77b", fontSize: 11, whiteSpace: "nowrap" });

  return <section className="glass-panel" aria-label="Android default assistant setup" style={{ padding: 14, borderRadius: 16, marginTop: 10 }}>
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
      <div><strong style={{ color: "#edf6ff" }}>Make AURORA your Android assistant</strong><p style={{ color: "#9fb7ca", fontSize: 12, lineHeight: 1.5, margin: "4px 0 0" }}>Pulse is the assistant interface. The Main App stays your control centre. Both are inside this one APK.</p></div>
      <span style={{ color: role?.selected ? "#79e0bb" : "#a9bbce", fontSize: 11, whiteSpace: "nowrap" }}>{role?.selected ? "ACTIVE ROLE" : role ? "SETUP" : "CHECKING"}</span>
    </div>

    <div style={stepStyle}>
      <div><strong style={{ color: "#e7eef8", fontSize: 13 }}>1. Default assistant</strong><p style={{ color: "#91a7bd", fontSize: 11, margin: "3px 0 0" }}>{role?.selected ? "Android has selected AURORA." : "Choose AURORA in Android's own assistant selector."}</p></div>
      <button type="button" className="setting-row" disabled={busy || Boolean(role?.selected)} onClick={chooseAssistant} style={{ minHeight: 36, padding: "0 10px" }}>{role?.selected ? "Selected" : "Choose"}</button>
    </div>

    <div style={stepStyle}>
      <div><strong style={{ color: "#e7eef8", fontSize: 13 }}>2. Pulse overlay</strong><p style={{ color: "#91a7bd", fontSize: 11, margin: "3px 0 0" }}>{overlayAllowed ? "Pulse can appear above other apps." : "Allow Pulse to appear over the app you are using."}</p></div>
      <button type="button" className="setting-row" disabled={busy || overlayAllowed === true} onClick={allowOverlay} style={{ minHeight: 36, padding: "0 10px" }}>{overlayAllowed ? "Allowed" : "Allow"}</button>
    </div>

    <div style={stepStyle}>
      <div><strong style={{ color: "#e7eef8", fontSize: 13 }}>3. Hey AURORA wake phrase</strong><p style={{ color: "#91a7bd", fontSize: 11, margin: "3px 0 0" }}>{wakeListening ? "Background microphone listener is active." : "Enable the visible microphone service for hands-free wake-up."}</p></div>
      <button type="button" className="setting-row" disabled={busy || overlayAllowed !== true} onClick={toggleWakeListener} style={{ minHeight: 36, padding: "0 10px" }}>{busy ? "Please wait…" : wakeListening ? "Stop" : "Enable"}</button>
    </div>

    <p role="status" aria-live="polite" style={{ color: "#b9c8d8", fontSize: 12, lineHeight: 1.55, margin: "12px 0 8px" }}>{message || "Checking Android setup…"}</p>
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
      <button type="button" className="setting-row" disabled={busy} onClick={() => { setMessage(""); void refresh(); }} style={{ minHeight: 38, padding: "0 12px" }}>Refresh status</button>
      <span style={{ alignSelf: "center", color: "#829bb2", fontSize: 11 }}>{notificationsAllowed === false ? "Notifications permission needed for wake listening." : "Permissions are requested only when you choose to enable them."}</span>
    </div>
    <small style={{ display: "block", color: "#829bb2", fontSize: 11, lineHeight: 1.45, marginTop: 8 }}>Android controls the final assistant choice and permission grants. Hey AURORA listening is optional; the system assistant gesture works separately.</small>
  </section>;
}
