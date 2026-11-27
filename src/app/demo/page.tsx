import Link from "next/link";
import { PageHeader } from "@/components/under-construction";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getDb } from "@/db/client";
import { isSimulado } from "@/lib/config";
import { listCompanies } from "@/services/carteira";
import { RestartButton } from "./restart-button";

export const dynamic = "force-dynamic";

type ScriptStep = { title: string; what: string; href: string; cta: string };

/** Roteiro de 3 minutos (docs/01): cada passo abre a tela certa, já no cliente Padaria Boa Massa. */
function scriptSteps(padariaId: string | null): ScriptStep[] {
  const cliente = padariaId ? `?cliente=${padariaId}` : "";
  return [
    { title: "Sala da Equipe", what: "Apresente os agentes: cada um faz uma parte do trabalho, e o Conferente refaz tudo do zero.", href: "/", cta: "Abrir a Sala da Equipe" },
    { title: "Rodar a equipe", what: "Clique em “Rodar a equipe” e acompanhe Captura, Apuração, Conciliador, Conferente, Analista, Tesouraria, Vigia e Mensageiro.", href: "/", cta: "Rodar a equipe" },
    { title: "Carteira", what: "A Padaria Boa Massa aparece no topo: é o cliente com mais dinheiro em risco. Abra o detalhe da nota 1.284 do Moinho.", href: "/carteira", cta: "Abrir a Carteira" },
    { title: "Semáforo de fornecedores", what: "Equipamentos Forno Forte está vermelho (não recolheu e recusou) e Moinho Estrela está amarelo (não recolheu e ainda não recusou).", href: `/fornecedores${cliente}`, cta: "Abrir Fornecedores" },
    { title: "RAD do C2", what: "Prepare a proposta da nota 1.284 e envie. Como Ana Analista, tente gerar o DARF: o servidor bloqueia.", href: `/rad${cliente}`, cta: "Abrir RAD" },
    { title: "Aprovação do contador", what: "No cabeçalho, troque o papel para Carlos Contador e aprove a proposta. Quem enviou não pode aprovar.", href: `/rad${cliente}`, cta: "Abrir a fila do contador" },
    { title: "DARF", what: "Ainda como contador, gere o DARF: Pix, código de barras e PDF. DARF gerado ainda não é DARF pago.", href: `/rad${cliente}`, cta: "Abrir RAD" },
    { title: "Mensagem", what: "O Mensageiro envia o DARF ao financeiro por e-mail e mostra a prévia do WhatsApp (simulado). Depois, sincronize os recolhimentos: a Receita confirma o pagamento.", href: "/sincronizacao", cta: "Abrir Sincronização" },
    { title: "Kim por voz", what: "Pergunte “Kim, o que eu preciso decidir hoje?”. Ela responde com os números da base, por voz quando a voz está ligada, e sempre com legenda.", href: "/kim", cta: "Falar com a Kim" },
  ];
}

export default async function DemoPage() {
  const companies = await listCompanies(getDb());
  const padaria = companies.find((c) => c.name.startsWith("Padaria Boa Massa")) ?? null;
  const steps = scriptSteps(padaria?.id ?? null);
  return (
    <>
      <PageHeader title="Demonstração" description="Roteiro guiado de 3 minutos sobre a base fictícia: 12 clientes e 412 notas, recriada todo dia às 06:00 de Brasília." />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
        <Card>
          <CardHeader>
            <CardTitle>Roteiro guiado</CardTitle>
            <CardDescription>Siga na ordem. Cada passo abre a tela certa; a decisão é sempre de uma pessoa, nunca de um agente.</CardDescription>
          </CardHeader>
          <CardContent>
            <ol className="flex flex-col gap-4" data-demo-roteiro>
              {steps.map((s, i) => (
                <li key={s.title} className="flex gap-3">
                  <span aria-hidden className="flex size-7 shrink-0 items-center justify-center rounded-full bg-kyb-azul text-sm font-semibold text-kyb-branco">
                    {i + 1}
                  </span>
                  <div className="min-w-0">
                    <p className="font-semibold">{s.title}</p>
                    <p className="text-sm text-muted-foreground">{s.what}</p>
                    <Link href={s.href} className="mt-1 inline-block text-sm font-semibold text-kyb-azul underline underline-offset-4 hover:text-kyb-azul-2">
                      {s.cta}
                    </Link>
                  </div>
                </li>
              ))}
            </ol>
          </CardContent>
        </Card>
        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Reiniciar demonstração</CardTitle>
              <CardDescription>
                Volta a base aos números de docs/06: zera solicitações à Receita, propostas, e-mails e rodadas. A auditoria é mantida. Limite de uma vez por minuto.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {isSimulado() ? (
                <RestartButton />
              ) : (
                <p className="text-sm text-muted-foreground">Disponível só no modo SIMULADO. Em modo REAL, a base é a do escritório e não é recriada.</p>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>O que é simulado</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
                <li>Receita Federal em modo SIMULADO: nenhuma consulta é real.</li>
                <li>WhatsApp e ligação simulados (adaptador da Nvoip sem envio).</li>
                <li>Sem login: o papel (Analista ou Contador) é trocado no cabeçalho.</li>
                <li>Empresas, CNPJs e fornecedores são fictícios.</li>
              </ul>
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
