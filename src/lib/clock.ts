// Relógio da demonstração (docs/06). Em SIMULADO, toda regra que depende de data
// usa DEMO_TODAY; em REAL, o dia de Brasília. A cota da Receita usa sempre o relógio real.
import { isSimulado, type Env } from "./config";
import { brasiliaDay, parseIsoDate } from "./dates";

export const DEFAULT_DEMO_TODAY = "2026-11-20";

export function demoToday(env: Env = process.env): string {
  const value = env.DEMO_TODAY?.trim();
  if (!value) return DEFAULT_DEMO_TODAY;
  try {
    return parseIsoDate(value);
  } catch {
    throw new Error("DEMO_TODAY inválido: use o formato AAAA-MM-DD");
  }
}

/** "Hoje" das regras de negócio. */
export function businessToday(env: Env = process.env, now: Date = new Date()): string {
  return isSimulado(env) ? demoToday(env) : brasiliaDay(now);
}

/** Dia real de Brasília (cota diária da Receita). */
export function realBrasiliaDay(now: Date = new Date()): string {
  return brasiliaDay(now);
}
