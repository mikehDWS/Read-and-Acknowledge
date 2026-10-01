import bcrypt from "bcryptjs";
import { MAX_PASSWORD_LENGTH, MIN_PASSWORD_LENGTH } from "./passwords-rules";

export { MIN_PASSWORD_LENGTH };

const COST = 12;

export function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, COST);
}

export function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

// A real hash to compare against when the email is unknown, so response time doesn't reveal it.
const DUMMY_HASH = bcrypt.hashSync("not-a-real-password", COST);
export function verifyAgainstDummy(password: string): Promise<boolean> {
  return bcrypt.compare(password, DUMMY_HASH);
}

export function passwordProblem(password: string, confirm: string): string | null {
  if (password.length < MIN_PASSWORD_LENGTH) {
    return `Use at least ${MIN_PASSWORD_LENGTH} characters.`;
  }
  if (Buffer.byteLength(password, "utf8") > MAX_PASSWORD_LENGTH) {
    return `Use no more than ${MAX_PASSWORD_LENGTH} characters.`;
  }
  if (password !== confirm) return "The two passwords don't match.";
  return null;
}
