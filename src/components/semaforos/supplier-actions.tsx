"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";

export function SupplierActions({
  counterpartyId,
  canFindContact,
  chargeInvoiceId,
  charged,
}: {
  counterpartyId: string;
  canFindContact: boolean;
  chargeInvoiceId: string | null;
  charged: boolean;
}) {
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const call = (path: string, body: Record<string, unknown>, ok: (j: Record<string, unknown>) => string) =>
    start(async () => {
      const res = await fetch(`/api/fornecedores/${counterpartyId}/${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      setMessage(res.ok ? ok(json) : String(json.erro ?? "Não deu certo agora."));
      if (res.ok) router.refresh();
    });
  const CONTACT: Record<string, string> = {
    contato_encontrado: "Contato encontrado e CNPJ conferido.",
    cnpj_divergente: "O CNPJ do site não bate com o da nota: contato não gravado.",
    sem_email: "O site não tem e-mail do financeiro.",
    sem_site: "Fornecedor sem site cadastrado.",
  };
  return (
    <div className="flex flex-col items-start gap-2">
      <div className="flex flex-wrap gap-2">
        {canFindContact ? (
          <Button size="sm" variant="outline" disabled={pending} onClick={() => call("contato", {}, (j) => CONTACT[String(j.status)] ?? "Feito.")}>
            Buscar contato
          </Button>
        ) : null}
        {chargeInvoiceId ? (
          <Button size="sm" disabled={pending} onClick={() => call("cobrar", { invoiceId: chargeInvoiceId }, () => "Cobrança registrada por e-mail e WhatsApp simulado.")}>
            {charged ? "Reenviar cobrança" : "Cobrar fornecedor"}
          </Button>
        ) : null}
      </div>
      {charged ? (
        <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Resposta simulada do fornecedor">
          <span className="text-xs text-kyb-mudo">Resposta do fornecedor (simulada):</span>
          <Button size="sm" variant="outline" disabled={pending} onClick={() => call("resposta", { resposta: "vou_recolher" }, () => "Resposta registrada: Vou recolher.")}>
            Vou recolher
          </Button>
          <Button size="sm" variant="outline" disabled={pending} onClick={() => call("resposta", { resposta: "nao_aceito" }, () => "Resposta registrada: Não aceito o RAD.")}>
            Não aceito o RAD
          </Button>
        </div>
      ) : null}
      {message ? (
        <p role="status" className="text-xs">
          {message}
        </p>
      ) : null}
    </div>
  );
}
