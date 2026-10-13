package com.aurora.assistant

import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.Build

class AuroraReminderReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val title = intent.getStringExtra(EXTRA_TITLE)?.takeIf { it.isNotBlank() } ?: "AURORA reminder"
        val id = intent.getIntExtra(EXTRA_ID, title.hashCode())
        val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            manager.createNotificationChannel(
                NotificationChannel(CHANNEL_ID, "AURORA reminders", NotificationManager.IMPORTANCE_HIGH).apply {
                    description = "Scheduled reminders created in AURORA"
                }
            )
        }
        val notification = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            android.app.Notification.Builder(context, CHANNEL_ID)
        } else {
            @Suppress("DEPRECATION")
            android.app.Notification.Builder(context)
        }.setSmallIcon(android.R.drawable.ic_dialog_info)
            .setContentTitle("AURORA reminder")
            .setContentText(title)
            .setAutoCancel(true)
            .build()
        manager.notify(id, notification)
    }

    companion object {
        const val EXTRA_TITLE = "aurora_reminder_title"
        const val EXTRA_ID = "aurora_reminder_id"
        private const val CHANNEL_ID = "aurora_reminders"
    }
}
