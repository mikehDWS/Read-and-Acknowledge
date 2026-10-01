export const MAX_FAILED_LOGINS = 5;
export const LOCKOUT_MINUTES = 15;

export function isLocked(lockedUntil: Date | null, now: Date = new Date()): boolean {
  return lockedUntil !== null && lockedUntil.getTime() > now.getTime();
}

/** New counter state after a failed sign-in; locks the account at the threshold. */
export function afterFailedLogin(
  failedCount: number,
  now: Date = new Date(),
): { failedCount: number; lockedUntil: Date | null } {
  const next = failedCount + 1;
  if (next >= MAX_FAILED_LOGINS) {
    return { failedCount: 0, lockedUntil: new Date(now.getTime() + LOCKOUT_MINUTES * 60_000) };
  }
  return { failedCount: next, lockedUntil: null };
}
