type HeaderLike = { get(name: string): string | null };

/** Best-effort client IP: the first address in X-Forwarded-For, set by the hosting proxy. */
export function clientIp(headers: HeaderLike): string | null {
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first.slice(0, 100);
  }
  return headers.get("x-real-ip")?.trim().slice(0, 100) || null;
}

export function userAgent(headers: HeaderLike): string | null {
  return headers.get("user-agent")?.slice(0, 500) || null;
}

/** Base URL for links admins copy. Prefer APP_URL so links don't depend on the Host header. */
export function appBaseUrl(headers: HeaderLike): string {
  const configured = process.env.APP_URL?.trim();
  if (configured) return configured.replace(/\/$/, "");
  const host = headers.get("x-forwarded-host") ?? headers.get("host") ?? "localhost:3000";
  const proto = headers.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

/** Only allow redirects to a path on this site. */
export function safeNextPath(next: string | null | undefined, fallback = "/"): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) {
    return fallback;
  }
  return next;
}
