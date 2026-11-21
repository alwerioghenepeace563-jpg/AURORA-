import { useEffect, useRef, useState } from "react";
import { PhoneCall, PhoneOff, Mic, MicOff, Volume2, VolumeX, Copy, Link2, ShieldCheck, Radio, Users } from "lucide-react";
import { auroraApiUrl } from "../lib/aurora-native";
import "./aurora-connect.css";

const makeRoomCode = () => Math.random().toString(36).slice(2, 10).toUpperCase();
const apiToWebSocket = (path) => {
  const url = new URL(auroraApiUrl(path), window.location.href);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  return url.toString();
};

export default function AuroraConnectWorkspace() {
  const [roomCode, setRoomCode] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [status, setStatus] = useState("Ready to connect");
  const [connected, setConnected] = useState(false);
  const [muted, setMuted] = useState(false);
  const [speaker, setSpeaker] = useState(true);
  const [error, setError] = useState("");
  const [remotePresent, setRemotePresent] = useState(false);
  const socketRef = useRef(null);
  const pcRef = useRef(null);
  const localStreamRef = useRef(null);
  const audioRef = useRef(null);
  const pendingIceRef = useRef([]);

  const stopCall = (message = "Call ended") => {
    try { socketRef.current?.close(); } catch {}
    socketRef.current = null;
    try { pcRef.current?.close(); } catch {}
    pcRef.current = null;
    localStreamRef.current?.getTracks().forEach(track => track.stop());
    localStreamRef.current = null;
    if (audioRef.current) audioRef.current.srcObject = null;
    pendingIceRef.current = [];
    setConnected(false);
    setRemotePresent(false);
    setStatus(message);
  };

  useEffect(() => () => stopCall("Call closed"), []);

  const send = (payload) => {
    if (socketRef.current?.readyState === WebSocket.OPEN) socketRef.current.send(JSON.stringify(payload));
  };

  const connect = async (code) => {
    setError("");
    if (!navigator.mediaDevices?.getUserMedia || !window.RTCPeerConnection) {
      setError("This device or browser does not support WebRTC voice calling.");
      return;
    }
    try {
      setStatus("Requesting microphone permission…");
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }, video: false });
      localStreamRef.current = stream;
      const token = (() => { try { return JSON.parse(localStorage.getItem("aurora-auth-session") || "null")?.access_token || ""; } catch { return ""; } })();
      if (!token) throw new Error("Sign in to AURORA before starting a private call.");
      const socket = new WebSocket(apiToWebSocket("/api/connect/" + encodeURIComponent(code) + "?token=" + encodeURIComponent(token)));
      socketRef.current = socket;
      setRoomCode(code);
      setStatus("Connecting to AURORA Connect…");
      socket.onopen = () => {
        socket.send(JSON.stringify({ type: "join" }));
        setStatus("Waiting for the other person…");
      };
      socket.onerror = () => setError("Could not reach the AURORA calling service. It may not be deployed yet.");
      socket.onclose = event => {
        if (socketRef.current === socket) {
          setConnected(false);
          if (event.code !== 1000) setError("Calling connection closed. Check the AURORA service and try again.");
          setStatus("Disconnected");
        }
      };
      socket.onmessage = async event => {
        let message;
        try { message = JSON.parse(event.data); } catch { return; }
        if (message.type === "peer-joined") {
          setRemotePresent(true);
          setStatus("Contact found · setting up secure audio…");
          const pc = new RTCPeerConnection({ iceServers: [{ urls: "stun:stun.l.google.com:19302" }, { urls: "stun:stun.cloudflare.com:3478" }] });
          pcRef.current = pc;
          stream.getTracks().forEach(track => pc.addTrack(track, stream));
          pc.onicecandidate = e => { if (e.candidate) send({ type: "ice", candidate: e.candidate }); };
          pc.ontrack = e => { if (audioRef.current) audioRef.current.srcObject = e.streams[0]; setConnected(true); setStatus("Connected · voice active"); };
          pc.onconnectionstatechange = () => {
            if (["failed", "disconnected", "closed"].includes(pc.connectionState)) {
              setConnected(false);
              if (pc.connectionState === "failed") setError("A direct connection could not be established on this network. A TURN relay service is not configured yet.");
            }
          };
          if (message.initiator) {
            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);
            send({ type: "offer", description: pc.localDescription });
          }
        } else if (message.type === "signal" && message.payload) {
          const pc = pcRef.current;
          if (!pc) return;
          const signal = message.payload;
          if (signal.type === "offer" || signal.type === "answer") {
            await pc.setRemoteDescription(signal.description);
            for (const candidate of pendingIceRef.current) await pc.addIceCandidate(candidate);
            pendingIceRef.current = [];
            if (signal.type === "offer") {
              const answer = await pc.createAnswer();
              await pc.setLocalDescription(answer);
              send({ type: "answer", description: pc.localDescription });
            }
          } else if (signal.type === "ice" && signal.candidate) {
            if (pc.remoteDescription) await pc.addIceCandidate(signal.candidate);
            else pendingIceRef.current.push(signal.candidate);
          } else if (signal.type === "hangup") stopCall("The other person ended the call");
        } else if (message.type === "room-full") {
          setError("This call already has two participants.");
          stopCall("Call unavailable");
        } else if (message.type === "peer-left") {
          setRemotePresent(false);
          setConnected(false);
          setStatus("The other person left the call");
        }
      };
    } catch (e) {
      localStreamRef.current?.getTracks().forEach(track => track.stop());
      localStreamRef.current = null;
      setError(e?.message || "Could not start the call.");
      setStatus("Not connected");
    }
  };

  const startCall = () => {
    if (socketRef.current) stopCall();
    const code = makeRoomCode();
    setJoinCode(code);
    void connect(code);
  };
  const joinCall = () => {
    const code = joinCode.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
    if (code.length < 6 || code.length > 12) { setError("Enter a valid 6–12 character call code."); return; }
    if (socketRef.current) stopCall();
    void connect(code);
  };
  const hangup = () => { send({ type: "hangup" }); stopCall(); };
  const toggleMute = () => {
    const next = !muted;
    localStreamRef.current?.getAudioTracks().forEach(track => { track.enabled = !next; });
    setMuted(next);
  };
  const copyInvite = async () => {
    try { await navigator.clipboard.writeText(roomCode); setStatus("Call code copied · share it privately"); }
    catch { setError("Clipboard unavailable. Copy the code manually: " + roomCode); }
  };

  return <main className="aurora-connect-page">
    <header className="connect-hero">
      <div className="connect-orb"><Radio size={29}/></div>
      <p className="connect-kicker">AURORA COMMUNICATIONS NETWORK</p>
      <h1>AURORA <span>Connect</span></h1>
      <p>Private, internet-based voice calls between signed-in AURORA users.</p>
      <div className="connect-status"><i className={connected ? "is-live" : ""}/>{status}</div>
    </header>
    <section className="connect-call-card">
      <div className="connect-card-heading"><Users size={18}/><div><strong>Start a voice call</strong><small>Create a private room and share its code with one person.</small></div></div>
      {!socketRef.current && <button className="connect-primary" onClick={startCall}><PhoneCall size={17}/> Create call room</button>}
      {roomCode && <div className="connect-invite"><span>YOUR CALL CODE</span><strong>{roomCode}</strong><button onClick={copyInvite} aria-label="Copy call code"><Copy size={16}/> Copy</button></div>}
      <div className="connect-divider"><span>OR JOIN A CALL</span></div>
      <label className="connect-code-label" htmlFor="connect-code">Enter the other person's call code</label>
      <div className="connect-join-row"><input id="connect-code" value={joinCode} onChange={e => setJoinCode(e.target.value.toUpperCase())} placeholder="e.g. A8K2P9QX" maxLength={12}/><button onClick={joinCall} disabled={!!socketRef.current}><Link2 size={16}/> Join</button></div>
      {socketRef.current && <div className="connect-controls">
        <audio ref={audioRef} autoPlay playsInline muted={!speaker}/>
        <button onClick={toggleMute} className={muted ? "is-active" : ""}>{muted ? <MicOff/> : <Mic/>}{muted ? "Unmute" : "Mute"}</button>
        <button onClick={() => setSpeaker(v => !v)} className={!speaker ? "is-active" : ""}>{speaker ? <Volume2/> : <VolumeX/>}{speaker ? "Speaker on" : "Speaker off"}</button>
        <button onClick={hangup} className="connect-hangup"><PhoneOff/> End call</button>
      </div>}
      {error && <p className="connect-error" role="alert">{error}</p>}
    </section>
    <section className="connect-info-grid">
      <div><ShieldCheck size={18}/><strong>Account protected</strong><p>Call signaling requires an authenticated AURORA account. Share room codes only with the intended person.</p></div>
      <div><Radio size={18}/><strong>Direct voice</strong><p>Audio uses browser WebRTC peer-to-peer transport. A relay fallback is not configured yet, so some mobile networks may not connect.</p></div>
    </section>
    <p className="connect-footnote">AURORA Connect is an early internet-calling build. It cannot call ordinary mobile or landline numbers.</p>
  </main>;
}
