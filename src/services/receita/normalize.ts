// Normalização idempotente (chave natural; débito/crédito só atualiza se `atualizacao` for igual ou mais nova).
import { createHash } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { rfbCredits, rfbDebits, rfbPayments, rfbRawFiles } from "@/db/schema";
import type { Db } from "@/db/types";
import { parseReceitaFile, ReceitaFileError } from "./parser";
import { hmacPii } from "./pii";
import type { ReceitaService } from "./types";

export function sha256(raw: string): string {
  return createHash("sha256").update(raw, "utf8").digest("hex");
}

/** `niConsumidor` pode ser CPF (docs/07): fica só o HMAC-SHA256 (chave PII_HASH_KEY) + os 2 últimos dígitos. */
export function maskNiConsumidor(raw: string, hashKey: string): string {
  return raw.replace(/("niConsumidor"\s*:\s*)"(\d{11}|\d{14})"/, (_m, prefix: string, ni: string) => {
    return `${prefix}"h:${hmacPii(hashKey, ni)}:${ni.slice(-2)}"`;
  });
}

/** Guarda o bruto (append-only). O sha256 é do arquivo como veio; o payload sai com o `niConsumidor` mascarado. */
export async function storeRawFile(db: Db, requestId: string, hashKey: string, raw: string) {
  const hash = sha256(raw);
  return db.transaction(async (tx) => {
    // Duas telas acompanhando o mesmo pedido: a segunda espera e encontra o bruto já gravado.
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`rfb-raw:${requestId}`}))`);
    const [existing] = await tx
      .select({ id: rfbRawFiles.id })
      .from(rfbRawFiles)
      .where(and(eq(rfbRawFiles.requestId, requestId), eq(rfbRawFiles.sha256, hash)))
      .limit(1);
    if (existing) return { id: existing.id, sha256: hash };
    const [row] = await tx
      .insert(rfbRawFiles)
      .values({ requestId, sha256: hash, payload: sql`${maskNiConsumidor(raw, hashKey)}::jsonb` })
      .returning({ id: rfbRawFiles.id });
    return { id: row.id, sha256: hash };
  });
}

export interface NormalizeResult {
  rows: number;
  inserted: number;
  updated: number;
  unchanged: number;
}

const BATCH = 200;

function chunks<T>(items: T[]): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += BATCH) out.push(items.slice(i, i + BATCH));
  return out;
}

const inserted = sql<boolean>`(xmax = 0)`;

export async function normalizeFile(
  db: Db,
  input: { companyId: string; cnpjRoot: string; service: ReceitaService; raw: string },
): Promise<NormalizeResult> {
  const file = parseReceitaFile(input.service, input.raw);
  if (file.ni !== input.cnpjRoot) throw new ReceitaFileError("arquivo de outro contribuinte (ni não confere)");
  const result: NormalizeResult = { rows: 0, inserted: 0, updated: 0, unchanged: 0 };
  const tally = (total: number, returned: { inserted: boolean }[]) => {
    result.rows += total;
    const ins = returned.filter((r) => r.inserted).length;
    result.inserted += ins;
    result.updated += returned.length - ins;
    result.unchanged += total - returned.length;
  };

  for (const batch of chunks(file.debits)) {
    const returned = await db
      .insert(rfbDebits)
      .values(batch.map((d) => ({ ...d, companyId: input.companyId })))
      .onConflictDoUpdate({
        target: [rfbDebits.companyId, rfbDebits.accessKey, rfbDebits.period, rfbDebits.origin],
        set: {
          docModel: sql`excluded.doc_model`,
          issuedAt: sql`excluded.issued_at`,
          registeredAt: sql`excluded.registered_at`,
          updatedAt: sql`excluded.updated_at`,
          apuradoCents: sql`excluded.apurado_cents`,
          excedenteCents: sql`excluded.excedente_cents`,
          suspensoCents: sql`excluded.suspenso_cents`,
          inexigivelCents: sql`excluded.inexigivel_cents`,
          pgtoAntecipadoCents: sql`excluded.pgto_antecipado_cents`,
          extintoCents: sql`excluded.extinto_cents`,
          saldoDevedorCents: sql`excluded.saldo_devedor_cents`,
        },
        setWhere: sql`excluded.updated_at >= ${rfbDebits.updatedAt}`,
      })
      .returning({ inserted });
    tally(batch.length, returned);
  }

  for (const batch of chunks(file.credits)) {
    const returned = await db
      .insert(rfbCredits)
      .values(batch.map((c) => ({ ...c, companyId: input.companyId })))
      .onConflictDoUpdate({
        target: [rfbCredits.companyId, rfbCredits.accessKey, rfbCredits.period, rfbCredits.origin],
        set: {
          docModel: sql`excluded.doc_model`,
          issuedAt: sql`excluded.issued_at`,
          registeredAt: sql`excluded.registered_at`,
          updatedAt: sql`excluded.updated_at`,
          apuradoCents: sql`excluded.apurado_cents`,
          excedenteCents: sql`excluded.excedente_cents`,
          suspensoCents: sql`excluded.suspenso_cents`,
          apropriadoCents: sql`excluded.apropriado_cents`,
          aApropriarCents: sql`excluded.a_apropriar_cents`,
          inapropriavelCents: sql`excluded.inapropriavel_cents`,
          prescritoCents: sql`excluded.prescrito_cents`,
          utilizadoCents: sql`excluded.utilizado_cents`,
          inutilizavelCents: sql`excluded.inutilizavel_cents`,
          restabelecidoCents: sql`excluded.restabelecido_cents`,
          saldoCredorCents: sql`excluded.saldo_credor_cents`,
          pedidoRessarcimentoCents: sql`excluded.pedido_ressarcimento_cents`,
        },
        setWhere: sql`excluded.updated_at >= ${rfbCredits.updatedAt}`,
      })
      .returning({ inserted });
    tally(batch.length, returned);
  }

  const sourceService: "pagamentos" | "recolhimentos" = input.service === "recolhimentos" ? "recolhimentos" : "pagamentos";
  for (const batch of chunks(file.payments)) {
    // Pagamento não tem `atualizacao`: o DARF arrecadado não muda; a mesma linha não entra de novo.
    const returned = await db
      .insert(rfbPayments)
      .values(batch.map((p) => ({ ...p, companyId: input.companyId, sourceService })))
      .onConflictDoNothing({ target: [rfbPayments.companyId, rfbPayments.sourceService, rfbPayments.darfNumber, rfbPayments.seq] })
      .returning({ inserted });
    tally(batch.length, returned);
  }
  return result;
}
