"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";

export function RestartButton() {
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const restart = () =>
    start(async () => {
      const res = await fetch("/api/demo/reiniciar", { method: "POST" });
      if (res.status === 429) setMessage("Já reiniciamos há menos de um minuto. Aguarde e tente de novo.");
      else if (!res.ok) setMessage("Não foi possível reiniciar agora.");
      else {
        const { counts } = (await res.json()) as { counts: { companies: number; invoices: number } };
        setMessage(`Base recriada: ${counts.companies} clientes e ${counts.invoices} notas.`);
        router.refresh();
      }
    });

  return (
    <div className="flex flex-col items-start gap-3">
      <Button onClick={restart} disabled={pending}>
        {pending ? "Reiniciando…" : "Reiniciar demonstração"}
      </Button>
      {message ? (
        <p role="status" className="text-sm">
          {message}
        </p>
      ) : null}
    </div>
  );
}
