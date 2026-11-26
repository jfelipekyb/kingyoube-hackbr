// Leitura dos arquivos baixados (docs/03 §2–§5). Campo ausente = 0 (exceto os obrigatórios); datas com "Z" ou "-03:00".
import { parseIsoDate, parseIsoDateTime } from "@/lib/dates";
import { parseCents } from "@/lib/money";
import { parseReceitaJson, RawNumber } from "./json";
import type { ReceitaService } from "./types";

export class ReceitaFileError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ReceitaFileError";
  }
}

type Obj = Record<string, unknown>;

function obj(value: unknown, path: string): Obj {
  if (!value || typeof value !== "object" || Array.isArray(value) || value instanceof RawNumber) {
    throw new ReceitaFileError(`${path}: esperado objeto`);
  }
  return value as Obj;
}

function arr(value: unknown, path: string): unknown[] {
  if (!Array.isArray(value)) throw new ReceitaFileError(`${path}: esperado lista`);
  return value;
}

function str(value: unknown, path: string, maxLength?: number): string {
  if (typeof value !== "string" || value === "") throw new ReceitaFileError(`${path}: esperado texto`);
  if (maxLength && value.length > maxLength) throw new ReceitaFileError(`${path}: texto maior que ${maxLength}`);
  return value;
}

function optStr(value: unknown, path: string, maxLength?: number): string | null {
  return value === undefined || value === null ? null : str(value, path, maxLength);
}

function int(value: unknown, path: string): number {
  if (!(value instanceof RawNumber) || !/^-?\d+$/.test(value.source)) throw new ReceitaFileError(`${path}: esperado inteiro`);
  return Number(value.source);
}

/** Valor number(18,2). Ausente: 0, a menos que seja obrigatório. */
function cents(value: unknown, path: string, required = false): bigint {
  if (value === undefined || value === null) {
    if (required) throw new ReceitaFileError(`${path}: valor obrigatório ausente`);
    return 0n;
  }
  if (!(value instanceof RawNumber)) throw new ReceitaFileError(`${path}: esperado número`);
  try {
    return parseCents(value.source);
  } catch {
    throw new ReceitaFileError(`${path}: valor fora de number(18,2)`);
  }
}

function dateTime(value: unknown, path: string): Date {
  try {
    return parseIsoDateTime(str(value, path));
  } catch (e) {
    if (e instanceof ReceitaFileError) throw e;
    throw new ReceitaFileError(`${path}: data e hora ISO inválida`);
  }
}

function date(value: unknown, path: string): string {
  try {
    return parseIsoDate(str(value, path));
  } catch (e) {
    if (e instanceof ReceitaFileError) throw e;
    throw new ReceitaFileError(`${path}: data ISO inválida`);
  }
}

function pa(value: unknown, path: string): string {
  const p = str(value, path);
  if (!/^(0[1-9]|1[0-2])\/\d{4}$/.test(p)) throw new ReceitaFileError(`${path}: período deve ser MM/AAAA`);
  return p;
}

interface DocBase {
  accessKey: string;
  period: string;
  origin: number;
  docModel: number;
  issuedAt: Date;
  registeredAt: Date;
  updatedAt: Date;
  apuradoCents: bigint;
  excedenteCents: bigint;
  suspensoCents: bigint;
}

export interface DebitRow extends DocBase {
  inexigivelCents: bigint;
  pgtoAntecipadoCents: bigint;
  extintoCents: bigint;
  saldoDevedorCents: bigint;
}

export interface CreditRow extends DocBase {
  inapropriavelCents: bigint;
  prescritoCents: bigint;
  aApropriarCents: bigint;
  apropriadoCents: bigint;
  inutilizavelCents: bigint;
  utilizadoCents: bigint;
  restabelecidoCents: bigint;
  saldoCredorCents: bigint;
  pedidoRessarcimentoCents: bigint;
}

export interface PaymentRow {
  darfNumber: string;
  type: 1 | 2;
  collectedOn: string;
  seq: number;
  period: string;
  dueDate: string;
  counterpartyCnpj: string | null;
  accessKey: string | null;
  principalCents: bigint;
  multaCents: bigint;
  jurosCents: bigint;
  totalCents: bigint;
}

