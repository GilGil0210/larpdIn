import { describe, expect, it } from "vitest";
import { GenerateResponseSchema, LIMITS } from "../src/contract.js";
import { briefRequirements, buildMessages, extractJson, parseCandidates, requirementProblems } from "../src/personas.js";
import { exampleRequest, fixtureCompletionText } from "./helpers.js";

const fixture = () => JSON.parse(fixtureCompletionText());

describe("extractJson", () => {
  it("handles fenced output and surrounding chatter", () => {
    expect(extractJson('Here you go:\n```json\n{"a":1}\n```\nEnjoy!')).toEqual({ a: 1 });
    expect(extractJson('Result: {"a":{"b":2}} done')).toEqual({ a: { b: 2 } });
  });

  it("throws when there is no JSON object", () => {
    expect(() => extractJson("no json here")).toThrow();
    expect(() => extractJson('{"a":')).toThrow();
  });
});

describe("parseCandidates", () => {
  it("accepts the deterministic fixture", () => {
    const result = parseCandidates(fixtureCompletionText());
    expect(result.ok).toBe(true);
    if (result.ok) expect(GenerateResponseSchema.parse(result.value).personas).toHaveLength(3);
  });

  it("normalizes loose model output into the strict contract", () => {
    const data = fixture();
    const p = data.personas[0];
    p.extraField = "drop me";
    p.content.headline = "H".repeat(400);
    p.content.education[0].startYear = "2018";
    p.content.education[0].endYear = 1700;
    delete p.content.education[0].grade;
    p.content.education.push({ degree: "no school" });
    delete p.description;
    const result = parseCandidates(JSON.stringify(data));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const out = result.value.personas[0];
    expect(out).not.toHaveProperty("extraField");
    expect(out.description).toBe("");
    expect(out.content.headline.length).toBeLessThanOrEqual(LIMITS.headline);
    expect(out.content.education).toHaveLength(1);
    expect(out.content.education[0]).toMatchObject({ startYear: 2018, endYear: null, grade: "" });
  });

  it("accepts a bare array and keeps only the first three valid personas", () => {
    const data = fixture();
    const fourth = structuredClone(data.personas[0]);
    fourth.name = "Fourth";
    fourth.content.headline = "Different";
    fourth.content.about = "Different about";
    const result = parseCandidates(JSON.stringify([...data.personas, fourth]));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.personas.map((p) => p.name)).not.toContain("Fourth");
  });

  it("rejects duplicates and fewer than three personas with useful problems", () => {
    const data = fixture();
    data.personas[1].content.headline = data.personas[0].content.headline.toUpperCase();
    const result = parseCandidates(JSON.stringify(data));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.problems[0]).toContain("got 2");
      expect(result.problems.join("\n")).toContain("duplicates");
    }
  });

  it("rejects personas without education or about", () => {
    const data = fixture();
    data.personas[2].content.education = [];
    data.personas[1].content.about = "";
    const result = parseCandidates(JSON.stringify(data));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.problems.join("\n")).toMatch(/no education/);
      expect(result.problems.join("\n")).toMatch(/empty about/);
    }
  });

  it("rejects non-JSON text", () => {
    expect(parseCandidates("I cannot help with that.").ok).toBe(false);
  });
});

describe("buildMessages", () => {
  it("includes the profile and brief as data with the contract shape", () => {
    const req = exampleRequest();
    const [system, user] = buildMessages(req);
    expect(system!.content).toContain('"personas"');
    expect(system!.content).toContain("MUST appear in every candidate");
    expect(user!.content).toContain(JSON.stringify(req.profile));
    expect(user!.content).toContain(req.brief);
  });
});

describe("brief requirements (Toronto / University of Toronto example)", () => {
  const brief = exampleRequest().brief;

  it("all three fixture options satisfy the example's explicit requirements", () => {
    const result = parseCandidates(fixtureCompletionText(), brief);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    for (const p of result.value.personas) {
      expect(p.content.location).toMatch(/Toronto/);
      expect(p.content.education.some((e) => e.school.includes("University of Toronto"))).toBe(true);
    }
    // The model's requirements list is internal and never reaches the response.
    expect(result.value).not.toHaveProperty("requirements");
  });

  it("asks for a repair when one option drops a model-listed requirement", () => {
    const data = fixture();
    data.personas[1].content.location = "Vancouver, British Columbia, Canada";
    const result = parseCandidates(JSON.stringify(data), brief);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.problems).toEqual(['persona 2 must include "Toronto" in location (required by the brief)']);
  });

  it("enforces a school named in the brief even if the model forgot to list it", () => {
    const data = fixture();
    data.requirements = [];
    data.personas[2].content.education = [{ ...data.personas[2].content.education[0], school: "McGill University" }];
    const result = parseCandidates(JSON.stringify(data), brief);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.problems[0]).toContain('persona 3 must include "University of Toronto" in education.school');
  });

  it("matches case-, accent- and spacing-insensitively", () => {
    const data = fixture();
    data.requirements = [{ field: "location", value: "montréal" }];
    for (const p of data.personas) p.content.location = "Montreal,  Quebec, Canada";
    expect(parseCandidates(JSON.stringify(data), "Based in Montréal").ok).toBe(true);
  });

  it("ignores malformed or unknown requirement entries", () => {
    const data = fixture();
    data.requirements = [{ field: "salary", value: "1M" }, { field: "location" }, "Toronto", { field: "headline", value: "" }];
    expect(parseCandidates(JSON.stringify(data), "something unrelated").ok).toBe(true);
  });

  it("does not check requirements when no brief is given", () => {
    const data = fixture();
    data.personas[0].content.location = "Paris, France";
    expect(parseCandidates(JSON.stringify(data)).ok).toBe(true);
  });
});

describe("briefRequirements", () => {
  it("extracts a single named school", () => {
    expect(briefRequirements("someone who studied at the University of Toronto, based in Toronto")).toEqual([
      { field: "education.school", value: "University of Toronto" },
    ]);
    expect(briefRequirements("A Toronto Metropolitan University grad")).toEqual([
      { field: "education.school", value: "Toronto Metropolitan University" },
    ]);
  });

  it("leaves multi-school briefs to the model", () => {
    expect(briefRequirements("University of Toronto or McGill University alumni")).toEqual([]);
  });

  it("finds nothing in briefs without a school", () => {
    expect(briefRequirements("make me look like a product manager in Berlin")).toEqual([]);
  });

  it("accepts a profile school contained in a longer brief phrase", () => {
    const [req] = briefRequirements("University of Toronto CS grad");
    expect(req?.value).toBe("University of Toronto CS");
    const persona = { name: "x", description: "", content: { headline: "h", location: "", industry: "", about: "a", education: [{ school: "University of Toronto", degree: "", fieldOfStudy: "", startYear: null, endYear: null, grade: "", activities: "", description: "" }] } };
    expect(requirementProblems([persona], [req!])).toEqual([]);
    const tooShort = { ...persona, content: { ...persona.content, education: [{ ...persona.content.education[0]!, school: "Toronto" }] } };
    expect(requirementProblems([tooShort], [req!])).toHaveLength(1);
  });
});
