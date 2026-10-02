import { describe, expect, it } from "vitest";
import { parsePeopleList } from "@/lib/people";

describe("parsePeopleList", () => {
  it("reads typed 'Name, email' lines", () => {
    const { people, problems } = parsePeopleList("Sam Patel, Sam.Patel@Example.com\nAlex Jones,alex@example.com");
    expect(people).toEqual([
      { name: "Sam Patel", email: "sam.patel@example.com" },
      { name: "Alex Jones", email: "alex@example.com" },
    ]);
    expect(problems).toEqual([]);
  });

  it("reads two columns pasted from a spreadsheet, in either order, and skips the header", () => {
    const { people } = parsePeopleList("Name\tEmail\nSam Patel\tsam@example.com\nalex@example.com\tAlex Jones\n");
    expect(people).toEqual([
      { name: "Sam Patel", email: "sam@example.com" },
      { name: "Alex Jones", email: "alex@example.com" },
    ]);
  });

  it("reads 'Name <email>' and bare emails", () => {
    const { people } = parsePeopleList('"Patel, Sam" <sam@example.com>\njo.bloggs@example.com');
    expect(people).toEqual([
      { name: "Patel, Sam", email: "sam@example.com" },
      { name: "jo.bloggs", email: "jo.bloggs@example.com" },
    ]);
  });

  it("collapses duplicate emails and reports bad lines with line numbers", () => {
    const { people, problems } = parsePeopleList("A, a@example.com\n\nB, A@example.com\nNo email here\nC, c@nodot");
    expect(people).toEqual([{ name: "A", email: "a@example.com" }]);
    expect(problems).toEqual([
      { line: 4, text: "No email here", reason: "No email address found" },
      { line: 5, text: "C, c@nodot", reason: "Email address doesn't look valid" },
    ]);
  });
});

describe("parsePeopleList with outstations", () => {
  const outstations = ["Head Office", "Ferrybridge", "Isle of Grain"];

  it("reads an outstation column in any position and any case", () => {
    const { people } = parsePeopleList(
      "Sam Patel, sam@example.com, Ferrybridge\nisle of grain\tAlex Jones\talex@example.com\nJo Bloggs, jo@example.com",
      outstations,
    );
    expect(people).toEqual([
      { name: "Sam Patel", email: "sam@example.com", outstation: "Ferrybridge" },
      { name: "Alex Jones", email: "alex@example.com", outstation: "Isle of Grain" },
      { name: "Jo Bloggs", email: "jo@example.com" },
    ]);
  });

  it("keeps an unknown third column as part of the name", () => {
    const { people } = parsePeopleList("Sam, sam@example.com, Patel", outstations);
    expect(people).toEqual([{ name: "Sam Patel", email: "sam@example.com" }]);
  });
});

describe("parsePeopleList with distribution lists", () => {
  it("collects any distribution list columns alongside the outstation", () => {
    const { people } = parsePeopleList(
      "Sam Patel, sam@example.com, Ferrybridge, Engineering, health and safety\nAlex\talex@example.com\tPurchasing",
      ["Ferrybridge", "Humber"],
      ["Engineering", "Purchasing", "Health and Safety", "Operations Managers"],
    );
    expect(people).toEqual([
      { name: "Sam Patel", email: "sam@example.com", outstation: "Ferrybridge", distributionLists: ["Engineering", "Health and Safety"] },
      { name: "Alex", email: "alex@example.com", distributionLists: ["Purchasing"] },
    ]);
  });
});