export interface ParsedReceitaFile {
  service: ReceitaService;
  ticket: string;
  ni: string;
  niConsumidor: string;
  geradoEm: Date;
  debits: DebitRow[];
  credits: CreditRow[];
  payments: PaymentRow[];
}

function docBase(d: Obj, period: string, path: string): Omit<DocBase, "apuradoCents" | "excedenteCents" | "suspensoCents"> {
  return {
    accessKey: str(d.chave, `${path}.chave`, 100),
    period,
    origin: int(d.origem, `${path}.origem`),
    docModel: int(d.documento, `${path}.documento`),
    issuedAt: dateTime(d.emissao, `${path}.emissao`),
    registeredAt: dateTime(d.registro, `${path}.registro`),
    updatedAt: dateTime(d.atualizacao, `${path}.atualizacao`),
  };
}

function parseDebits(apuracao: unknown[]): DebitRow[] {
  return apuracao.flatMap((a, i) => {
    const group = obj(a, `apuracao[${i}]`);
    const period = pa(group.pa, `apuracao[${i}].pa`);
    return arr(group.debitos, `apuracao[${i}].debitos`).map((item, j) => {
      const path = `apuracao[${i}].debitos[${j}]`;
      const d = obj(item, path);
      const cbs = obj(d.cbs, `${path}.cbs`);
      return {
        ...docBase(d, period, path),
        apuradoCents: cents(cbs.apurado, `${path}.cbs.apurado`, true),
        excedenteCents: cents(cbs.excedente, `${path}.cbs.excedente`),
        suspensoCents: cents(cbs.suspenso, `${path}.cbs.suspenso`),
        inexigivelCents: cents(cbs.inexigivel, `${path}.cbs.inexigivel`),
        pgtoAntecipadoCents: cents(cbs.pgtoAntecipado, `${path}.cbs.pgtoAntecipado`),
        extintoCents: cents(cbs.extinto, `${path}.cbs.extinto`),
        saldoDevedorCents: cents(cbs.saldoDevedor, `${path}.cbs.saldoDevedor`, true),
      };
    });
  });
}

function parseCredits(apuracao: unknown[]): CreditRow[] {
  return apuracao.flatMap((a, i) => {
    const group = obj(a, `apuracao[${i}]`);
    const period = pa(group.pa, `apuracao[${i}].pa`);
    return arr(group.creditos, `apuracao[${i}].creditos`).map((item, j) => {
      const path = `apuracao[${i}].creditos[${j}]`;
      const c = obj(item, path);
      const cbs = obj(c.cbs, `${path}.cbs`);
      const ap = obj(cbs.apropriacao, `${path}.cbs.apropriacao`);
      const ut = obj(ap.utilizacao, `${path}.cbs.apropriacao.utilizacao`);
      const nu = obj(ut.naoUtilizado, `${path}.cbs.apropriacao.utilizacao.naoUtilizado`);
      return {
        ...docBase(c, period, path),
        apuradoCents: cents(cbs.apurado, `${path}.cbs.apurado`, true),
        excedenteCents: cents(cbs.excedente, `${path}.cbs.excedente`),
        inapropriavelCents: cents(ap.inapropriavel, `${path}.cbs.apropriacao.inapropriavel`),
        suspensoCents: cents(ap.suspenso, `${path}.cbs.apropriacao.suspenso`),
        prescritoCents: cents(ap.prescrito, `${path}.cbs.apropriacao.prescrito`),
        aApropriarCents: cents(ap.aApropriar, `${path}.cbs.apropriacao.aApropriar`),
        apropriadoCents: cents(ap.apropriado, `${path}.cbs.apropriacao.apropriado`),
        inutilizavelCents: cents(ut.inutilizavel, `${path}.utilizacao.inutilizavel`),
        utilizadoCents: cents(ut.utilizado, `${path}.utilizacao.utilizado`),
        restabelecidoCents: cents(ut.restabelecido, `${path}.utilizacao.restabelecido`),
        saldoCredorCents: cents(nu.saldoCredor, `${path}.naoUtilizado.saldoCredor`, true),
        pedidoRessarcimentoCents: cents(nu.pedidoRessarcimento, `${path}.naoUtilizado.pedidoRessarcimento`),
      };
    });
  });
}

