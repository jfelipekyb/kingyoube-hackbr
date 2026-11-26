"use client";

import { RefreshCw } from "lucide-react";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { verifyNow } from "./actions";

export function VerifyButton() {
  const [message, setMessage] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const run = () =>
    start(async () => {
      setMessage(null);
      const r = await verifyNow();
      if (!r.ok) setMessage(r.message);
      else setMessage(`Conferidas ${r.pages - r.errors} de ${r.pages} páginas: ${r.changed === 0 ? "nenhuma mudança" : `${r.changed} com mudança, time avisado`}${r.errors ? `; ${r.errors} com erro` : ""}.`);
    });
  return (
    <div className="mb-4 flex flex-wrap items-center gap-3">
      <Button onClick={run} disabled={pending}>
        <RefreshCw aria-hidden strokeWidth={1.75} className={pending ? "animate-spin" : undefined} />
        {pending ? "Verificando as 9 páginas (cerca de 1 minuto)…" : "Verificar agora"}
      </Button>
      {message ? (
        <p role="status" className="text-sm">
          {message}
        </p>
      ) : null}
    </div>
  );
}
