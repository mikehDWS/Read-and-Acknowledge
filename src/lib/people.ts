import { isEmail } from "./validation";

export type ParsedPerson = { name: string; email: string; department?: string };
export type ParseProblem = { line: number; text: string; reason: string };

/**
 * Parses a typed or pasted list of people, one per line. Accepts
 *   Name, email          (typed, or CSV)
 *   Name<TAB>email       (pasted from a spreadsheet; either column order)
 *   Name <email>
 *   email                (name taken from the part before @)
 * A column that exactly matches one of `departments` (any case) is read as the person's department,
 * e.g. "Sam Patel, sam@example.com, Ferrybridge".
 * Duplicate emails are collapsed; a header row such as "Name, Email" is skipped.
 */
export function parsePeopleList(
  input: string,
  departments: string[] = [],
): { people: ParsedPerson[]; problems: ParseProblem[] } {
  const departmentByKey = new Map(departments.map((o) => [o.toLowerCase(), o]));
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
    let department: string | undefined;

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
      const departmentIndex = parts.findIndex((p, i) => i !== emailIndex && departmentByKey.has(p.toLowerCase()));
      if (departmentIndex !== -1) department = departmentByKey.get(parts[departmentIndex].toLowerCase());
      name = parts
        .filter((_, i) => i !== emailIndex && i !== departmentIndex)
        .join(" ")
        .trim();
    }

    email = email.toLowerCase();
    if (!isEmail(email)) {
      problems.push({ line: lineNo, text: line, reason: "Email address doesn't look valid" });
      return;
    }
    if (!name) name = email.split("@")[0];
    if (seen.has(email)) return;
    seen.add(email);
    const person: ParsedPerson = { name: name.slice(0, 200), email };
    if (department) person.department = department;
    people.push(person);
  });

  return { people, problems };
}
