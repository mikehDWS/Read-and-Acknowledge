import { describe, expect, it } from "vitest";
import { isOverdue, todayIso } from "@/lib/format";
import { afterFailedLogin, isLocked, MAX_FAILED_LOGINS } from "@/lib/lockout";
import { passwordProblem } from "@/lib/passwords";
import { RateLimiter } from "@/lib/rate-limit";
import { clientIp, safeNextPath } from "@/lib/request";
import { hashToken, isWellFormedToken, newToken } from "@/lib/tokens";
import { isEmail, optionalDate, optionalWebUrl } from "@/lib/validation";

const headers = (h: Record<string, string>) => ({ get: (k: string) => h[k.toLowerCase()] ?? null });

describe("validation", () => {
  it("accepts real calendar dates only", () => {
    expect(optionalDate("")).toBeNull();
    expect(optionalDate("2026-02-28")).toBe("2026-02-28");
    expect(optionalDate("2026-02-30")).toBeUndefined();
    expect(optionalDate("28/02/2026")).toBeUndefined();
  });

  it("accepts only http(s) document links", () => {
    expect(optionalWebUrl("https://intranet.example.com/policy")).toBe("https://intranet.example.com/policy");
    expect(optionalWebUrl("javascript:alert(1)")).toBeUndefined();
    expect(optionalWebUrl("not a url")).toBeUndefined();
  });

  it("checks emails", () => {
    expect(isEmail("a.b@example.co.uk")).toBe(true);
    expect(isEmail("a@b")).toBe(false);
    expect(isEmail("a b@example.com")).toBe(false);
  });

  it("checks passwords", () => {
    expect(passwordProblem("short", "short")).toMatch(/at least/);
    expect(passwordProblem("long enough phrase", "different phrase!")).toMatch(/match/);
    expect(passwordProblem("long enough phrase", "long enough phrase")).toBeNull();
  });
});

describe("tokens", () => {
  it("are long, URL-safe and hashed deterministically", () => {
    const t = newToken();
    expect(isWellFormedToken(t)).toBe(true);
    expect(newToken()).not.toBe(t);
    expect(hashToken(t)).toBe(hashToken(t));
    expect(hashToken(t)).not.toContain(t);
    expect(isWellFormedToken("../../etc")).toBe(false);
  });
});

describe("sign-in protection", () => {
  it(`locks after ${MAX_FAILED_LOGINS} failures`, () => {
    const now = new Date("2026-10-01T10:00:00Z");
    let state = { failedCount: 0, lockedUntil: null as Date | null };
    for (let i = 0; i < MAX_FAILED_LOGINS - 1; i++) state = afterFailedLogin(state.failedCount, now);
    expect(state.lockedUntil).toBeNull();
    state = afterFailedLogin(state.failedCount, now);
    expect(isLocked(state.lockedUntil, now)).toBe(true);
    expect(isLocked(state.lockedUntil, new Date("2026-10-01T10:16:00Z"))).toBe(false);
  });

  it("rate limits per key within a window", () => {
    const limiter = new RateLimiter(2, 1000);
    expect(limiter.hit("k", 0)).toBe(true);
    expect(limiter.hit("k", 1)).toBe(true);
    expect(limiter.hit("k", 2)).toBe(false);
    expect(limiter.hit("other", 2)).toBe(true);
    expect(limiter.hit("k", 1001)).toBe(true);
  });
});

describe("request helpers", () => {
  it("only redirects within the site", () => {
    expect(safeNextPath("/sign/abc")).toBe("/sign/abc");
    expect(safeNextPath("https://evil.example")).toBe("/");
    expect(safeNextPath("//evil.example")).toBe("/");
    expect(safeNextPath("/\\evil.example")).toBe("/");
  });

  it("takes the first forwarded IP", () => {
    expect(clientIp(headers({ "x-forwarded-for": "203.0.113.5, 10.0.0.1" }))).toBe("203.0.113.5");
    expect(clientIp(headers({}))).toBeNull();
  });
});

describe("due dates", () => {
  it("are overdue only after the due day ends in the app's time zone", () => {
    const now = new Date("2026-10-01T22:30:00Z"); // 23:30 in London (BST)
    expect(todayIso(now)).toBe("2026-10-01");
    expect(isOverdue("2026-10-01", now)).toBe(false);
    expect(isOverdue("2026-09-30", now)).toBe(true);
    expect(isOverdue(null, now)).toBe(false);
  });
});
