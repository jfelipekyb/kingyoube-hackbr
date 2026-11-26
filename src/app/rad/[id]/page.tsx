import { asc, eq } from "drizzle-orm";
import { ArrowLeft, FileText, Landmark, Receipt } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/under-construction";
import { RadStateBadge } from "@/components/rad/rad-state-badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { LightBadge } from "@/components/ui/light-badge";
import { getDb } from "@/db/client";
import { auditLog, invoices } from "@/db/schema";
import { isUuid } from "@/lib/company-param";
import { formatCnpj } from "@/lib/cnpj";
import { formatDateBR } from "@/lib/dates";
import { currentUser } from "@/lib/demo-session";
import { formatBRL } from "@/lib/money";
import { getProposal, proposalSupplier, RadError } from "@/services/rad";
import { RadActions } from "./actions";

export const dynamic = "force-dynamic";

const shortName = (n: string | null | undefined) => (n ?? "—").replace(/\s*\(FICTÍCIA\)$/, "");
const dateTime = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" });
const money = (v: bigint | null) => (v === null ? "—" : formatBRL(v));
const who = (a: string | null) => (a ? (a.startsWith("agente:") ? `Agente ${a.slice(7)}` : a.startsWith("usuario:") ? "Pessoa (usuário da demo)" : a) : "—");

function Row({ label, value, strong }: { label: string; value: React.ReactNode; strong?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-kyb-linha py-1.5 last:border-0">
      <dt className="text-sm text-kyb-mudo">{label}</dt>
      <dd className={strong ? "font-semibold tabular-nums" : "tabular-nums break-all text-right"}>{value}</dd>
    </div>
  );
}

