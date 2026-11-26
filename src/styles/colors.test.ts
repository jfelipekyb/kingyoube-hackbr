import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

// docs/10, seção 2: nenhum valor de cor fora de src/styles/tokens.css.
const SRC = join(__dirname, "..");
const TOKENS = join(__dirname, "tokens.css");
const LITERAL = /#[0-9a-fA-F]{3,8}\b|\b(?:rgba?|hsla?|oklch|oklab|lab|lch|hwb)\(/;
const PALETTE =
  /\b(?:bg|text|border|ring|outline|fill|stroke|from|to|via|shadow|decoration|divide|accent|caret)-(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|white|black)(?:-\d{2,3})?\b/;

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return files(path);
    return /\.(tsx?|css)$/.test(name) && !name.endsWith(".test.ts") ? [path] : [];
  });
}

describe("cores só em tokens.css", () => {
  it("nenhum hexadecimal, rgb/hsl/oklch ou cor da paleta padrão do Tailwind fora de tokens.css", () => {
    const offenders = files(SRC)
      .filter((f) => f !== TOKENS)
      .flatMap((f) =>
        readFileSync(f, "utf8")
          .split("\n")
          .map((line, i) => ({ line, i }))
          .filter(({ line }) => LITERAL.test(line) || PALETTE.test(line))
          .map(({ line, i }) => `${relative(SRC, f)}:${i + 1}: ${line.trim()}`),
      );
    expect(offenders).toEqual([]);
  });

  it("tokens.css tem as cores oficiais da marca", () => {
    const css = readFileSync(TOKENS, "utf8").toLowerCase();
    for (const hex of ["#000055", "#000088", "#00cc99", "#007a5c", "#f7f8fb", "#eff2f6", "#dde3ea", "#667085", "#b54708", "#b42318"]) {
      expect(css).toContain(hex);
    }
  });
});
