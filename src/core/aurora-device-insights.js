/**
 * One-shot, user-invoked device health insights. Only coarse thresholds leave
 * this pure helper; raw device metrics are not persisted by this module.
 */
function buildAuroraDeviceInsights(status = {}) {
  const insights = [];
  const battery = Number(status.batteryPercent);
  if (Number.isFinite(battery) && battery >= 0 && battery <= 20 && status.charging !== true) {
    insights.push(Object.freeze({
      id: "device-battery-low",
      title: "Battery is running low",
      reason: "Your device reports " + Math.round(battery) + "% battery and is not charging. Consider charging soon or reducing optional battery use.",
      kind: "device_battery"
    }));
  }
  const thermal = Number(status.thermalStatus);
  if (Number.isInteger(thermal) && thermal >= 3) {
    insights.push(Object.freeze({
      id: "device-thermal-review",
      title: "Review device temperature",
      reason: "Android reports an elevated thermal state. Consider pausing demanding activity and allowing the device to cool naturally.",
      kind: "device_thermal"
    }));
  }
  if (status.memoryLow === true) {
    insights.push(Object.freeze({
      id: "device-memory-low",
      title: "Device memory is low",
      reason: "Android reports low available memory. Consider closing apps you are not using.",
      kind: "device_memory"
    }));
  }
  return insights.slice(0, 3);
}
export { buildAuroraDeviceInsights };
