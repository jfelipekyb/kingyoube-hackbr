"use client";

import { RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";

/** Roda o Conciliador e o Analista (cliente ou carteira) e recarrega a tela. */
export function ReconcileButton({ companyId, label = "Conciliar agora", variant = "default" }: { companyId?: string; label?: string; variant?: "default" | "outline" }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const run = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/conciliacao/run", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(companyId ? { companyId } : {}),
      });
      if (!res.ok) throw new Error();
      startTransition(() => router.refresh());
    } catch {
      setError("Não foi possível conciliar agora. Tente de novo.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <span className="inline-flex flex-col items-end gap-1">
      <Button variant={variant} onClick={run} disabled={busy} aria-busy={busy}>
        <RefreshCw aria-hidden className={busy ? "animate-spin" : undefined} />
        {busy ? "Conciliando…" : label}
      </Button>
      {error ? (
        <span role="alert" className="text-xs text-kyb-erro">
          {error}
        </span>
      ) : null}
    </span>
  );
}
