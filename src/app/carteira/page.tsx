import { PageHeader } from "@/components/under-construction";
import { Card } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/status-badge";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getDb } from "@/db/client";
import { formatCnpj } from "@/lib/cnpj";
import { currentCompanyId } from "@/lib/demo-session";
import { formatBRL } from "@/lib/money";
import { portfolioOverview } from "@/services/carteira";

export default async function CarteiraPage() {
  const rows = await portfolioOverview(getDb(), await currentCompanyId());
  const totalInvoices = rows.reduce((n, r) => n + r.invoices, 0);
  const totalCbs = rows.reduce((n, r) => n + BigInt(r.cbsCents), 0n);
  return (
    <>
      <PageHeader
        title="Carteira"
        description="Os clientes do escritório e as notas recebidas. Status, dinheiro em risco e crédito travado aparecem depois da primeira sincronização com a Receita (S2 e S3)."
      />
      <Card className="py-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Cliente</TableHead>
              <TableHead>CNPJ</TableHead>
              <TableHead>Segmento</TableHead>
              <TableHead className="text-right">Vendas</TableHead>
              <TableHead className="text-right">Compras</TableHead>
              <TableHead className="text-right">Notas</TableHead>
              <TableHead className="text-right">CBS nas notas</TableHead>
              <TableHead>Situação</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r, i) => (
              <TableRow key={r.id} className="kyb-entrada" style={{ "--kyb-ordem": i } as React.CSSProperties}>
                <TableCell className="font-semibold whitespace-normal">{r.name}</TableCell>
                <TableCell className="text-secundario text-muted-foreground">{formatCnpj(r.cnpj)}</TableCell>
                <TableCell>{r.segment}</TableCell>
                <TableCell className="text-right">{r.sales}</TableCell>
                <TableCell className="text-right">{r.purchases}</TableCell>
                <TableCell className="text-right">{r.invoices}</TableCell>
                <TableCell className="text-right">{formatBRL(BigInt(r.cbsCents))}</TableCell>
                <TableCell>
                  <StatusBadge tone="aguardando">Aguardando sincronização</StatusBadge>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
          <TableFooter>
            <TableRow>
              <TableCell colSpan={5}>{rows.length} clientes</TableCell>
              <TableCell className="text-right">{totalInvoices}</TableCell>
              <TableCell className="text-right">{formatBRL(totalCbs)}</TableCell>
              <TableCell />
            </TableRow>
          </TableFooter>
        </Table>
      </Card>
    </>
  );
}
