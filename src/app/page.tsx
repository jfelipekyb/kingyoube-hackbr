import { PageHeader } from "@/components/under-construction";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AGENTS } from "@/services/equipe/agents";

export default function EquipeAoVivoPage() {
  return (
    <>
      <PageHeader
        title="Equipe ao vivo"
        description="A sala onde cada agente mostra o que está fazendo. A rodada da equipe chega na sessão S6; por enquanto todos estão parados."
      />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {AGENTS.map((agent) => (
          <Card key={agent.key} size="sm">
            <CardHeader>
              <CardTitle>{agent.name}</CardTitle>
              <CardDescription>{agent.role}</CardDescription>
            </CardHeader>
            <CardContent className="text-xs text-muted-foreground">Parado · nenhuma rodada ainda</CardContent>
          </Card>
        ))}
      </div>
    </>
  );
}
