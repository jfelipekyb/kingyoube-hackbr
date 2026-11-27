import { describe, expect, it } from "vitest";
import { charAt, mouthOpenAt, mouthTimeline, opennessFromVolume, wordsSpokenAt, wordTimings, type Alignment } from "./lipsync";

// "Ma pá." com tempos irregulares e uma pausa depois da vírgula de silêncio (espaço longo).
const a: Alignment = {
  characters: ["M", "a", " ", "p", "á", "."],
  starts: [0.0, 0.1, 0.3, 0.5, 0.6, 0.9],
  ends: [0.1, 0.3, 0.5, 0.6, 0.8, 1.0],
};

describe("sincronia labial pelos tempos de cada caractere", () => {
  it("a boca abre e fecha nos tempos certos", () => {
    expect(mouthTimeline(a)).toEqual([
      { t: 0.1, open: 1 }, // "a" abre
      { t: 0.3, open: 0 }, // espaço fecha
      { t: 0.6, open: 1 }, // "p" fica fechado; "á" abre
      { t: 0.8, open: 0 }, // silêncio antes do ponto
    ]);
  });

  it("em cada instante, a abertura segue o caractere que está soando", () => {
    expect(mouthOpenAt(a, 0.05)).toBe(0); // M: lábios fechados
    expect(mouthOpenAt(a, 0.1)).toBe(1); // começo exato do "a"
    expect(mouthOpenAt(a, 0.29)).toBe(1);
    expect(mouthOpenAt(a, 0.3)).toBe(0); // fim do "a" = começo do espaço
    expect(mouthOpenAt(a, 0.55)).toBe(0); // "p"
    expect(mouthOpenAt(a, 0.7)).toBe(1); // "á"
    expect(mouthOpenAt(a, 0.85)).toBe(0); // pausa entre caracteres
    expect(mouthOpenAt(a, 1.5)).toBe(0); // depois da fala
    expect(mouthOpenAt(null, 0.2)).toBe(0); // sem tempos: boca parada
    expect(charAt(a, -0.1)).toBe(-1);
  });

  it("consoante que não é labial entreabre", () => {
    const b: Alignment = { characters: ["s", "i"], starts: [0, 0.1], ends: [0.1, 0.2] };
    expect(mouthTimeline(b)).toEqual([
      { t: 0, open: 0.35 },
      { t: 0.1, open: 1 },
      { t: 0.2, open: 0 },
    ]);
  });
});

describe("legenda palavra a palavra", () => {
  it("separa as palavras com início e fim", () => {
    expect(wordTimings(a)).toEqual([
      { word: "Ma", start: 0, end: 0.3 },
      { word: "pá.", start: 0.5, end: 1.0 },
    ]);
  });

  it("revela as palavras conforme o tempo", () => {
    const w = wordTimings(a);
    expect(wordsSpokenAt(w, 0)).toBe(1);
    expect(wordsSpokenAt(w, 0.45)).toBe(1);
    expect(wordsSpokenAt(w, 0.5)).toBe(2);
  });
});

describe("fallback por volume (Web Audio)", () => {
  it("silêncio fecha; volume alto abre até 1", () => {
    expect(opennessFromVolume(new Float32Array(128))).toBe(0);
    expect(opennessFromVolume(new Float32Array(128).fill(0.01))).toBe(0);
    expect(opennessFromVolume(new Float32Array(128).fill(0.1))).toBeCloseTo(0.4, 5);
    expect(opennessFromVolume(new Float32Array(128).fill(0.9))).toBe(1);
  });
});
