package com.aurora.assistant;
import android.content.Context;
import android.content.Intent;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.service.voice.VoiceInteractionSession;
import android.view.Gravity;
import android.view.View;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.TextView;
/** Assistant session with an explicit user action; it never launches AURORA automatically. */
public class AuroraVoiceInteractionSession extends VoiceInteractionSession {
 public AuroraVoiceInteractionSession(Context context) { super(context); }
 @Override public View onCreateContentView() {
  Context context=getContext();
  LinearLayout panel=new LinearLayout(context);
  panel.setOrientation(LinearLayout.VERTICAL);
  panel.setGravity(Gravity.CENTER_HORIZONTAL);
  int pad=dp(22); panel.setPadding(pad,pad,pad,pad);
  GradientDrawable bg=new GradientDrawable(); bg.setColor(Color.rgb(19,20,32)); bg.setCornerRadius(dp(24)); panel.setBackground(bg);
  TextView title=new TextView(context); title.setText("AURORA"); title.setTextColor(Color.WHITE); title.setTextSize(22); title.setTypeface(Typeface.DEFAULT,Typeface.BOLD); title.setGravity(Gravity.CENTER);
  panel.addView(title,new LinearLayout.LayoutParams(-1,-2));
  TextView info=new TextView(context); info.setText("Your Android assistant is ready. Open AURORA to continue."); info.setTextColor(Color.rgb(220,222,235)); info.setTextSize(14); info.setGravity(Gravity.CENTER);
  LinearLayout.LayoutParams ip=new LinearLayout.LayoutParams(-1,-2); ip.topMargin=dp(10); panel.addView(info,ip);
  Button open=new Button(context); open.setText("Open AURORA"); LinearLayout.LayoutParams bp=new LinearLayout.LayoutParams(-1,-2); bp.topMargin=dp(18); panel.addView(open,bp);
  open.setOnClickListener(v -> {
   context.getSharedPreferences("aurora_assistant",Context.MODE_PRIVATE).edit().putBoolean("pulse_open_requested",true).apply();
   Intent intent=new Intent(context,MainActivity.class); intent.setAction("com.aurora.assistant.OPEN_PULSE");
   intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK|Intent.FLAG_ACTIVITY_CLEAR_TOP|Intent.FLAG_ACTIVITY_SINGLE_TOP);
   context.startActivity(intent); finish();
  });
  return panel;
 }
 private int dp(int value) { return (int)(value*getContext().getResources().getDisplayMetrics().density+0.5f); }
}
