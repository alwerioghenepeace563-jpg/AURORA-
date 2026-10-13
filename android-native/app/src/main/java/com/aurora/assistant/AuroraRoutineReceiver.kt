package com.aurora.assistant

import android.app.AlarmManager
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.Build
import org.json.JSONArray
import org.json.JSONObject
import java.util.Calendar

/** Schedules recurring daily/weekday/weekend routine reminders using local device time. */
object AuroraRoutineScheduler {
    private const val PREFS = "aurora_custom_routines"
    private const val KEY = "items"
    private const val CHANNEL = "aurora_routines"
    const val EXTRA_ID = "aurora_routine_id"
    const val EXTRA_TITLE = "aurora_routine_title"

    fun scheduleAll(context: Context, routines: List<JSONObject>) {
        val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        val previous = try {
            JSONArray(prefs.getString(KEY, "[]") ?: "[]")
        } catch (_: Exception) { JSONArray() }
        val incomingIds = routines.map { it.optString("id") }.filter { it.isNotBlank() }.toSet()
        val alarm = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager
        // Cancel alarms for routines that were deleted, otherwise a stale notification
        // could still fire even after the routine disappears from the UI.
        for (i in 0 until previous.length()) {
            val old = previous.optJSONObject(i) ?: continue
            val oldId = old.optString("id")
            if (oldId.isBlank() || oldId in incomingIds) continue
            val staleIntent = Intent(context, AuroraRoutineReceiver::class.java).apply {
                action = "com.aurora.assistant.ROUTINE.$oldId"
                putExtra(EXTRA_ID, oldId)
                putExtra(EXTRA_TITLE, old.optString("title", "AURORA routine"))
            }
            val stalePending = PendingIntent.getBroadcast(context, oldId.hashCode(), staleIntent,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
            alarm.cancel(stalePending)
            stalePending.cancel()
        }
        val saved = JSONArray()
        routines.forEach { saved.put(it) }
        prefs.edit().putString(KEY, saved.toString()).apply()
        routines.forEach { routine ->
            val id = routine.optString("id")
            if (id.isBlank()) return@forEach
            val requestCode = id.hashCode()
            val intent = Intent(context, AuroraRoutineReceiver::class.java).apply {
                action = "com.aurora.assistant.ROUTINE.$id"
                putExtra(EXTRA_ID, id)
                putExtra(EXTRA_TITLE, routine.optString("title", "AURORA routine"))
            }
            val pending = PendingIntent.getBroadcast(context, requestCode, intent,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
            if (!routine.optBoolean("enabled", true)) {
                alarm.cancel(pending)
            } else {
                nextOccurrence(routine.optString("time"), routine.optString("days", "Daily"))?.let { at ->
                    alarm.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pending)
                }
            }
        }
    }

    fun scheduleNext(context: Context, id: String) {
        val saved = try {
            JSONArray(context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(KEY, "[]") ?: "[]")
        } catch (_: Exception) { JSONArray() }
        for (i in 0 until saved.length()) {
            val item = saved.optJSONObject(i) ?: continue
            if (item.optString("id") == id && item.optBoolean("enabled", true)) {
                val time = item.optString("time")
                val days = item.optString("days", "Daily")
                val at = nextOccurrence(time, days) ?: return
                val intent = Intent(context, AuroraRoutineReceiver::class.java).apply {
                    action = "com.aurora.assistant.ROUTINE.$id"
                    putExtra(EXTRA_ID, id)
                    putExtra(EXTRA_TITLE, item.optString("title", "AURORA routine"))
                }
                val pending = PendingIntent.getBroadcast(context, id.hashCode(), intent,
                    PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
                (context.getSystemService(Context.ALARM_SERVICE) as AlarmManager)
                    .setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pending)
                return
            }
        }
    }

    fun restore(context: Context) {
        val saved = try {
            JSONArray(context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(KEY, "[]") ?: "[]")
        } catch (_: Exception) { JSONArray() }
        val list = (0 until saved.length()).mapNotNull { saved.optJSONObject(it) }
        scheduleAll(context, list)
    }

    private fun nextOccurrence(time: String, days: String): Long? {
        val match = Regex("^([01]\\d|2[0-3]):([0-5]\\d)$").matchEntire(time) ?: return null
        val hour = match.groupValues[1].toInt()
        val minute = match.groupValues[2].toInt()
        val now = System.currentTimeMillis()
        for (offset in 0..7) {
            val cal = Calendar.getInstance().apply {
                timeInMillis = now
                add(Calendar.DAY_OF_YEAR, offset)
                set(Calendar.HOUR_OF_DAY, hour)
                set(Calendar.MINUTE, minute)
                set(Calendar.SECOND, 0)
                set(Calendar.MILLISECOND, 0)
            }
            val day = cal.get(Calendar.DAY_OF_WEEK)
            val allowed = when (days) {
                "Weekdays" -> day in Calendar.MONDAY..Calendar.FRIDAY
                "Weekends" -> day == Calendar.SATURDAY || day == Calendar.SUNDAY
                else -> true
            }
            if (allowed && cal.timeInMillis > now) return cal.timeInMillis
        }
        return null
    }
}

class AuroraRoutineReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val id = intent.getStringExtra(AuroraRoutineScheduler.EXTRA_ID).orEmpty()
        val title = intent.getStringExtra(AuroraRoutineScheduler.EXTRA_TITLE)?.takeIf { it.isNotBlank() } ?: "AURORA routine"
        val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            manager.createNotificationChannel(NotificationChannel(CHANNEL_ID, "AURORA routines", NotificationManager.IMPORTANCE_DEFAULT))
        }
        val notification = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            android.app.Notification.Builder(context, CHANNEL_ID)
        } else {
            @Suppress("DEPRECATION")
            android.app.Notification.Builder(context)
        }.setSmallIcon(android.R.drawable.ic_dialog_info)
            .setContentTitle("AURORA routine")
            .setContentText(title)
            .setAutoCancel(true)
            .build()
        manager.notify(id.hashCode(), notification)
        AuroraRoutineScheduler.scheduleNext(context, id)
    }

    companion object { private const val CHANNEL_ID = "aurora_routines" }
}
