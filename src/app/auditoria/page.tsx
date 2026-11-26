import Link from "next/link";
import { PageHeader } from "@/components/under-construction";
import { Bot, Settings2, UserRound } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getDb } from "@/db/client";
import { cn } from "@/lib/utils";
import { DEMO_USERS } from "@/seed/demo-data";
import { actorKind, listAudit, type ActorKind } from "@/services/auditoria";

const FILTERS: { value: ActorKind | undefined; label: string }[] = [
  { value: undefined, label: "Todos" },
  { value: "humano", label: "Pessoas" },
  { value: "agente", label: "Agentes" },
  { value: "sistema", label: "Sistema" },
];

const KIND_LABEL: Record<ActorKind, string> = { humano: "Pessoa", agente: "Agente", sistema: "Sistema" };

const KIND_ICON = { humano: UserRound, agente: Bot, sistema: Settings2 } as const;

const USER_NAMES = new Map(DEMO_USERS.map((u) => [`usuario:${u.id}`, u.name]));

const dateTime = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "medium", timeZone: "America/Sao_Paulo" });

export default async function AuditoriaPage({ searchParams }: { searchParams: Promise<{ ator?: string }> }) {
  const { ator } = await searchParams;
  const kind = FILTERS.find((f) => f.value === ator)?.value;
  const rows = await listAudit(getDb(), { kind });
  return (
    <>
      <PageHeader title="Auditoria" description="Quem fez o quê, quando e com que resultado. A trilha só recebe linhas novas: nada é alterado nem apagado." />
      <div className="mb-4 inline-flex gap-1 rounded-kyb-botao border border-kyb-linha bg-kyb-branco p-1" role="group" aria-label="Filtrar por ator">
        {FILTERS.map((f) => (
          <Link
            key={f.label}
            href={f.value ? `/auditoria?ator=${f.value}` : "/auditoria"}
            aria-current={kind === f.value ? "true" : undefined}
            className={cn(
              "rounded-kyb-botao px-3 py-1.5 text-sm font-semibold transition-colors duration-150 ease-kyb focus-visible:outline-2 focus-visible:outline-kyb-azul-2",
              kind === f.value ? "bg-kyb-azul text-kyb-branco" : "text-kyb-azul hover:bg-kyb-canvas-2",
            )}
          >
            {f.label}
          </Link>
        ))}
      </div>
      <Card className="py-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Quando</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead>Ator</TableHead>
              <TableHead>Ação</TableHead>
              <TableHead>Entidade</TableHead>
              <TableHead>Resultado</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="p-4">
                  <EmptyState message="Nenhum registro para este filtro. Veja todos os registros ou rode uma sincronização." action={<Link href="/auditoria" className="text-sm font-semibold underline underline-offset-4">Ver todos</Link>} />
                </TableCell>
              </TableRow>
            ) : (
              rows.map((r, i) => {
                const k = actorKind(r.actor);
                const Icon = KIND_ICON[k];
                return (
                <TableRow key={r.id} className={i < 20 ? "kyb-entrada" : undefined} style={i < 20 ? ({ "--kyb-ordem": i } as React.CSSProperties) : undefined}>
                  <TableCell className="whitespace-nowrap">{dateTime.format(r.at)}</TableCell>
                  <TableCell>
                    <Badge variant={k === "humano" ? "default" : "secondary"}>
                      <Icon aria-hidden strokeWidth={1.75} />
                      {KIND_LABEL[k]}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-secundario">{USER_NAMES.get(r.actor) ?? r.actor}</TableCell>
                  <TableCell>{r.action}</TableCell>
                  <TableCell>{r.entityId ? `${r.entity} · ${r.entityId}` : r.entity}</TableCell>
                  <TableCell>{r.result}</TableCell>
                </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </Card>
    </>
  );
}
