package com.aurora.assistant;

import android.service.notification.NotificationListenerService;
import android.service.notification.StatusBarNotification;
import android.content.Context;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.ByteArrayOutputStream;
import java.nio.charset.StandardCharsets;
import android.os.Bundle;
import android.app.Notification;
import com.getcapacitor.JSObject;
import org.json.JSONArray;
import org.json.JSONObject;

public class AuroraNotificationListenerService extends NotificationListenerService {
    private static final int MAX_ITEMS = 20;
    private static volatile AuroraNotificationListenerService activeInstance;

    @Override public void onListenerConnected() { super.onListenerConnected(); activeInstance = this; }
    @Override public void onListenerDisconnected() { if (activeInstance == this) activeInstance = null; super.onListenerDisconnected(); }

    public static boolean openNotification(String key) {
        if (key == null || key.trim().isEmpty() || key.length() > 512) return false;
        AuroraNotificationListenerService service = activeInstance;
        if (service == null) return false;
        try {
            StatusBarNotification[] active = service.getActiveNotifications();
            if (active == null) return false;
            for (StatusBarNotification item : active) {
                if (item == null || !key.equals(item.getKey())) continue;
                Notification notification = item.getNotification();
                if (notification == null || notification.contentIntent == null) return false;
                notification.contentIntent.send();
                return true;
            }
        } catch (Exception ignored) { }
        return false;
    }

    public static JSObject controlActiveMedia(String requestedAction) {
        JSObject result = new JSObject();
        if (requestedAction == null || !java.util.Arrays.asList("play_pause", "next", "previous").contains(requestedAction)) {
            return result.put("controlled", false).put("reason", "unsupported_action");
        }
        AuroraNotificationListenerService service = activeInstance;
        if (service == null) return result.put("controlled", false).put("reason", "notification_access_unavailable");
        try {
            StatusBarNotification[] active = service.getActiveNotifications();
            if (active == null) return result.put("controlled", false).put("reason", "no_active_media_session");
            for (StatusBarNotification item : active) {
                if (item == null || item.getNotification() == null || item.getNotification().extras == null) continue;
                Bundle extras = item.getNotification().extras;
                Object rawToken = extras.get(Notification.EXTRA_MEDIA_SESSION);
                if (!(rawToken instanceof android.media.session.MediaSession.Token)) continue;
                android.media.session.MediaController controller =
                    new android.media.session.MediaController(service, (android.media.session.MediaSession.Token) rawToken);
                android.media.session.PlaybackState state = controller.getPlaybackState();
                if (state == null) continue;
                long actions = state.getActions();
                android.media.session.MediaController.TransportControls controls = controller.getTransportControls();
                if ("play_pause".equals(requestedAction)) {
                    if (state.getState() == android.media.session.PlaybackState.STATE_PLAYING
                        || state.getState() == android.media.session.PlaybackState.STATE_BUFFERING) {
                        if ((actions & android.media.session.PlaybackState.ACTION_PAUSE) == 0) continue;
                        controls.pause();
                    } else {
                        if ((actions & android.media.session.PlaybackState.ACTION_PLAY) == 0) continue;
                        controls.play();
                    }
                } else if ("next".equals(requestedAction)) {
                    if ((actions & android.media.session.PlaybackState.ACTION_SKIP_TO_NEXT) == 0) continue;
                    controls.skipToNext();
                } else {
                    if ((actions & android.media.session.PlaybackState.ACTION_SKIP_TO_PREVIOUS) == 0) continue;
                    controls.skipToPrevious();
                }
                android.media.MediaMetadata metadata = controller.getMetadata();
                result.put("controlled", true).put("action", requestedAction)
                    .put("packageName", item.getPackageName())
                    .put("title", metadata == null ? "" : String.valueOf(metadata.getDescription().getTitle()))
                    .put("playbackState", state.getState())
                    .put("supportedActions", actions);
                return result;
            }
        } catch (Exception ignored) { }
        return result.put("controlled", false).put("reason", "no_compatible_active_session");
    }

