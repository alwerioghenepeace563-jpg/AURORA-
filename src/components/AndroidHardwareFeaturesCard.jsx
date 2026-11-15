import { useEffect, useState } from "react";
import { auroraNative } from "../lib/aurora-native";

export default function AndroidHardwareFeaturesCard() {
  const [screenStatus, setScreenStatus] = useState(null);
  const [nfcStatus, setNfcStatus] = useState(null);
  const [tag, setTag] = useState(null);
  const [writeText, setWriteText] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!auroraNative.isAndroid()) return undefined;
    let active = true;
    let tagHandle, writeHandle;
    auroraNative.getScreenCaptureStatus().then(value => { if (active) setScreenStatus(value); }).catch(() => {});
    auroraNative.getNfcStatus().then(value => { if (active) setNfcStatus(value); }).catch(() => {});
    auroraNative.addNfcTagListener(event => { if (active) { setTag(event); setMessage("NFC tag read. Review the text below before using it."); } }).then(handle => { tagHandle = handle; if (!active) handle.remove(); }).catch(() => {});
    auroraNative.addNfcWriteResultListener(event => { if (active) setMessage(event.written ? "Text written to the NFC tag." : event.error || "NFC write failed."); }).then(handle => { writeHandle = handle; if (!active) handle.remove(); }).catch(() => {});
    return () => { active = false; tagHandle?.remove(); writeHandle?.remove(); void auroraNative.stopNfcReader(); };
  }, []);

  if (!auroraNative.isAndroid()) return null;

  const capture = async () => {
    setBusy(true); setMessage("Android will ask you to approve screen capture.");
    try {
      const result = await auroraNative.requestScreenCapture();
      if (!result.consentGranted) setMessage("Screen capture was cancelled. Nothing was captured.");
      else {
        setMessage("Permission granted. AURORA is capturing one frame, then the session will stop.");
        window.setTimeout(async () => {
          try { const status = await auroraNative.getScreenCaptureStatus(); setScreenStatus(status); setMessage(status.captured ? "One frame was captured to AURORA's private app cache." : "The capture did not complete. You can try again."); }
          catch { setMessage("Could not refresh capture status."); }
        }, 1800);
      }
    } catch (error) { setMessage(error?.message || "Could not start screen capture."); }
    finally { setBusy(false); }
  };

  const startReader = async () => {
    setBusy(true);
    try {
      const result = await auroraNative.startNfcReader();
      setMessage(result.started ? "NFC reader active. Hold a tag near your phone while AURORA is open." : "NFC reader did not start.");
      setNfcStatus(await auroraNative.getNfcStatus());
    } catch (error) { setMessage(error?.message || "Could not start NFC reader."); }
    finally { setBusy(false); }
  };

  const armWrite = async () => {
    setBusy(true);
    try {
      await auroraNative.armNfcTextWrite(writeText);
      setMessage("NFC write armed. Present a writable tag now; AURORA will write only the text you entered.");
      setWriteText("");
    } catch (error) { setMessage(error?.message || "Could not arm NFC write."); }
    finally { setBusy(false); }
  };

  const stopReader = async () => {
    await auroraNative.stopNfcReader().catch(() => {});
    setNfcStatus(await auroraNative.getNfcStatus().catch(() => null));
    setMessage("NFC reader stopped.");
  };

  return <section className="glass-panel" aria-label="Android screen capture and NFC" style={{ padding: 14, borderRadius: 16, marginTop: 10 }}>
    <strong style={{ color: "#edf6ff" }}>Screen & nearby hardware</strong>
    <p style={{ color: "#9fb7ca", fontSize: 12, lineHeight: 1.5, margin: "5px 0 12px" }}>Native Android tools with visible, user-controlled sessions.</p>
    <div style={{ padding: 11, borderRadius: 12, background: "rgba(20,48,75,.24)", marginBottom: 10 }}>
      <strong style={{ color: "#dbeeff", fontSize: 13 }}>One-frame screen capture</strong>
      <p style={{ color: "#9fb7ca", fontSize: 11, margin: "4px 0 9px" }}>{screenStatus?.captured ? "A private cached frame is available." : "Android displays its own capture-consent prompt. Only one frame is captured; no continuous or background capture."}</p>
      <div style={{ display: "flex", gap: 8 }}>
        <button type="button" className="setting-row" disabled={busy || screenStatus?.capturing} onClick={capture} style={{ flex: 1, justifyContent: "center", minHeight: 38 }}>Capture screen</button>
        <button type="button" className="setting-row" disabled={busy || !screenStatus?.captured} onClick={async () => { const result = await auroraNative.clearScreenCapture(); setScreenStatus(await auroraNative.getScreenCaptureStatus()); setMessage(result.cleared ? "Cached screen frame cleared." : "Could not clear cached frame."); }} style={{ minHeight: 38, padding: "0 12px" }}>Clear</button>
      </div>
    </div>
    <div style={{ padding: 11, borderRadius: 12, background: "rgba(20,48,75,.24)" }}>
      <strong style={{ color: "#dbeeff", fontSize: 13 }}>NFC tags</strong>
      <p style={{ color: "#9fb7ca", fontSize: 11, margin: "4px 0 9px" }}>{nfcStatus?.available ? nfcStatus.enabled ? "NFC is available and enabled." : "Turn on NFC in Android Settings." : "NFC hardware is not available on this device."} Reader runs only while AURORA is foregrounded.</p>
      <div style={{ display: "flex", gap: 8 }}>
        <button type="button" className="setting-row" disabled={busy || !nfcStatus?.available || !nfcStatus?.enabled} onClick={startReader} style={{ flex: 1, justifyContent: "center", minHeight: 38 }}>Read a tag</button>
        <button type="button" className="setting-row" disabled={!nfcStatus?.readerActive} onClick={stopReader} style={{ minHeight: 38, padding: "0 12px" }}>Stop</button>
      </div>
      <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
        <input value={writeText} onChange={event => setWriteText(event.target.value)} maxLength={1200} placeholder="Text to write to an NFC tag" aria-label="Text to write to NFC tag" style={{ minWidth: 0, flex: 1, padding: 9, borderRadius: 9 }} />
        <button type="button" className="setting-row" disabled={busy || !nfcStatus?.enabled || !writeText.trim()} onClick={armWrite} style={{ minHeight: 38, padding: "0 12px" }}>Arm write</button>
      </div>
      {tag && <div style={{ marginTop: 9, color: "#c6d9eb", fontSize: 11, overflowWrap: "anywhere" }}><strong>Last tag:</strong> {tag.uid}<div>{(tag.textRecords || []).join(" · ") || tag.readError || "No readable NDEF text records."}</div></div>}
    </div>
    <p role="status" aria-live="polite" style={{ color: "#b9c8d8", fontSize: 11, lineHeight: 1.5, margin: "10px 0 0" }}>{message}</p>
  </section>;
}
