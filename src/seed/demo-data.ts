// Base de demonstração de docs/06: tudo fictício, determinístico e calculado a partir de DEMO_TODAY.
import { buildAccessKey } from "@/lib/access-key";
import { buildCnpj } from "@/lib/cnpj";
import { addDays, brasiliaDateTime, periodOf } from "@/lib/dates";
import { Prng, stableUuid } from "@/lib/prng";

export const SEED_DEMO = 2026;
export const GENERATED_INVOICES = 400;

export type Direction = "venda" | "compra";

export interface DemoCompany {
  id: string;
  slug: string;
  name: string;
  segment: string;
  cnpj: string;
  cnpjRoot: string;
  generatedCount: number;
}

export interface DemoCounterparty {
  id: string;
  slug: string;
  name: string;
  cnpj: string;
  siteUrlPath: string | null;
  financeEmail: string | null;
}

export interface DemoInvoice {
  id: string;
  companySlug: string;
  scenario: string | null; // "V1"… para os cenários à mão; null para os gerados
  accessKey: string;
  direction: Direction;
  docModel: 55;
  counterpartyCnpj: string;
  issuedOn: string; // YYYY-MM-DD
  issuedAt: string; // ISO com -03:00
  period: string; // MM/AAAA
  totalCents: bigint;
  cbsCents: bigint;
}

export interface DebitRecord {
  companySlug: string;
  scenario: string | null;
  accessKey: string;
  issuedOn: string;
  period: string;
  apurado: bigint;
  saldoDevedor: bigint;
  suspenso?: bigint;
  extinto?: bigint;
}

export interface CreditRecord {
  companySlug: string;
  scenario: string | null;
  accessKey: string;
  issuedOn: string;
  period: string;
  apurado: bigint;
  apropriado?: bigint;
  aApropriar?: bigint;
  inapropriavel?: bigint;
  utilizado?: bigint;
  saldoCredor: bigint;
}

export interface PaymentRecord {
  companySlug: string;
  scenario: string;
  numeroDARF: string;
  dataArrecadacao: string;
  period: string;
  vencimento: string;
  principal: bigint;
  multa: bigint;
  juros: bigint;
  total: bigint;
}

export interface PcontPaymentRecord extends PaymentRecord {
  niContribuinte: string;
}

export interface RadCollectionRecord extends PaymentRecord {
  niFornecedor: string;
  chaveDFE: string;
}

export interface DemoData {
  demoToday: string;
  companies: DemoCompany[];
  counterparties: DemoCounterparty[];
  invoices: DemoInvoice[];
  debits: DebitRecord[];
  credits: CreditRecord[];
  pcontPayments: PcontPaymentRecord[];
  radCollections: RadCollectionRecord[];
}

export const DEMO_USERS = [
  { id: stableUuid("user:ana"), name: "Ana Analista", email: "ana.analista@exemplo.com", role: "analista" as const },
  { id: stableUuid("user:carlos"), name: "Carlos Contador", email: "carlos.contador@exemplo.com", role: "contador" as const },
];

const COMPANY_SPECS: { slug: string; name: string; segment: string; generated: number }[] = [
  { slug: "padaria-boa-massa", name: "Padaria Boa Massa", segment: "Alimentação", generated: 39 },
  { slug: "auto-pecas-rota-9", name: "Auto Peças Rota 9", segment: "Comércio", generated: 31 },
  { slug: "clinica-sorriso-pleno", name: "Clínica Sorriso Pleno", segment: "Saúde", generated: 33 },
  { slug: "mercadinho-sol-nascente", name: "Mercadinho Sol Nascente", segment: "Comércio", generated: 33 },
  { slug: "construtora-pedra-firme", name: "Construtora Pedra Firme", segment: "Construção", generated: 33 },
  { slug: "restaurante-sabor-da-serra", name: "Restaurante Sabor da Serra", segment: "Alimentação", generated: 33 },
  { slug: "farmacia-vida-leve", name: "Farmácia Vida Leve", segment: "Saúde", generated: 33 },
  { slug: "atelie-bordado-fino", name: "Ateliê Bordado Fino", segment: "Indústria", generated: 33 },
  { slug: "transportadora-rumo-certo", name: "Transportadora Rumo Certo", segment: "Transporte", generated: 33 },
  { slug: "academia-corpo-em-movimento", name: "Academia Corpo em Movimento", segment: "Serviços", generated: 33 },
  { slug: "grafica-tinta-viva", name: "Gráfica Tinta Viva", segment: "Indústria", generated: 33 },
  { slug: "pet-shop-patas-felizes", name: "Pet Shop Patas Felizes", segment: "Comércio", generated: 33 },
];

