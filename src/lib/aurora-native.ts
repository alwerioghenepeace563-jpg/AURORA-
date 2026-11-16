import { registerPlugin, Capacitor } from "@capacitor/core";

export type AuroraNativeStatus = {
  platform: string;
  nativeBridge: boolean;
  backgroundServiceFoundation: boolean;
  wakeWordEnabled: boolean;
  wakeWordListening: boolean;
  liveRealtimeVoiceEnabled: boolean;
  assistantRoleSupported?: boolean;
  assistantRoleHeld?: boolean;
};

type AuroraTranscriptionPlugin = {
  start(options: { title: string }): Promise<{ started: boolean }>;
  update(options: { title: string; message: string; percent: number }): Promise<{ updated: boolean }>;
  stop(): Promise<{ stopped: boolean }>;
  enqueueChunk(options: { audioBase64: string; requestId: string; endpoint: string; mimeType: string; accessToken: string; chunkNumber: number; totalChunks: number }): Promise<{ queued: boolean; workId: string; chunkNumber: number }>;
  stageSourcePart(options: { requestId: string; partBase64: string; offset: number }): Promise<{ staged: boolean; bytesWritten: number; offset: number }>;
  getSourceStagingStatus(options: { requestId: string }): Promise<{ stagedBytes: number; exists: boolean }>;
  queueSourceRecording(options: { requestId: string; endpoint: string; accessToken: string; mimeType: string; sizeBytes: number; durationSeconds: number; totalChunks: number }): Promise<{ queued: boolean; workId: string; requestId: string }>;
  getSourceWorkStatus(options: { requestId: string }): Promise<{ state: string; finished: boolean; successful: boolean; failed: boolean; completedChunks: number; reason?: string }>;
  cancelJob(options: { requestId: string }): Promise<{ cancelled: boolean }>;
  getWorkStatus(options: { workId: string }): Promise<{ state: string; finished: boolean; successful: boolean; failed: boolean }>;
  clearSession(): Promise<{ cleared: boolean }>;
};

const AuroraTranscription = registerPlugin<AuroraTranscriptionPlugin>("AuroraTranscription");

