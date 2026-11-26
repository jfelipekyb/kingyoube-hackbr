import Link from "next/link";
import { notFound } from "next/navigation";
import { ReconcileButton } from "@/components/conciliacao/reconcile-button";
import { CustomerTable, LightFilter, SupplierTable } from "@/components/semaforos/tables";
import { PageHeader } from "@/components/under-construction";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ITEM_STATUS_LABEL, ItemStatusBadge } from "@/components/ui/item-status-badge";
import { getDb } from "@/db/client";
import { isUuid } from "@/lib/company-param";
import { formatCnpj } from "@/lib/cnpj";
import { formatBRL } from "@/lib/money";
import { cn } from "@/lib/utils";
import { portfolioMetrics } from "@/services/carteira/metrics";
import type { ItemStatus } from "@/services/conciliacao/rules";
import { countByLight, customerLights, supplierLights, type Light } from "@/services/semaforos";

export const dynamic = "force-dynamic";

const TABS = [
  { key: "resumo", label: "Resumo" },
  { key: "fornecedores", label: "Fornecedores" },
  { key: "clientes", label: "Clientes" },
] as const;
type Tab = (typeof TABS)[number]["key"];
const LIGHTS: Light[] = ["verde", "amarelo", "vermelho"];

export default async function ClientPanelPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ aba?: string; cor?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  if (!isUuid(id)) notFound();
  const db = getDb();
  const [m] = await portfolioMetrics(db, id);
  if (!m) notFound();
  const tab: Tab = TABS.some((t) => t.key === sp.aba) ? (sp.aba as Tab) : "resumo";
  const color = LIGHTS.includes(sp.cor as Light) ? (sp.cor as Light) : null;
  const href = (t: Tab, c: Light | null = null) => `/carteira/${id}?aba=${t}${c ? `&cor=${c}` : ""}`;
  const name = m.name.replace(/\s*\(FICTÍCIA\)$/, "");

  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <PageHeader title={name} description={`${formatCnpj(m.cnpj)} · ${m.segment}`} />
        <ReconcileButton companyId={id} label="Conciliar este cliente" variant="outline" />
      </div>
      <nav aria-label="Abas do painel do cliente" className="mb-6 flex gap-1 border-b border-kyb-linha">
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={href(t.key)}
            aria-current={tab === t.key ? "page" : undefined}
            className={cn(
              "-mb-px border-b-2 px-4 py-2 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-kyb-verde",
              tab === t.key ? "border-kyb-verde text-kyb-azul" : "border-transparent text-kyb-mudo hover:text-kyb-azul",
            )}
          >
            {t.label}
          </Link>
        ))}
      </nav>
      {tab === "resumo" ? <Summary m={m} id={id} /> : null}
      {tab === "fornecedores" ? <Suppliers id={id} color={color} hrefFor={(c) => href("fornecedores", c)} /> : null}
      {tab === "clientes" ? <Customers id={id} color={color} hrefFor={(c) => href("clientes", c)} /> : null}
    </>
  );
}

function Summary({ m, id }: { m: Awaited<ReturnType<typeof portfolioMetrics>>[number]; id: string }) {
  const statuses = Object.keys(ITEM_STATUS_LABEL) as ItemStatus[];
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>Indicadores</CardTitle>
          <CardDescription>Calculados pela regra a partir da conciliação.</CardDescription>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-3 gap-4">
            <div>
              <dt className="text-xs text-kyb-mudo">Dinheiro em risco</dt>
              <dd className="text-xl font-semibold tabular-nums">{formatBRL(m.riskCents)}</dd>
            </div>
            <div>
              <dt className="text-xs text-kyb-mudo">Crédito travado</dt>
              <dd className="text-xl font-semibold tabular-nums">{formatBRL(m.lockedCents)}</dd>
            </div>
            <div>
              <dt className="text-xs text-kyb-mudo">Decisões pendentes</dt>
              <dd className="text-xl font-semibold tabular-nums">{m.decisions}</dd>
            </div>
          </dl>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Itens por status</CardTitle>
          <CardDescription>{m.items} itens conciliados nota × Receita.</CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="flex flex-col gap-2">
            {statuses
              .filter((s) => (m.byStatus[s] ?? 0) > 0)
              .map((s) => (
                <li key={s} className="flex items-center justify-between gap-2">
                  <Link href={`/conciliacao?cliente=${id}&status=${s}`} className="rounded-kyb-selo focus-visible:outline-2 focus-visible:outline-kyb-verde">
                    <ItemStatusBadge status={s} />
                  </Link>
                  <span className="font-semibold tabular-nums">{m.byStatus[s]}</span>
                </li>
              ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}

async function Suppliers({ id, color, hrefFor }: { id: string; color: Light | null; hrefFor: (c: Light | null) => string }) {
  const rows = await supplierLights(getDb(), id);
  return (
    <>
      <LightFilter counts={countByLight(rows)} active={color} hrefFor={hrefFor} />
      <Card className="py-0">
        <SupplierTable rows={color ? rows.filter((r) => r.light === color) : rows} />
      </Card>
    </>
  );
}

async function Customers({ id, color, hrefFor }: { id: string; color: Light | null; hrefFor: (c: Light | null) => string }) {
  const rows = await customerLights(getDb(), id);
  return (
    <>
      <p className="mb-4 max-w-3xl text-sm text-kyb-mudo">Semáforo das vendas: o risco é a empresa dever a CBS de uma venda que o cliente ainda não pagou.</p>
      <LightFilter counts={countByLight(rows)} active={color} hrefFor={hrefFor} />
      <Card className="py-0">
        <CustomerTable rows={color ? rows.filter((r) => r.light === color) : rows} />
      </Card>
    </>
  );
}
