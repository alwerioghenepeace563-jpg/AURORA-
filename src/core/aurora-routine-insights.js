/**
 * Stage 12 approved-routine insight generator.
 * Pure, on-demand analysis of task/reminder/event summaries supplied by the UI.
 * It does not read storage, schedule work, profile behavior, or execute actions.
 */
const clean = (value, limit = 100) => String(value || "").replace(/[\\u0000-\\u001f]/g, " ").trim().slice(0, limit);
const validTime = value => {
  const time = typeof value === "number" ? value : Date.parse(value);
  return Number.isFinite(time) && time > 0 ? time : null;
};

function buildAuroraRoutineInsights(input = {}) {
  const now = Number.isFinite(input.now) ? input.now : Date.now();
  const tasks = Array.isArray(input.tasks) ? input.tasks : [];
  const reminders = Array.isArray(input.reminders) ? input.reminders : [];
  const events = Array.isArray(input.events) ? input.events : [];
  const openTasks = tasks.filter(item => item && item.done !== true);
  const upcomingReminders = reminders
    .filter(item => item && item.done !== true)
    .map(item => ({ title: clean(item.title, 90), at: validTime(item.at) }))
    .filter(item => item.title && item.at !== null && item.at >= now && item.at <= now + 24 * 60 * 60 * 1000)
    .sort((a, b) => a.at - b.at);
  const upcomingEvents = events
    .map(item => ({ title: clean(item?.title, 90), at: validTime(item?.at) }))
    .filter(item => item.title && item.at !== null && item.at >= now && item.at <= now + 24 * 60 * 60 * 1000)
    .sort((a, b) => a.at - b.at);
  const insights = [];
  if (openTasks.length > 1) {
    insights.push({
      id: "routine-focus-" + new Date(now).toISOString().slice(0, 10),
      title: "Choose one task to focus on",
      reason: "You have " + openTasks.length + " unfinished tasks saved. Picking one priority can make the next step clearer.",
      kind: "task_focus"
    });
  } else if (openTasks.length === 1) {
    insights.push({
      id: "routine-next-step-" + new Date(now).toISOString().slice(0, 10),
      title: "Your next saved task",
      reason: "Your task list has one unfinished item: " + clean(openTasks[0].title, 90) + ". Review it and decide when to work on it.",
      kind: "task_next_step"
    });
  }
  const event = upcomingEvents[0];
  if (event) {
    const minutes = Math.max(0, Math.round((event.at - now) / 60000));
    insights.push({
      id: "routine-event-" + event.at,
      title: "Prepare for your upcoming event",
      reason: minutes < 60
        ? "Your saved event, " + event.title + ", is in about " + minutes + " minute(s). Review what you need before it starts."
        : "Your saved event, " + event.title + ", is coming up within 24 hours. You may want to review your preparations.",
      kind: "event_preparation"
    });
  }
  const reminder = upcomingReminders[0];
  if (reminder) {
    const minutes = Math.max(0, Math.round((reminder.at - now) / 60000));
    insights.push({
      id: "routine-reminder-" + reminder.at,
      title: "Upcoming reminder",
      reason: "Your reminder, " + reminder.title + ", is due " + (minutes < 60 ? "in about " + minutes + " minute(s)." : "later today or within 24 hours.") + " Check that it still suits your plan.",
      kind: "reminder_review"
    });
  }
  return insights.slice(0, 3).map(item => Object.freeze(item));
}

export { buildAuroraRoutineInsights };
