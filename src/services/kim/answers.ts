// Respostas da Kim montadas só com números da base e regras determinísticas (docs/09, docs/11). Nenhum número vem de LLM.
import { and, eq, inArray, sql } from "drizzle-orm";
import { agentRuns, companies, counterparties, invoices, outboundMessages, reconciliationItems } from "@/db/schema";
import type { Db } from "@/db/types";
import { portfolioMetrics, portfolioTotals, radCandidates, type RadCandidate } from "@/services/carteira/metrics";
import { hoursFromCounts, listStandards } from "@/services/equipe/hours";
import { chargeIdempotencyKey } from "@/services/fornecedor";
import { customerLights, supplierLights } from "@/services/semaforos";
import { classify, findCompany, type KimIntent } from "./intents";
import { inCompany, spokenCustomer, spokenSupplier } from "./names";
import { brl, capitalize, count, join, list, num, say, type Say } from "./speech";

export interface KimAnswer extends Say {
  intent: KimIntent;
}

export const FORBIDDEN_ANSWER = "Eu não aprovo nem gero nada. A aprovação é só na tela, com o usuário do contador.";
export const HELP_ANSWER = "Ainda não sei responder isso. Posso dizer o que precisa de decisão hoje, quanto crédito está travado ou se os fornecedores foram cobrados.";
export const NOT_RUN_ANSWER = "A equipe ainda não rodou hoje. Clique em Rodar a equipe e eu te conto o que precisa de decisão.";
export const NOT_SYNCED_ANSWER = "Ainda não tenho a apuração da Receita. Clique em Rodar a equipe e pergunte de novo.";

const plain = (intent: KimIntent, text: string): KimAnswer => ({ intent, fala: text, legenda: text });
const answer = (intent: KimIntent, s: Say): KimAnswer => ({ intent, ...s });

async function hasFinishedRun(db: Db) {
  const [r] = await db.select({ id: agentRuns.id }).from(agentRuns).where(eq(agentRuns.status, "concluida")).limit(1);
  return Boolean(r);
}

async function isReconciled(db: Db) {
  const [r] = await db.select({ id: reconciliationItems.id }).from(reconciliationItems).limit(1);
  return Boolean(r);
}

async function divergences(db: Db, companyId: string | null = null) {
  const rows = await db
    .select({ companyId: reconciliationItems.companyId, diffCents: reconciliationItems.diffCents })
    .from(reconciliationItems)
    .where(and(eq(reconciliationItems.status, "divergente_valor"), companyId ? eq(reconciliationItems.companyId, companyId) : undefined));
  return { n: rows.length, absCents: rows.reduce((a, r) => a + (r.diffCents && r.diffCents < 0n ? -r.diffCents : (r.diffCents ?? 0n)), 0n) };
}

interface SupplierCharge {
  cnpj: string;
  name: string;
  charged: boolean;
  delivered: boolean;
}

/** Fornecedores com crédito travado e o status real da cobrança por e-mail (Resend: `delivered` = entregue). */
async function supplierCharges(db: Db, candidates: RadCandidate[]): Promise<SupplierCharge[]> {
  if (candidates.length === 0) return [];
  const cnpjs = [...new Set(candidates.map((c) => c.counterpartyCnpj))];
  const names = new Map((await db.select({ cnpj: counterparties.cnpj, name: counterparties.name }).from(counterparties).where(inArray(counterparties.cnpj, cnpjs))).map((r) => [r.cnpj, r.name]));
  const msgs = await db
    .select({ key: outboundMessages.idempotencyKey, status: outboundMessages.lastStatus })
    .from(outboundMessages)
    .where(and(eq(outboundMessages.channel, "email"), inArray(outboundMessages.idempotencyKey, candidates.map((c) => chargeIdempotencyKey(c.invoiceId)))));
  const byKey = new Map(msgs.map((m) => [m.key, m.status]));
  return cnpjs.map((cnpj) => {
    const statuses = candidates.filter((c) => c.counterpartyCnpj === cnpj).map((c) => byKey.get(chargeIdempotencyKey(c.invoiceId)));
    return {
      cnpj,
      name: names.get(cnpj) ?? cnpj,
      charged: statuses.some((st) => st !== undefined && st !== "erro"),
      delivered: statuses.some((st) => st === "delivered"),
    };
  });
}

