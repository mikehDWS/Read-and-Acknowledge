const TIME_ZONE = process.env.APP_TIME_ZONE ?? "Europe/London";

export function formatDateTime(value: Date | string): string {
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: TIME_ZONE,
  }).format(new Date(value));
}

/** A calendar date stored as YYYY-MM-DD (no time zone). */
export function formatDate(value: string): string {
  return new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeZone: "UTC" }).format(
    new Date(`${value}T00:00:00Z`),
  );
}

/** Today's date in the app's time zone, as YYYY-MM-DD. */
export function todayIso(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TIME_ZONE }).format(now);
}

export function isOverdue(dueDate: string | null, now: Date = new Date()): boolean {
  return dueDate !== null && dueDate < todayIso(now);
}
