import { isEmail } from "./validation";

export type ParsedPerson = { name: string; email: string; outstation?: string; distributionLists?: string[] };
export type ParseProblem = { line: number; text: string; reason: string };

/**
 * Parses a typed or pasted list of people, one per line. Accepts
 *   Name, email          (typed, or CSV)
 *   Name<TAB>email       (pasted from a spreadsheet; either column order)
 *   Name <email>
 *   email                (name taken from the part before @)
 * A column that exactly matches one of `outstations` (any case) is read as the person's outstation,
 * e.g. "Sam Patel, sam@example.com, Ferrybridge". Columns matching `distributionLists` are collected
 * the same way, e.g. "Sam Patel, sam@example.com, Ferrybridge, Engineering, Purchasing".
 * Duplicate emails are collapsed; a header row such as "Name, Email" is skipped.
 */
export function parsePeopleList(
  input: string,
  outstations: string[] = [],
  distributionLists: string[] = [],
): { people: ParsedPerson[]; problems: ParseProblem[] } {
  const outstationByKey = new Map(outstations.map((o) => [o.toLowerCase(), o]));
  const listByKey = new Map(distributionLists.map((l) => [l.toLowerCase(), l]));
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
    let outstation: string | undefined;
    const lists: string[] = [];

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
      const outstationIndex = parts.findIndex((p, i) => i !== emailIndex && outstationByKey.has(p.toLowerCase()));
      if (outstationIndex !== -1) outstation = outstationByKey.get(parts[outstationIndex].toLowerCase());
      const listIndexes = new Set<number>();
      parts.forEach((p, i) => {
        const list = i !== emailIndex && i !== outstationIndex ? listByKey.get(p.toLowerCase()) : undefined;
        if (list) {
          listIndexes.add(i);
          if (!lists.includes(list)) lists.push(list);
        }
      });
      name = parts
        .filter((_, i) => i !== emailIndex && i !== outstationIndex && !listIndexes.has(i))
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
    if (outstation) person.outstation = outstation;
    if (lists.length) person.distributionLists = lists;
    people.push(person);
  });

  return { people, problems };
}
