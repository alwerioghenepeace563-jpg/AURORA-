package com.aurora.assistant;
import android.accessibilityservice.AccessibilityService;
import android.view.accessibility.AccessibilityEvent;
import android.view.accessibility.AccessibilityNodeInfo;
import java.util.ArrayList;
import java.util.List;
/** Screen text is captured only on an explicit user Read Screen request; accessibility events are never cached. */
public class AuroraAccessibilityService extends AccessibilityService {
 private static volatile AuroraAccessibilityService instance;
 @Override public void onServiceConnected(){super.onServiceConnected();instance=this;}
 @Override public void onAccessibilityEvent(AccessibilityEvent event){/* No background screen inspection or caching. */}
 @Override public void onInterrupt(){}
 @Override public void onDestroy(){if(instance==this)instance=null;super.onDestroy();}
 public static String readVisibleText(){
  AuroraAccessibilityService service=instance;if(service==null)return null;
  AccessibilityNodeInfo root=service.getRootInActiveWindow();if(root==null)return null;
  try{CharSequence pkg=root.getPackageName();if(pkg==null||"com.aurora.assistant".contentEquals(pkg))return null;return collectVisibleText(root);}
  finally{root.recycle();}
 }
 private static String collectVisibleText(AccessibilityNodeInfo root){
  List<String> lines=new ArrayList<>();collect(root,lines);StringBuilder out=new StringBuilder();
  for(String line:lines){if(out.length()>0)out.append("\n");out.append(line);if(out.length()>=12000)break;}return out.toString();
 }
 private static void collect(AccessibilityNodeInfo node,List<String> lines){
  if(node==null||lines.size()>=400)return;CharSequence value=node.getText();if(value==null)value=node.getContentDescription();
  if(value!=null){String text=value.toString().trim();if(!text.isEmpty()&&!lines.contains(text))lines.add(text);}
  for(int i=0;i<node.getChildCount();i++){AccessibilityNodeInfo child=node.getChild(i);if(child!=null){collect(child,lines);child.recycle();}}
 }
}
