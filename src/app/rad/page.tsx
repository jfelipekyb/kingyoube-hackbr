import Link from "next/link";
import { PageHeader } from "@/components/under-construction";
import { RadStateBadge } from "@/components/rad/rad-state-badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { LightBadge } from "@/components/ui/light-badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getDb } from "@/db/client";
import { resolveCompany } from "@/lib/company-param";
import { formatBRL } from "@/lib/money";
import { radCandidates } from "@/services/carteira/metrics";
import { listProposals } from "@/services/rad";
import { supplierLights } from "@/services/semaforos";
import { PrepareButton } from "./prepare-button";

export const dynamic = "force-dynamic";

const shortName = (n: string | null | undefined) => (n ?? "—").replace(/\s*\(FICTÍCIA\)$/, "");
const shortKey = (k: string) => `…${k.slice(-8)}`;
const OPEN = ["rascunho", "aguardando_aprovacao", "aprovada", "darf_gerado", "pago_confirmado", "erro_receita"];

export default async function RadPage({ searchParams }: { searchParams: Promise<{ cliente?: string }> }) {
  const sp = await searchParams;
  const db = getDb();
  const { company, metrics } = await resolveCompany(db, sp.cliente);
  if (!company) return <EmptyState message="Nenhum cliente na carteira." />;
  const [candidates, proposals, suppliers] = await Promise.all([radCandidates(db, company.id), listProposals(db, company.id), supplierLights(db, company.id)]);
  const supplierByCnpj = new Map(suppliers.map((s) => [s.cnpj, s]));
  const openByInvoice = new Map(proposals.filter((p) => OPEN.includes(p.proposal.state)).map((p) => [p.proposal.invoiceId, p.proposal]));
  const queue = proposals.filter((p) => p.proposal.state === "aguardando_aprovacao");

  return (
    <>
      <PageHeader
        title="RAD — recolhimento como adquirente"
        description="A Tesouraria prepara a proposta, uma pessoa envia e o contador decide. Elegibilidade legal é decisão do contador; o valor sugerido é o crédito travado."
      />
      <form className="mb-4 flex flex-wrap items-end gap-3" action="/rad">
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-semibold">Cliente</span>
          <select name="cliente" defaultValue={company.id} className="h-9 rounded-kyb-botao border border-kyb-linha bg-kyb-branco px-3 text-sm">
            {metrics.map((m) => (
              <option key={m.id} value={m.id}>
                {shortName(m.name)}
              </option>
            ))}
          </select>
        </label>
        <button type="submit" className="h-9 rounded-kyb-botao border border-kyb-azul bg-kyb-branco px-3.5 text-sm font-semibold text-kyb-azul hover:bg-kyb-canvas-2">
          Ver
        </button>
      </form>

      <div className="grid gap-4">
        <Card data-tour="rad-candidatas">
          <CardHeader>
            <CardTitle>Candidatas a RAD</CardTitle>
            <CardDescription>Compras com crédito a apropriar e sem RAD confirmado (docs/04).</CardDescription>
          </CardHeader>
          <CardContent className="px-0">
            {candidates.length === 0 ? (
              <EmptyState message="Nenhuma compra candidata. Sincronize com a Receita se ainda não sincronizou." />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Fornecedor</TableHead>
                    <TableHead>Semáforo</TableHead>
                    <TableHead>Período</TableHead>
                    <TableHead>Chave</TableHead>
                    <TableHead className="text-right">Valor sugerido</TableHead>
                    <TableHead className="text-right">Proposta</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {candidates.map((c) => {
                    const sup = supplierByCnpj.get(c.counterpartyCnpj);
                    const open = openByInvoice.get(c.invoiceId);
                    return (
                      <TableRow key={c.invoiceId} data-access-key={c.accessKey}>
                        <TableCell className="font-semibold">{shortName(sup?.name)}</TableCell>
                        <TableCell>{sup ? <LightBadge light={sup.light} /> : "—"}</TableCell>
                        <TableCell className="tabular-nums">{c.period}</TableCell>
                        <TableCell className="font-mono text-xs" title={c.accessKey}>
                          {shortKey(c.accessKey)}
                        </TableCell>
                        <TableCell className="text-right font-semibold tabular-nums">{formatBRL(c.lockedCents)}</TableCell>
                        <TableCell className="text-right">
                          {open ? (
                            <Link href={`/rad/${open.id}`} className="inline-flex items-center gap-2 text-sm text-kyb-azul underline-offset-4 hover:underline">
                              <RadStateBadge state={open.state} /> Abrir
                            </Link>
                          ) : (
                            <PrepareButton companyId={company.id} invoiceId={c.invoiceId} />
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Card data-tour="rad-fila">
          <CardHeader>
            <CardTitle>Fila do Contador</CardTitle>
            <CardDescription>Propostas enviadas, aguardando a decisão do contador. Quem enviou não pode aprovar.</CardDescription>
          </CardHeader>
          <CardContent className="px-0">
            <ProposalTable rows={queue} empty="Nenhuma proposta aguardando aprovação." />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Todas as propostas</CardTitle>
          </CardHeader>
          <CardContent className="px-0">
            <ProposalTable rows={proposals} empty="Nenhuma proposta ainda." />
          </CardContent>
        </Card>
      </div>
    </>
  );
}

function ProposalTable({ rows, empty }: { rows: Awaited<ReturnType<typeof listProposals>>; empty: string }) {
  if (rows.length === 0) return <EmptyState message={empty} />;
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Fornecedor</TableHead>
          <TableHead>Opção</TableHead>
          <TableHead className="text-right">Valor</TableHead>
          <TableHead>Estado</TableHead>
          <TableHead className="text-right">Detalhe</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map(({ proposal: p, supplierName, cbsCents }) => (
          <TableRow key={p.id} data-proposal={p.id}>
            <TableCell className="font-semibold">{shortName(supplierName)}</TableCell>
            <TableCell>{p.option === "PAGAMENTO_PARCIAL" ? "Parcial" : "Total"}</TableCell>
            <TableCell className="text-right tabular-nums">{formatBRL(p.totalCents ?? p.partialCents ?? cbsCents)}</TableCell>
            <TableCell>
              <RadStateBadge state={p.state} />
            </TableCell>
            <TableCell className="text-right">
              <Link href={`/rad/${p.id}`} className="text-sm text-kyb-azul underline-offset-4 hover:underline">
                Abrir proposta
              </Link>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
