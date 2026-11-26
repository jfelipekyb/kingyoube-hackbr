import { asc } from "drizzle-orm";
import { PageHeader } from "@/components/under-construction";
import { StatusBadge } from "@/components/ui/status-badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getDb } from "@/db/client";
import { docWatch } from "@/db/schema";
import { CONTRACT_VERSION_LABEL, RECEITA_DOCS_BASE, WATCHED_PAGES } from "@/services/receita/contract";
import { compareVersions } from "@/services/vigia/radar";
import { VerifyButton } from "./verify-button";

export const dynamic = "force-dynamic";

const when = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" });

export default async function RadarPage() {
  const pages = await getDb().select().from(docWatch).orderBy(asc(docWatch.title));
  const codeVersion = (url: string) => WATCHED_PAGES.find((p) => `${RECEITA_DOCS_BASE}${p.page}` === url)?.version ?? null;
  return (
    <>
      <PageHeader
        title="Radar"
        description="O Vigia lê todo dia as 9 páginas oficiais da documentação da Receita pelo Firecrawl, extrai a versão publicada e compara com a que o sistema implementa. Se mudar, grava o diff e avisa o time por e-mail."
      />
      <p className="mb-4 text-sm">{CONTRACT_VERSION_LABEL}</p>
      <VerifyButton />
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Página</TableHead>
            <TableHead>Versão publicada</TableHead>
            <TableHead>Versão no código</TableHead>
            <TableHead>Situação</TableHead>
            <TableHead>Última verificação</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {pages.map((p) => {
            const code = codeVersion(p.url);
            const outdated = Boolean(p.lastVersion && code && compareVersions(p.lastVersion, code) > 0);
            return (
              <TableRow key={p.id} data-radar-page>
                <TableCell className="whitespace-normal">
                  <div className="font-semibold">{p.title}</div>
                  <a href={p.url} className="font-mono text-xs text-kyb-azul underline-offset-4 hover:underline" target="_blank" rel="noreferrer">
                    {p.url.slice(RECEITA_DOCS_BASE.length)}
                  </a>
                </TableCell>
                <TableCell>{p.lastVersion ?? "sem tabela de versão"}</TableCell>
                <TableCell>{code ?? "—"}</TableCell>
                <TableCell className="whitespace-normal">
                  <div className="flex flex-col gap-1">
                    {!p.lastCheckedAt ? (
                      <StatusBadge tone="aguardando">ainda não verificada</StatusBadge>
                    ) : p.changeStatus === "sem_mudanca" ? (
                      <StatusBadge tone="conciliado">sem mudança</StatusBadge>
                    ) : (
                      <StatusBadge tone="atencao">{p.changeStatus === "alertado" ? "mudou · time avisado" : "mudou"}</StatusBadge>
                    )}
                    {outdated ? <StatusBadge tone="divergente">código desatualizado</StatusBadge> : null}
                    {p.diffText && p.changeStatus !== "sem_mudanca" ? (
                      <details className="text-xs">
                        <summary className="cursor-pointer text-kyb-azul">Ver diff</summary>
                        <pre className="mt-1 max-h-48 max-w-md overflow-auto whitespace-pre-wrap rounded-kyb-botao bg-kyb-canvas p-2 font-mono">{p.diffText}</pre>
                      </details>
                    ) : null}
                  </div>
                </TableCell>
                <TableCell className="text-kyb-mudo">{p.lastCheckedAt ? when.format(p.lastCheckedAt) : "—"}</TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </>
  );
}
