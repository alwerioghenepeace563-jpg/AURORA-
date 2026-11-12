package com.aurora.assistant;
import android.content.Context;
import android.content.Intent;
import androidx.core.content.ContextCompat;
final class IntentHelper {
 static void start(Context context, String action, String title, String message, int percent) {
  Intent intent = new Intent(context, AuroraTranscriptionService.class);
  intent.setAction(action); intent.putExtra("title", title); intent.putExtra("message", message); intent.putExtra("percent", percent);
  if (AuroraTranscriptionService.ACTION_STOP.equals(action)) context.startService(intent);
  else ContextCompat.startForegroundService(context, intent);
 }
}
