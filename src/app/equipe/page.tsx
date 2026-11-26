import { CloudDownload, FileSearch, Inbox, Mail, MessageCircle, Radar, Receipt, Scale, ShieldCheck, UserRound, type LucideIcon } from "lucide-react";
import { PageHeader } from "@/components/under-construction";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/status-badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getDb } from "@/db/client";
import { currentUser } from "@/lib/demo-session";
import { DEMO_USERS } from "@/seed/demo-data";
import { AGENTS } from "@/services/equipe/agents";
import { returnedHours } from "@/services/equipe/hours";
import { ROUND_AGENTS } from "@/services/equipe/run";
import { PremissasTable, type PremiseRow } from "./premissas";

export const dynamic = "force-dynamic";

const ICONS: Record<string, LucideIcon> = {
  captura: Inbox,
  apuracao: CloudDownload,
  conciliador: Scale,
  conferente: ShieldCheck,
  analista: FileSearch,
  tesouraria: Receipt,
  vigia: Radar,
  mensageiro: Mail,
};

const NEXT_HIRES = ["Equipe IBS", "Faturamento", "Cobrança", "Conciliação bancária", "Rentabilidade da carteira", "Obrigações acessórias"];
const PROJECTION_UNITS: Record<string, string> = { rodadas_por_mes: "por mês", clientes_projecao: "clientes", horas_pessoa_mes: "horas" };

const h1 = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const n0 = new Intl.NumberFormat("pt-BR");

function who(updatedBy: string | null) {
  if (!updatedBy || updatedBy === "seed") return "base da demonstração";
  const id = updatedBy.replace(/^usuario:/, "");
  return DEMO_USERS.find((u) => u.id === id)?.name ?? updatedBy;
}

