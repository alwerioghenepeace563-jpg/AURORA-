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
  openAccessibilitySettings(): Promise<void>;
  readScreen(): Promise<{ text: string }>;
  clickVisibleText(options: { text: string }): Promise<{ clicked: boolean }>;
  status(): Promise<AuroraNativeStatus>;
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
  openWhatsApp: async () => {
    if (!Capacitor.isNativePlatform()) throw new Error("Opening other apps is available only in the Android app.");
    return AuroraNative.openApp({ packageName: "com.whatsapp" });
  },
  openApp: async (packageName: string) => {
    if (!Capacitor.isNativePlatform()) throw new Error("Opening other apps is available only in the Android app.");
    return AuroraNative.openApp({ packageName });
  },
  openAccessibilitySettings: async () => {
    if (!Capacitor.isNativePlatform()) throw new Error("Accessibility settings are available only in the Android app.");
    return AuroraNative.openAccessibilitySettings();
  },
  readScreen: async () => {
    if (!Capacitor.isNativePlatform()) throw new Error("Screen reading is available only in the Android app.");
    return AuroraNative.readScreen();
  },
  clickVisibleText: async (text: string) => {
    if (!Capacitor.isNativePlatform()) throw new Error("Screen actions are available only in the Android app.");
    return AuroraNative.clickVisibleText({ text });
  },
};
