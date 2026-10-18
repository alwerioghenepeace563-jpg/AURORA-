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
  addListener(eventName: "speechResult", listenerFunc: (event: { transcript: string }) => void): Promise<{ remove: () => Promise<void> }>;
  addListener(eventName: "speechError", listenerFunc: (event: { code: number; message: string }) => void): Promise<{ remove: () => Promise<void> }>;
  addListener(eventName: "speechStatus", listenerFunc: (event: { status: string }) => void): Promise<{ remove: () => Promise<void> }>;
  requestMicrophonePermission(): Promise<{ granted: boolean }>;
  consumeWakeWord(): Promise<{ detected: boolean }>;
  startAssistantService(): Promise<{ started: boolean; note?: string }>;
  stopAssistantService(): Promise<{ stopped: boolean }>;
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

export const auroraNative = {
  isAndroid: () => Capacitor.getPlatform() === "android",
  status: async (): Promise<AuroraNativeStatus | null> =>
    Capacitor.isNativePlatform() ? AuroraNative.status() : null,
  requestMicrophonePermission: async () => { if (!Capacitor.isNativePlatform()) throw new Error("Microphone permission is available only in the Android app."); return AuroraNative.requestMicrophonePermission(); },
  startSpeechRecognition: async () => { if (!Capacitor.isNativePlatform()) throw new Error("Native speech recognition is available only in the Android app."); return AuroraNative.startSpeechRecognition(); },
  stopSpeechRecognition: async () => { if (!Capacitor.isNativePlatform()) throw new Error("Native speech recognition is available only in the Android app."); return AuroraNative.stopSpeechRecognition(); },
  addSpeechResultListener: (callback: (event: { transcript: string }) => void) => AuroraNative.addListener("speechResult", callback),
  addSpeechErrorListener: (callback: (event: { code: number; message: string }) => void) => AuroraNative.addListener("speechError", callback),
  addSpeechStatusListener: (callback: (event: { status: string }) => void) => AuroraNative.addListener("speechStatus", callback),
  consumeWakeWord: async () => { if (!Capacitor.isNativePlatform()) return { detected: false }; return AuroraNative.consumeWakeWord(); },
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
  openWhatsApp: async () => {
    if (!Capacitor.isNativePlatform()) throw new Error("Opening other apps is available only in the Android app.");
    return AuroraNative.openApp({ packageName: "com.whatsapp" });
  },
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
