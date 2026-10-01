import { isEmail } from "./validation";

export type ParsedPerson = { name: string; email: string };
export type ParseProblem = { line: number; text: string; reason: string };

/**
 * Parses a typed or pasted list of people, one per line. Accepts
 *   Name, email          (typed, or CSV)
 *   Name<TAB>email       (pasted from a spreadsheet; either column order)
 *   Name <email>
 *   email                (name taken from the part before @)
 * Duplicate emails are collapsed; a header row such as "Name, Email" is skipped.
 */
export function parsePeopleList(input: string): { people: ParsedPerson[]; problems: ParseProblem[] } {
  const people: ParsedPerson[] = [];
  const problems: ParseProblem[] = [];
  const seen = new Set<string>();
  let firstLine = true;

  input.split(/\r?\n/).forEach((raw, index) => {
    const line = raw.trim();
    if (!line) return;
    const lineNo = index + 1;
    const isFirstLine = firstLine;
    firstLine = false;

    let name = "";
    let email = "";

    const angle = line.match(/^(.*?)<([^>]+)>\s*$/);
    if (angle) {
      name = angle[1].trim().replace(/^"|"$/g, "").trim();
      email = angle[2].trim();
    } else {
      const parts = line
        .split(/\t|,|;/)
        .map((p) => p.trim().replace(/^"|"$/g, "").trim())
        .filter(Boolean);
      const emailIndex = parts.findIndex((p) => p.includes("@"));
      if (emailIndex === -1) {
        if (isFirstLine && /e-?mail/i.test(line)) return; // header row
        problems.push({ line: lineNo, text: line, reason: "No email address found" });
        return;
      }
      email = parts[emailIndex];
      name = parts.filter((_, i) => i !== emailIndex).join(" ").trim();
    }

    email = email.toLowerCase();
    if (!isEmail(email)) {
      problems.push({ line: lineNo, text: line, reason: "Email address doesn't look valid" });
      return;
    }
    if (!name) name = email.split("@")[0];
    if (seen.has(email)) return;
    seen.add(email);
    people.push({ name: name.slice(0, 200), email });
  });

  return { people, problems };
}