function chargeSentence(charges: SupplierCharge[]): Say | null {
  const total = charges.length;
  if (total === 0) return null;
  const charged = charges.filter((c) => c.charged).length;
  const anyDelivered = charges.some((c) => c.delivered);
  if (charged === 0) return say`Ainda não cobrei ${total === 1 ? "o fornecedor" : "os fornecedores"}.`;
  if (charged < total) return say`Cobrei ${num(charged)} de ${num(total)} fornecedores por e-mail.`;
  const ja = anyDelivered ? "já " : "";
  if (total === 1) return say`O fornecedor ${ja}foi cobrado por e-mail.`;
  return say`Os ${num(total)} fornecedores ${ja}foram cobrados por e-mail.`;
}

async function decisoesHoje(db: Db): Promise<KimAnswer> {
  if (!(await hasFinishedRun(db))) return plain("decisoes_hoje", NOT_RUN_ANSWER);
  const [{ n: notes }] = await db.select({ n: sql<number>`count(*)::int` }).from(invoices);
  const [{ n: clients }] = await db.select({ n: sql<number>`count(*)::int` }).from(companies);
  const metrics = await portfolioMetrics(db);
  const totals = portfolioTotals(metrics);
  const candidates = await radCandidates(db);
  const guias = candidates.filter((c) => !c.hasDecision).length;
  const diffs = await divergences(db);
  const withDecisions = metrics.filter((m) => m.decisions > 0);

  const parts: Say[] = [];
  parts.push(say`Conferi ${num(notes, "f")} notas de ${num(clients)} clientes.`);
  const what: Say[] = [];
  if (guias > 0) what.push(say`${count(guias, "f", "guia", "guias")} de recolhimento`);
  if (diffs.n === 1) what.push(say`uma diferença de ${brl(diffs.absCents)}`);
  else if (diffs.n > 1) what.push(say`${num(diffs.n, "f")} diferenças que somam ${brl(diffs.absCents)}`);
  const d = totals.decisions;
  if (d === 0) parts.push(say`Não há decisão esperando por você.`);
  else if (withDecisions.length === 1) {
    const where = inCompany(withDecisions[0].name);
    parts.push(d === 1 ? say`É uma decisão, ${where}: ${list(what)}.` : say`São ${num(d, "f")} decisões, todas ${where}: ${list(what)}.`);
  } else parts.push(say`São ${num(d, "f")} decisões em ${num(withDecisions.length)} clientes: ${list(what)}.`);
  if (totals.lockedCents > 0n) parts.push(say`Há ${brl(totals.lockedCents)} de crédito travado.`);
  const charge = chargeSentence(await supplierCharges(db, candidates));
  if (charge) parts.push(charge);
  return answer("decisoes_hoje", join(parts));
}

async function creditoTravado(db: Db): Promise<KimAnswer> {
  if (!(await isReconciled(db))) return plain("credito_travado", NOT_SYNCED_ANSWER);
  const metrics = (await portfolioMetrics(db)).filter((m) => m.lockedCents > 0n).sort((a, b) => (a.lockedCents === b.lockedCents ? 0 : a.lockedCents > b.lockedCents ? -1 : 1));
  const total = metrics.reduce((a, m) => a + m.lockedCents, 0n);
  if (total === 0n) return plain("credito_travado", "Não há crédito travado na carteira.");
  if (metrics.length === 1) return answer("credito_travado", say`O crédito travado na carteira é de ${brl(total)}, todo ${inCompany(metrics[0].name)}.`);
  return answer("credito_travado", say`O crédito travado na carteira é de ${brl(total)}, em ${num(metrics.length)} clientes: ${list(metrics.map((m) => say`${brl(m.lockedCents)} ${inCompany(m.name)}`))}.`);
}

