// Smoke pós-deploy: npm run smoke -- https://hackbrasil.kingyoube.com
// Só funciona em modo SIMULADO (reinício da demo e Receita simulada). Não usa nem imprime segredo.
// Começa e termina reiniciando a demonstração, para não deixar a base pública mexida.
import { findCompanyId, findProposalId } from "./smoke-lib";

const base = (process.argv[2] ?? "").replace(/\/+$/, "");
if (!/^https?:\/\/[^/]+/.test(base)) {
  console.error("Uso: npm run smoke -- https://hackbrasil.kingyoube.com");
  process.exit(2);
}

type Role = "analista" | "contador";
const sleep = (ms: number) => new Promise((ok) => setTimeout(ok, ms));
const started = Date.now();
const elapsed = () => `${((Date.now() - started) / 1000).toFixed(1)} s`;

class SmokeError extends Error {}
const ok = (msg: string) => console.log(`OK      [${elapsed()}] ${msg}`);
function check(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new SmokeError(msg);
}

async function http(path: string, init: { method?: "GET" | "POST"; body?: unknown; role?: Role } = {}) {
  const res = await fetch(base + path, {
    method: init.method ?? "GET",
    headers: {
      ...(init.body !== undefined ? { "content-type": "application/json" } : {}),
      ...(init.role ? { cookie: `demo_papel=${init.role}` } : {}),
    },
    body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
    cache: "no-store",
    redirect: "follow",
  });
  const text = await res.text();
  let json: Record<string, unknown> = {};
  try {
    json = JSON.parse(text) as Record<string, unknown>;
  } catch {
    /* página HTML */
  }
  return { status: res.status, text, json, headers: res.headers };
}

async function restart(label: string) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const r = await http("/api/demo/reiniciar", { method: "POST" });
    if (r.status === 429) {
      const wait = Number(r.headers.get("retry-after") ?? "60");
      console.log(`AGUARDA [${elapsed()}] reinício limitado a 1 por minuto; nova tentativa em ${wait} s`);
      await sleep((wait + 1) * 1000);
      continue;
    }
    check(r.status === 200, `${label}: reiniciar devolveu HTTP ${r.status}`);
    const counts = r.json.counts as { companies: number; invoices: number };
    ok(`${label}: base recriada com ${counts.companies} clientes e ${counts.invoices} notas`);
    return;
  }
  throw new SmokeError(`${label}: reinício continuou limitado`);
}

async function panel() {
  const r = await http("/");
  check(r.status === 200, `painel: HTTP ${r.status}`);
  check(r.text.includes("Sala da Equipe"), "painel: não achei a Sala da Equipe");
  check(r.text.includes("Dados simulados"), "painel: sem o selo de dados simulados");
  ok("painel abre (HTTP 200), Sala da Equipe e selo “Dados simulados” presentes");
}

async function teamRound() {
  const r = await http("/api/equipe/run", { method: "POST" });
  check(r.status === 200 || r.status === 201, `rodada: iniciar devolveu HTTP ${r.status} ${String(r.json.erro ?? "")}`);
  const runId = r.json.runId as string;
  const agents = r.json.agents as string[];
  for (const agent of agents) {
    for (let i = 0; ; i++) {
      check(i < 180, `rodada: ${agent} não terminou`);
      const s = await http(`/api/equipe/run/${runId}/${agent}`, { method: "POST" });
      check(s.status === 200, `rodada: ${agent} devolveu HTTP ${s.status} ${String(s.json.erro ?? "")}`);
      const step = s.json.step as { status: string; summary?: string };
      check(step.status !== "erro", `rodada: ${agent} com erro: ${step.summary ?? ""}`);
      if (s.json.done) {
        ok(`rodada: ${agent} → ${step.status}${step.summary ? ` · ${step.summary}` : ""}`);
        break;
      }
      await sleep(1000);
    }
  }
  const snap = await http(`/api/equipe/run/${runId}`);
  const run = snap.json.run as { status: string };
  check(run?.status === "concluida", `rodada: terminou em ${run?.status}`);
  const hours = snap.json.hours as { hours: number };
  ok(`rodada da equipe concluída (${agents.length} agentes, ${hours.hours} h devolvidas)`);
}

async function kim() {
  const r = await http("/api/kim/perguntar", { method: "POST", body: { texto: "Kim, o que eu preciso decidir hoje?", modo: "texto" } });
  check(r.status === 200, `Kim: HTTP ${r.status}`);
  const legenda = String(r.json.legenda ?? "");
  check(legenda.length > 0, "Kim: resposta sem legenda");
  ok(`Kim responde em texto: “${legenda.replace(/\s+/g, " ").slice(0, 140)}${legenda.length > 140 ? "…" : ""}”`);
}

