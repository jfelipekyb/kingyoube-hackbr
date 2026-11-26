import { eq } from "drizzle-orm";
import { FlaskConical } from "lucide-react";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/under-construction";
import { Card, CardContent } from "@/components/ui/card";
import { getDb } from "@/db/client";
import { radProposals } from "@/db/schema";
import { isUuid } from "@/lib/company-param";
import { formatDateBR } from "@/lib/dates";
import { formatBRL } from "@/lib/money";

export const dynamic = "force-dynamic";

/** "PDF" do DARF em modo SIMULADO: mostra os dados gravados, sempre marcado como simulado. */
export default async function DemoDarfPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const [p] = await getDb().select().from(radProposals).where(eq(radProposals.darfPdfUrl, `/demo/darf/${id}`));
  if (!p) notFound();
  return (
    <>
      <PageHeader title="DARF — recolhimento como adquirente (RAD)" description="Documento simulado: não é guia real da Receita Federal e não pode ser pago." />
      <Card>
        <CardContent className="space-y-2 pt-6">
          <p className="inline-flex items-center gap-1.5 font-semibold text-kyb-azul">
            <FlaskConical aria-hidden className="size-4" strokeWidth={1.75} /> DARF simulado
          </p>
          <dl className="grid gap-2 sm:grid-cols-2">
            <div><dt className="text-sm text-kyb-mudo">Chave da nota</dt><dd className="break-all font-mono text-sm">{p.accessKey}</dd></div>
            <div><dt className="text-sm text-kyb-mudo">Vencimento</dt><dd>{p.dueDate ? formatDateBR(p.dueDate) : "—"}</dd></div>
            <div><dt className="text-sm text-kyb-mudo">Valor principal</dt><dd className="tabular-nums">{p.principalCents !== null ? formatBRL(p.principalCents) : "—"}</dd></div>
            <div><dt className="text-sm text-kyb-mudo">Valor total</dt><dd className="tabular-nums font-semibold">{p.totalCents !== null ? formatBRL(p.totalCents) : "—"}</dd></div>
            <div className="sm:col-span-2"><dt className="text-sm text-kyb-mudo">Código de barras</dt><dd className="break-all font-mono text-sm">{p.darfBarcode}</dd></div>
          </dl>
        </CardContent>
      </Card>
    </>
  );
}
