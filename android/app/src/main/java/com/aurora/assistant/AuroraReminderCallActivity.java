package com.aurora.assistant;

import android.app.Activity;
import android.app.AlarmManager;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Intent;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.os.Bundle;
import android.view.Gravity;
import android.view.View;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.TextView;
import org.json.JSONObject;

/** Tap-open reminder call-style screen. It never places a telephone call or bypasses the lock screen. */
public class AuroraReminderCallActivity extends Activity {
    private String reminderId, reminderTitle, reminderMessage;
    private int notificationId;
    private int dp(float value) { return (int)(value * getResources().getDisplayMetrics().density + 0.5f); }

    @Override protected void onCreate(Bundle state) {
        super.onCreate(state);
        reminderId=getIntent().getStringExtra("id");
        reminderTitle=getIntent().getStringExtra("title");
        reminderMessage=getIntent().getStringExtra("message");
        notificationId=getIntent().getIntExtra("notificationId",0);
        getWindow().setStatusBarColor(Color.rgb(7,12,25));
        getWindow().setNavigationBarColor(Color.rgb(7,12,25));
        LinearLayout root=new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setGravity(Gravity.CENTER);
        root.setPadding(dp(28),dp(36),dp(28),dp(36));
        root.setBackground(new GradientDrawable(GradientDrawable.Orientation.TL_BR,
            new int[]{Color.rgb(10,24,48),Color.rgb(5,9,20),Color.rgb(22,13,48)}));
        TextView brand=new TextView(this); brand.setText("A U R O R A"); brand.setTextColor(Color.rgb(111,224,255)); brand.setTextSize(14); brand.setLetterSpacing(.22f); brand.setGravity(Gravity.CENTER);
        root.addView(brand,new LinearLayout.LayoutParams(-1,dp(42)));
        TextView orb=new TextView(this); orb.setText("✦"); orb.setTextColor(Color.WHITE); orb.setTextSize(44); orb.setGravity(Gravity.CENTER);
        GradientDrawable glow=new GradientDrawable(); glow.setShape(GradientDrawable.OVAL); glow.setColors(new int[]{Color.rgb(90,160,255),Color.rgb(117,77,211)}); orb.setBackground(glow);
        LinearLayout.LayoutParams orbParams=new LinearLayout.LayoutParams(dp(116),dp(116)); orbParams.gravity=Gravity.CENTER; orbParams.topMargin=dp(28); orbParams.bottomMargin=dp(28); root.addView(orb,orbParams);
        TextView label=new TextView(this); label.setText("REMINDER CALL"); label.setTextColor(Color.rgb(111,224,255)); label.setTextSize(12); label.setLetterSpacing(.18f); label.setGravity(Gravity.CENTER); root.addView(label);
        TextView title=new TextView(this); title.setText(reminderTitle==null?"AURORA reminder":reminderTitle); title.setTextColor(Color.WHITE); title.setTextSize(25); title.setTypeface(Typeface.DEFAULT,Typeface.BOLD); title.setGravity(Gravity.CENTER); title.setPadding(0,dp(14),0,dp(10)); root.addView(title);
        TextView message=new TextView(this); message.setText(reminderMessage==null?"Your scheduled reminder is due.":reminderMessage); message.setTextColor(Color.rgb(190,202,224)); message.setTextSize(15); message.setGravity(Gravity.CENTER); root.addView(message);
        View spacer=new View(this); root.addView(spacer,new LinearLayout.LayoutParams(1,dp(54)));
        Button snooze=new Button(this); snooze.setText("SNOOZE · 10 MIN"); snooze.setTextColor(Color.WHITE); snooze.setBackground(buttonBackground(Color.rgb(46,91,151))); root.addView(snooze,new LinearLayout.LayoutParams(-1,dp(54)));
        Button dismiss=new Button(this); dismiss.setText("DISMISS"); dismiss.setTextColor(Color.WHITE); dismiss.setBackground(buttonBackground(Color.rgb(34,49,72))); LinearLayout.LayoutParams dismissParams=new LinearLayout.LayoutParams(-1,dp(54)); dismissParams.topMargin=dp(12); root.addView(dismiss,dismissParams);
        snooze.setOnClickListener(v->{scheduleSnooze();finish();});
        dismiss.setOnClickListener(v->{cancelNotification();finish();});
        setContentView(root);
    }
    private GradientDrawable buttonBackground(int color){GradientDrawable d=new GradientDrawable();d.setColor(color);d.setCornerRadius(dp(28));return d;}
    private void cancelNotification(){NotificationManager manager=(NotificationManager)getSystemService(NOTIFICATION_SERVICE);if(manager!=null)manager.cancel(notificationId);}
    private void scheduleSnooze(){
        if(reminderId==null||reminderId.trim().isEmpty())return;
        Intent intent=new Intent(this,AuroraReminderReceiver.class);intent.setAction("com.aurora.assistant.REMINDER");
        intent.putExtra("id",reminderId);intent.putExtra("title",reminderTitle);intent.putExtra("message",reminderMessage);
        PendingIntent pending=PendingIntent.getBroadcast(this,reminderId.hashCode()&0x7fffffff,intent,PendingIntent.FLAG_UPDATE_CURRENT|(android.os.Build.VERSION.SDK_INT>=23?PendingIntent.FLAG_IMMUTABLE:0));
        AlarmManager alarms=(AlarmManager)getSystemService(ALARM_SERVICE);
        if(alarms!=null){
            long at=System.currentTimeMillis()+600000L;
            if(android.os.Build.VERSION.SDK_INT>=23)alarms.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP,at,pending);else alarms.set(AlarmManager.RTC_WAKEUP,at,pending);
            try {
                JSONObject saved=new JSONObject(); saved.put("id",reminderId); saved.put("title",reminderTitle); saved.put("message",reminderMessage==null?"":reminderMessage); saved.put("at",at);
                getSharedPreferences("aurora_reminders",MODE_PRIVATE).edit().putString(reminderId,saved.toString()).apply();
            } catch(Exception ignored) {}
        }
        cancelNotification();
    }
}
