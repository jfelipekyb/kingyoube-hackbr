import Link from "next/link";
import { PageHeader } from "@/components/under-construction";
import { Badge } from "@/components/ui/badge";
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

const USER_NAMES = new Map(DEMO_USERS.map((u) => [`usuario:${u.id}`, u.name]));

const dateTime = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "medium", timeZone: "America/Sao_Paulo" });

export default async function AuditoriaPage({ searchParams }: { searchParams: Promise<{ ator?: string }> }) {
  const { ator } = await searchParams;
  const kind = FILTERS.find((f) => f.value === ator)?.value;
  const rows = await listAudit(getDb(), { kind });
  return (
    <>
      <PageHeader title="Auditoria" description="Quem fez o quê, quando e com que resultado. A trilha só recebe linhas novas: nada é alterado nem apagado." />
      <div className="mb-4 flex gap-2" role="group" aria-label="Filtrar por ator">
        {FILTERS.map((f) => (
          <Link
            key={f.label}
            href={f.value ? `/auditoria?ator=${f.value}` : "/auditoria"}
            aria-current={kind === f.value ? "true" : undefined}
            className={cn(
              "rounded-md border px-3 py-1.5 text-sm",
              kind === f.value ? "bg-primary text-primary-foreground" : "hover:bg-muted",
            )}
          >
            {f.label}
          </Link>
        ))}
      </div>
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
              <TableCell colSpan={6} className="text-muted-foreground">
                Nenhum registro para este filtro.
              </TableCell>
            </TableRow>
          ) : (
            rows.map((r) => (
              <TableRow key={r.id}>
                <TableCell className="whitespace-nowrap">{dateTime.format(r.at)}</TableCell>
                <TableCell>
                  <Badge variant={actorKind(r.actor) === "humano" ? "default" : "secondary"}>{KIND_LABEL[actorKind(r.actor)]}</Badge>
                </TableCell>
                <TableCell className="font-mono text-xs">{USER_NAMES.get(r.actor) ?? r.actor}</TableCell>
                <TableCell>{r.action}</TableCell>
                <TableCell>{r.entityId ? `${r.entity} · ${r.entityId}` : r.entity}</TableCell>
                <TableCell>{r.result}</TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </>
  );
}
