import { registerPlugin, Capacitor } from "@capacitor/core";

export type AuroraNativeStatus = {
  platform: string;
  nativeBridge: boolean;
  backgroundServiceFoundation: boolean;
  wakeWordEnabled: boolean;
  liveRealtimeVoiceEnabled: boolean;
};

type AuroraNativePlugin = {
  startAssistantService(): Promise<{ started: boolean; note?: string }>;
  stopAssistantService(): Promise<{ stopped: boolean }>;
  openApp(options: { packageName: string }): Promise<{ opened: boolean; packageName: string }>;
  status(): Promise<AuroraNativeStatus>;
  openAccessibilitySettings(): Promise<{ opened: boolean }>;
  readScreen(): Promise<{ text: string }>;
};

const AuroraNative = registerPlugin<AuroraNativePlugin>("AuroraNative");

export const auroraNative = {
  isAndroid: () => Capacitor.getPlatform() === "android",
  status: async (): Promise<AuroraNativeStatus | null> =>
    Capacitor.isNativePlatform() ? AuroraNative.status() : null,
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
