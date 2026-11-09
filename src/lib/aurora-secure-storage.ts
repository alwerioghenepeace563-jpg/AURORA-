import { Capacitor, registerPlugin } from "@capacitor/core";

type SecureStoragePlugin = {
  set(options: { key: string; value: string }): Promise<{ saved: boolean }>;
  get(options: { key: string }): Promise<{ found: boolean; value?: string }>;
  remove(options: { key: string }): Promise<{ removed: boolean }>;
};
type ReminderPlugin = {
  requestNotificationPermission(): Promise<{ granted: boolean }>;
  schedule(options: { id: string; title: string; message?: string; at: number }): Promise<{ scheduled: boolean; id: string; at: number; exact: boolean }>;
  cancel(options: { id: string }): Promise<{ cancelled: boolean }>;
  list(): Promise<{ items: Array<{ id: string; title: string; message: string; at: number }> }>;
};
const SecureStorage = registerPlugin<SecureStoragePlugin>("AuroraSecureStorage");
const Reminder = registerPlugin<ReminderPlugin>("AuroraReminder");

export const auroraSecureStorage = Object.freeze({
  isAvailable: () => Capacitor.getPlatform() === "android",
  async set(key: string, value: string) {
    if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== "android") throw new Error("Keystore-backed secure storage is available in the Android app only.");
    if (!key.trim() || key.length > 128 || typeof value !== "string") throw new Error("Provide a valid secure-storage key and string value.");
    return SecureStorage.set({ key, value });
  },
  async get(key: string) {
    if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== "android") throw new Error("Keystore-backed secure storage is available in the Android app only.");
    return SecureStorage.get({ key });
  },
  async remove(key: string) {
    if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== "android") throw new Error("Keystore-backed secure storage is available in the Android app only.");
    return SecureStorage.remove({ key });
  }
});

export const auroraReminder = Object.freeze({
  isAvailable: () => Capacitor.getPlatform() === "android",
  async requestPermission() {
    if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== "android") throw new Error("Native reminder notifications are available in the Android app only.");
    return Reminder.requestNotificationPermission();
  },
  async schedule(input: { id: string; title: string; message?: string; at: number }) {
    if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== "android") throw new Error("Native reminders are available in the Android app only.");
    return Reminder.schedule(input);
  },
  async cancel(id: string) {
    if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== "android") throw new Error("Native reminders are available in the Android app only.");
    return Reminder.cancel({ id });
  },
  async list() {
    if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== "android") throw new Error("Native reminders are available in the Android app only.");
    return Reminder.list();
  }
});
