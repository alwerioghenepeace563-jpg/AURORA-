import { useEffect, useRef, useState } from "react";
import { auroraApiUrl } from "../lib/aurora-native";
import { auroraRuntime } from "../core/aurora-runtime";
import { Film, Mic, Download, RefreshCw, Save, XCircle } from "lucide-react";

const JOB_KEY = "aurora.creative.video-job.v1";
function readJob() {
  try {
    const value = JSON.parse(localStorage.getItem(JOB_KEY) || "null");
    if (value && typeof value === "object" && typeof value.prompt === "string") return value;
  } catch {}
  return null;
}
function persistJob(value) {
  try {
    if (value) localStorage.setItem(JOB_KEY, JSON.stringify(value));
    else localStorage.removeItem(JOB_KEY);
  } catch {}
}
async function postJob(payload) {
  const response = await fetch(auroraApiUrl("/api/media-jobs"), {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload)
  });
  if (payload.action === "video:download" && response.ok) return response;
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "The media service is unavailable.");
  return data;
}

export default function CreativeMediaStudio({ projectId = "", onSaved }) {
  const [videoPrompt, setVideoPrompt] = useState("");
  const [aspectRatio, setAspectRatio] = useState("16:9");
  const [durationSeconds, setDurationSeconds] = useState(8);
  const [videoJob, setVideoJob] = useState(readJob);
  const [videoUrl, setVideoUrl] = useState("");
  const [videoBusy, setVideoBusy] = useState(false);
  const [videoDownloadBusy, setVideoDownloadBusy] = useState(false);
  const [videoNotice, setVideoNotice] = useState("");
  const [voiceText, setVoiceText] = useState("");
  const [voices, setVoices] = useState([]);
  const [voiceId, setVoiceId] = useState("");
  const [voiceBusy, setVoiceBusy] = useState(false);
  const [voiceUrl, setVoiceUrl] = useState("");
  const [voiceNotice, setVoiceNotice] = useState("");
  const [voiceSaved, setVoiceSaved] = useState(false);
  const downloadAttempt = useRef("");
  const pollTimer = useRef(null);

  useEffect(() => {
    if (videoJob?.status === "submitting") {
      const interrupted = { ...videoJob, status: "interrupted", error: "AURORA was refreshed before the provider returned a job ID. You can safely submit this prompt again." };
      persistJob(interrupted); setVideoJob(interrupted);
    }
  }, []);

  useEffect(() => {
    let active = true;
    fetch(auroraApiUrl("/api/voices")).then(async response => {
      const data = await response.json().catch(() => ({}));
      if (response.ok && active) {
        const list = Array.isArray(data.voices) ? data.voices : [];
        setVoices(list);
        if (list.length) setVoiceId(current => current || list[0].voice_id);
      }
    }).catch(() => {});
    return () => { active = false; };
  }, []);

  useEffect(() => () => {
    if (videoUrl) URL.revokeObjectURL(videoUrl);
    if (voiceUrl) URL.revokeObjectURL(voiceUrl);
    if (pollTimer.current) clearTimeout(pollTimer.current);
  }, [videoUrl, voiceUrl]);

  useEffect(() => {
    if (!videoJob?.operationName || !["queued", "running"].includes(videoJob.status)) return;
    let active = true;
    const poll = async () => {
      try {
        const data = await postJob({ action: "video:status", operationName: videoJob.operationName });
        if (!active) return;
        if (data.status === "completed") {
          const next = { ...videoJob, status: "completed", completedAt: new Date().toISOString(), error: "" };
          persistJob(next); setVideoJob(next); setVideoNotice("Video is ready. Loading the MP4 preview…");
          return;
        }
        if (data.status === "failed") {
          const next = { ...videoJob, status: "failed", error: data.error || "Video generation failed." };
          persistJob(next); setVideoJob(next); setVideoNotice(next.error);
          return;
        }
        const next = { ...videoJob, status: "running", lastCheckedAt: new Date().toISOString() };
        persistJob(next); setVideoJob(next);
        pollTimer.current = setTimeout(poll, 10000);
      } catch (error) {
        if (!active) return;
        setVideoNotice(error?.message || "Status check failed. AURORA will retry automatically.");
        pollTimer.current = setTimeout(poll, 15000);
      }
    };
    poll();
    return () => { active = false; if (pollTimer.current) clearTimeout(pollTimer.current); };
  }, [videoJob?.operationName, videoJob?.status]);

  useEffect(() => {
    if (videoJob?.status !== "completed" || !videoJob.operationName || videoUrl || downloadAttempt.current === videoJob.operationName) return;
    downloadAttempt.current = videoJob.operationName;
    let active = true;
    (async () => {
      setVideoDownloadBusy(true);
      try {
        const response = await postJob({ action: "video:download", operationName: videoJob.operationName });
        const blob = await response.blob();
        if (!blob.size || !blob.type.includes("video")) throw new Error("The provider returned an invalid video file.");
        const url = URL.createObjectURL(blob);
        if (active) { setVideoUrl(url); setVideoNotice("MP4 ready. Preview or download it below."); }
        else URL.revokeObjectURL(url);
      } catch (error) {
        downloadAttempt.current = "";
        if (active) setVideoNotice(error?.message || "The video is ready, but AURORA could not load the file. Tap Load MP4 to retry.");
      } finally {
        if (active) setVideoDownloadBusy(false);
      }
    })();
    return () => { active = false; };
  }, [videoJob?.status, videoJob?.operationName, videoUrl]);

  const startVideo = async (promptOverride) => {
    const prompt = String(promptOverride ?? videoPrompt).trim();
    if (prompt.length < 8) { setVideoNotice("Describe the video in at least 8 characters."); return; }
    const initial = { prompt, status: "submitting", aspectRatio, durationSeconds, createdAt: new Date().toISOString(), model: "veo-3.1-generate-preview" };
    persistJob(initial); setVideoJob(initial); setVideoPrompt(prompt); setVideoUrl(""); downloadAttempt.current = "";
    setVideoBusy(true); setVideoNotice("Submitting your video request. The job will remain listed if you refresh AURORA.");
    try {
      const data = await postJob({ action: "video:create", prompt, aspectRatio, durationSeconds });
      const next = { ...initial, operationName: data.operationName, status: "queued", model: data.model || initial.model };
      persistJob(next); setVideoJob(next); setVideoNotice("Video job accepted. AURORA will check its progress automatically.");
    } catch (error) {
      const next = { ...initial, status: "interrupted", error: error?.message || "The request did not complete." };
      persistJob(next); setVideoJob(next); setVideoNotice(next.error);
    } finally { setVideoBusy(false); }
  };

  const loadVideoAgain = async () => {
    if (!videoJob?.operationName || videoDownloadBusy) return;
    setVideoDownloadBusy(true); setVideoNotice("Loading the completed MP4 again…");
    try {
      const response = await postJob({ action: "video:download", operationName: videoJob.operationName });
      const blob = await response.blob();
      if (!blob.size || !blob.type.includes("video")) throw new Error("The provider returned an invalid video file.");
      const url = URL.createObjectURL(blob);
      setVideoUrl(current => { if (current) URL.revokeObjectURL(current); return url; });
      setVideoNotice("MP4 ready. Preview or download it below.");
    } catch (error) { setVideoNotice(error?.message || "Could not load the completed MP4."); }
    finally { setVideoDownloadBusy(false); }
  };
  const downloadVideo = () => {
    if (!videoUrl) return;
    const link = document.createElement("a"); link.href = videoUrl; link.download = "aurora-generated-video.mp4";
    document.body.appendChild(link); link.click(); link.remove();
  };
  const forgetVideoJob = () => {
    persistJob(null); setVideoJob(null); setVideoUrl(""); setVideoNotice("Saved job record cleared. This does not cancel a provider job that is already running.");
    downloadAttempt.current = "";
  };

  const generateVoiceover = async () => {
    const text = voiceText.trim();
    if (!text) { setVoiceNotice("Write or paste a voiceover script first."); return; }
    if (text.length > 2500) { setVoiceNotice("Voiceover scripts are limited to 2,500 characters per generation."); return; }
    setVoiceBusy(true); setVoiceSaved(false); setVoiceNotice("Generating your voiceover. Provider usage may apply.");
    try {
      const response = await fetch(auroraApiUrl("/api/voice"), {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, ...(voiceId ? { voiceId } : { voice: "jessica" }) })
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || "Voiceover generation failed.");
      }
      const blob = await response.blob();
      if (!blob.size || !blob.type.includes("audio")) throw new Error("The voice provider returned an invalid audio file.");
      const url = URL.createObjectURL(blob);
      setVoiceUrl(current => { if (current) URL.revokeObjectURL(current); return url; });
      setVoiceNotice("Voiceover generated. Preview it or download the MP3.");
    } catch (error) { setVoiceNotice(error?.message || "Voiceover generation failed."); }
    finally { setVoiceBusy(false); }
  };
  const downloadVoiceover = () => {
    if (!voiceUrl) return;
    const link = document.createElement("a"); link.href = voiceUrl; link.download = "aurora-voiceover.mp3";
    document.body.appendChild(link); link.click(); link.remove();
  };
  const saveVoiceScript = () => {
    if (!projectId) { setVoiceNotice("Select a creative project before saving this script."); return; }
    try {
      auroraRuntime.saveCreativeDraft({ projectId, title: "Voiceover script", content: voiceText.trim(), userApproved: true });
      setVoiceSaved(true); setVoiceNotice("Voiceover script saved to the selected project. Download the MP3 separately to keep the audio file.");
      onSaved?.();
    } catch (error) { setVoiceNotice(error?.message || "Could not save the voiceover script."); }
  };

  return <section className="clw-panel clw-wide clw-media-studio">
    <h3>AI Video & Voiceover Studio</h3>
    <p className="clw-help">Generate real video with Gemini Veo and narration with your connected ElevenLabs voice. Requests run only when you press Generate; provider usage or quota may apply.</p>
    <div className="clw-media-studio-grid">
      <article className="clw-media-card">
        <h4><Film size={17}/> Video generation</h4>
        <label>Describe the clip<textarea rows={4} maxLength={1800} value={videoPrompt} onChange={event => setVideoPrompt(event.target.value)} placeholder="A smooth cinematic shot of a rainforest canopy after rainfall, sunlight moving through the leaves…"/></label>
        <div className="clw-media-options">
          <label>Format<select value={aspectRatio} onChange={event => setAspectRatio(event.target.value)}><option value="16:9">Landscape 16:9</option><option value="9:16">Portrait 9:16</option></select></label>
          <label>Length<select value={durationSeconds} onChange={event => setDurationSeconds(Number(event.target.value))}><option value={4}>4 seconds</option><option value={6}>6 seconds</option><option value={8}>8 seconds</option></select></label>
        </div>
        <button className="clw-primary" onClick={() => startVideo()} disabled={videoBusy || videoPrompt.trim().length < 8}><Film size={15}/>{videoBusy ? "Starting video…" : "Generate video"}</button>
        {videoJob && <div className="clw-job-status">
          <strong>Last video job · {videoJob.status}</strong>
          <p>{videoJob.error || (videoJob.status === "completed" ? "The generated MP4 is ready." : videoJob.status === "interrupted" ? "This request needs a retry." : "AURORA can resume checking this job after refresh.")}</p>
          {videoJob.operationName && <small>Job ID saved on this device</small>}
          {["failed", "interrupted"].includes(videoJob.status) && <button onClick={() => startVideo(videoJob.prompt)} disabled={videoBusy}><RefreshCw size={14}/> Retry job</button>}
          {videoJob.status === "completed" && !videoUrl && <button onClick={loadVideoAgain} disabled={videoDownloadBusy}><RefreshCw size={14}/> Load MP4</button>}
          {videoUrl && <><video className="clw-generated-video" src={videoUrl} controls playsInline/><button onClick={downloadVideo}><Download size={14}/> Download MP4</button></>}
          <button className="clw-secondary" onClick={forgetVideoJob}><XCircle size={14}/> Clear job record</button>
        </div>}
        {videoNotice && <p className="clw-help" role="status">{videoNotice}</p>}
      </article>
      <article className="clw-media-card">
        <h4><Mic size={17}/> Voiceover generation</h4>
        <label>Voiceover script<textarea rows={6} maxLength={2500} value={voiceText} onChange={event => setVoiceText(event.target.value)} placeholder="Write the narration you want AURORA to speak…"/></label>
        <label>Voice<select value={voiceId} onChange={event => setVoiceId(event.target.value)}><option value="">Default configured AURORA voice</option>{voices.map(voice => <option value={voice.voice_id} key={voice.voice_id}>{voice.name}</option>)}</select></label>
        <button className="clw-primary" onClick={generateVoiceover} disabled={voiceBusy || !voiceText.trim()}><Mic size={15}/>{voiceBusy ? "Generating voiceover…" : "Generate voiceover"}</button>
        {voiceUrl && <div className="clw-generated-audio"><audio src={voiceUrl} controls/><button onClick={downloadVoiceover}><Download size={14}/> Download MP3</button></div>}
        <div className="clw-actions">
          <button onClick={saveVoiceScript} disabled={!projectId || !voiceText.trim() || voiceSaved}><Save size={14}/> Save script to project</button>
          <small>{voiceText.length}/2500 characters</small>
        </div>
        {voiceNotice && <p className="clw-help" role="status">{voiceNotice}</p>}
      </article>
    </div>
  </section>;
}
