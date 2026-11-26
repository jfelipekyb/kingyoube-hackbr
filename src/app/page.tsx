import { PageHeader } from "@/components/under-construction";
import { getDb } from "@/db/client";
import { AGENTS } from "@/services/equipe/agents";
import { latestRun, ROUND_AGENTS } from "@/services/equipe/run";
import { runSnapshot } from "@/services/equipe/snapshot";
import { SalaDaEquipe } from "./sala-da-equipe";

export const dynamic = "force-dynamic";

export default async function SalaDaEquipePage() {
  const db = getDb();
  const last = await latestRun(db);
  const initial = last ? await runSnapshot(db, last.id) : null;
  const agents = ROUND_AGENTS.map((k) => AGENTS.find((a) => a.key === k)!).map((a) => ({ key: a.key, name: a.name, role: a.role }));
  return (
    <>
      <PageHeader
        title="Sala da Equipe"
        description="Cada agente faz a sua parte da conferência da carteira e mostra o que entregou. O Conferente refaz tudo do zero; no fim, o que precisa da sua decisão."
      />
      <SalaDaEquipe agents={agents} initial={initial} />
    </>
  );
}
