import Link from "next/link";
import { ReconcileButton } from "@/components/conciliacao/reconcile-button";
import { PageHeader } from "@/components/under-construction";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CountUp } from "@/components/ui/count-up";
import { LightDots } from "@/components/ui/light-badge";
import { StatusBadge } from "@/components/ui/status-badge";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getDb } from "@/db/client";
import { formatCnpj } from "@/lib/cnpj";
import { currentCompanyId } from "@/lib/demo-session";
import { formatBRL } from "@/lib/money";
import { portfolioMetrics, portfolioTotals } from "@/services/carteira/metrics";
import { portfolioLights } from "@/services/semaforos";

export const dynamic = "force-dynamic";

const shortName = (name: string) => name.replace(/\s*\(FICTÍCIA\)$/, "");

export default async function CarteiraPage() {
  const db = getDb();
  const selected = await currentCompanyId();
  const all = await portfolioMetrics(db);
  const rows = selected ? all.filter((r) => r.id === selected) : all;
  const totals = portfolioTotals(rows);
  const lights = await portfolioLights(db, rows.map((r) => r.id));
  const reconciled = rows.some((r) => r.reconciled);
  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <PageHeader title="Carteira" description="Os clientes do escritório em ordem de dinheiro em risco. A regra calcula; o contador decide." />
        <ReconcileButton label="Conciliar carteira" />
      </div>
      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <Card size="sm">
          <CardHeader>
            <CardDescription>Dinheiro em risco</CardDescription>
            <CardTitle className="text-2xl">
              <CountUp value={totals.riskCents} currency />
            </CardTitle>
          </CardHeader>
        </Card>
        <Card size="sm">
          <CardHeader>
            <CardDescription>Crédito travado</CardDescription>
            <CardTitle className="text-2xl">
              <CountUp value={totals.lockedCents} currency />
            </CardTitle>
          </CardHeader>
        </Card>
        <Card size="sm">
          <CardHeader>
            <CardDescription>Decisões pendentes</CardDescription>
            <CardTitle className="text-2xl">
              <CountUp value={totals.decisions} />
            </CardTitle>
          </CardHeader>
        </Card>
      </div>
      {!reconciled ? (
        <Card size="sm" className="mb-4">
          <CardContent className="text-sm text-kyb-mudo">
            Ainda sem conciliação: sincronize com a Receita em <Link className="underline" href="/sincronizacao">Sincronização</Link> e depois clique em “Conciliar carteira”.
          </CardContent>
        </Card>
      ) : null}
      <Card className="py-0" data-tour="carteira">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Cliente</TableHead>
              <TableHead className="text-right">Itens</TableHead>
              <TableHead className="text-right">Dinheiro em risco</TableHead>
              <TableHead className="text-right">Crédito travado</TableHead>
              <TableHead className="text-right">Decisões</TableHead>
              <TableHead>Fornecedores</TableHead>
              <TableHead>Clientes</TableHead>
              <TableHead>Situação</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r, i) => {
              const l = lights.get(r.id)!;
              const pending = r.items - (r.byStatus.conciliado ?? 0);
              return (
                <TableRow key={r.id} className="kyb-entrada" style={{ "--kyb-ordem": i } as React.CSSProperties} data-company={r.id}>
                  <TableCell className="whitespace-normal">
                    <Link href={`/carteira/${r.id}`} className="font-semibold text-kyb-azul underline-offset-4 hover:underline">
                      {shortName(r.name)}
                    </Link>
                    <div className="text-xs text-kyb-mudo">
                      {formatCnpj(r.cnpj)} · {r.segment}
                    </div>
                  </TableCell>
                  <TableCell className="text-right">{r.items}</TableCell>
                  <TableCell className="text-right font-semibold">{formatBRL(r.riskCents)}</TableCell>
                  <TableCell className="text-right">{formatBRL(r.lockedCents)}</TableCell>
                  <TableCell className="text-right">{r.decisions}</TableCell>
                  <TableCell>
                    <LightDots counts={l.suppliers} label="Fornecedores" />
                  </TableCell>
                  <TableCell>
                    <LightDots counts={l.customers} label="Clientes" />
                  </TableCell>
                  <TableCell>
                    {!r.reconciled ? (
                      <StatusBadge tone="aguardando">Aguardando conciliação</StatusBadge>
                    ) : pending > 0 ? (
                      <StatusBadge tone="atencao">{pending} pedem olhar</StatusBadge>
                    ) : (
                      <StatusBadge tone="conciliado">Tudo conciliado</StatusBadge>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
          <TableFooter>
            <TableRow>
              <TableCell>{rows.length} clientes</TableCell>
              <TableCell className="text-right">{totals.items}</TableCell>
              <TableCell className="text-right">{formatBRL(totals.riskCents)}</TableCell>
              <TableCell className="text-right">{formatBRL(totals.lockedCents)}</TableCell>
              <TableCell className="text-right">{totals.decisions}</TableCell>
              <TableCell colSpan={3} />
            </TableRow>
          </TableFooter>
        </Table>
      </Card>
    </>
  );
}