export default async function EquipePage() {
  const db = getDb();
  const [user, hours] = await Promise.all([currentUser(), returnedHours(db)]);
  const canEdit = user.role === "contador";
  const kim = AGENTS.find((a) => a.key === "kim")!;
  const team = ROUND_AGENTS.filter((k) => k !== "kim").map((k) => AGENTS.find((a) => a.key === k)!);
  const taskRows: PremiseRow[] = hours.standards.map((s) => ({ tipo: "tarefa", chave: s.task, label: s.label, valor: s.minutes, unidade: "min", atualizadoPor: who(s.updatedBy) }));
  const projRows: PremiseRow[] = hours.premises.map((p) => ({ tipo: "projecao", chave: p.key, label: p.label, valor: p.value, unidade: PROJECTION_UNITS[p.key] ?? "", atualizadoPor: who(p.updatedBy) }));
  const last = hours.lastRun;

  return (
    <>
      <PageHeader title="Equipe" description="Quem decide, quem coordena e quem faz. Nenhum agente aprova nada: a decisão é sempre do contador." />

      <section aria-labelledby="organograma" className="mb-8">
        <h2 id="organograma" className="mb-4 text-lg font-semibold">
          Organograma
        </h2>
        <ol className="flex flex-col items-center gap-0" aria-label="Da decisão ao trabalho">
          <li className="kyb-entrada w-full max-w-sm rounded-kyb border-2 border-kyb-azul bg-kyb-branco p-4 text-center" style={{ "--kyb-ordem": 0 } as React.CSSProperties}>
            <UserRound aria-hidden className="mx-auto mb-1 size-6 text-kyb-azul" />
            <p className="font-semibold">Contador (pessoa) — decide</p>
            <p className="text-secundario text-muted-foreground">Aprova ou recusa. Nenhuma guia sai sem ele.</p>
          </li>
          <li aria-hidden className="h-6 w-px bg-kyb-linha" />
          <li className="kyb-entrada w-full max-w-sm rounded-kyb border border-kyb-linha bg-kyb-branco p-4 text-center" style={{ "--kyb-ordem": 1 } as React.CSSProperties}>
            <MessageCircle aria-hidden className="mx-auto mb-1 size-6 text-kyb-azul" />
            <p className="font-semibold">{kim.name}</p>
            <p className="text-secundario text-muted-foreground">{kim.role}. Fala, mas não decide.</p>
          </li>
          <li aria-hidden className="h-6 w-px bg-kyb-linha" />
          <li className="w-full">
            <ul className="grid gap-3 border-t border-kyb-linha pt-4 sm:grid-cols-2 xl:grid-cols-4" aria-label="Equipe CBS">
              {team.map((a, i) => {
                const Icon = ICONS[a.key] ?? Inbox;
                return (
                  <li key={a.key} className="kyb-entrada flex flex-col gap-1 rounded-kyb border border-kyb-linha bg-kyb-branco p-3" style={{ "--kyb-ordem": i + 2 } as React.CSSProperties}>
                    <span className="flex items-center justify-between gap-2">
                      <span className="flex items-center gap-2 font-semibold">
                        <Icon aria-hidden className="size-4" /> {a.name}
                      </span>
                      <StatusBadge tone="conciliado">Contratada</StatusBadge>
                    </span>
                    <span className="text-secundario text-muted-foreground">{a.role}</span>
                  </li>
                );
              })}
            </ul>
          </li>
        </ol>
      </section>

      <section aria-labelledby="horas" className="mb-8 grid gap-4 lg:grid-cols-2">
        <h2 id="horas" className="sr-only">
          Horas devolvidas
        </h2>
        <Card>
          <CardHeader>
            <CardTitle>Horas devolvidas — medição na carteira de demonstração</CardTitle>
            <CardDescription>Σ (contagem × minutos-padrão) ÷ 60, só com o trabalho feito de fato. Uma rodada = um mês de conferência da carteira.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {last ? (
              <>
                <p className="flex flex-wrap items-baseline gap-x-6 gap-y-1">
                  <span>
                    <span className="text-3xl font-bold tabular-nums text-kyb-azul" data-testid="horas-ultima-rodada">
                      {h1.format(last.hours)} h
                    </span>{" "}
                    na última rodada
                  </span>
                  <span className="text-secundario text-muted-foreground">
                    {h1.format(hours.accumulated.hours)} h em {n0.format(hours.runs)} {hours.runs === 1 ? "rodada" : "rodadas"} desde o último reinício
                  </span>
                </p>
                <Table>
                  <caption className="sr-only">Contagem por tarefa da última rodada</caption>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Tarefa</TableHead>
                      <TableHead className="text-right">Contagem</TableHead>
                      <TableHead className="text-right">Min. cada</TableHead>
                      <TableHead className="text-right">Minutos</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {last.lines.map((l) => (
                      <TableRow key={l.task}>
                        <TableCell className="whitespace-normal">{l.label}</TableCell>
                        <TableCell className="text-right tabular-nums">{n0.format(l.count)}</TableCell>
                        <TableCell className="text-right tabular-nums">{n0.format(l.minutesEach)}</TableCell>
                        <TableCell className="text-right tabular-nums">{n0.format(l.minutes)}</TableCell>
                      </TableRow>
                    ))}
                    <TableRow>
                      <TableCell className="font-semibold" colSpan={3}>
                        Total ({n0.format(last.minutes)} min ÷ 60)
                      </TableCell>
                      <TableCell className="text-right font-semibold tabular-nums">{h1.format(last.hours)} h</TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </>
            ) : (
              <p className="text-muted-foreground">Nenhuma rodada concluída ainda. Rode a equipe na Sala da Equipe.</p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="flex flex-wrap items-center gap-2">
              Projeção <StatusBadge tone="aguardando">projeção, não medição</StatusBadge>
            </CardTitle>
            <CardDescription>(horas da última rodada ÷ clientes da carteira) × clientes da projeção × rodadas por mês.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {last && hours.clientsInRun > 0 ? (
              <>
                <p>
                  Com <strong>{n0.format(hours.projection.clients)} clientes</strong>, a equipe faria o equivalente a{" "}
                  <strong className="text-2xl tabular-nums text-kyb-azul" data-testid="horas-projecao">
                    {h1.format(hours.projection.monthlyHours)} h por mês
                  </strong>
                  .
                </p>
                <p>
                  Equivale a <strong className="tabular-nums">{h1.format(hours.projection.fte)}</strong> analistas em tempo integral.
                </p>
                <p className="text-secundario text-muted-foreground">
                  Base: {h1.format(last.hours)} h ÷ {n0.format(hours.clientsInRun)} clientes da demonstração. É uma conta com as premissas abaixo, não uma medição.
                </p>
              </>
            ) : (
              <p className="text-muted-foreground">A projeção aparece depois da primeira rodada.</p>
            )}
          </CardContent>
        </Card>
      </section>

      <section aria-labelledby="premissas" className="mb-8">
        <h2 id="premissas" className="mb-1 text-lg font-semibold">
          Premissas
        </h2>
        <p className="mb-4 text-secundario text-muted-foreground">
          {canEdit ? "Você é o contador: pode mudar as premissas. Toda mudança vai para a auditoria." : "Só o contador muda premissa. Troque o papel no topo da tela para editar."}
        </p>
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Minutos-padrão por tarefa</CardTitle>
            </CardHeader>
            <CardContent>
              <PremissasTable rows={taskRows} canEdit={canEdit} caption="Minutos-padrão por tarefa" />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Premissas da projeção</CardTitle>
            </CardHeader>
            <CardContent>
              <PremissasTable rows={projRows} canEdit={canEdit} caption="Premissas da projeção" />
            </CardContent>
          </Card>
        </div>
      </section>

      <section aria-labelledby="proximas">
        <h2 id="proximas" className="mb-1 text-lg font-semibold">
          Próximas contratações
        </h2>
        <p className="mb-4 text-secundario text-muted-foreground">Visão do produto — ainda não disponível.</p>
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {NEXT_HIRES.map((name) => (
            <li key={name} className="pointer-events-none flex select-none flex-col gap-1 rounded-kyb border border-dashed border-kyb-linha bg-kyb-canvas p-3">
              <span className="font-semibold opacity-60">{name}</span>
              <span className="text-rotulo text-muted-foreground">visão do produto — ainda não disponível</span>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
