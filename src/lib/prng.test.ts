import { describe, expect, it } from "vitest";
import { Prng, stableUuid } from "./prng";

describe("Prng", () => {
  it("mesma semente, mesma sequência", () => {
    const a = new Prng(2026);
    const b = new Prng(2026);
    const seqA = Array.from({ length: 50 }, () => a.int(0, 1000));
    const seqB = Array.from({ length: 50 }, () => b.int(0, 1000));
    expect(seqA).toEqual(seqB);
    expect(new Set(seqA).size).toBeGreaterThan(10);
  });

  it("int respeita os limites", () => {
    const p = new Prng(1);
    for (let i = 0; i < 1000; i++) {
      const v = p.int(5, 9);
      expect(v).toBeGreaterThanOrEqual(5);
      expect(v).toBeLessThanOrEqual(9);
    }
  });
});

describe("stableUuid", () => {
  it("é estável e tem formato de UUID", () => {
    expect(stableUuid("x")).toBe(stableUuid("x"));
    expect(stableUuid("x")).not.toBe(stableUuid("y"));
    expect(stableUuid("x")).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });
});