const GENERIC_COUNTERPARTIES = [
  "Distribuidora Aurora",
  "Atacado Bom Preço",
  "Laticínios Vale Verde",
  "Embalagens Ponto Certo",
  "Comercial Horizonte",
  "Hortifrúti Campo Bom",
  "Papelaria Traço Fino",
  "Química Limpa Mais",
  "Transportes Via Rápida",
  "Tecidos Fio de Ouro",
  "Metalúrgica Aço Forte",
  "Informática Byte Certo",
  "Bebidas Fonte Clara",
  "Gráfica Papel Bom",
  "Materiais Casa Firme",
  "Rações Bicho Feliz",
  "Farmacêutica Bem Estar",
  "Óticas Visão Clara",
  "Combustíveis Estrada Livre",
  "Serviços Limpeza Total",
];

export const MOINHO_SLUG = "moinho-estrela";
export const FORNO_FORTE_SLUG = "forno-forte";

function fictitious(name: string): string {
  return `${name} (FICTÍCIA)`;
}

/** Total da nota derivado da CBS só para a demo (proporção dos cenários C2 e C3). */
function demoTotalFromCbs(cbs: bigint): bigint {
  return (cbs * 1000n) / 9n;
}

export function buildDemoData(demoToday: string): DemoData {
  const prng = new Prng(SEED_DEMO);
  const usedRoots = new Set<string>(["00000000"]);
  const newCnpj = () => {
    for (;;) {
      const root = "00" + prng.digits(6);
      if (!usedRoots.has(root)) {
        usedRoots.add(root);
        return buildCnpj(root);
      }
    }
  };

  const companies: DemoCompany[] = COMPANY_SPECS.map((spec) => {
    const cnpj = newCnpj();
    return {
      id: stableUuid(`company:${spec.slug}`),
      slug: spec.slug,
      name: fictitious(spec.name),
      segment: spec.segment,
      cnpj,
      cnpjRoot: cnpj.slice(0, 8),
      generatedCount: spec.generated,
    };
  });
  const companyBySlug = new Map(companies.map((c) => [c.slug, c]));

  const counterparties: DemoCounterparty[] = [
    {
      id: stableUuid(`counterparty:${MOINHO_SLUG}`),
      slug: MOINHO_SLUG,
      name: fictitious("Moinho Estrela Farinhas"),
      cnpj: newCnpj(),
      siteUrlPath: `/demo/fornecedores/${MOINHO_SLUG}`,
      financeEmail: null, // o Vigia encontra (S5)
    },
    {
      id: stableUuid(`counterparty:${FORNO_FORTE_SLUG}`),
      slug: FORNO_FORTE_SLUG,
      name: fictitious("Equipamentos Forno Forte"),
      cnpj: newCnpj(),
      siteUrlPath: null,
      financeEmail: "financeiro@fornoforte.exemplo",
    },
    ...GENERIC_COUNTERPARTIES.map((name, i) => ({
      id: stableUuid(`counterparty:generic-${i}`),
      slug: `generic-${i}`,
      name: fictitious(name),
      cnpj: newCnpj(),
      siteUrlPath: null,
      financeEmail: null,
    })),
  ];
  const cpBySlug = new Map(counterparties.map((c) => [c.slug, c]));
  const generics = counterparties.slice(2);

  const invoices: DemoInvoice[] = [];
  const debits: DebitRecord[] = [];
  const credits: CreditRecord[] = [];
  const pcontPayments: PcontPaymentRecord[] = [];
  const radCollections: RadCollectionRecord[] = [];

  const makeKey = (issuerCnpj: string, issuedOn: string, number: number) =>
    buildAccessKey({
      uf: "35",
      yearMonth: issuedOn.slice(2, 4) + issuedOn.slice(5, 7),
      issuerCnpj,
      model: "55",
      series: "001",
      number: number.toString().padStart(9, "0"),
      emissionType: "1",
      code: prng.digits(8),
    });

  interface Draft {
    companySlug: string;
    scenario: string | null;
    direction: Direction;
    counterpartyCnpj: string;
    daysAgo: number;
    number: number;
    cbs: bigint;
    total?: bigint;
  }

  const draftToInvoice = (d: Draft): DemoInvoice => {
    const company = companyBySlug.get(d.companySlug)!;
    const issuedOn = addDays(demoToday, -d.daysAgo);
    const issuer = d.direction === "venda" ? company.cnpj : d.counterpartyCnpj;
    const accessKey = makeKey(issuer, issuedOn, d.number);
    return {
      id: stableUuid(`invoice:${accessKey}`),
      companySlug: d.companySlug,
      scenario: d.scenario,
      accessKey,
      direction: d.direction,
      docModel: 55,
      counterpartyCnpj: d.counterpartyCnpj,
      issuedOn,
      issuedAt: brasiliaDateTime(issuedOn),
      period: periodOf(issuedOn),
      totalCents: d.total ?? demoTotalFromCbs(d.cbs),
      cbsCents: d.cbs,
    };
  };

  // ---- Cenários à mão: Padaria Boa Massa (docs/06) ----
  const padaria = "padaria-boa-massa";
  const cliente = (i: number) => generics[i % generics.length].cnpj;
  const moinho = cpBySlug.get(MOINHO_SLUG)!.cnpj;
  const fornoForte = cpBySlug.get(FORNO_FORTE_SLUG)!.cnpj;

  const hand = (d: Draft) => {
    const inv = draftToInvoice(d);
    invoices.push(inv);
    return inv;
  };
  const debit = (inv: DemoInvoice, values: Omit<DebitRecord, "companySlug" | "scenario" | "accessKey" | "issuedOn" | "period">) =>
    debits.push({ companySlug: inv.companySlug, scenario: inv.scenario, accessKey: inv.accessKey, issuedOn: inv.issuedOn, period: inv.period, ...values });
  const credit = (inv: DemoInvoice, values: Omit<CreditRecord, "companySlug" | "scenario" | "accessKey" | "issuedOn" | "period">) =>
    credits.push({ companySlug: inv.companySlug, scenario: inv.scenario, accessKey: inv.accessKey, issuedOn: inv.issuedOn, period: inv.period, ...values });

  const V1 = hand({ companySlug: padaria, scenario: "V1", direction: "venda", counterpartyCnpj: cliente(0), daysAgo: 30, number: 501, cbs: 9000n });
  debit(V1, { apurado: 9000n, saldoDevedor: 0n, extinto: 9000n });
  pcontPayments.push({
    companySlug: padaria,
    scenario: "V1",
    numeroDARF: "0" + prng.digits(16),
    dataArrecadacao: addDays(demoToday, -5),
    period: V1.period,
    vencimento: addDays(demoToday, -5),
    principal: 9000n,
    multa: 0n,
    juros: 0n,
    total: 9000n,
    niContribuinte: companyBySlug.get(padaria)!.cnpj,
  });

  const V2 = hand({ companySlug: padaria, scenario: "V2", direction: "venda", counterpartyCnpj: cliente(1), daysAgo: 14, number: 502, cbs: 12000n });
  debit(V2, { apurado: 13200n, saldoDevedor: 13200n });

  hand({ companySlug: padaria, scenario: "V3", direction: "venda", counterpartyCnpj: cliente(2), daysAgo: 2, number: 503, cbs: 4500n });
  hand({ companySlug: padaria, scenario: "V4", direction: "venda", counterpartyCnpj: cliente(3), daysAgo: 20, number: 504, cbs: 6000n });

  // V5: só na Receita (não existe nota no sistema).
  const V5 = draftToInvoice({ companySlug: padaria, scenario: "V5", direction: "venda", counterpartyCnpj: cliente(4), daysAgo: 10, number: 505, cbs: 7500n });
  debit(V5, { apurado: 7500n, saldoDevedor: 7500n });

  const V6 = hand({ companySlug: padaria, scenario: "V6", direction: "venda", counterpartyCnpj: cliente(5), daysAgo: 11, number: 506, cbs: 20000n });
  debit(V6, { apurado: 20000n, suspenso: 2000n, saldoDevedor: 18000n });

  const C1 = hand({ companySlug: padaria, scenario: "C1", direction: "compra", counterpartyCnpj: cliente(6), daysAgo: 25, number: 7701, cbs: 15000n });
  credit(C1, { apurado: 15000n, apropriado: 15000n, utilizado: 15000n, saldoCredor: 0n });

  const C2 = hand({ companySlug: padaria, scenario: "C2", direction: "compra", counterpartyCnpj: moinho, daysAgo: 13, number: 1284, cbs: 43650n, total: 4850000n });
  credit(C2, { apurado: 43650n, aApropriar: 43650n, saldoCredor: 0n });

  const C3 = hand({ companySlug: padaria, scenario: "C3", direction: "compra", counterpartyCnpj: fornoForte, daysAgo: 16, number: 3310, cbs: 80000n, total: 8888889n });
  credit(C3, { apurado: 80000n, aApropriar: 80000n, saldoCredor: 0n });

  const C4 = hand({ companySlug: padaria, scenario: "C4", direction: "compra", counterpartyCnpj: cliente(7), daysAgo: 18, number: 4420, cbs: 9000n });
  credit(C4, { apurado: 9000n, inapropriavel: 9000n, saldoCredor: 0n });

  const C5 = hand({ companySlug: padaria, scenario: "C5", direction: "compra", counterpartyCnpj: cliente(8), daysAgo: 28, number: 5530, cbs: 10000n });
  credit(C5, { apurado: 10000n, apropriado: 10000n, saldoCredor: 0n });
  radCollections.push({
    companySlug: padaria,
    scenario: "C5",
    numeroDARF: "0" + prng.digits(16),
    dataArrecadacao: addDays(demoToday, -7),
    period: C5.period,
    vencimento: addDays(demoToday, -7),
    principal: 10000n,
    multa: 1000n,
    juros: 500n,
    total: 11500n,
    niFornecedor: cliente(8),
    chaveDFE: C5.accessKey,
  });

  hand({ companySlug: padaria, scenario: "C6", direction: "compra", counterpartyCnpj: cliente(9), daysAgo: 15, number: 6640, cbs: 5500n });

  // ---- Cenário à mão: Auto Peças Rota 9 ----
  hand({ companySlug: "auto-pecas-rota-9", scenario: "R9", direction: "venda", counterpartyCnpj: cliente(10), daysAgo: 12, number: 901, cbs: 8100n });

  // ---- 400 notas geradas, todas conciliadas (R01) ----
  const supplierNumbers = new Map<string, number>();
  for (const company of companies) {
    const vendas = Math.floor(company.generatedCount / 2);
    for (let i = 0; i < company.generatedCount; i++) {
      const direction: Direction = i < vendas ? "venda" : "compra";
      const counterparty = prng.pick(generics);
      let number: number;
      if (direction === "venda") {
        number = 10_001 + i;
      } else {
        number = (supplierNumbers.get(counterparty.cnpj) ?? 20_000) + 1;
        supplierNumbers.set(counterparty.cnpj, number);
      }
      const inv = draftToInvoice({
        companySlug: company.slug,
        scenario: null,
        direction,
        counterpartyCnpj: counterparty.cnpj,
        daysAgo: prng.int(9, 50),
        number,
        cbs: BigInt(prng.int(500, 90_000)),
      });
      invoices.push(inv);
      if (direction === "venda") {
        debit(inv, { apurado: inv.cbsCents, saldoDevedor: 0n, extinto: inv.cbsCents });
      } else {
        credit(inv, { apurado: inv.cbsCents, apropriado: inv.cbsCents, saldoCredor: 0n });
      }
    }
  }

  return { demoToday, companies, counterparties, invoices, debits, credits, pcontPayments, radCollections };
}
