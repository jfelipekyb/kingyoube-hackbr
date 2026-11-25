// Leitura das variáveis de ambiente que não são segredo.

export type ReceitaMode = "SIMULADO" | "REAL";
export type Env = Record<string, string | undefined>;

export function receitaMode(env: Env = process.env): ReceitaMode {
  const value = (env.RECEITA_MODE ?? "SIMULADO").trim().toUpperCase();
  if (value !== "SIMULADO" && value !== "REAL") {
    throw new Error(`RECEITA_MODE inválido: use SIMULADO ou REAL`);
  }
  return value;
}

export function isSimulado(env: Env = process.env): boolean {
  return receitaMode(env) === "SIMULADO";
}

/** Seletor de papel da demo; desligável por DEMO_ROLE_SWITCH=false. */
export function demoRoleSwitchEnabled(env: Env = process.env): boolean {
  return (env.DEMO_ROLE_SWITCH ?? "true").trim().toLowerCase() !== "false";
}

export const OFFICE_NAME = "Escritório Exemplo Contabilidade (FICTÍCIO)";

export const SIMULATED_BADGE = "Dados simulados — não é consulta real à Receita";
