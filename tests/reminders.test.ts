import { describe, expect, it } from "vitest";
import { renderDigest, weekStart, type ManagerDigest } from "@/lib/reminders";

const digest: ManagerDigest = {
  userId: "u1",
  name: "Priya Shah",
  email: "priya@example.com",
  departments: ["Ferrybridge"],
  outstanding: 2,
  documents: [
    {
      id: "d1",
      name: "Brake <Test> Briefing",
      due: "2026-09-30",
      overdue: true,
      linkToken: "tok123",
      outstanding: [
        { name: "Sam Patel", department: "Ferrybridge" },
        { name: "Tom O'Neill", department: "Ferrybridge" },
      ],
    },
  ],
};

describe("renderDigest", () => {
  const mail = renderDigest(digest, "https://ack.example.com");

  it("says how many signatures are needed and where", () => {
    expect(mail.subject).toBe("2 signatures still needed in Ferrybridge");
  });

  it("lists each document, its people, due date and links", () => {
    expect(mail.text).toContain("Hello Priya,");
    expect(mail.text).toContain("Brake <Test> Briefing (due 30 Sept 2026, overdue)");
    expect(mail.text).toContain("  - Sam Patel, Ferrybridge");
    expect(mail.text).toContain("https://ack.example.com/sign/tok123");
    expect(mail.text).toContain("https://ack.example.com/team");
  });

  it("escapes names in the HTML version", () => {
    expect(mail.html).toContain("Brake &lt;Test&gt; Briefing");
    expect(mail.html).toContain("Tom O&#39;Neill");
    expect(mail.html).not.toContain("<Test>");
  });
});

describe("weekStart", () => {
  it("is the Monday of the week in UK time", () => {
    expect(weekStart(new Date("2026-10-05T06:00:00Z"))).toBe("2026-10-05"); // Monday
    expect(weekStart(new Date("2026-10-04T22:00:00Z"))).toBe("2026-09-28"); // Sunday 23:00 BST
    expect(weekStart(new Date("2026-10-04T23:30:00Z"))).toBe("2026-10-05"); // Monday 00:30 BST
  });
});