type AuroraPredictivePlugin = {
  getMotionSensorStatus(): Promise<{ available: boolean; active: boolean; backgroundSampling: false }>;
  startMotionSensing(options: { consent: boolean; samplingIntervalMs: number }): Promise<{ started: boolean; available: boolean; samplingIntervalMs?: number; backgroundSampling: false }>;
  stopMotionSensing(): Promise<{ stopped: boolean }>;
  addListener(eventName: "motionSignal", listenerFunc: (event: { moved: boolean; timestamp: number; signal: "motion"; coarseOnly: true }) => void): Promise<{ remove: () => Promise<void> }>;
};
const AuroraPredictive = registerPlugin<AuroraPredictivePlugin>("AuroraPredictive");

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
  setAudioVolume(options: { stream: "media" | "ring" | "alarm"; level: number }): Promise<{ stream: string; level: number; current: number; maximum: number; systemUiShown: boolean }>;
  listLaunchableApps(): Promise<{ apps: Array<{ name: string; packageName: string; systemApp: boolean }>; count: number; limit: number; launcherAppsOnly: true }>;
  getNetworkStatus(): Promise<{ connected: boolean; validated: boolean; internetAvailable: boolean; metered: boolean; transport: string; readOnly: true; ssidRead: false; trafficInspection: false }>;
  getStorageStatus(): Promise<{ totalBytes: number; availableBytes: number; usedBytes: number; readOnlySummary: true; fileContentsRead: false }>;
  prepareContact(options: { name: string; phone?: string; email?: string }): Promise<{ opened: boolean; requiresUserSave: boolean; savedByAurora: boolean }>;
  prepareAlarm(options: { hour: number; minute: number; message?: string }): Promise<{ opened: boolean; requiresUserConfirmation: boolean; alarmCreatedByAurora: boolean }>;
  prepareTimer(options: { seconds: number; message?: string }): Promise<{ opened: boolean; requiresUserConfirmation: boolean; timerCreatedByAurora: boolean }>;
  prepareEmail(options: { to: string; subject?: string; body?: string }): Promise<{ opened: boolean; recipientCount: number; requiresUserReview: boolean; requiresUserSend: boolean }>;
  shareText(options: { text: string }): Promise<{ opened: boolean }>;
  searchOnMap(options: { query: string }): Promise<{ opened: boolean; query: string }>;
  startMapDirections(options: { destination: string; mode: string }): Promise<{ opened: boolean; destination: string; mode: string }>;
  prepareCalendarEvent(options: { title: string; beginTime: number; endTime: number; description?: string; location?: string }): Promise<{ opened: boolean; requiresUserSave: boolean }>;
  searchMedia(options: { query: string }): Promise<{ opened: boolean; query: string }>;
  controlActiveMedia(options: { action: "play_pause" | "next" | "previous" }): Promise<{ controlled: boolean; action?: string; packageName?: string; title?: string; playbackState?: number; reason?: string }>;
  exportTextDocument(options: { content: string; filename: string; mimeType: "text/plain" | "text/markdown" | "text/csv" | "application/json" }): Promise<{ saved: boolean; cancelled: boolean; bytesWritten?: number; characters?: number; destinationChosenByUser?: boolean; uri?: string; reason?: string }>;
  readClipboardText(): Promise<{ available: boolean; text: string; truncated?: boolean; readOnly: true; notStored?: true; note?: string }>;
  writeClipboardText(options: { text: string }): Promise<{ written: boolean; characters: number; systemClipboard: true }>;
  openMediaSource(options: { url: string }): Promise<{ opened: boolean; userControlsDownload: boolean }>;
  downloadPublicMedia(options: { url: string; filename: string; mediaKind: "image" | "video" }): Promise<{ queued: boolean; downloadId: number; filename: string; destination: string }>;
  pickMedia(options: { mediaType: "image" | "video" | "audio" }): Promise<{ cancelled: boolean; name?: string; mimeType?: string; contentUri?: string; readOnlySelection?: true; contentLoaded?: false }>;
  prepareAudioRecording(): Promise<{ cancelled: boolean; recorded?: boolean; contentUri?: string; mimeType?: string; recordingByAurora?: false; userControlledRecorder?: true; audioReadByAurora?: false }>;
  capturePhoto(): Promise<{ cancelled: boolean; mimeType?: "image/jpeg"; thumbnailBase64?: string; thumbnailOnly?: true; fullResolutionSaved?: false; requiresUserCapture?: true }>;
  shareSelectedFile(options: { contentUri: string; mimeType: string }): Promise<{ opened: boolean; requiresUserDestination: boolean; fileSentByAurora: false }>;
  downloadMedia(options: { url: string; filename: string; mimeType: string; confirmed: boolean }): Promise<{ queued: boolean; downloadId: number; filename: string; destination: string; managedByAndroid: true; notificationVisible: true }>;
  pickDocument(): Promise<{ cancelled: boolean; name?: string; mimeType?: string; contentUri?: string; text?: string; textIncluded?: boolean; note?: string }>;
  openNotificationAccessSettings(): Promise<{ opened: boolean }>;
  hasNotificationAccess(): Promise<{ granted: boolean }>;
  readRecentNotifications(): Promise<{ items: string; localOnly: boolean; limit: number }>;
  openNotification(options: { key: string }): Promise<{ opened: boolean; note: string }>;
  dismissNotification(options: { key: string }): Promise<{ dismissed: boolean; note: string }>;
  clearRecentNotifications(): Promise<{ cleared: boolean }>;
  getDeviceStatus(): Promise<{ batteryPercent?: number; charging?: boolean; chargingSource?: "none" | "usb" | "ac" | "wireless" | "other"; batteryHealth?: number; batteryTemperatureC?: number; batteryVoltageMv?: number; batteryStatus?: number; memoryAvailableBytes?: number; memoryTotalBytes?: number; memoryLow?: boolean; memoryThresholdBytes?: number; thermalStatus?: number; readOnly: true; capturedAt: number; platform: string; sdk: number; manufacturer: string; model: string }>;
  getDeviceCapabilityInventory(): Promise<{ platform: string; device: { manufacturer: string; model: string; sdk: number }; hardware: Record<string, boolean>; permissions: Record<string, boolean>; specialAccess: Record<string, boolean>; readOnly: true; capturedAt: number }>;
  requestCameraPermission(): Promise<{ granted: boolean }>;
  setFlashlight(options: { enabled: boolean }): Promise<{ enabled: boolean }>;
  openDeviceSettings(options: { target: "wifi" | "bluetooth" | "display" | "hotspot" | "nfc" | "sound" | "battery" | "app_details" | "location" | "notifications" | "security" | "date_time" | "storage" }): Promise<{ opened: boolean; target: string; settingsOnly: boolean; userMustApplyChanges: boolean; fallback?: boolean }>;

  openApp(options: { packageName: string }): Promise<{ opened: boolean; packageName: string }>;
  status(): Promise<AuroraNativeStatus>;
  getAssistantRoleStatus(): Promise<{ supported: boolean; held: boolean }>;
  requestAssistantRole(): Promise<{ supported: boolean; held: boolean; cancelled?: boolean }>;
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
  getPredictiveMotionStatus: async () => Capacitor.getPlatform() === "android" ? AuroraPredictive.getMotionSensorStatus() : { available: false, active: false, backgroundSampling: false as const },
  startPredictiveMotion: async (consent: boolean, samplingIntervalMs = 10000) => { if (Capacitor.getPlatform() !== "android") throw new Error("Native motion sensing is available only in Android."); return AuroraPredictive.startMotionSensing({ consent, samplingIntervalMs }); },
  stopPredictiveMotion: async () => Capacitor.getPlatform() === "android" ? AuroraPredictive.stopMotionSensing() : { stopped: true },
  addPredictiveMotionListener: async (listener: (event: { moved: boolean; timestamp: number; signal: "motion"; coarseOnly: true }) => void) => AuroraPredictive.addListener("motionSignal", listener),
  isAndroid: () => Capacitor.getPlatform() === "android",
  startTranscriptionService: async (title: string) => { if (Capacitor.getPlatform() !== "android") return { started: false }; return AuroraTranscription.start({ title }); },
  updateTranscriptionService: async (title: string, message: string, percent: number) => { if (Capacitor.getPlatform() !== "android") return { updated: false }; return AuroraTranscription.update({ title, message, percent }); },
  stopTranscriptionService: async () => { if (Capacitor.getPlatform() !== "android") return { stopped: true }; return AuroraTranscription.stop(); },
  enqueueTranscriptionChunk: async (options: { audioBase64: string; requestId: string; endpoint: string; mimeType: string; accessToken: string; chunkNumber: number; totalChunks: number }) => { if (Capacitor.getPlatform() !== "android") throw new Error("Background transcription queue requires Android."); return AuroraTranscription.enqueueChunk(options); },
  getNativeRecordingStagingStatus: async (requestId: string) => { if (Capacitor.getPlatform() !== "android") throw new Error("Native recording staging requires Android."); return AuroraTranscription.getSourceStagingStatus({ requestId }); },
  stageNativeRecordingPart: async (options: { requestId: string; partBase64: string; offset: number }) => { if (Capacitor.getPlatform() !== "android") throw new Error("Native recording staging requires Android."); return AuroraTranscription.stageSourcePart(options); },
  queueNativeRecording: async (options: { requestId: string; endpoint: string; accessToken: string; mimeType: string; sizeBytes: number; durationSeconds: number; totalChunks: number }) => { if (Capacitor.getPlatform() !== "android") throw new Error("Native recording processing requires Android."); return AuroraTranscription.queueSourceRecording(options); },
  getNativeRecordingStatus: async (requestId: string) => { if (Capacitor.getPlatform() !== "android") return { state: "UNAVAILABLE", finished: true, successful: false, failed: true, completedChunks: 0 }; return AuroraTranscription.getSourceWorkStatus({ requestId }); },
  cancelTranscriptionJob: async (requestId: string) => { if (Capacitor.getPlatform() !== "android") return { cancelled: false }; return AuroraTranscription.cancelJob({ requestId }); },
  getTranscriptionWorkStatus: async (workId: string) => { if (Capacitor.getPlatform() !== "android") return { state: "UNAVAILABLE", finished: true, successful: false, failed: true }; return AuroraTranscription.getWorkStatus({ workId }); },
  clearTranscriptionSession: async () => { if (Capacitor.getPlatform() !== "android") return { cleared: true }; return AuroraTranscription.clearSession(); },
  status: async (): Promise<AuroraNativeStatus | null> =>
    Capacitor.isNativePlatform() ? AuroraNative.status() : null,
  getAssistantRoleStatus: async () => Capacitor.isNativePlatform() ? AuroraNative.getAssistantRoleStatus() : { supported: false, held: false },
  requestAssistantRole: async () => { if (!Capacitor.isNativePlatform()) throw new Error("Default assistant selection is available only in the Android app."); return AuroraNative.requestAssistantRole(); },
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
  openMediaSource: async (url: string) => { if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== "android") { window.open(url, "_blank", "noopener,noreferrer"); return { opened: true, userControlsDownload: true }; } return AuroraNative.openMediaSource({ url }); },
  downloadPublicMedia: async (url: string, filename: string, mediaKind: "image" | "video") => { if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== "android") throw new Error("Direct downloads through Android Download Manager are available in the Android app."); return AuroraNative.downloadPublicMedia({ url, filename, mediaKind }); },
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
  prepareEmail: async (to: string, subject = "", body = "") => {
    if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== "android") throw new Error("Email composer handoff is available only in the Android app.");
    return AuroraNative.prepareEmail({ to, subject, body });
  },
  setAudioVolume: async (stream: "media" | "ring" | "alarm", level: number) => { if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== "android") throw new Error("Volume control is available only in Android."); return AuroraNative.setAudioVolume({ stream, level }); },
  listLaunchableApps: async () => { if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== "android") throw new Error("App discovery is available only in Android."); return AuroraNative.listLaunchableApps(); },
  getNetworkStatus: async () => { if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== "android") throw new Error("Network diagnostics are available only in Android."); return AuroraNative.getNetworkStatus(); },
  getStorageStatus: async () => { if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== "android") throw new Error("Storage status is available only in Android."); return AuroraNative.getStorageStatus(); },
  prepareContact: async (name: string, phone = "", email = "") => { if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== "android") throw new Error("Contact creation handoff is available only in Android."); return AuroraNative.prepareContact({ name, phone, email }); },
  prepareAlarm: async (hour: number, minute: number, message = "AURORA alarm") => { if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== "android") throw new Error("Alarm handoff is available only in Android."); return AuroraNative.prepareAlarm({ hour, minute, message }); },
  prepareTimer: async (seconds: number, message = "AURORA timer") => { if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== "android") throw new Error("Timer handoff is available only in Android."); return AuroraNative.prepareTimer({ seconds, message }); },
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
  exportTextDocument: async (options: { content: string; filename: string; mimeType: "text/plain" | "text/markdown" | "text/csv" | "application/json" }) => { if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== "android") throw new Error("Document export requires Android."); return AuroraNative.exportTextDocument(options); },
  controlActiveMedia: async (action: "play_pause" | "next" | "previous") => { if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== "android") throw new Error("Media session controls require Android."); return AuroraNative.controlActiveMedia({ action }); },
  searchMedia: async (query: string) => { if (!Capacitor.isNativePlatform()) throw new Error("Media search handoff is available only in Android."); return AuroraNative.searchMedia({ query }); },
  readClipboardText: async () => { if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== "android") throw new Error("Clipboard access is available only in Android."); return AuroraNative.readClipboardText(); },
  writeClipboardText: async (options) => { if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== "android") throw new Error("Clipboard access is available only in Android."); return AuroraNative.writeClipboardText(options); },
  pickMedia: async (options) => { if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== "android") throw new Error("Media picker is available only in Android."); return AuroraNative.pickMedia(options); },
  prepareAudioRecording: async () => { if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== "android") throw new Error("Audio recording handoff is available only in Android."); return AuroraNative.prepareAudioRecording(); },
  capturePhoto: async () => { if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== "android") throw new Error("Camera capture is available only in Android."); return AuroraNative.capturePhoto(); },
  shareSelectedFile: async (options) => { if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== "android") throw new Error("File sharing is available only in Android."); return AuroraNative.shareSelectedFile(options); },
  downloadMedia: async (options) => { if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== "android") throw new Error("Direct media downloads require the AURORA Android app."); return AuroraNative.downloadMedia(options); },
  pickDocument: async () => { if (!Capacitor.isNativePlatform()) throw new Error("File picking is available only in the Android app."); return AuroraNative.pickDocument(); },
  openNotificationAccessSettings: async () => { if (!Capacitor.isNativePlatform()) throw new Error("Notification access settings are available only in Android."); return AuroraNative.openNotificationAccessSettings(); },
  hasNotificationAccess: async () => Capacitor.isNativePlatform() ? AuroraNative.hasNotificationAccess() : { granted: false },
  readRecentNotifications: async () => { if (!Capacitor.isNativePlatform()) throw new Error("Notification intelligence is available only in Android."); return AuroraNative.readRecentNotifications(); },
  openNotification: async (key: string) => { if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== "android") throw new Error("Opening notifications is available only in Android."); return AuroraNative.openNotification({ key }); },
  dismissNotification: async (key: string) => { if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== "android") throw new Error("Dismissing notifications is available only in Android."); return AuroraNative.dismissNotification({ key }); },
  clearRecentNotifications: async () => { if (!Capacitor.isNativePlatform()) throw new Error("Notification cache is available only in Android."); return AuroraNative.clearRecentNotifications(); },
  getDeviceStatus: async () => { if (!Capacitor.isNativePlatform()) throw new Error("Device status is available only in Android."); return AuroraNative.getDeviceStatus(); },
  getDeviceCapabilityInventory: async () => { if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== "android") throw new Error("Device capability inventory is available only in the Android app."); return AuroraNative.getDeviceCapabilityInventory(); },
  requestCameraPermission: async () => { if (!Capacitor.isNativePlatform()) return { granted: false }; return AuroraNative.requestCameraPermission(); },
  setFlashlight: async (enabled: boolean) => { if (!Capacitor.isNativePlatform()) throw new Error("Flashlight control is available only in Android."); return AuroraNative.setFlashlight({ enabled }); },
  openDeviceSettings: async (target: "wifi" | "bluetooth" | "display" | "hotspot" | "nfc" | "sound" | "battery" | "app_details" | "location" | "notifications" | "security" | "date_time" | "storage") => { if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== "android") throw new Error("Device settings handoff is available only in Android."); return AuroraNative.openDeviceSettings({ target }); },
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
