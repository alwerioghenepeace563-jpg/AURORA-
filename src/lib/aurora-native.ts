import { registerPlugin, Capacitor } from "@capacitor/core";

export type AuroraNativeStatus = {
  platform: string;
  nativeBridge: boolean;
  backgroundServiceFoundation: boolean;
  wakeWordEnabled: boolean;
  wakeWordListening: boolean;
  liveRealtimeVoiceEnabled: boolean;
};

type AuroraNativePlugin = {
  startSpeechRecognition(): Promise<{ started: boolean }>;
  stopSpeechRecognition(): Promise<{ stopped: boolean }>;
  speakText(options: { text: string }): Promise<{ started: boolean; engine: string }>;
  stopTextSpeech(): Promise<{ stopped: boolean }>;
  addListener(eventName: "ttsStatus", listenerFunc: (event: { status: "started" | "done" | "error" }) => void): Promise<{ remove: () => Promise<void> }>;
  addListener(eventName: "speechResult", listenerFunc: (event: { transcript: string }) => void): Promise<{ remove: () => Promise<void> }>;
  addListener(eventName: "speechError", listenerFunc: (event: { code: number; message: string }) => void): Promise<{ remove: () => Promise<void> }>;
  addListener(eventName: "speechStatus", listenerFunc: (event: { status: string }) => void): Promise<{ remove: () => Promise<void> }>;
  requestMicrophonePermission(): Promise<{ granted: boolean }>;
  requestNotificationPermission(): Promise<{ granted: boolean }>;
  hasOverlayPermission(): Promise<{ granted: boolean }>;
  requestOverlayPermission(): Promise<{ opened: boolean; granted: boolean }>;
  showOverlay(): Promise<{ requested: boolean; shown: boolean; note?: string }>;
  hideOverlay(): Promise<{ hidden: boolean }>;
  getOverlayStatus(): Promise<{ shown: boolean; note: string }>;
  consumeWakeWord(): Promise<{ detected: boolean }>;
  consumePulseOpenRequest(): Promise<{ requested: boolean }>;
  startAssistantService(): Promise<{ started: boolean; note?: string }>;
  stopAssistantService(): Promise<{ stopped: boolean }>;
  requestContactsPermission(): Promise<{ granted: boolean }>;
  requestCalendarReadPermission(): Promise<{ granted: boolean }>;
  requestLocationPermission(): Promise<{ granted: boolean }>;
  getCurrentLocation(): Promise<{ latitude: number; longitude: number; accuracyMeters: number; provider: string; timestamp: number; ageMs: number; fresh: boolean; precision: "fine" | "coarse"; backgroundTracking: false }>;
  searchCalendarEvents(options: { query?: string }): Promise<{ events: Array<{ id: string; title: string; beginTime: number; endTime: number; location: string }>; count: number; limit: number; windowEnd: number; localOnly: boolean }>;
    searchContacts(options: { query: string }): Promise<{ contacts: Array<{ id?: string; name: string; number: string }> }>;
    openDialer(options: { number: string }): Promise<{ opened: boolean }>;
  prepareSms(options: { number: string; body?: string }): Promise<{ opened: boolean }>;
  shareText(options: { text: string }): Promise<{ opened: boolean }>;
  searchOnMap(options: { query: string }): Promise<{ opened: boolean; query: string }>;
  startMapDirections(options: { destination: string; mode: string }): Promise<{ opened: boolean; destination: string; mode: string }>;
  prepareCalendarEvent(options: { title: string; beginTime: number; endTime: number; description?: string; location?: string }): Promise<{ opened: boolean; requiresUserSave: boolean }>;
  searchMedia(options: { query: string }): Promise<{ opened: boolean; query: string }>;
  pickDocument(): Promise<{ cancelled: boolean; name?: string; mimeType?: string; contentUri?: string; text?: string; textIncluded?: boolean; note?: string }>;
  openNotificationAccessSettings(): Promise<{ opened: boolean }>;
  hasNotificationAccess(): Promise<{ granted: boolean }>;
  readRecentNotifications(): Promise<{ items: string; localOnly: boolean; limit: number }>;
  clearRecentNotifications(): Promise<{ cleared: boolean }>;
  getDeviceStatus(): Promise<{ batteryPercent?: number; charging?: boolean; batteryHealth?: number; platform: string; sdk: number; manufacturer: string; model: string }>;
  requestCameraPermission(): Promise<{ granted: boolean }>;
  setFlashlight(options: { enabled: boolean }): Promise<{ enabled: boolean }>; 

  openApp(options: { packageName: string }): Promise<{ opened: boolean; packageName: string }>;
  status(): Promise<AuroraNativeStatus>;
  openAccessibilitySettings(): Promise<{ opened: boolean }>;
  readScreen(): Promise<{ text: string }>;
  isAccessibilityEnabled(): Promise<{ enabled: boolean }>;
  getBuildInfo(): Promise<{ versionCode: number; versionName: string }>;
  downloadAndInstallUpdate(options: { url: string }): Promise<{ downloaded: boolean }>;
  installDownloadedUpdate(): Promise<{ needsInstallPermission?: boolean; installerLaunched?: boolean }>;
};

