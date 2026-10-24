package com.aurora.assistant;

import android.accessibilityservice.AccessibilityService;
import android.view.accessibility.AccessibilityEvent;
import android.view.accessibility.AccessibilityNodeInfo;
import java.util.ArrayList;
import java.util.List;

public class AuroraAccessibilityService extends AccessibilityService {
    private static volatile AuroraAccessibilityService instance;
    private static volatile String lastExternalScreenText = "";

    @Override public void onServiceConnected() {
        super.onServiceConnected();
        instance = this;
    }

    @Override public void onAccessibilityEvent(AccessibilityEvent event) {
        if (event == null || event.getPackageName() == null
                || "com.aurora.assistant".contentEquals(event.getPackageName())) return;
        AccessibilityNodeInfo root = getRootInActiveWindow();
        if (root == null) return;
        String visible = collectVisibleText(root);
        root.recycle();
        if (visible != null && !visible.trim().isEmpty()) lastExternalScreenText = visible;
    }

    @Override public void onInterrupt() { }

    @Override public void onDestroy() {
        if (instance == this) instance = null;
        super.onDestroy();
    }

    public static String readVisibleText() {
        AuroraAccessibilityService service = instance;
        if (service == null) return null;
        AccessibilityNodeInfo root = service.getRootInActiveWindow();
        if (root == null) return lastExternalScreenText;
        String packageName = String.valueOf(root.getPackageName());
        String visible = collectVisibleText(root);
        root.recycle();
        if (!"com.aurora.assistant".equals(packageName) && visible != null && !visible.trim().isEmpty()) {
            lastExternalScreenText = visible;
            return visible;
        }
        return lastExternalScreenText;
    }

    private static String collectVisibleText(AccessibilityNodeInfo root) {
        List<String> lines = new ArrayList<>();
        collect(root, lines);
        StringBuilder result = new StringBuilder();
        for (String line : lines) {
            if (result.length() > 0) result.append("\n");
            result.append(line);
            if (result.length() >= 12000) break;
        }
        return result.toString();
    }

    private static void collect(AccessibilityNodeInfo node, List<String> lines) {
        if (node == null || lines.size() >= 400) return;
        CharSequence text = node.getText();
        if (text == null) text = node.getContentDescription();
        if (text != null) {
            String value = text.toString().trim();
            if (!value.isEmpty() && !lines.contains(value)) lines.add(value);
        }
        for (int i = 0; i < node.getChildCount(); i++) {
            AccessibilityNodeInfo child = node.getChild(i);
            if (child != null) { collect(child, lines); child.recycle(); }
        }
    }
}