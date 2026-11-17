import { auroraNative } from "../lib/aurora-native";

export async function extractPublicPageInIsolatedBrowser(url, taskId, timeoutMs = 20000) {
  if (!auroraNative.isAndroid()) throw new Error("The isolated research browser is available only in the Android app.");
  return new Promise(async (resolve, reject) => {
    let listener = null;
    let settled = false;
    const finish = async (error, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try { await listener?.remove?.(); } catch {}
      if (error) reject(error); else resolve(value);
    };
    const timer = setTimeout(() => finish(new Error("The isolated research browser timed out.")), timeoutMs);
    try {
      listener = await auroraNative.addResearchPageListener(event => {
        if (event?.taskId !== taskId) return;
        if (!event.success) return finish(new Error(event.error || "The research page could not be extracted."));
        finish(null, {
          taskId, url: String(event.url || url), title: String(event.title || "").slice(0, 220),
          text: String(event.text || "").slice(0, 12000), retrievedAt: new Date().toISOString()
        });
      });
      await auroraNative.extractResearchPage(url, taskId);
    } catch (error) {
      finish(error instanceof Error ? error : new Error("The isolated research browser could not start."));
    }
  });
}

export async function openIsolatedResearchResult(url) {
  return auroraNative.openResearchBrowser(url);
}

export async function clearIsolatedResearchData() {
  return auroraNative.clearResearchBrowserData();
}
