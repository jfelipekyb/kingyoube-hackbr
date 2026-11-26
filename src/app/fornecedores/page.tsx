import Link from "next/link";
import { LightFilter, SupplierTable } from "@/components/semaforos/tables";
import { PageHeader } from "@/components/under-construction";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { getDb } from "@/db/client";
import { resolveCompany } from "@/lib/company-param";
import { countByLight, supplierLights, type Light } from "@/services/semaforos";

export const dynamic = "force-dynamic";

const LIGHTS: Light[] = ["verde", "amarelo", "vermelho"];

export default async function FornecedoresPage({ searchParams }: { searchParams: Promise<{ cliente?: string; cor?: string }> }) {
  const sp = await searchParams;
  const db = getDb();
  const { company, metrics } = await resolveCompany(db, sp.cliente);
  if (!company) return <EmptyState message="Nenhum cliente na carteira." />;
  const color = LIGHTS.includes(sp.cor as Light) ? (sp.cor as Light) : null;
  const rows = await supplierLights(db, company.id);
  const href = (cliente: string, c: Light | null) => `/fornecedores?cliente=${cliente}${c ? `&cor=${c}` : ""}`;
  return (
    <>
      <PageHeader
        title="Fornecedores"
        description="Semáforo de contas a pagar: quem recolheu a CBS, quem não recolheu e aceita o RAD, e quem recusou. A cor vem da regra; o contador decide."
      />
      <form className="mb-4 flex flex-wrap items-end gap-3" action="/fornecedores">
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-semibold">Cliente</span>
          <select name="cliente" defaultValue={company.id} className="h-9 rounded-kyb-botao border border-kyb-linha bg-kyb-branco px-3 text-sm">
            {metrics.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name.replace(/\s*\(FICTÍCIA\)$/, "")}
              </option>
            ))}
          </select>
        </label>
        <button type="submit" className="h-9 rounded-kyb-botao border border-kyb-azul bg-kyb-branco px-3.5 text-sm font-semibold text-kyb-azul hover:bg-kyb-canvas-2">
          Ver
        </button>
        <Link href={`/carteira/${company.id}?aba=clientes`} className="ml-auto self-center text-sm text-kyb-azul underline-offset-4 hover:underline">
          Ver semáforo de clientes (vendas)
        </Link>
      </form>
      <LightFilter counts={countByLight(rows)} active={color} hrefFor={(c) => href(company.id, c)} />
      <Card className="py-0" data-tour="semaforo-fornecedores">
        <SupplierTable rows={color ? rows.filter((r) => r.light === color) : rows} />
      </Card>
    </>
  );
}
