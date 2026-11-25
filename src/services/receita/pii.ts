// Chave do hash de dado pessoal (docs/07): `niConsumidor` pode ser CPF.
import { createHmac } from "node:crypto";
import { isSimulado, type Env } from "@/lib/config";
import { ReceitaConfigError } from "./types";

/** Só para a base fictícia do modo SIMULADO; nunca protege dado real. */
export const DEMO_PII_HASH_KEY = "demo-kingyoube-cbs-pii-hash-key";

/** REAL exige PII_HASH_KEY (sem ela o modo REAL não sobe); SIMULADO usa a chave fixa de demonstração. */
export function piiHashKey(env: Env = process.env): string {
  if (isSimulado(env)) return DEMO_PII_HASH_KEY;
  const key = env.PII_HASH_KEY?.trim();
  if (!key) throw new ReceitaConfigError("Modo REAL exige PII_HASH_KEY");
  return key;
}

export function hmacPii(key: string, value: string): string {
  return createHmac("sha256", key).update(value).digest("hex");
}
