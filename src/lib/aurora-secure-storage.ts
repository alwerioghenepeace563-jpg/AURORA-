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

function validateKey(key: string) {
  if (typeof key !== "string" || !key.trim() || key.length > 128) throw new Error("Provide a valid secure-storage key.");
}
function requireAndroid() {
  if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== "android") throw new Error("Keystore-backed secure storage is available in the Android app only.");
}

export const auroraSecureStorage = Object.freeze({
  isAvailable: () => Capacitor.isNativePlatform() && Capacitor.getPlatform() === "android",
  async set(key: string, value: string) {
    requireAndroid();
    validateKey(key);
    if (typeof value !== "string" || new TextEncoder().encode(value).byteLength > 32768) throw new Error("Secure values are limited to 32 KB.");
    return SecureStorage.set({ key, value });
  },
  async get(key: string) {
    requireAndroid();
    validateKey(key);
    return SecureStorage.get({ key });
  },
  async remove(key: string) {
    requireAndroid();
    validateKey(key);
    return SecureStorage.remove({ key });
  }
});

export const auroraReminder = Object.freeze({
  isAvailable: () => Capacitor.isNativePlatform() && Capacitor.getPlatform() === "android",
  async requestPermission() {
    requireAndroid();
    return Reminder.requestNotificationPermission();
  },
  async schedule(input: { id: string; title: string; message?: string; at: number }) {
    requireAndroid();
    return Reminder.schedule(input);
  },
  async cancel(id: string) {
    requireAndroid();
    return Reminder.cancel({ id });
  },
  async list() {
    requireAndroid();
    return Reminder.list();
  }
});