function parsePayments(apuracao: unknown[], service: "pagamentos" | "recolhimentos"): PaymentRow[] {
  return apuracao.flatMap((a, i) => {
    const group = obj(a, `apuracao[${i}]`);
    const collectedOn = date(group.dataArrecadacao, `apuracao[${i}].dataArrecadacao`);
    return arr(group.pagamentos, `apuracao[${i}].pagamentos`).flatMap((item, j) => {
      const path = `apuracao[${i}].pagamentos[${j}]`;
      const p = obj(item, path);
      const darfNumber = str(p.numeroDARF, `${path}.numeroDARF`, 17);
      const type = int(p.tipo, `${path}.tipo`);
      if (type !== 1 && type !== 2) throw new ReceitaFileError(`${path}.tipo: esperado 1 (RAD) ou 2 (PCONT)`);
      if (service === "recolhimentos" && type !== 1) throw new ReceitaFileError(`${path}.tipo: recolhimentos só têm tipo 1`);
      return arr(p.composicao, `${path}.composicao`).map((c, k) => {
        const cp = `${path}.composicao[${k}]`;
        const comp = obj(c, cp);
        let counterpartyCnpj: string | null = null;
        let accessKey: string | null = null;
        if (service === "recolhimentos") {
          counterpartyCnpj = str(comp.niFornecedor, `${cp}.niFornecedor`, 14);
          accessKey = optStr(comp.chaveDFE, `${cp}.chaveDFE`, 100);
        } else if (type === 1) {
          counterpartyCnpj = optStr(p.niAdquirente, `${path}.niAdquirente`, 14);
          accessKey = optStr(comp.chaveDFE, `${cp}.chaveDFE`, 100);
        }
        return {
          darfNumber,
          type,
          collectedOn,
          seq: int(comp.sequencial, `${cp}.sequencial`),
          period: pa(comp.pa, `${cp}.pa`),
          dueDate: date(comp.vencimento, `${cp}.vencimento`),
          counterpartyCnpj,
          accessKey,
          principalCents: cents(comp.principal, `${cp}.principal`),
          multaCents: cents(comp.multa, `${cp}.multa`),
          jurosCents: cents(comp.juros, `${cp}.juros`),
          totalCents: cents(comp.total, `${cp}.total`),
        } satisfies PaymentRow;
      });
    });
  });
}

export function parseReceitaFile(service: ReceitaService, raw: string): ParsedReceitaFile {
  let parsed: unknown;
  try {
    parsed = parseReceitaJson(raw);
  } catch (e) {
    if (e instanceof SyntaxError) throw new ReceitaFileError("arquivo não é JSON válido");
    throw e;
  }
  const root = obj(parsed, "arquivo");
  const apuracao = arr(root.apuracao, "apuracao");
  return {
    service,
    ticket: str(root.tiqueteSolicitacao, "tiqueteSolicitacao"),
    ni: str(root.ni, "ni", 14),
    niConsumidor: str(root.niConsumidor, "niConsumidor"),
    geradoEm: dateTime(root.geradoEm, "geradoEm"),
    debits: service === "debitos" ? parseDebits(apuracao) : [],
    credits: service === "creditos" ? parseCredits(apuracao) : [],
    payments: service === "pagamentos" || service === "recolhimentos" ? parsePayments(apuracao, service) : [],
  };
}

/** Resposta do POST de abertura (201): `{tiqueteSolicitacao, tEASegundos}`. */
export function parseConsultaAberta(raw: string): { ticket: string; etaSeconds: number } {
  const root = obj(parseReceitaJson(raw), "resposta");
  return { ticket: str(root.tiqueteSolicitacao, "tiqueteSolicitacao"), etaSeconds: int(root.tEASegundos, "tEASegundos") };
}