    @Override
    public void onNotificationPosted(StatusBarNotification sbn) {
        if (sbn == null || sbn.getPackageName() == null || sbn.getPackageName().equals(getPackageName())) return;
        Notification notification = sbn.getNotification();
        if (notification == null || (notification.flags & Notification.FLAG_ONGOING_EVENT) != 0) return;
        Bundle extras = notification.extras;
        CharSequence titleValue = extras == null ? null : extras.getCharSequence(Notification.EXTRA_TITLE);
        String title = titleValue == null ? "" : titleValue.toString();
        CharSequence textValue = extras == null ? "" : extras.getCharSequence(Notification.EXTRA_BIG_TEXT);
        if (textValue == null || textValue.length() == 0) textValue = extras == null ? "" : extras.getCharSequence(Notification.EXTRA_TEXT, "");
        String text = textValue == null ? "" : textValue.toString();
        if (title.trim().isEmpty() && text.trim().isEmpty()) return;
        try {
            synchronized (AuroraNotificationListenerService.class) {
                JSONArray old = readArray(this);
                JSONArray next = new JSONArray();
                JSONObject item = new JSONObject();
                item.put("packageName", sbn.getPackageName());
                item.put("title", limit(title, 180));
                item.put("text", limit(text, 500));
                item.put("postedAt", sbn.getPostTime());
                item.put("key", sbn.getKey());
                next.put(item);
                for (int i = 0; i < old.length() && next.length() < MAX_ITEMS; i++) {
                    JSONObject previous = old.optJSONObject(i);
                    if (previous != null && !sbn.getKey().equals(previous.optString("key"))) next.put(previous);
                }
                writeArray(this, next);
            }
        } catch (Exception ignored) { }
    }


    public static boolean dismissNotification(String key) {
        if (key == null || key.trim().isEmpty() || key.length() > 512) return false;
        AuroraNotificationListenerService service = activeInstance;
        if (service == null) return false;
        try {
            StatusBarNotification[] active = service.getActiveNotifications();
            if (active == null) return false;
            for (StatusBarNotification item : active) {
                if (item != null && key.equals(item.getKey())) {
                    service.cancelNotification(key);
                    return true;
                }
            }
        } catch (Exception ignored) { }
        return false;
    }

    private static String limit(String value, int max) {
        if (value == null) return "";
        String clean = value.replaceAll("[\\r\\n\\t]+", " ").trim();
        return clean.length() > max ? clean.substring(0, max) : clean;
    }

    private static File cacheFile(Context context) {
        return new File(context.getNoBackupFilesDir(), "aurora-notification-previews.json");
    }

    private static JSONArray readArray(Context context) {
        File file = cacheFile(context);
        if (!file.exists()) return new JSONArray();
        try (FileInputStream input = new FileInputStream(file);
             ByteArrayOutputStream output = new ByteArrayOutputStream()) {
            byte[] buffer = new byte[4096];
            int count;
            while ((count = input.read(buffer)) != -1) output.write(buffer, 0, count);
            return new JSONArray(new String(output.toByteArray(), StandardCharsets.UTF_8));
        } catch (Exception ignored) { return new JSONArray(); }
    }

    private static void writeArray(Context context, JSONArray array) {
        File target = cacheFile(context);
        File temporary = new File(context.getNoBackupFilesDir(), "aurora-notification-previews.tmp");
        try (FileOutputStream output = new FileOutputStream(temporary)) {
            output.write(array.toString().getBytes(StandardCharsets.UTF_8));
            output.getFD().sync();
        } catch (Exception ignored) { temporary.delete(); return; }
        if (target.exists() && !target.delete()) { temporary.delete(); return; }
        if (!temporary.renameTo(target)) temporary.delete();
    }

    public static JSObject readRecent(Context context) {
        JSObject result = new JSObject();
        result.put("items", readArray(context).toString());
        result.put("localOnly", true);
        result.put("excludedFromBackup", true);
        result.put("limit", MAX_ITEMS);
        return result;
    }

    public static void clearRecent(Context context) {
        cacheFile(context).delete();
        new File(context.getNoBackupFilesDir(), "aurora-notification-previews.tmp").delete();
    }
}
