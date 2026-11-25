// Datas ISO 8601. A Receita usa tanto "Z" quanto "-03:00"; aceitamos os dois.

const DATE_TIME_RE =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,9}))?)?(Z|[+-]\d{2}:\d{2})$/;
const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

export const BRASILIA_TZ = "America/Sao_Paulo";

function isRealDate(year: number, month: number, day: number): boolean {
  const d = new Date(Date.UTC(year, month - 1, day));
  return d.getUTCFullYear() === year && d.getUTCMonth() === month - 1 && d.getUTCDate() === day;
}

/** Data e hora com fuso obrigatório ("Z" ou "±HH:MM"). Sem fuso é recusado (ambíguo). */
export function parseIsoDateTime(value: string): Date {
  const m = DATE_TIME_RE.exec(value);
  if (!m) throw new RangeError(`Data e hora ISO inválida: "${value}"`);
  const [, y, mo, d, h, mi, s = "00", , offset] = m;
  if (!isRealDate(Number(y), Number(mo), Number(d)) || Number(h) > 23 || Number(mi) > 59 || Number(s) > 59) {
    throw new RangeError(`Data e hora ISO inválida: "${value}"`);
  }
  if (offset !== "Z") {
    const [oh, om] = offset.slice(1).split(":").map(Number);
    if (oh > 23 || om > 59) throw new RangeError(`Fuso inválido: "${value}"`);
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new RangeError(`Data e hora ISO inválida: "${value}"`);
  return date;
}

/** Data sem hora ("YYYY-MM-DD"), como `dataArrecadacao` e `vencimento`. Devolve a própria string validada. */
export function parseIsoDate(value: string): string {
  const m = DATE_RE.exec(value);
  if (!m || !isRealDate(Number(m[1]), Number(m[2]), Number(m[3]))) {
    throw new RangeError(`Data ISO inválida: "${value}"`);
  }
  return value;
}

/** Dia civil em Brasília ("YYYY-MM-DD") de um instante. */
export function brasiliaDay(instant: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: BRASILIA_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(instant);
}

export function addDays(isoDate: string, days: number): string {
  const [y, m, d] = parseIsoDate(isoDate).split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/** Dias civis de `from` até `to` (positivo se `to` é depois). */
export function daysBetween(from: string, to: string): number {
  const toUtc = (s: string) => {
    const [y, m, d] = parseIsoDate(s).split("-").map(Number);
    return Date.UTC(y, m - 1, d);
  };
  return Math.round((toUtc(to) - toUtc(from)) / 86_400_000);
}

/** Período de apuração "MM/AAAA". */
export function periodOf(isoDate: string): string {
  const [y, m] = parseIsoDate(isoDate).split("-");
  return `${m}/${y}`;
}

/** "2026-11-18" + "10:00:00" → "2026-11-18T10:00:00-03:00" (Brasília, sem horário de verão). */
export function brasiliaDateTime(isoDate: string, time = "10:00:00"): string {
  return `${parseIsoDate(isoDate)}T${time}-03:00`;
}

/** "2026-11-18" → "18/11/2026". */
export function formatDateBR(isoDate: string): string {
  const [y, m, d] = parseIsoDate(isoDate).split("-");
  return `${d}/${m}/${y}`;
}