async function motivoCliente(db: Db, text: string): Promise<KimAnswer> {
  if (!(await isReconciled(db))) return plain("motivo_cliente", NOT_SYNCED_ANSWER);
  const metrics = await portfolioMetrics(db);
  const company = findCompany(text, metrics) ?? (metrics[0]?.riskCents > 0n ? metrics[0] : null);
  if (!company) return plain("motivo_cliente", "Nenhum cliente tem divergência nem crédito travado agora.");
  const where = capitalize(inCompany(company.name));
  const lights = new Map((await supplierLights(db, company.id)).map((r) => [r.cnpj, r]));
  // Primeiro o que dá para resolver com RAD (amarelo); depois o maior valor.
  const candidates = (await radCandidates(db, company.id)).sort((a, b) => {
    const ra = lights.get(a.counterpartyCnpj)?.light === "vermelho" ? 1 : 0;
    const rb = lights.get(b.counterpartyCnpj)?.light === "vermelho" ? 1 : 0;
    return ra - rb;
  });
  const diffs = await divergences(db, company.id);
  const cpNames = new Map((await db.select({ cnpj: counterparties.cnpj, name: counterparties.name }).from(counterparties)).map((r) => [r.cnpj, r.name]));
  const noteNumber = (c: RadCandidate) => num(BigInt(c.accessKey.slice(25, 34)));
  const parts: Say[] = [];
  const [first, ...others] = candidates;
  if (first) {
    parts.push(say`${where}, ${spokenSupplier(cpNames.get(first.counterpartyCnpj)).the} não recolheu a CBS da nota ${noteNumber(first)}. São ${brl(first.lockedCents)} de crédito esperando.`);
    for (const c of others) {
      const refused = lights.get(c.counterpartyCnpj)?.light === "vermelho" ? " e recusou o RAD" : "";
      parts.push(say`${capitalize(spokenSupplier(cpNames.get(c.counterpartyCnpj)).the)} também não recolheu a CBS da nota ${noteNumber(c)}${refused}: mais ${brl(c.lockedCents)} travados.`);
    }
    if (diffs.n === 1) parts.push(say`Há ainda uma diferença de ${brl(diffs.absCents)} entre uma nota e a Receita.`);
    else if (diffs.n > 1) parts.push(say`Há ainda ${num(diffs.n, "f")} diferenças entre notas e a Receita, que somam ${brl(diffs.absCents)}.`);
  } else if (diffs.n > 0) {
    parts.push(diffs.n === 1 ? say`${where}, há uma diferença de ${brl(diffs.absCents)} entre uma nota e a Receita.` : say`${where}, há ${num(diffs.n, "f")} diferenças entre notas e a Receita, que somam ${brl(diffs.absCents)}.`);
  } else parts.push(say`${where}, está tudo conciliado.`);
  return answer("motivo_cliente", join(parts));
}

