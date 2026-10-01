export function text(form: FormData, key: string, max = 1000): string {
  const value = form.get(key);
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

export function optionalText(form: FormData, key: string, max = 1000): string | null {
  return text(form, key, max) || null;
}

/** YYYY-MM-DD or null. Returns undefined when the value is present but invalid. */
export function optionalDate(value: string): string | null | undefined {
  if (!value) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  const date = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) return undefined;
  return value;
}

/** http(s) URL or null. Returns undefined when the value is present but not a web address. */
export function optionalWebUrl(value: string): string | null | undefined {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") return undefined;
    return url.toString();
  } catch {
    return undefined;
  }
}

export function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

const EMAIL_RE = /^[^\s@<>(),;:"]+@[^\s@<>(),;:"]+\.[^\s@<>(),;:"]+$/;
export function isEmail(value: string): boolean {
  return value.length <= 254 && EMAIL_RE.test(value);
}
