import { describe, expect, it } from "vitest";
import type { Db } from "@/db/types";
import { createReceitaAdapter } from "./adapter";
import { maskNiConsumidor } from "./normalize";
import { DEMO_PII_HASH_KEY, hmacPii, piiHashKey } from "./pii";
import { ReceitaConfigError } from "./types";

const RFB = { RFB_CLIENT_ID: "a", RFB_CLIENT_SECRET: "b", RFB_TOKEN_URL: "https://t", RFB_CNPJ: "00436612000121" };

describe("PII_HASH_KEY", () => {
  it("SIMULADO usa a chave fixa de demonstração", () => {
    expect(piiHashKey({ RECEITA_MODE: "SIMULADO" })).toBe(DEMO_PII_HASH_KEY);
    expect(piiHashKey({ RECEITA_MODE: "SIMULADO", PII_HASH_KEY: "outra" })).toBe(DEMO_PII_HASH_KEY);
  });

  it("REAL exige PII_HASH_KEY: sem ela o modo REAL não sobe", () => {
    expect(() => piiHashKey({ RECEITA_MODE: "REAL" })).toThrow(ReceitaConfigError);
    expect(() => createReceitaAdapter({} as Db, { RECEITA_MODE: "REAL", ...RFB })).toThrow(/PII_HASH_KEY/);
    expect(createReceitaAdapter({} as Db, { RECEITA_MODE: "REAL", ...RFB, PII_HASH_KEY: "k" }).mode).toBe("REAL");
    expect(piiHashKey({ RECEITA_MODE: "REAL", PII_HASH_KEY: " chave-real " })).toBe("chave-real");
  });

  it("mascara CPF ou CNPJ com HMAC-SHA256 + 2 últimos dígitos", () => {
    const raw = '{"ni": "12345678", "niConsumidor": "12345678901", "apuracao": []}';
    const out = maskNiConsumidor(raw, "k");
    expect(out).toBe(`{"ni": "12345678", "niConsumidor": "h:${hmacPii("k", "12345678901")}:01", "apuracao": []}`);
    expect(out).not.toContain("12345678901");
    expect(maskNiConsumidor(raw, "k2")).not.toBe(out);
  });
});
