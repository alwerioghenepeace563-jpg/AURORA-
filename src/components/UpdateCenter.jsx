import { useCallback, useEffect, useState } from "react";
import { App as CapacitorApp } from "@capacitor/app";
import { Browser } from "@capacitor/browser";
import { Capacitor } from "@capacitor/core";
import { CheckCircle2, Download, ExternalLink, RefreshCw, ShieldCheck, Smartphone } from "lucide-react";

const MANIFEST_URL = "https://raw.githubusercontent.com/alwerioghenepeace563-jpg/-Lively_updates/main/aurora/version.json";

function compareVersions(latest, installed) {
  const latestCode = Number(latest?.versionCode || 0);
  const installedCode = Number(installed?.build || 0);
  return latestCode > installedCode;
}

export default function UpdateCenter() {
  const [installed, setInstalled] = useState(null);
  const [release, setRelease] = useState(null);
  const [status, setStatus] = useState("idle");
  const [error, setError] = useState("");

  const checkForUpdates = useCallback(async () => {
    setStatus("checking");
    setError("");
    try {
      const [appInfo, response] = await Promise.all([
        CapacitorApp.getInfo(),
        fetch(MANIFEST_URL + "?t=" + Date.now(), { cache: "no-store" })
      ]);
      if (!response.ok) throw new Error("The update server could not be reached. Try again shortly.");
      const manifest = await response.json();
      if (manifest.app !== "AURORA" || manifest.packageId !== "com.aurora.assistant") {
        throw new Error("The update information failed its app identity check.");
      }
      setInstalled(appInfo);
      setRelease(manifest);
      setStatus("ready");
    } catch (err) {
      setError(err?.message || "Could not check for updates.");
      setStatus("error");
    }
  }, []);

  useEffect(() => {
    if (Capacitor.isNativePlatform()) checkForUpdates();
  }, [checkForUpdates]);

  if (!Capacitor.isNativePlatform()) return null;

  const updateAvailable = release && installed && compareVersions(release, installed);
  const published = release && Number(release.versionCode || 0) > 0 && typeof release.apkUrl === "string" && release.apkUrl.startsWith("https://");

  const openDownload = async () => {
    if (!published || !release?.apkUrl) return;
    try {
      if (Capacitor.isNativePlatform()) {
        await Browser.open({ url: release.apkUrl });
      } else {
        window.open(release.apkUrl, "_blank", "noopener,noreferrer");
      }
    } catch {
      window.open(release.apkUrl, "_blank", "noopener,noreferrer");
    }
  };

  return (
    <section className="update-center-card" aria-labelledby="aurora-update-heading">
      <div className="update-center-top">
        <div className="update-center-icon"><Smartphone size={21} /></div>
        <div className="update-center-title">
          <p className="panel-eyebrow">AURORA SYSTEM</p>
          <h2 id="aurora-update-heading">App updates</h2>
          <p>Live releases from Lively Updates. Check again after installing to refresh the version shown here.</p>
        </div>
      </div>

      <div className="update-center-version-row">
        <span>Installed version</span>
        <strong>{installed ? `${installed.version || "Installed"} (${installed.build || "?"})` : "Checking device…"}</strong>
      </div>
      {release && (
        <>
          <div className="update-center-version-row">
            <span>Latest version</span>
            <strong>{release.versionName || "Not published"}{Number(release.versionCode || 0) > 0 ? ` (${release.versionCode})` : ""}</strong>
          </div>
          {release.releaseNotes && <p className="update-center-notes">{release.releaseNotes}</p>}
        </>
      )}

      {status === "checking" && <p className="update-center-status"><RefreshCw size={15} className="update-spin" /> Checking Lively Updates…</p>}
      {status === "error" && <p className="update-center-error" role="status">{error}</p>}
      {status === "ready" && !published && <p className="update-center-status">Update service is connected. No AURORA release has been published yet.</p>}
      {status === "ready" && published && updateAvailable && (
        <p className="update-center-status update-center-available"><Download size={16} /> A newer version is available.</p>
      )}
      {status === "ready" && published && !updateAvailable && (
        <p className="update-center-status"><CheckCircle2 size={16} /> You’re using the latest published version.</p>
      )}

      <div className="update-center-actions">
        <button className="outline-action" type="button" onClick={checkForUpdates} disabled={status === "checking"}>
          <RefreshCw size={16} className={status === "checking" ? "update-spin" : ""} /> Check for updates
        </button>
        {published && updateAvailable && (
          <button className="primary-action" type="button" onClick={openDownload}>
            <Download size={16} /> Download update <ExternalLink size={14} />
          </button>
        )}
      </div>

      <div className="update-center-safety">
        <ShieldCheck size={17} />
        <span>Android requires your approval to install downloaded APK updates. After installation, reopen AURORA and tap Check for updates to refresh the installed version. Keep the same signing key; do not uninstall AURORA to update it.</span>
      </div>
    </section>
  );
}
