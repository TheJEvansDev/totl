// Date helpers. Calendar dates are "YYYY-MM-DD" strings; instants are ISO UTC.

const DAY_MS = 86_400_000;

export function parseDate(d: string): number {
  const [y, m, day] = d.split("-").map(Number);
  return Date.UTC(y, m - 1, day);
}

export function formatDate(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

export function addDays(d: string, n: number): string {
  return formatDate(parseDate(d) + n * DAY_MS);
}

export function daysBetween(a: string, b: string): number {
  return Math.round((parseDate(b) - parseDate(a)) / DAY_MS);
}

/** 0 = Sunday ... 6 = Saturday */
export function dayOfWeek(d: string): number {
  return new Date(parseDate(d)).getUTCDay();
}

export function isValidDate(d: unknown): d is string {
  return typeof d === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d) && !Number.isNaN(parseDate(d));
}

export function todayUK(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London" }).format(new Date());
}

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
export function dayName(d: string): string {
  return DAY_NAMES[dayOfWeek(d)];
}

// Creating formatters is slow, so keep one per time zone.
const offsetFormatters = new Map<string, Intl.DateTimeFormat>();
const dateFormatters = new Map<string, Intl.DateTimeFormat>();

/** Offset of a time zone from UTC at a given instant, in minutes. */
function tzOffsetMins(utcMs: number, tz: string): number {
  let fmt = offsetFormatters.get(tz);
  if (!fmt) {
    fmt = new Intl.DateTimeFormat("en-GB", {
      timeZone: tz,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
    offsetFormatters.set(tz, fmt);
  }
  const parts = fmt.formatToParts(new Date(utcMs));
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"));
  return Math.round((asUtc - Math.floor(utcMs / 60000) * 60000) / 60000);
}

/** Convert a local date + minutes after midnight in a time zone to an ISO UTC string. */
export function localToUtc(date: string, minutes: number, tz: string): string {
  const guess = parseDate(date) + minutes * 60000;
  let ms = guess - tzOffsetMins(guess, tz) * 60000;
  ms = guess - tzOffsetMins(ms, tz) * 60000;
  return new Date(ms).toISOString();
}

/** Local hour (with fraction) of an instant in a time zone. */
export function localHour(iso: string, tz: string): number {
  const ms = Date.parse(iso);
  const local = ms + tzOffsetMins(ms, tz) * 60000;
  const d = new Date(local);
  return d.getUTCHours() + d.getUTCMinutes() / 60;
}

/** Local calendar date of an instant in a time zone. */
export function localDate(iso: string, tz: string): string {
  let fmt = dateFormatters.get(tz);
  if (!fmt) {
    fmt = new Intl.DateTimeFormat("en-CA", { timeZone: tz });
    dateFormatters.set(tz, fmt);
  }
  return fmt.format(new Date(iso));
}

export function hoursBetween(aIso: string, bIso: string): number {
  return (Date.parse(bIso) - Date.parse(aIso)) / 3_600_000;
}
