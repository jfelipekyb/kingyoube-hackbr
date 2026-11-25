// Regrava fixtures/receita/ a partir do gerador determinístico. Há teste que confere a sincronia.
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { DEFAULT_DEMO_TODAY } from "../src/lib/clock";
import { buildDemoData } from "../src/seed/demo-data";
import { buildReceitaFixtures } from "../src/seed/receita-fixtures";

const root = path.join(process.cwd(), "fixtures", "receita");
rmSync(root, { recursive: true, force: true });
const files = buildReceitaFixtures(buildDemoData(DEFAULT_DEMO_TODAY));
for (const [name, content] of files) {
  const file = path.join(root, name);
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, content);
}
console.log(`${files.size} arquivos gravados em fixtures/receita/ (DEMO_TODAY ${DEFAULT_DEMO_TODAY}).`);
