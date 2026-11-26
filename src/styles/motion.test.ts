import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { interpolateInt } from "@/components/ui/motion-utils";

const css = readFileSync(join(__dirname, "motion.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
const LOOPS = new Set(["kyb-anel", "kyb-balao", "kyb-brilho"]);
const CONTINUOUS_LOOPS = new Set(["kyb-anel", "kyb-balao"]);

function keyframeBodies(): Map<string, string> {
  const out = new Map<string, string>();
  const re = /@keyframes\s+([\w-]+)\s*\{/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(css))) {
    let depth = 1;
    let i = re.lastIndex;
    while (depth > 0) {
      if (css[i] === "{") depth++;
      if (css[i] === "}") depth--;
      i++;
    }
    out.set(m[1], css.slice(re.lastIndex, i - 1));
  }
  return out;
}

function animations(): { name: string; ms: number; infinite: boolean }[] {
  return [...css.matchAll(/animation:\s*([\w-]+)\s+(\d+)ms[^;]*;/g)].map((m) => ({
    name: m[1],
    ms: Number(m[2]),
    infinite: m[0].includes("infinite"),
  }));
}

describe("movimento (docs/10, seção 4)", () => {
  it("com prefers-reduced-motion, desliga animação e transição de tudo", () => {
    const block = css.match(/@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{([\s\S]*)\}\s*$/);
    expect(block).not.toBeNull();
    const body = block![1];
    expect(body).toMatch(/\*,\s*\*::before,\s*\*::after/);
    expect(body).toMatch(/animation:\s*none\s*!important/);
    expect(body).toMatch(/transition:\s*none\s*!important/);
  });

  it("keyframes animam só transform e opacity (e o traço do check)", () => {
    for (const [name, body] of keyframeBodies()) {
      const props = [...body.matchAll(/([\w-]+)\s*:/g)].map((m) => m[1]);
      const allowed = name === "kyb-traco" ? ["stroke-dashoffset"] : ["transform", "opacity"];
      for (const p of props) expect(allowed, `${name}: ${p}`).toContain(p);
    }
  });

  it("toda animação usa a curva padrão e nenhuma passa de 1,2s", () => {
    const list = animations();
    expect(list.length).toBeGreaterThan(5);
    for (const a of css.matchAll(/animation:\s*[\w-]+\s+\d+ms\s+([^\s;]+)/g)) expect(a[1]).toBe("var(--kyb-curva)");
    for (const a of list) {
      if (CONTINUOUS_LOOPS.has(a.name)) continue;
      expect(a.ms, a.name).toBeLessThanOrEqual(1200);
      if (a.infinite) expect(LOOPS.has(a.name), `${a.name} em loop`).toBe(true);
    }
  });

  it("durações da tabela", () => {
    const ms = Object.fromEntries(animations().map((a) => [a.name, a.ms]));
    expect(ms).toMatchObject({
      "kyb-coroa": 600,
      "kyb-entrada": 250,
      "kyb-anel": 1600,
      "kyb-traco": 300,
      "kyb-destaque": 1200,
      "kyb-tremer": 300,
      "kyb-fade": 150,
    });
    expect(css).toMatch(/animation-delay:\s*calc\(var\(--kyb-ordem, 0\) \* 50ms\)/);
  });
});

describe("interpolateInt (contagem sem float)", () => {
  it("vai do valor antigo ao novo em inteiros e termina exato", () => {
    expect(interpolateInt(0n, 413n, 0n)).toBe(0n);
    expect(interpolateInt(0n, 413n, 500n)).toBe(206n);
    expect(interpolateInt(0n, 413n, 1000n)).toBe(413n);
    expect(interpolateInt(123_650n, 100n, 1000n)).toBe(100n);
    expect(interpolateInt(10n, 0n, 2000n)).toBe(0n);
  });
});
