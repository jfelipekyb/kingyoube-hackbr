import { asc } from "drizzle-orm";
import { PageHeader } from "@/components/under-construction";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getDb } from "@/db/client";
import { effortStandards } from "@/db/schema";
import { AGENTS } from "@/services/equipe/agents";

export default async function EquipePage() {
  const standards = await getDb().select().from(effortStandards).orderBy(asc(effortStandards.minutes));
  return (
    <>
      <PageHeader
        title="Equipe"
        description="Quem faz o quê e quanto tempo cada tarefa leva à mão. Organograma e horas devolvidas chegam na S6."
      />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Agentes</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2 text-sm">
              {AGENTS.map((a) => (
                <li key={a.key}>
                  <span className="font-medium">{a.name}</span> — {a.role}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Minutos-padrão (premissas)</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Tarefa</TableHead>
                  <TableHead className="text-right">Minutos</TableHead>
                  <TableHead>Fonte</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {standards.map((s) => (
                  <TableRow key={s.task}>
                    <TableCell>{s.label}</TableCell>
                    <TableCell className="text-right">{s.minutes}</TableCell>
                    <TableCell>{s.source}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
