function parseCalendarIntent(message, now = new Date()) {
  const match = message.match(/^\s*(?:hey aurora[, ]*)?(?:please\s+)?(?:remind me to|add|create|schedule|put)\s+(.+?)\s+(?:for\s+)?(?:on\s+)?(today|tomorrow|monday|tuesday|wednesday|thursday|friday|saturday|sunday|\d{4}-\d{2}-\d{2})\s+at\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)\s*$/i);
  if (!match) return null;
  const title = match[1].replace(/\s+(?:in|to)\s+(?:my\s+)?calendar$/i, "").trim();
  if (!title) return null;
  const dayToken = match[2].toLowerCase();
  const hourInput = Number(match[3]);
  const minute = Number(match[4] || 0);
  const meridiem = match[5].toLowerCase();
  if (hourInput < 1 || hourInput > 12 || minute > 59) return null;
  const date = new Date(now.getTime());
  if (dayToken === "tomorrow") date.setDate(date.getDate() + 1);
  else if (dayToken !== "today") {
    const weekdays = ["sunday","monday","tuesday","wednesday","thursday","friday","saturday"];
    if (dayToken.includes("-")) {
      const [year, month, day] = dayToken.split("-").map(Number);
      date.setFullYear(year, month - 1, day);
    } else {
      const target = weekdays.indexOf(dayToken);
      const delta = (target - date.getDay() + 7) % 7 || 7;
      date.setDate(date.getDate() + delta);
    }
  }
  let hour = hourInput % 12;
  if (meridiem === "pm") hour += 12;
  date.setHours(hour, minute, 0, 0);
  if (!Number.isFinite(date.getTime()) || date.getTime() <= now.getTime()) return null;
  return { title, beginTime: date.getTime(), endTime: date.getTime() + 60 * 60 * 1000 };
}

export { parseCalendarIntent };
