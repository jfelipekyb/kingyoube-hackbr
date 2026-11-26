import Link from "next/link";
import { ReconcileButton } from "@/components/conciliacao/reconcile-button";
import { PageHeader } from "@/components/under-construction";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { ITEM_STATUS_LABEL, ItemStatusBadge } from "@/components/ui/item-status-badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getDb } from "@/db/client";
import { maskAccessKey } from "@/lib/access-key";
import { resolveCompany } from "@/lib/company-param";
import { formatBRL } from "@/lib/money";
import { listItems } from "@/services/conciliacao/queries";
import type { ItemKind, ItemStatus } from "@/services/conciliacao/rules";

export const dynamic = "force-dynamic";

const STATUSES = Object.keys(ITEM_STATUS_LABEL) as ItemStatus[];
const KIND_LABEL: Record<ItemKind, string> = { debito: "Venda (débito)", credito: "Compra (crédito)" };
const selectClass = "h-9 rounded-kyb-botao border border-kyb-linha bg-kyb-branco px-3 text-sm";
const periodBR = (p: string) => `${p.slice(5, 7)}/${p.slice(0, 4)}`;
const money = (v: bigint | null) => (v === null ? "—" : formatBRL(v));

export default async function ConciliacaoPage({ searchParams }: { searchParams: Promise<{ cliente?: string; status?: string; tipo?: string; todos?: string }> }) {
  const sp = await searchParams;
  const db = getDb();
  const { company, metrics } = await resolveCompany(db, sp.cliente);
  const status = STATUSES.includes(sp.status as ItemStatus) ? (sp.status as ItemStatus) : null;
  const kind = sp.tipo === "debito" || sp.tipo === "credito" ? sp.tipo : null;
  const onlyAttention = !status && sp.todos !== "1";
  const rows = company ? await listItems(db, { companyId: company.id, status, kind, onlyAttention }) : [];
  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <PageHeader title="Conciliação" description="Nota × Receita, com o status de cada item e a regra que o classificou. Clique num item para ver o detalhe lado a lado." />
        {company ? <ReconcileButton companyId={company.id} label="Conciliar este cliente" /> : null}
      </div>
      <form className="mb-4 flex flex-wrap items-end gap-3" action="/conciliacao" aria-label="Filtros da conciliação">
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-semibold">Cliente</span>
          <select name="cliente" defaultValue={company?.id} className={selectClass}>
            {metrics.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name.replace(/\s*\(FICTÍCIA\)$/, "")}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-semibold">Status</span>
          <select name="status" defaultValue={status ?? ""} className={selectClass}>
            <option value="">Pedem olhar (todos menos conciliado)</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {ITEM_STATUS_LABEL[s]}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-semibold">Tipo</span>
          <select name="tipo" defaultValue={kind ?? ""} className={selectClass}>
            <option value="">Vendas e compras</option>
            <option value="debito">{KIND_LABEL.debito}</option>
            <option value="credito">{KIND_LABEL.credito}</option>
          </select>
        </label>
        <label className="flex items-center gap-2 pb-2 text-sm">
          <input type="checkbox" name="todos" value="1" defaultChecked={sp.todos === "1"} className="size-4 accent-kyb-azul" />
          Incluir conciliados
        </label>
        <button type="submit" className="h-9 rounded-kyb-botao border border-kyb-azul bg-kyb-branco px-3.5 text-sm font-semibold text-kyb-azul hover:bg-kyb-canvas-2">
          Filtrar
        </button>
      </form>
      <Card className="py-0">
        {rows.length === 0 ? (
          <EmptyState message={company && company.reconciled ? "Nenhum item com estes filtros." : "Este cliente ainda não foi conciliado. Sincronize com a Receita e clique em “Conciliar este cliente”."} />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Status</TableHead>
                <TableHead>Regra</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Chave / período</TableHead>
                <TableHead>Contraparte</TableHead>
                <TableHead className="text-right">Nota</TableHead>
                <TableHead className="text-right">Receita</TableHead>
                <TableHead className="text-right">Diferença</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r, i) => (
                <TableRow key={r.id} className="kyb-entrada" style={{ "--kyb-ordem": Math.min(i, 12) } as React.CSSProperties} data-rule={r.ruleId}>
                  <TableCell>
                    <ItemStatusBadge status={r.status} />
                  </TableCell>
                  <TableCell className="font-semibold">{r.ruleId}</TableCell>
                  <TableCell>{KIND_LABEL[r.kind]}</TableCell>
                  <TableCell>
                    <Link href={`/conciliacao/${r.id}`} className="font-mono text-xs text-kyb-azul underline-offset-4 hover:underline">
                      {maskAccessKey(r.accessKey)}
                    </Link>
                    <div className="text-xs text-kyb-mudo">período {periodBR(r.period)}</div>
                  </TableCell>
                  <TableCell className="whitespace-normal">{r.counterpartyName?.replace(/\s*\(FICTÍCIA\)$/, "") ?? "—"}</TableCell>
                  <TableCell className="text-right">{money(r.invoiceCents)}</TableCell>
                  <TableCell className="text-right">{money(r.rfbCents)}</TableCell>
                  <TableCell className="text-right">{money(r.diffCents)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>
    </>
  );
}
