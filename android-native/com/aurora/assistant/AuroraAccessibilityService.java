package com.aurora.assistant;

import android.accessibilityservice.AccessibilityService;
import android.view.accessibility.AccessibilityEvent;
import android.view.accessibility.AccessibilityNodeInfo;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

public class AuroraAccessibilityService extends AccessibilityService {
    private static volatile AuroraAccessibilityService instance;

    @Override public void onServiceConnected() { super.onServiceConnected(); instance = this; }
    @Override public void onAccessibilityEvent(AccessibilityEvent event) { }
    @Override public void onInterrupt() { }
    @Override public void onDestroy() { if (instance == this) instance = null; super.onDestroy(); }

    public static String readVisibleText() {
        AuroraAccessibilityService service = instance;
        if (service == null) return null;
        AccessibilityNodeInfo root = service.getRootInActiveWindow();
        if (root == null) return "";
        List<String> lines = new ArrayList<>();
        collectText(root, lines);
        root.recycle();
        StringBuilder result = new StringBuilder();
        for (String line : lines) {
            if (result.length() > 0) result.append("\n");
            result.append(line);
            if (result.length() > 12000) break;
        }
        return result.toString();
    }

    private static void collectText(AccessibilityNodeInfo node, List<String> lines) {
        if (node == null || lines.size() >= 400) return;
        CharSequence text = node.getText();
        if (text == null) text = node.getContentDescription();
        if (text != null && text.length() > 0) {
            String value = text.toString().trim();
            if (!value.isEmpty() && !lines.contains(value)) lines.add(value);
        }
        for (int i = 0; i < node.getChildCount(); i++) {
            AccessibilityNodeInfo child = node.getChild(i);
            if (child != null) { collectText(child, lines); child.recycle(); }
        }
    }

    public static boolean clickVisibleText(String target) {
        AuroraAccessibilityService service = instance;
        if (service == null) return false;
        AccessibilityNodeInfo root = service.getRootInActiveWindow();
        if (root == null) return false;
        boolean clicked = clickMatch(root, target.toLowerCase(Locale.ROOT));
        root.recycle();
        return clicked;
    }

    private static boolean clickMatch(AccessibilityNodeInfo node, String target) {
        if (node == null) return false;
        CharSequence label = node.getText();
        if (label == null) label = node.getContentDescription();
        if (label != null && label.toString().toLowerCase(Locale.ROOT).contains(target)
                && node.isClickable() && node.isEnabled()) {
            return node.performAction(AccessibilityNodeInfo.ACTION_CLICK);
        }
        for (int i = 0; i < node.getChildCount(); i++) {
            AccessibilityNodeInfo child = node.getChild(i);
            if (child != null) {
                boolean clicked = clickMatch(child, target);
                child.recycle();
                if (clicked) return true;
            }
        }
        return false;
    }
}
