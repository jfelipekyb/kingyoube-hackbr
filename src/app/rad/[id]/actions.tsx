"use client";

import { CheckCircle2, FileText, Send, ShieldAlert, XCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { AWARE_OF_REFUSAL_TEXT, decisionView, type RadState } from "@/services/rad/labels";

export interface ActionProposal {
  id: string;
  companyId: string;
  state: RadState;
  option: "PAGAMENTO_TOTAL" | "PAGAMENTO_PARCIAL";
  partialCents: string | null;
  justification: string | null;
  suggestedCents: string;
  preparedBy: string;
  submittedBy: string | null;
}

const BRL_RE = /^\d{1,3}(?:\.\d{3})*(?:,\d{1,2})?$|^\d+(?:,\d{1,2})?$/;
/** "900,00" → "90000" (centavos em texto); nada de float. */
function brlToCents(text: string): string | null {
  const t = text.trim().replace(/^R\$\s*/, "");
  if (!BRL_RE.test(t)) return null;
  const [int, frac = ""] = t.replace(/\./g, "").split(",");
  return (BigInt(int) * 100n + BigInt(frac.padEnd(2, "0"))).toString();
}
function centsToBrl(cents: string | null): string {
  if (!cents) return "";
  const c = BigInt(cents);
  return `${(c / 100n).toString()},${(c % 100n).toString().padStart(2, "0")}`;
}

export function RadActions({ p, supplierRed, role, actor }: { p: ActionProposal; supplierRed: boolean; role: "analista" | "contador"; actor: string }) {
  const view = decisionView(p, { role, actor });
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [shake, setShake] = useState(false);
  const [option, setOption] = useState(p.option);
  const [partial, setPartial] = useState(centsToBrl(p.partialCents));
  const [justification, setJustification] = useState(p.justification ?? "");
  const [aware, setAware] = useState(false);
  const [reason, setReason] = useState("");

  async function call(path: string, body: Record<string, unknown> = {}): Promise<boolean> {
    setBusy(path);
    setError(null);
    const res = await fetch(`/api/rad/proposals/${p.id}/${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ companyId: p.companyId, ...body }),
    });
    const json = (await res.json().catch(() => ({}))) as { erro?: string };
    setBusy(null);
    if (!res.ok || json.erro) {
      setError(json.erro ?? "Não foi possível concluir. Recarregue a página e tente de novo.");
      setShake(false);
      requestAnimationFrame(() => setShake(true));
      router.refresh();
      return false;
    }
    router.refresh();
    return true;
  }

  async function saveDraft(thenSubmit: boolean) {
    let partialCents: string | null = null;
    if (option === "PAGAMENTO_PARCIAL") {
      partialCents = brlToCents(partial);
      if (!partialCents) return setError("Valor parcial inválido. Use o formato 900,00.");
    }
    const ok = await call("draft", { option, partialCents, justification });
    if (ok && thenSubmit) await call("submit");
  }

  const editable = p.state === "rascunho" || p.state === "erro_receita";
  return (
    <div className={cn("space-y-4", shake && "kyb-tremer")} onAnimationEnd={() => setShake(false)} data-tour="rad-acoes">
      {editable && (
        <fieldset className="space-y-3">
          <legend className="mb-2 font-semibold">Proposta</legend>
          <div className="flex flex-wrap gap-4">
            {(["PAGAMENTO_TOTAL", "PAGAMENTO_PARCIAL"] as const).map((o) => (
              <label key={o} className="inline-flex items-center gap-2 text-sm">
                <input type="radio" name="option" value={o} checked={option === o} onChange={() => setOption(o)} />
                {o === "PAGAMENTO_TOTAL" ? `Pagamento total (sugerido R$ ${centsToBrl(p.suggestedCents)})` : "Pagamento parcial"}
              </label>
            ))}
          </div>
          {option === "PAGAMENTO_PARCIAL" && (
            <label className="flex max-w-xs flex-col gap-1 text-sm">
              <span className="font-semibold">Valor parcial (R$)</span>
              <input inputMode="decimal" value={partial} onChange={(e) => setPartial(e.target.value)} placeholder="900,00" className="h-9 rounded-kyb-botao border border-kyb-linha bg-kyb-branco px-3 tabular-nums" />
            </label>
          )}
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-semibold">Justificativa</span>
            <textarea value={justification} onChange={(e) => setJustification(e.target.value)} rows={3} className="rounded-kyb-botao border border-kyb-linha bg-kyb-branco p-2" />
          </label>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => saveDraft(false)} disabled={busy !== null}>
              Salvar rascunho
            </Button>
            {view.canSubmit && (
              <Button onClick={() => saveDraft(true)} disabled={busy !== null}>
                <Send aria-hidden strokeWidth={1.75} /> Enviar ao contador
              </Button>
            )}
          </div>
        </fieldset>
      )}

      {view.blockedReason && (
        <p className="rounded-kyb-botao border border-kyb-linha bg-kyb-canvas-2 p-3 text-sm" data-decision-blocked>
          {view.blockedReason}
        </p>
      )}

      {p.state === "aguardando_aprovacao" && (view.canDecide || role === "analista") && (
        <div className="space-y-3">
          {supplierRed && (
            <div role="alert" className="rounded-kyb-botao border border-kyb-erro/40 bg-kyb-erro/10 p-3 text-sm text-kyb-erro" data-tour="rad-aviso-vermelho">
              <p className="flex items-center gap-2 font-semibold">
                <ShieldAlert aria-hidden className="size-4" strokeWidth={1.75} /> Fornecedor vermelho: recusou o RAD
              </p>
              <p className="mt-1">Recolher a CBS no lugar dele pode gerar disputa. Aprove só com decisão expressa.</p>
              <label className="mt-2 flex items-center gap-2 font-semibold">
                <input type="checkbox" checked={aware} onChange={(e) => setAware(e.target.checked)} />
                {AWARE_OF_REFUSAL_TEXT}
              </label>
            </div>
          )}
          <div className="flex flex-wrap items-end gap-2">
            <Button onClick={() => call("approve", { awareOfRefusal: aware })} disabled={busy !== null}>
              <CheckCircle2 aria-hidden strokeWidth={1.75} /> Aprovar
            </Button>
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-semibold">Motivo da recusa</span>
              <input value={reason} onChange={(e) => setReason(e.target.value)} className="h-9 rounded-kyb-botao border border-kyb-linha bg-kyb-branco px-3" />
            </label>
            <Button variant="outline" onClick={() => call("reject", { reason })} disabled={busy !== null}>
              <XCircle aria-hidden strokeWidth={1.75} /> Recusar
            </Button>
          </div>
          {role === "analista" && <p className="text-sm text-kyb-mudo">Você está como Analista: a decisão é do contador, e o servidor recusa.</p>}
        </div>
      )}

      {p.state === "aprovada" && (
        <Button onClick={() => call("generate-darf")} disabled={busy !== null} data-tour="rad-gerar-darf">
          <FileText aria-hidden strokeWidth={1.75} /> {busy ? "Gerando DARF…" : "Gerar DARF"}
        </Button>
      )}

      {error && (
        <p role="alert" className="rounded-kyb-botao border border-kyb-alerta/40 bg-kyb-alerta/10 p-2 text-sm font-semibold text-kyb-alerta" data-rad-error>
          {error}
        </p>
      )}
    </div>
  );
}
