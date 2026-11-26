import Link from "next/link";
import { BadgeCheck, CircleDashed } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { LightBadge } from "@/components/ui/light-badge";
import { StatusBadge } from "@/components/ui/status-badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatCnpj } from "@/lib/cnpj";
import { formatDateBR, brasiliaDay } from "@/lib/dates";
import { maskEmail } from "@/lib/mask";
import { formatBRL } from "@/lib/money";
import { cn } from "@/lib/utils";
import type { CustomerRow, Light, LightCounts, SupplierRow } from "@/services/semaforos";

const shortName = (name: string | null) => (name ?? "—").replace(/\s*\(FICTÍCIA\)$/, "");
const RAD_AGREEMENT: Record<SupplierRow["radAgreement"], string> = { aceita: "aceita o RAD", recusa: "recusou o RAD", sem_resposta: "sem resposta" };
const RECEIPT: Record<NonNullable<CustomerRow["receipt"]>, string> = { recebido: "recebido", a_receber: "a receber", vencido: "vencido" };

/** Contagem por cor que também é o filtro (link). Só conta o que tem dado da Receita. */
export function LightFilter({ counts, active, hrefFor }: { counts: LightCounts; active: Light | null; hrefFor: (l: Light | null) => string }) {
  const total = counts.verde + counts.amarelo + counts.vermelho;
  const item = (l: Light | null, content: React.ReactNode) => (
    <Link
      key={l ?? "todos"}
      href={hrefFor(l)}
      aria-current={active === l ? "true" : undefined}
      className={cn(
        "inline-flex items-center gap-2 rounded-kyb-botao border px-3 py-2 text-sm transition-colors focus-visible:outline-2 focus-visible:outline-kyb-verde",
        active === l ? "border-kyb-azul bg-kyb-canvas-2" : "border-kyb-linha bg-kyb-branco hover:bg-kyb-canvas-2",
      )}
    >
      {content}
    </Link>
  );
  return (
    <nav aria-label="Filtrar por cor" className="mb-4 flex flex-wrap gap-2" data-tour="semaforo-contagem">
      {item(null, <span className="font-semibold">Todos · {total}</span>)}
      {(["vermelho", "amarelo", "verde"] as const).map((l) =>
        item(
          l,
          <>
            <LightBadge light={l} />
            <span className="font-semibold tabular-nums">{counts[l]}</span>
          </>,
        ),
      )}
      {counts.aguardando > 0 && (
        <span className="inline-flex items-center gap-2 px-1 py-2 text-sm text-kyb-mudo" data-light="aguardando">
          <CircleDashed aria-hidden className="size-4" strokeWidth={1.75} />
          {counts.aguardando} aguardando sincronização com a Receita (fora da contagem por cor)
        </span>
      )}
    </nav>
  );
}

export function SupplierTable({ rows }: { rows: SupplierRow[] }) {
  if (rows.length === 0) return <EmptyState message="Nenhum fornecedor nesta cor." />;
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Fornecedor</TableHead>
          <TableHead>Contato financeiro</TableHead>
          <TableHead className="text-right">Compras</TableHead>
          <TableHead className="text-right">Crédito travado</TableHead>
          <TableHead>Semáforo</TableHead>
          <TableHead>Recomendação</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((r, i) => (
          <TableRow key={r.counterpartyId} className="kyb-entrada" style={{ "--kyb-ordem": i } as React.CSSProperties} data-light={r.light}>
            <TableCell className="whitespace-normal">
              <div className="font-semibold">{shortName(r.name)}</div>
              <div className="text-xs text-kyb-mudo">{formatCnpj(r.cnpj)} · {RAD_AGREEMENT[r.radAgreement]}</div>
            </TableCell>
            <TableCell className="text-kyb-mudo">{maskEmail(r.financeEmail) ?? "não informado"}</TableCell>
            <TableCell className="text-right">{r.purchases}</TableCell>
            <TableCell className="text-right">{formatBRL(r.lockedCents)}</TableCell>
            <TableCell>
              <div className="flex flex-col gap-1">
                <LightBadge light={r.light} />
                {r.regularizedByRad ? (
                  <StatusBadge tone="conciliado" icon={BadgeCheck}>
                    regularizado via RAD
                  </StatusBadge>
                ) : null}
              </div>
            </TableCell>
            <TableCell className="max-w-sm whitespace-normal text-sm">{r.recommendation}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

export function CustomerTable({ rows }: { rows: CustomerRow[] }) {
  if (rows.length === 0) return <EmptyState message="Nenhuma venda nesta cor." />;
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Cliente</TableHead>
          <TableHead>Emissão</TableHead>
          <TableHead>Recebimento</TableHead>
          <TableHead className="text-right">CBS da venda</TableHead>
          <TableHead className="text-right">CBS em aberto na Receita</TableHead>
          <TableHead>Semáforo</TableHead>
          <TableHead>Recomendação</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((r, i) => (
          <TableRow key={r.invoiceId} className="kyb-entrada" style={{ "--kyb-ordem": Math.min(i, 12) } as React.CSSProperties} data-light={r.light}>
            <TableCell className="whitespace-normal">
              <div className="font-semibold">{shortName(r.customerName)}</div>
              <div className="text-xs text-kyb-mudo">{formatCnpj(r.customerCnpj)}</div>
            </TableCell>
            <TableCell>{formatDateBR(brasiliaDay(r.issuedAt))}</TableCell>
            <TableCell className="whitespace-normal">
              {r.receipt ? RECEIPT[r.receipt] : "—"}
              {r.titleDueDate ? <div className="text-xs text-kyb-mudo">vence {formatDateBR(r.titleDueDate)}</div> : null}
            </TableCell>
            <TableCell className="text-right">{formatBRL(r.cbsCents)}</TableCell>
            <TableCell className="text-right">{r.saldoDevedorCents === null ? "sem registro" : formatBRL(r.saldoDevedorCents)}</TableCell>
            <TableCell>
              <LightBadge light={r.light} />
            </TableCell>
            <TableCell className="max-w-sm whitespace-normal text-sm">{r.recommendation}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
