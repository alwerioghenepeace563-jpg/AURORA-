package com.aurora.assistant

import android.app.AlarmManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import org.json.JSONArray
import org.json.JSONObject

/** Restores locally saved reminder alarms after Android restarts the device. */
class AuroraBootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != Intent.ACTION_BOOT_COMPLETED &&
            intent.action != "android.intent.action.MY_PACKAGE_REPLACED") return

        AuroraRoutineScheduler.restore(context)

        val prefs = context.getSharedPreferences("aurora_reminder_alarms", Context.MODE_PRIVATE)
        val saved = try { JSONArray(prefs.getString("alarms", "[]") ?: "[]") } catch (_: Exception) { JSONArray() }
        val remaining = JSONArray()
        val alarm = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager
        val now = System.currentTimeMillis()

        for (i in 0 until saved.length()) {
            val item: JSONObject = saved.optJSONObject(i) ?: continue
            val id = item.optInt("id")
            val title = item.optString("title").ifBlank { "AURORA reminder" }
            val at = item.optLong("at")
            if (at <= now) continue
            val broadcast = Intent(context, AuroraReminderReceiver::class.java).apply {
                putExtra(AuroraReminderReceiver.EXTRA_TITLE, title)
                putExtra(AuroraReminderReceiver.EXTRA_ID, id)
            }
            val pending = PendingIntent.getBroadcast(
                context, id, broadcast,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
            )
            alarm.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pending)
            remaining.put(item)
        }
        prefs.edit().putString("alarms", remaining.toString()).apply()
    }
}
