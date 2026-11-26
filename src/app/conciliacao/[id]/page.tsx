import { ArrowLeft, FileText, Landmark, Scale } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/under-construction";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { ItemStatusBadge } from "@/components/ui/item-status-badge";
import { StatusBadge } from "@/components/ui/status-badge";
import { getDb } from "@/db/client";
import { isUuid } from "@/lib/company-param";
import { formatCnpj } from "@/lib/cnpj";
import { brasiliaDay, formatDateBR } from "@/lib/dates";
import { formatBRL } from "@/lib/money";
import { itemDetail } from "@/services/conciliacao/queries";
import { RULES, type RuleId } from "@/services/conciliacao/rules";

export const dynamic = "force-dynamic";

const periodBR = (p: string) => `${p.slice(5, 7)}/${p.slice(0, 4)}`;
const money = (v: bigint | null) => (v === null ? "—" : formatBRL(v));
const shortName = (n: string | null | undefined) => (n ?? "—").replace(/\s*\(FICTÍCIA\)$/, "");
const dateTime = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" });

function Row({ label, value, strong }: { label: string; value: React.ReactNode; strong?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-kyb-linha py-1.5 last:border-0">
      <dt className="text-sm text-kyb-mudo">{label}</dt>
      <dd className={strong ? "font-semibold tabular-nums" : "tabular-nums"}>{value}</dd>
    </div>
  );
}

export default async function ItemDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const d = await itemDetail(getDb(), id);
  if (!d) notFound();
  const { item } = d;
  const rule = RULES[item.ruleId as RuleId];
  const isSale = item.kind === "debito";
  const rewritten = item.explanationOriginal !== null && item.explanation !== item.explanationOriginal;

  return (
    <>
      <Link href={`/conciliacao?cliente=${item.companyId}`} className="mb-3 inline-flex items-center gap-1 text-sm text-kyb-azul underline-offset-4 hover:underline">
        <ArrowLeft aria-hidden className="size-4" /> Voltar para a conciliação
      </Link>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <PageHeader title={`${isSale ? "Venda" : "Compra"} · período ${periodBR(item.period)}`} description={`${shortName(d.companyName)} · chave ${item.accessKey}`} />
        <ItemStatusBadge status={item.status} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2" data-tour="detalhe-lado-a-lado">
        <Card className="kyb-entrada">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText aria-hidden className="size-5 text-kyb-azul" strokeWidth={1.75} /> Nota fiscal
            </CardTitle>
            <CardDescription>O que está no sistema do escritório.</CardDescription>
          </CardHeader>
          <CardContent>
            {d.invoice ? (
              <dl>
                <Row label="Emissão" value={formatDateBR(brasiliaDay(d.invoice.invoice.issuedAt))} />
                <Row label={isSale ? "Cliente" : "Fornecedor"} value={shortName(d.invoice.counterpartyName)} />
                <Row label="CNPJ" value={formatCnpj(d.invoice.invoice.counterpartyCnpj)} />
                <Row label="Total da nota" value={formatBRL(d.invoice.invoice.totalCents)} />
                <Row label={isSale ? "CBS da nota" : "Crédito de CBS da nota"} value={formatBRL(d.invoice.invoice.cbsCents)} strong />
              </dl>
            ) : (
              <EmptyState message="Não há nota no sistema para esta chave e período." />
            )}
          </CardContent>
        </Card>
        <Card className="kyb-entrada" style={{ "--kyb-ordem": 1 } as React.CSSProperties}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Landmark aria-hidden className="size-5 text-kyb-azul" strokeWidth={1.75} /> Receita ({isSale ? "débitos" : "créditos"})
            </CardTitle>
            <CardDescription>O que a Receita apurou para a mesma chave e período.</CardDescription>
          </CardHeader>
          <CardContent>
            {d.receita.length === 0 ? (
              <EmptyState message="A Receita não tem registro para esta chave e período." />
            ) : (
              d.receita.map((r) => (
                <dl key={r.origin} className="mb-3 last:mb-0">
                  <Row label="Origem" value={r.origin === 0 ? "0 (documento original)" : `${r.origin} (cancelamento/devolução)`} />
                  <Row label="Registrado em" value={dateTime.format(r.registeredAt)} />
                  <Row label="Apurado" value={formatBRL(r.apuradoCents)} strong />
                  {r.fields.map(([label, cents]) => (
                    <Row key={label} label={label} value={formatBRL(cents)} />
                  ))}
                </dl>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Scale aria-hidden className="size-5 text-kyb-azul" strokeWidth={1.75} /> Regra {item.ruleId} · {rule.title}
            </CardTitle>
            <CardDescription>{rule.when}</CardDescription>
          </CardHeader>
          <CardContent className="text-sm text-kyb-mudo">Tolerância zero, em centavos. Contrato da Receita v{item.contractVersion}.</CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Evidência</CardTitle>
            <CardDescription>Os números que a regra usou.</CardDescription>
          </CardHeader>
          <CardContent>
            <dl>
              <Row label="Nota" value={money(item.invoiceCents)} />
              <Row label="Receita" value={money(item.rfbCents)} />
              <Row label="Diferença (Receita − nota)" value={money(item.diffCents)} strong />
              <Row label="Calculado em" value={dateTime.format(item.computedAt)} />
            </dl>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Explicação do Analista</CardTitle>
            <CardDescription>{rewritten ? "Texto reescrito por modelo de linguagem, com os mesmos números." : "Modelo fixo de texto da regra."}</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3 text-sm">
            <p>{item.explanation}</p>
            {rewritten ? (
              <details>
                <summary className="cursor-pointer text-kyb-mudo">Texto original da regra</summary>
                <p className="mt-2">{item.explanationOriginal}</p>
              </details>
            ) : null}
          </CardContent>
        </Card>
      </div>

      {d.rad ? (
        <Card className="mt-4">
          <CardHeader>
            <CardTitle className="flex flex-wrap items-center gap-2">
              Candidata a RAD <StatusBadge tone="atencao">crédito travado</StatusBadge>
            </CardTitle>
            <CardDescription>
              Valor sugerido do RAD: {formatBRL(d.rad.lockedCents)} (crédito a apropriar). A elegibilidade legal é confirmada pelo contador.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : null}
    </>
  );
}
