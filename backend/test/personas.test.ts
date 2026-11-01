import { describe, expect, it } from "vitest";
import { GenerateResponseSchema, LIMITS } from "../src/contract.js";
import { buildMessages, extractJson, parseCandidates } from "../src/personas.js";
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
