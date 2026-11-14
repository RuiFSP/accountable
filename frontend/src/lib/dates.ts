/** Dates: ISO strings in, human labels out. All comparisons happen in local time. */

function parseIsoDate(isoDate: string): Date {
  const [year, month, day] = isoDate.slice(0, 10).split("-").map(Number);
  return new Date(year, month - 1, day);
}

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function dayDifference(isoDate: string, today: Date): number {
  const due = startOfDay(parseIsoDate(isoDate)).getTime();
  const reference = startOfDay(today).getTime();
  return Math.round((due - reference) / 86_400_000);
}

/** "Nov 14, 2026" from a "YYYY-MM-DD" close date. */
export function formatDate(isoDate: string | null): string {
  if (!isoDate) {
    return "—";
  }
  return parseIsoDate(isoDate).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

/** "Nov 10, 2026 · 9:30 AM" from an activity timestamp. */
export function formatDateTime(isoDateTime: string): string {
  const date = new Date(isoDateTime);
  if (Number.isNaN(date.getTime())) {
    return "—";
  }
  const day = date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  const time = date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
  return `${day} · ${time}`;
}

/** True when a due date is before today. */
export function isOverdue(isoDate: string, today: Date = new Date()): boolean {
  return dayDifference(isoDate, today) < 0;
}

/** Label for a due date: "Today", "Tomorrow", "3 days late", or the date itself. */
export function formatDue(isoDate: string, today: Date = new Date()): string {
  const difference = dayDifference(isoDate, today);
  if (difference === 0) {
    return "Today";
  }
  if (difference === 1) {
    return "Tomorrow";
  }
  if (difference === -1) {
    return "1 day late";
  }
  if (difference < 0) {
    return `${-difference} days late`;
  }
  return formatDate(isoDate);
}

/** "YYYY-MM-DDTHH:mm" for datetime-local inputs, at the current local time. */
export function datetimeLocalNow(): string {
  const now = new Date();
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T${pad(now.getHours())}:${pad(now.getMinutes())}`;
}