const AuroraNative = registerPlugin<AuroraNativePlugin>("AuroraNative");

export async function requestAuroraCameraPermission(): Promise<{ granted: boolean }> {
  try { return await AuroraNative.requestCameraPermission(); }
  catch { return { granted: false }; }
}

export async function requestAuroraContactsPermission(): Promise<{ granted: boolean }> {
  try {
    return await AuroraNative.requestContactsPermission();
  } catch {
    return { granted: false };
  }
}

export async function searchAuroraContacts(query: string): Promise<Array<{ id?: string; name: string; number: string }>> {
  const result = await AuroraNative.searchContacts({ query });
  return result.contacts || [];
}

export async function openAuroraDialer(number: string): Promise<{ opened: boolean }> {
  return AuroraNative.openDialer({ number });
}

export const auroraNative = {
  isAndroid: () => Capacitor.getPlatform() === "android",
  status: async (): Promise<AuroraNativeStatus | null> =>
    Capacitor.isNativePlatform() ? AuroraNative.status() : null,
  hasOverlayPermission: async () => {
    if (!Capacitor.isNativePlatform()) return { granted: false };
    return AuroraNative.hasOverlayPermission();
  },
  requestOverlayPermission: async () => {
    if (!Capacitor.isNativePlatform()) throw new Error("Overlay permission is available only in the Android app.");
    return AuroraNative.requestOverlayPermission();
  },
  showOverlay: async () => {
    if (!Capacitor.isNativePlatform()) throw new Error("AURORA Pulse floating overlay is available only in the Android app.");
    return AuroraNative.showOverlay();
  },
  hideOverlay: async () => {
    if (!Capacitor.isNativePlatform()) throw new Error("AURORA Pulse floating overlay is available only in the Android app.");
    return AuroraNative.hideOverlay();
  },
  getOverlayStatus: async () => {
    if (!Capacitor.isNativePlatform()) return { shown: false, note: "AURORA Pulse floating overlay is available only in the Android app." };
    return AuroraNative.getOverlayStatus();
  },
  requestMicrophonePermission: async () => { if (!Capacitor.isNativePlatform()) throw new Error("Microphone permission is available only in the Android app."); return AuroraNative.requestMicrophonePermission(); },
  requestNotificationPermission: async () => { if (!Capacitor.isNativePlatform()) return { granted: false }; return AuroraNative.requestNotificationPermission(); },
  startSpeechRecognition: async () => { if (!Capacitor.isNativePlatform()) throw new Error("Native speech recognition is available only in the Android app."); return AuroraNative.startSpeechRecognition(); },
  stopSpeechRecognition: async () => { if (!Capacitor.isNativePlatform()) throw new Error("Native speech recognition is available only in the Android app."); return AuroraNative.stopSpeechRecognition(); },
  addSpeechResultListener: (callback: (event: { transcript: string }) => void) => AuroraNative.addListener("speechResult", callback),
  addSpeechErrorListener: (callback: (event: { code: number; message: string }) => void) => AuroraNative.addListener("speechError", callback),
  addSpeechStatusListener: (callback: (event: { status: string }) => void) => AuroraNative.addListener("speechStatus", callback),
  speakText: async (text: string) => { if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== "android") throw new Error("Native text-to-speech is available only in the Android app."); return AuroraNative.speakText({ text }); },
  stopTextSpeech: async () => { if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== "android") return { stopped: true }; return AuroraNative.stopTextSpeech(); },
  addTtsStatusListener: (callback: (event: { status: "started" | "done" | "error" }) => void) => AuroraNative.addListener("ttsStatus", callback),
  consumeWakeWord: async () => { if (!Capacitor.isNativePlatform()) return { detected: false }; return AuroraNative.consumeWakeWord(); },
  consumePulseOpenRequest: async () => { if (!Capacitor.isNativePlatform()) return { requested: false }; return AuroraNative.consumePulseOpenRequest(); },
  startAssistantService: async () => {
    if (!Capacitor.isNativePlatform()) throw new Error("AURORA background service is available only in the Android app.");
    return AuroraNative.startAssistantService();
  },
  stopAssistantService: async () => {
    if (!Capacitor.isNativePlatform()) throw new Error("AURORA background service is available only in the Android app.");
    return AuroraNative.stopAssistantService();
  },
  openAccessibilitySettings: async () => {
    if (!Capacitor.isNativePlatform()) throw new Error("Screen Assistant settings are available only in the Android app.");
    return AuroraNative.openAccessibilitySettings();
  },
  isAccessibilityEnabled: async () => {
    if (!Capacitor.isNativePlatform()) return { enabled: false };
    return AuroraNative.isAccessibilityEnabled();
  },
  getBuildInfo: async () => {
    if (!Capacitor.isNativePlatform()) return { versionCode: 0, versionName: "" };
    return AuroraNative.getBuildInfo();
  },
  downloadAndInstallUpdate: async (url: string) => {
    if (!Capacitor.isNativePlatform()) throw new Error("In-app APK updates are available only in Android.");
    return AuroraNative.downloadAndInstallUpdate({ url });
  },
  installDownloadedUpdate: async () => {
    if (!Capacitor.isNativePlatform()) throw new Error("APK installation is available only in Android.");
    return AuroraNative.installDownloadedUpdate();
  },
  readScreen: async () => {
    if (!Capacitor.isNativePlatform()) throw new Error("Phone screen reading is available only in the Android app.");
    return AuroraNative.readScreen();
  },
  prepareSms: async (number: string, body = "") => {
    if (!Capacitor.isNativePlatform()) throw new Error("SMS composer handoff is available only in Android.");
    return AuroraNative.prepareSms({ number, body });
  },
  shareText: async (text: string) => {
    if (!Capacitor.isNativePlatform()) throw new Error("Android share sheet is available only in the native app.");
    return AuroraNative.shareText({ text });
  },
  openWhatsApp: async () => {
    if (!Capacitor.isNativePlatform()) throw new Error("Opening other apps is available only in the Android app.");
    return AuroraNative.openApp({ packageName: "com.whatsapp" });
  },
  searchOnMap: async (query: string) => { if (!Capacitor.isNativePlatform()) throw new Error("Map search handoff is available only in Android."); return AuroraNative.searchOnMap({ query }); },
  startMapDirections: async (destination: string, mode = "driving") => { if (!Capacitor.isNativePlatform()) throw new Error("Map directions handoff is available only in Android."); return AuroraNative.startMapDirections({ destination, mode }); },
  requestCalendarReadPermission: async () => { if (!Capacitor.isNativePlatform()) return { granted: false }; return AuroraNative.requestCalendarReadPermission(); },
  requestLocationPermission: async () => { if (!Capacitor.isNativePlatform()) return { granted: false }; return AuroraNative.requestLocationPermission(); },
  getCurrentLocation: async () => { if (!Capacitor.isNativePlatform()) throw new Error("Device location is available only in the Android app."); return AuroraNative.getCurrentLocation(); },
  searchCalendarEvents: async (query = "") => { if (!Capacitor.isNativePlatform()) throw new Error("Calendar search is available only in the Android app."); return AuroraNative.searchCalendarEvents({ query }); },
  prepareCalendarEvent: async (event: { title: string; beginTime: number; endTime: number; description?: string; location?: string }) => { if (!Capacitor.isNativePlatform()) throw new Error("Calendar handoff is available only in Android."); return AuroraNative.prepareCalendarEvent(event); },
  searchMedia: async (query: string) => { if (!Capacitor.isNativePlatform()) throw new Error("Media search handoff is available only in Android."); return AuroraNative.searchMedia({ query }); },
  pickDocument: async () => { if (!Capacitor.isNativePlatform()) throw new Error("File picking is available only in the Android app."); return AuroraNative.pickDocument(); },
  openNotificationAccessSettings: async () => { if (!Capacitor.isNativePlatform()) throw new Error("Notification access settings are available only in Android."); return AuroraNative.openNotificationAccessSettings(); },
  hasNotificationAccess: async () => Capacitor.isNativePlatform() ? AuroraNative.hasNotificationAccess() : { granted: false },
  readRecentNotifications: async () => { if (!Capacitor.isNativePlatform()) throw new Error("Notification intelligence is available only in Android."); return AuroraNative.readRecentNotifications(); },
  clearRecentNotifications: async () => { if (!Capacitor.isNativePlatform()) throw new Error("Notification cache is available only in Android."); return AuroraNative.clearRecentNotifications(); },
  getDeviceStatus: async () => { if (!Capacitor.isNativePlatform()) throw new Error("Device status is available only in Android."); return AuroraNative.getDeviceStatus(); },
  requestCameraPermission: async () => { if (!Capacitor.isNativePlatform()) return { granted: false }; return AuroraNative.requestCameraPermission(); },
  setFlashlight: async (enabled: boolean) => { if (!Capacitor.isNativePlatform()) throw new Error("Flashlight control is available only in Android."); return AuroraNative.setFlashlight({ enabled }); },
  openApp: async (packageName: string) => {
    if (!Capacitor.isNativePlatform()) throw new Error("Opening other apps is available only in the Android app.");
    return AuroraNative.openApp({ packageName });
  },
};

// Keep web requests same-origin on the website, but route server API calls to Vercel
// when the UI is bundled inside the native Android application.
export const auroraApiUrl = (path: string): string => {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  return Capacitor.isNativePlatform() ? `https://aurora-ten-gold.vercel.app${normalized}` : normalized;
};
