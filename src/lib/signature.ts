export type SignatureMethod = "drawn" | "typed";

export type Signature = { png: Buffer; method: SignatureMethod; typedName: string | null };

/** A signature image is small; anything bigger is not a signature pad drawing. */
export const MAX_SIGNATURE_BYTES = 200_000;
const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const DATA_URL_PREFIX = "data:image/png;base64,";

/**
 * Checks the signature sent by the sign form: a PNG data URL from the signature pad, how it was
 * made, and for a typed signature the name typed. Returns a problem message or the signature.
 */
export function readSignature(dataUrl: string, method: string, typedName: string): Signature | string {
  if (method !== "drawn" && method !== "typed") return "Sign in the box before you confirm.";
  if (method === "typed" && !typedName.trim()) return "Type your full name to sign.";
  if (!dataUrl.startsWith(DATA_URL_PREFIX)) return "Sign in the box before you confirm.";
  const base64 = dataUrl.slice(DATA_URL_PREFIX.length);
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(base64)) return "That signature couldn't be read. Clear it and sign again.";
  if ((base64.length * 3) / 4 > MAX_SIGNATURE_BYTES) return "That signature is too large. Clear it and sign again.";
  const png = Buffer.from(base64, "base64");
  if (png.length < 67 || !png.subarray(0, 8).equals(PNG_MAGIC)) {
    return "That signature couldn't be read. Clear it and sign again.";
  }
  return { png, method, typedName: method === "typed" ? typedName.trim().slice(0, 200) : null };
}
