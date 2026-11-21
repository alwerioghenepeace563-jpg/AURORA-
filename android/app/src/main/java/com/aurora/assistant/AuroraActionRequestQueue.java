package com.aurora.assistant;

import android.content.Context;
import android.content.SharedPreferences;
import org.json.JSONArray;
import org.json.JSONObject;

/** Small, bounded, expiring handoff queue shared by the wake listener and Pulse overlay. */
public final class AuroraActionRequestQueue {
    private static final String PREFS = "aurora_assistant";
    private static final String QUEUE_KEY = "pulse_action_queue_v1";
    private static final int MAX_ITEMS = 10;
    private static final long TTL_MS = 10L * 60L * 1000L;
    private static final Object LOCK = new Object();

    private AuroraActionRequestQueue() {}

    public static boolean enqueue(Context context, String rawQuery, String source) {
        String query = rawQuery == null ? "" : rawQuery.trim();
        if (query.isEmpty() || query.length() > 2000) return false;
        String safeSource = "wake_word".equals(source) ? "wake_word" : "pulse_overlay";
        synchronized (LOCK) {
            SharedPreferences prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
            JSONArray queue = readAndPrune(prefs, System.currentTimeMillis());
            if (queue.length() >= MAX_ITEMS) return false;
            try {
                JSONObject item = new JSONObject();
                item.put("requestId", java.util.UUID.randomUUID().toString());
                item.put("query", query);
                item.put("source", safeSource);
                item.put("createdAt", System.currentTimeMillis());
                queue.put(item);
                return prefs.edit().putString(QUEUE_KEY, queue.toString())\n                    .remove("pulse_action_request").remove("pulse_action_request_at").commit();
            } catch (Exception error) {
                android.util.Log.w("AURORAActionQueue", "Could not enqueue assistant request.", error);
                return false;
            }
        }
    }

    public static JSONObject dequeue(Context context) {
        synchronized (LOCK) {
            SharedPreferences prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
            JSONArray queue = readAndPrune(prefs, System.currentTimeMillis());
            if (queue.length() == 0) {
                prefs.edit().remove(QUEUE_KEY).remove("pulse_action_request")
                    .remove("pulse_action_request_at").apply();
                return new JSONObject();
            }
            JSONObject next = queue.optJSONObject(0);
            JSONArray remaining = new JSONArray();
            for (int i = 1; i < queue.length(); i++) {
                JSONObject item = queue.optJSONObject(i);
                if (item != null) remaining.put(item);
            }
            prefs.edit().putString(QUEUE_KEY, remaining.toString())
                .remove("pulse_action_request").remove("pulse_action_request_at").apply();
            return next == null ? new JSONObject() : next;
        }
    }

    private static JSONArray readAndPrune(SharedPreferences prefs, long now) {
        JSONArray stored;
        try { stored = new JSONArray(prefs.getString(QUEUE_KEY, "[]")); }
        catch (Exception ignored) { stored = new JSONArray(); }
        JSONArray clean = new JSONArray();
        for (int i = 0; i < stored.length() && clean.length() < MAX_ITEMS; i++) {
            JSONObject item = stored.optJSONObject(i);
            if (item == null) continue;
            long createdAt = item.optLong("createdAt", 0L);
            String query = item.optString("query", "").trim();
            if (createdAt > 0L && now >= createdAt && now - createdAt <= TTL_MS
                && !query.isEmpty() && query.length() <= 2000) clean.put(item);
        }

        // Migrate a still-valid single-slot request written by older AURORA builds.
        String legacy = prefs.getString("pulse_action_request", "");
        long legacyAt = prefs.getLong("pulse_action_request_at", 0L);
        if (clean.length() < MAX_ITEMS && legacy != null && !legacy.trim().isEmpty()
            && legacyAt > 0L && now >= legacyAt && now - legacyAt <= TTL_MS) {
            try {
                JSONObject item = new JSONObject();
                item.put("requestId", java.util.UUID.randomUUID().toString());
                item.put("query", legacy.trim().substring(0, Math.min(2000, legacy.trim().length())));
                item.put("source", "pulse_overlay");
                item.put("createdAt", legacyAt);
                clean.put(item);
            } catch (Exception ignored) {}
        }
        return clean;
    }
}
