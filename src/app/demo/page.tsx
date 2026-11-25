import { PageHeader } from "@/components/under-construction";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { isSimulado } from "@/lib/config";
import { RestartButton } from "./restart-button";

export default function DemoPage() {
  return (
    <>
      <PageHeader title="Demonstração" description="Base fictícia com 12 clientes e 412 notas, recriada todo dia às 06:00 de Brasília." />
      <Card className="max-w-xl">
        <CardHeader>
          <CardTitle>Reiniciar demonstração</CardTitle>
          <CardDescription>
            Volta a base aos números de docs/06: zera solicitações à Receita, propostas, e-mails e rodadas. A auditoria é mantida. Limite de uma vez por minuto.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isSimulado() ? <RestartButton /> : <p className="text-sm text-muted-foreground">Disponível só no modo SIMULADO.</p>}
        </CardContent>
      </Card>
    </>
  );
}
