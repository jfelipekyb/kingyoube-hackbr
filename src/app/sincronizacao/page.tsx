import { PageHeader } from "@/components/under-construction";
import { ModeBadge } from "@/components/shell/mode-badge";
import { getDb } from "@/db/client";
import { receitaMode } from "@/lib/config";
import { currentCompanyId } from "@/lib/demo-session";
import { CONTRACT_VERSION_LABEL, syncOverview } from "@/services/receita";
import { SyncPanel } from "./sync-panel";

export const dynamic = "force-dynamic";

export default async function SincronizacaoPage() {
  const companyId = await currentCompanyId();
  const overview = await syncOverview(getDb(), { companyId });
  return (
    <>
      <PageHeader
        title="Sincronização"
        description="O agente Apuração pede à Receita débitos, créditos, pagamentos e recolhimentos de cada cliente, acompanha o processamento, baixa o arquivo e organiza na base. Cota: por serviço, por cliente e por dia de Brasília; pedido que falhou também conta."
      />
      <div className="mb-4 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
        <ModeBadge mode={receitaMode()} />
        <span>{CONTRACT_VERSION_LABEL}</span>
      </div>
      <SyncPanel initial={overview} companyId={companyId} />
    </>
  );
}