async function fornecedorCobrado(db: Db): Promise<KimAnswer> {
  if (!(await isReconciled(db))) return plain("fornecedor_cobrado", NOT_SYNCED_ANSWER);
  const charges = await supplierCharges(db, await radCandidates(db));
  if (charges.length === 0) return plain("fornecedor_cobrado", "Nenhum fornecedor precisa de cobrança agora.");
  const charged = charges.filter((c) => c.charged);
  if (charged.length === 0) return plain("fornecedor_cobrado", charges.length === 1 ? "Ainda não cobrei o fornecedor." : "Ainda não cobrei os fornecedores.");
  const parts: Say[] = [];
  if (charged.length === charges.length) parts.push(charges.length === 1 ? say`Cobrei ${spokenSupplier(charged[0].name).the} por e-mail.` : say`Cobrei os ${num(charges.length)} fornecedores por e-mail.`);
  else parts.push(say`Cobrei ${num(charged.length)} de ${num(charges.length)} fornecedores por e-mail.`);
  const delivered = charged.filter((c) => c.delivered);
  if (delivered.length === 0) parts.push(say`Ainda não tenho confirmação de entrega.`);
  else if (delivered.length === charged.length && charged.length > 1) parts.push(say`Os e-mails já foram entregues.`);
  else if (charged.length === 1) parts.push(say`O e-mail já foi entregue.`);
  else parts.push(delivered.length === 1 ? say`O ${spokenSupplier(delivered[0].name).of} já foi entregue.` : say`Os ${list(delivered.map((c) => spokenSupplier(c.name).of))} já foram entregues.`);
  return answer("fornecedor_cobrado", join(parts));
}

async function horas(db: Db): Promise<KimAnswer> {
  const [run] = await db.select().from(agentRuns).where(eq(agentRuns.status, "concluida")).orderBy(sql`${agentRuns.startedAt} desc`).limit(1);
  if (!run) return plain("horas", "A equipe ainda não rodou hoje. Clique em Rodar a equipe e eu te conto quanto trabalho ela fez.");
  const { minutes } = hoursFromCounts(run.counts ?? {}, await listStandards(db));
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  const amount = list([...(h > 0 ? [count(h, "f", "hora", "horas")] : []), ...(m > 0 || h === 0 ? [count(m, "m", "minuto", "minutos")] : [])]);
  return answer("horas", say`Nesta rodada, a equipe fez o equivalente a ${amount} de trabalho, pelas premissas da tela Equipe.`);
}

type Scope = { id: string; name: string }[];
async function scopeOf(db: Db, text: string): Promise<{ named: boolean; list: Scope }> {
  const all = (await db.select({ id: companies.id, name: companies.name }).from(companies)).sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
  const one = findCompany(text, all);
  return one ? { named: true, list: [one] } : { named: false, list: all };
}

const MAX_COMPANIES = 3;

async function semaforoFornecedores(db: Db, text: string): Promise<KimAnswer> {
  if (!(await isReconciled(db))) return plain("semaforo_fornecedores", NOT_SYNCED_ANSWER);
  const scope = await scopeOf(db, text);
  const parts: Say[] = [];
  let flagged = 0;
  for (const c of scope.list) {
    const rows = await supplierLights(db, c.id);
    const reds = rows.filter((r) => r.light === "vermelho").map((r) => spokenSupplier(r.name).the);
    const yellows = rows.filter((r) => r.light === "amarelo").map((r) => spokenSupplier(r.name).the);
    const where = capitalize(inCompany(c.name));
    if (reds.length === 0 && yellows.length === 0) {
      if (scope.named) parts.push(rows.every((r) => r.light === "aguardando") ? say`${where}, os fornecedores ainda aguardam a sincronização com a Receita.` : say`${where}, todos os fornecedores estão no verde.`);
      continue;
    }
    if (++flagged > MAX_COMPANIES) continue;
    if (reds.length === 1) parts.push(say`${where}, um fornecedor está no vermelho: ${reds[0]} não recolheu e recusou o RAD.`);
    else if (reds.length > 1) parts.push(say`${where}, ${num(reds.length)} fornecedores estão no vermelho: ${list(reds)} não recolheram e recusaram o RAD.`);
    else parts.push(say`${where}, nenhum fornecedor está no vermelho.`);
    if (yellows.length === 1) parts.push(say`${capitalize(yellows[0])} está no amarelo: recomendo recolher via RAD.`);
    else if (yellows.length > 1) parts.push(say`${capitalize(list(yellows))} estão no amarelo: recomendo recolher via RAD.`);
  }
  if (flagged > MAX_COMPANIES) parts.push(say`Há mais ${num(flagged - MAX_COMPANIES)} ${flagged - MAX_COMPANIES === 1 ? "cliente" : "clientes"} com fornecedor no amarelo ou no vermelho, na tela Fornecedores.`);
  if (parts.length === 0) parts.push(say`Todos os fornecedores da carteira estão no verde.`);
  return answer("semaforo_fornecedores", join(parts));
}

