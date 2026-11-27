"use client";

import { FilePlus2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";

/** Pede à Tesouraria o rascunho da proposta e abre o detalhe. */
export function PrepareButton({ companyId, invoiceId }: { companyId: string; invoiceId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function onClick() {
    setBusy(true);
    setError(null);
    const res = await fetch("/api/rad/proposals", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ companyId, invoiceId }) });
    const body = (await res.json()) as { proposta?: { id: string }; erro?: string };
    setBusy(false);
    if (!res.ok || !body.proposta) return setError(body.erro ?? "Não foi possível preparar a proposta. Tente de novo; se persistir, reinicie a demonstração.");
    router.push(`/rad/${body.proposta.id}`);
  }
  return (
    <span className="inline-flex flex-col items-end gap-1">
      <Button size="sm" variant="outline" onClick={onClick} disabled={busy}>
        <FilePlus2 aria-hidden strokeWidth={1.75} />
        {busy ? "Preparando…" : "Preparar proposta"}
      </Button>
      {error && (
        <span role="alert" className="text-xs text-kyb-erro">
          {error}
        </span>
      )}
    </span>
  );
}