async function c2Flow() {
  const list = await http("/rad");
  const companyId = findCompanyId(list.text, "Padaria Boa Massa");
  check(companyId, "C2: não achei a Padaria Boa Massa no seletor de cliente");
  const page = await http(`/rad?cliente=${companyId}`);
  const id = findProposalId(page.text, ["Moinho", "436,50"]);
  check(id, "C2: a Tesouraria não deixou a proposta do Moinho (R$ 436,50) na fila");
  ok(`C2: proposta de RAD do Moinho Estrela (nota 1.284, CBS R$ 436,50) preparada pela Tesouraria`);

  const act = (step: string, role: Role, body: Record<string, unknown> = {}) =>
    http(`/api/rad/proposals/${id}/${step}`, { method: "POST", role, body: { companyId, ...body } });

  const submit = await act("submit", "analista");
  check(submit.status === 200, `C2: enviar devolveu HTTP ${submit.status} ${String(submit.json.erro ?? "")}`);
  ok(`C2: Ana Analista envia ao contador → ${(submit.json.proposta as { state: string }).state}`);

  const early = await act("generate-darf", "contador");
  check(early.status >= 400, `C2: DARF sem aprovação devolveu HTTP ${early.status}`);
  ok(`C2: DARF antes da aprovação bloqueado no servidor (HTTP ${early.status}, ${String(early.json.codigo ?? early.json.erro)})`);

  const selfApprove = await act("approve", "analista");
  check(selfApprove.status >= 400, `C2: a analista conseguiu aprovar (HTTP ${selfApprove.status})`);
  ok(`C2: analista não aprova (HTTP ${selfApprove.status}, ${String(selfApprove.json.codigo ?? selfApprove.json.erro)})`);

  const approve = await act("approve", "contador");
  check(approve.status === 200, `C2: aprovar devolveu HTTP ${approve.status} ${String(approve.json.erro ?? "")}`);
  ok(`C2: Carlos Contador aprova → ${(approve.json.proposta as { state: string }).state}`);

  const byAnalyst = await act("generate-darf", "analista");
  check(byAnalyst.status >= 400, `C2: a analista gerou DARF (HTTP ${byAnalyst.status})`);
  ok(`C2: analista não gera DARF nem com a proposta aprovada (HTTP ${byAnalyst.status}, ${String(byAnalyst.json.codigo ?? byAnalyst.json.erro)})`);

  const darf = await act("generate-darf", "contador");
  check(darf.status === 200, `C2: gerar DARF devolveu HTTP ${darf.status} ${String(darf.json.erro ?? "")}`);
  const p = darf.json.proposta as { state: string; darfPix: string | null; darfBarcode: string | null };
  check(p.state === "darf_gerado" && p.darfPix && p.darfBarcode, `C2: DARF terminou em ${p.state}`);
  ok("C2: DARF gerado (Pix e código de barras) e enviado ao financeiro pelo Mensageiro; ainda não está pago");

  const PAID = "Pago (confirmado pela Receita)";
  const detail = await http(`/rad/${id}?cliente=${companyId}`);
  check(detail.text.includes("Mensageiro"), "C2: tela da proposta sem a seção do Mensageiro");
  check(!detail.text.includes(PAID), "C2: a tela já mostra pago antes da Receita confirmar");
  ok("C2: tela da proposta mostra o DARF e o Mensageiro, ainda sem pagamento confirmado");

  const sync = await http("/api/receita/sync", { method: "POST", body: { companyId } });
  check(sync.status === 200, `C2: sincronizar devolveu HTTP ${sync.status} ${String(sync.json.erro ?? "")}`);
  for (let i = 0; ; i++) {
    check(i < 40, "C2: a Receita simulada não terminou as consultas");
    await sleep(2000);
    const poll = await http("/api/receita/poll", { method: "POST", body: { companyId } });
    check(poll.status === 200, `C2: acompanhar devolveu HTTP ${poll.status}`);
    if ((poll.json.overview as { open: number }).open === 0) break;
  }
  const after = await http(`/rad/${id}?cliente=${companyId}`);
  check(after.text.includes(PAID), "C2: a proposta não chegou a pago_confirmado");
  ok("C2: recolhimentos sincronizados, Receita confirma o pagamento → pago_confirmado");
}

async function main() {
  let failed = false;
  console.log(`Smoke em ${base}`);
  try {
    await restart("início");
    await panel();
    await teamRound();
    await kim();
    await c2Flow();
  } catch (e) {
    failed = true;
    console.error(`FALHOU  [${elapsed()}] ${e instanceof Error ? e.message : String(e)}`);
  } finally {
    try {
      await restart("fim");
    } catch (e) {
      failed = true;
      console.error(`FALHOU  [${elapsed()}] ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  console.log(failed ? `Smoke com falha em ${elapsed()}` : `Smoke verde em ${elapsed()}`);
  process.exit(failed ? 1 : 0);
}

void main();
