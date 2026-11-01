import { describe, expect, it } from "vitest";
import { parseRetryAfter } from "../src/llm.js";

describe("parseRetryAfter", () => {
  const now = Date.parse("2026-11-01T12:00:00Z");

  it("parses delta-seconds", () => {
    expect(parseRetryAfter("7", now)).toBe(7000);
    expect(parseRetryAfter(" 0 ", now)).toBe(0);
  });

  it("parses HTTP dates relative to now", () => {
    expect(parseRetryAfter("Sun, 01 Nov 2026 12:00:05 GMT", now)).toBe(5000);
    expect(parseRetryAfter("Sun, 01 Nov 2026 11:59:00 GMT", now)).toBe(0);
  });

  it("returns null for missing or invalid values", () => {
    expect(parseRetryAfter(null, now)).toBeNull();
    expect(parseRetryAfter("soon", now)).toBeNull();
    expect(parseRetryAfter("-3", now)).toBeNull();
  });
});
