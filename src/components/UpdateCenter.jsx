import { useCallback, useEffect, useState } from "react";
import { App as CapacitorApp } from "@capacitor/app";
import { Capacitor, registerPlugin } from "@capacitor/core";
import { CheckCircle2, Download, RefreshCw, ShieldCheck, Smartphone, PackageCheck } from "lucide-react";

const MANIFEST_URL = "https://raw.githubusercontent.com/alwerioghenepeace563-jpg/-Lively_updates/main/aurora/version.json";
const AuroraNative = registerPlugin("AuroraNative");

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
  const [downloaded, setDownloaded] = useState(false);

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
      if (Number(manifest.versionCode || 0) <= Number(appInfo.build || 0)) setDownloaded(false);
      setStatus("ready");
    } catch (err) {
      setError(err?.message || "Could not check for updates.");
      setStatus("error");
    }
  }, []);

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    checkForUpdates();
    let subscription;
    CapacitorApp.addListener("appStateChange", ({ isActive }) => {
      if (isActive) checkForUpdates();
    }).then((listener) => { subscription = listener; });
    return () => { subscription?.remove(); };
  }, [checkForUpdates]);

  if (!Capacitor.isNativePlatform()) return null;

  const updateAvailable = release && installed && compareVersions(release, installed);
  const published = release && Number(release.versionCode || 0) > 0 &&
    typeof release.apkUrl === "string" && release.apkUrl.startsWith("https://");

  const downloadUpdate = async () => {
    if (!published || !updateAvailable || !release?.apkUrl) return;
    setStatus("downloading");
    setError("");
    try {
      const result = await AuroraNative.downloadAndInstallUpdate({ url: release.apkUrl });
      if (!result?.downloaded) throw new Error("The update was not downloaded.");
      setDownloaded(true);
      setStatus("downloaded");
      // Continue straight to Android's installer after the in-app download completes.
      await installUpdate();
    } catch (err) {
      setError(err?.message || "Could not download the update.");
      setStatus("error");
    }
  };

  const installUpdate = async () => {
    setError("");
    try {
      const result = await AuroraNative.installDownloadedUpdate();
      if (result?.needsInstallPermission) {
        setStatus("permission");
        return;
      }
      if (result?.installerLaunched) {
        setStatus("installing");
        return;
      }
      setStatus("downloaded");
    } catch (err) {
      setError(err?.message || "Could not start the installer.");
      setStatus("error");
    }
  };

  return (
    <section className="update-center-card" aria-labelledby="aurora-update-heading">
      <div className="update-center-top">
        <div className="update-center-icon"><Smartphone size={21} /></div>
        <div className="update-center-title">
          <p className="panel-eyebrow">AURORA SYSTEM</p>
          <h2 id="aurora-update-heading">App updates</h2>
          <p>Check releases, download the APK inside AURORA, and continue to Android's installer.</p>
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
      {status === "downloading" && <p className="update-center-status"><RefreshCw size={15} className="update-spin" /> Downloading update inside AURORA… Keep the app open.</p>}
      {status === "error" && <p className="update-center-error" role="status">{error}</p>}
      {status === "ready" && !published && <p className="update-center-status">Update service is connected. No AURORA release has been published yet.</p>}
      {status === "ready" && published && updateAvailable && <p className="update-center-status update-center-available"><Download size={16} /> A newer version is available.</p>}
      {status === "ready" && published && !updateAvailable && <p className="update-center-status"><CheckCircle2 size={16} /> App is up to date.</p>}
      {status === "downloaded" && <p className="update-center-status"><PackageCheck size={16} /> Update downloaded. Continue to install it.</p>}
      {status === "permission" && <p className="update-center-status">Allow “Install unknown apps” for AURORA in Android settings, return here, then tap Continue installation.</p>}
      {status === "installing" && <p className="update-center-status">Android’s installer is open. Approve the update, then return to AURORA. The installed version will be checked again.</p>}

      <div className="update-center-actions">
        <button className="outline-action" type="button" onClick={checkForUpdates} disabled={status === "checking" || status === "downloading"}>
          <RefreshCw size={16} className={status === "checking" ? "update-spin" : ""} /> Check for updates
        </button>
        {published && updateAvailable && !downloaded && (
          <button className="primary-action" type="button" onClick={downloadUpdate} disabled={status === "downloading"}>
            <Download size={16} /> {status === "downloading" ? "Downloading…" : "Download update"}
          </button>
        )}
        {downloaded && (
          <button className="primary-action" type="button" onClick={installUpdate}>
            <PackageCheck size={16} /> Continue installation
          </button>
        )}
      </div>

      <div className="update-center-safety">
        <ShieldCheck size={17} />
        <span>AURORA downloads the update inside the app. Android still requires you to approve installation. After installation, reopen AURORA and the updater rechecks the installed version. Updates require the same signing key as the installed app.</span>
      </div>
    </section>
  );
}