export default async function RadProposalPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const db = getDb();
  const p = await getProposal(db, id, null).catch((e) => {
    if (e instanceof RadError) notFound();
    throw e;
  });
  const [[inv], supplier, user, trail] = await Promise.all([
    db.select().from(invoices).where(eq(invoices.id, p.invoiceId)),
    proposalSupplier(db, p),
    currentUser(),
    db.select().from(auditLog).where(eq(auditLog.entityId, p.id)).orderBy(asc(auditLog.at)),
  ]);
  const suggested = inv?.cbsCents ?? 0n;

  return (
    <>
      <Link href={`/rad?cliente=${p.companyId}`} className="mb-3 inline-flex items-center gap-1 text-sm text-kyb-azul underline-offset-4 hover:underline">
        <ArrowLeft aria-hidden className="size-4" /> Voltar para o RAD
      </Link>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <PageHeader title={`Proposta de RAD · ${shortName(supplier.name)}`} description={`Chave ${p.accessKey} · período ${inv?.period ?? "—"}`} />
        <RadStateBadge state={p.state} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Receipt aria-hidden className="size-5 text-kyb-azul" strokeWidth={1.75} /> Proposta
            </CardTitle>
            <CardDescription>Preparada pela Tesouraria; a elegibilidade legal é decisão do contador.</CardDescription>
          </CardHeader>
          <CardContent>
            <dl>
              <Row label="Fornecedor" value={shortName(supplier.name)} />
              <Row label="CNPJ do fornecedor" value={supplier.cnpj ? formatCnpj(supplier.cnpj) : "—"} />
              <Row label="Semáforo do fornecedor" value={<LightBadge light={supplier.light} />} />
              <Row label="Opção" value={p.option === "PAGAMENTO_PARCIAL" ? "Pagamento parcial" : "Pagamento total"} />
              <Row label={p.option === "PAGAMENTO_PARCIAL" ? "Valor parcial" : "Valor sugerido (CBS da nota)"} value={money(p.option === "PAGAMENTO_PARCIAL" ? p.partialCents : suggested)} strong />
              <Row label="Justificativa" value={p.justification ?? "—"} />
              <Row label="Preparada por" value={who(p.preparedBy)} />
              <Row label="Enviada por" value={who(p.submittedBy)} />
              <Row label="Decidida por" value={who(p.approvedBy)} />
              {p.awareOfRefusal && <Row label="Decisão expressa" value="Contador ciente da recusa do fornecedor" />}
              {p.rejectionReason && <Row label="Motivo da recusa" value={p.rejectionReason} />}
            </dl>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Ações</CardTitle>
            <CardDescription>Você está como {user.role === "contador" ? "Contador" : "Analista"}. As travas valem no servidor.</CardDescription>
          </CardHeader>
          <CardContent>
            {p.state === "erro_receita" && (
              <p role="alert" className="mb-3 rounded-kyb-botao border border-kyb-erro/40 bg-kyb-erro/10 p-3 text-sm text-kyb-erro" data-rfb-code={p.rfbReturnCode ?? undefined}>
                <strong>A Receita recusou o DARF.</strong> {p.rfbMessage}
              </p>
            )}
            <RadActions
              p={{
                id: p.id,
                companyId: p.companyId,
                state: p.state,
                option: p.option,
                partialCents: p.partialCents?.toString() ?? null,
                justification: p.justification,
                suggestedCents: suggested.toString(),
              }}
              supplierRed={supplier.light === "vermelho"}
              role={user.role}
            />
            {!["rascunho", "erro_receita", "aguardando_aprovacao", "aprovada"].includes(p.state) && <p className="text-sm text-kyb-mudo">Nenhuma ação pendente nesta proposta.</p>}
          </CardContent>
        </Card>

        {p.darfPix && (
          <Card className="lg:col-span-2" data-tour="rad-darf">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText aria-hidden className="size-5 text-kyb-azul" strokeWidth={1.75} /> DARF
              </CardTitle>
              <CardDescription>DARF gerado não é DARF pago: só a consulta de recolhimentos da Receita confirma.</CardDescription>
            </CardHeader>
            <CardContent>
              <dl className="grid gap-x-6 lg:grid-cols-2">
                <Row label="Vencimento" value={p.dueDate ? formatDateBR(p.dueDate) : "—"} />
                <Row label="Valor principal" value={money(p.principalCents)} />
                <Row label="Valor total" value={money(p.totalCents)} strong />
                <Row label="Gerado em" value={p.darfGeneratedAt ? dateTime.format(p.darfGeneratedAt) : "—"} />
                <Row label="Pix (copia e cola)" value={<span className="font-mono text-xs">{p.darfPix}</span>} />
                <Row label="Código de barras" value={<span className="font-mono text-xs">{p.darfBarcode}</span>} />
                <Row label="PDF" value={p.darfPdfUrl ? <a href={p.darfPdfUrl} className="text-kyb-azul underline-offset-4 hover:underline">Abrir DARF</a> : "—"} />
                {p.confirmedAt && <Row label="Pagamento confirmado pela Receita" value={dateTime.format(p.confirmedAt)} />}
                {p.paidPrincipalCents !== null && <Row label="Valor recolhido (Receita)" value={money(p.paidPrincipalCents)} />}
                {p.divergenceRule && <Row label="Divergência" value={`${p.divergenceRule}: valor recolhido diferente do DARF`} />}
              </dl>
            </CardContent>
          </Card>
        )}

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Landmark aria-hidden className="size-5 text-kyb-azul" strokeWidth={1.75} /> Trilha de auditoria
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ol className="space-y-1 text-sm">
              {trail.map((a) => (
                <li key={a.id} className="flex flex-wrap gap-x-3" data-audit-action={a.action}>
                  <span className="tabular-nums text-kyb-mudo">{dateTime.format(a.at)}</span>
                  <span className="font-semibold">{a.action}</span>
                  <span>{who(a.actor)}</span>
                  <span className={a.result === "ok" ? "text-kyb-verde-texto" : "text-kyb-alerta"}>{a.result}</span>
                </li>
              ))}
            </ol>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
