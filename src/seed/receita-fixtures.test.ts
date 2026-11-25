import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { DEFAULT_DEMO_TODAY } from "@/lib/clock";
import { parseIsoDateTime } from "@/lib/dates";
import { buildDemoData } from "./demo-data";
import { buildReceitaFixtures, RECEITA_SERVICES } from "./receita-fixtures";

const root = path.join(process.cwd(), "fixtures", "receita");
const files = buildReceitaFixtures(buildDemoData(DEFAULT_DEMO_TODAY));

describe("fixtures da Receita simulada (docs/03)", () => {
  it("12 clientes × 4 serviços, commitados em sincronia com o gerador", () => {
    expect(files.size).toBe(48);
    const dirs = readdirSync(root);
    expect(dirs).toHaveLength(12);
    for (const [name, content] of files) {
      expect(readFileSync(path.join(root, name), "utf8"), `${name} desatualizado: rode npm run fixtures:receita`).toBe(content);
    }
  });

  it("valores saem como number com 2 casas e somem quando zero (exceto apurado/saldo)", () => {
    for (const [name, content] of files) {
      for (const m of content.matchAll(/"(\w+)": (-?\d+(?:\.\d+)?)[,\n]/g)) {
        const [, field, raw] = m;
        if (["origem", "documento", "tipo", "sequencial"].includes(field)) continue;
        expect(raw, `${name}:${field}`).toMatch(/^-?\d+\.\d{2}$/);
        if (raw === "0.00") expect(["saldoDevedor", "saldoCredor", "multa", "juros"], `${name}:${field}`).toContain(field);
      }
    }
  });

  it("estrutura de cada serviço segue o contrato", () => {
    const padaria = (service: string) => JSON.parse(files.get(`padaria-boa-massa/${service}.json`)!);
    for (const service of RECEITA_SERVICES) {
      const f = padaria(service);
      expect(Object.keys(f)).toEqual(["tiqueteSolicitacao", "ni", "niConsumidor", "geradoEm", "apuracao"]);
      expect(f.ni).toHaveLength(8);
      expect(f.niConsumidor).toHaveLength(14);
      expect(() => parseIsoDateTime(f.geradoEm)).not.toThrow();
    }
    const debito = padaria("debitos").apuracao[0].debitos[0];
    expect(Object.keys(debito)).toEqual(["origem", "documento", "chave", "emissao", "registro", "atualizacao", "cbs"]);
    for (const k of ["emissao", "registro", "atualizacao"]) expect(() => parseIsoDateTime(debito[k])).not.toThrow();
    const credito = padaria("creditos").apuracao[0].creditos[0];
    expect(credito.cbs.apropriacao.utilizacao.naoUtilizado).toHaveProperty("saldoCredor");
    const pag = padaria("pagamentos").apuracao[0].pagamentos[0];
    expect(pag.tipo).toBe(2);
    expect(pag.niContribuinte).toHaveLength(14);
    const rec = padaria("recolhimentos").apuracao[0].pagamentos[0];
    expect(rec.tipo).toBe(1);
    expect(rec.composicao[0].niFornecedor).toHaveLength(14);
    expect(JSON.parse(files.get("clinica-sorriso-pleno/recolhimentos.json")!).apuracao).toEqual([]);
  });

  it("V2 aparece com apurado 132.00 e V5 existe só na Receita", () => {
    const content = files.get("padaria-boa-massa/debitos.json")!;
    expect(content).toContain('"apurado": 132.00');
    expect(content).toContain('"apurado": 75.00');
  });
});
