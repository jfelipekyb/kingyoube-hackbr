import { asc } from "drizzle-orm";
import { PageHeader } from "@/components/under-construction";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getDb } from "@/db/client";
import { docWatch } from "@/db/schema";
import { CONTRACT_VERSION_LABEL } from "@/services/receita/contract";

export default async function RadarPage() {
  const pages = await getDb().select().from(docWatch).orderBy(asc(docWatch.title));
  return (
    <>
      <PageHeader
        title="Radar"
        description="Páginas oficiais da documentação da Receita que o Vigia vai conferir todo dia (S5). A versão abaixo é a que o sistema implementa hoje."
      />
      <p className="mb-4 text-sm">{CONTRACT_VERSION_LABEL}</p>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Página</TableHead>
            <TableHead>Endereço</TableHead>
            <TableHead>Versão implementada</TableHead>
            <TableHead>Última verificação</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {pages.map((p) => (
            <TableRow key={p.id}>
              <TableCell className="font-medium">{p.title}</TableCell>
              <TableCell className="font-mono text-xs">{p.url}</TableCell>
              <TableCell>{p.lastVersion ?? "sem versão publicada"}</TableCell>
              <TableCell className="text-muted-foreground">{p.lastCheckedAt ? p.lastCheckedAt.toISOString() : "Ainda não verificada"}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </>
  );
}