async function semaforoClientes(db: Db, text: string): Promise<KimAnswer> {
  if (!(await isReconciled(db))) return plain("semaforo_clientes", NOT_SYNCED_ANSWER);
  const scope = await scopeOf(db, text);
  const parts: Say[] = [];
  let flagged = 0;
  const open = (rows: { saldoDevedorCents: bigint | null }[]) => rows.reduce((a, r) => a + (r.saldoDevedorCents ?? 0n), 0n);
  for (const c of scope.list) {
    const rows = await customerLights(db, c.id);
    const reds = rows.filter((r) => r.light === "vermelho");
    const yellows = rows.filter((r) => r.light === "amarelo");
    const where = capitalize(inCompany(c.name));
    if (reds.length === 0 && yellows.length === 0) {
      if (scope.named) parts.push(rows.every((r) => r.light === "aguardando") ? say`${where}, as vendas ainda aguardam a sincronização com a Receita.` : say`${where}, todas as vendas estão no verde.`);
      continue;
    }
    if (++flagged > MAX_COMPANIES) continue;
    const s: Say[] = [];
    if (reds.length === 1) s.push(say`${where}, uma venda está no vermelho: ${spokenCustomer(reds[0].customerName)} não pagou e há ${brl(open(reds))} de CBS em aberto; recomendo recolher a CBS e cobrar o cliente.`);
    else if (reds.length > 1) s.push(say`${where}, ${num(reds.length, "f")} vendas estão no vermelho, com ${brl(open(reds))} de CBS em aberto; recomendo recolher a CBS e cobrar os clientes.`);
    else s.push(say`${where}, nenhuma venda está no vermelho.`);
    if (yellows.length === 1) s.push(say`Uma venda está no amarelo: ${spokenCustomer(yellows[0].customerName)} ainda vai pagar, com ${brl(open(yellows))} de CBS em aberto; recomendo cobrar antes do vencimento.`);
    else if (yellows.length > 1) s.push(say`${capitalize(num(yellows.length, "f"))} vendas estão no amarelo, com ${brl(open(yellows))} de CBS em aberto; recomendo cobrar antes do vencimento.`);
    parts.push(join(s));
  }
  if (flagged > MAX_COMPANIES) parts.push(say`Há mais ${num(flagged - MAX_COMPANIES)} ${flagged - MAX_COMPANIES === 1 ? "cliente" : "clientes"} com vendas no amarelo ou no vermelho, no Painel do cliente.`);
  if (parts.length === 0) parts.push(say`Todas as vendas da carteira estão no verde.`);
  return answer("semaforo_clientes", join(parts));
}

/** Pergunta → intenção por regra → resposta com números da base. Não muda nada no banco. */
export async function answerQuestion(db: Db, text: string): Promise<KimAnswer> {
  const names = await db.select({ name: companies.name }).from(companies);
  const intent = classify(text, findCompany(text, names) !== null);
  switch (intent) {
    case "acao_proibida":
      return plain(intent, FORBIDDEN_ANSWER);
    case "decisoes_hoje":
      return decisoesHoje(db);
    case "credito_travado":
      return creditoTravado(db);
    case "motivo_cliente":
      return motivoCliente(db, text);
    case "fornecedor_cobrado":
      return fornecedorCobrado(db);
    case "horas":
      return horas(db);
    case "semaforo_fornecedores":
      return semaforoFornecedores(db, text);
    case "semaforo_clientes":
      return semaforoClientes(db, text);
    case "ajuda":
      return plain(intent, HELP_ANSWER);
  }
}
