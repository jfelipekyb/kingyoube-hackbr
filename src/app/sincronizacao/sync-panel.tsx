"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import type { RequestState, SyncOverview } from "@/services/receita/sync";

const POLL_MS = 2_000;

const SERVICE_LABEL: Record<string, string> = {
  debitos: "Débitos",
  creditos: "Créditos",
  pagamentos: "Pagamentos",
  recolhimentos: "Recolhimentos",
};

const STATE_LABEL: Record<RequestState, string> = {
  solicitada: "solicitada",
  em_processamento: "em processamento",
  concluida: "concluída",
  baixada: "baixada",
  normalizada: "normalizada",
  erro: "erro",
  expirada: "expirada",
};

const STATE_CLASS: Record<RequestState, string> = {
  solicitada: "border-sky-300 bg-sky-50 text-sky-900 animate-pulse",
  em_processamento: "border-indigo-300 bg-indigo-50 text-indigo-900 animate-pulse",
  concluida: "border-violet-300 bg-violet-50 text-violet-900 animate-pulse",
  baixada: "border-violet-300 bg-violet-50 text-violet-900 animate-pulse",
  normalizada: "border-emerald-300 bg-emerald-50 text-emerald-900",
  erro: "border-red-300 bg-red-50 text-red-900",
  expirada: "border-red-300 bg-red-50 text-red-900",
};

const OPEN: RequestState[] = ["solicitada", "em_processamento", "concluida", "baixada"];

const dateTime = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "medium", timeZone: "America/Sao_Paulo" });

function StateBadge({ state }: { state: RequestState | null }) {
  if (!state) return <span className="text-muted-foreground">nunca sincronizado</span>;
  return (
    <span data-state={state} className={cn("inline-flex rounded-md border px-2 py-0.5 text-xs font-medium", STATE_CLASS[state])}>
      {STATE_LABEL[state]}
    </span>
  );
}

export function SyncPanel({ initial, companyId }: { initial: SyncOverview; companyId: string | null }) {
  const [overview, setOverview] = useState(initial);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState<number | null>(null);
  const polling = useRef(false);
  const startedAt = useRef<number | null>(null);

  useEffect(() => setOverview(initial), [initial]);

  const call = useCallback(
    async (path: string, body: Record<string, unknown>) => {
      const res = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(typeof json.erro === "string" ? json.erro : `Falha (HTTP ${res.status})`);
      setOverview(json.overview as SyncOverview);
      return json.overview as SyncOverview;
    },
    [],
  );

  useEffect(() => {
    if (overview.open === 0) {
      if (startedAt.current !== null && !busy) {
        setElapsed(Date.now() - startedAt.current);
        startedAt.current = null;
      }
      return;
    }
    const timer = setInterval(async () => {
      if (polling.current) return;
      polling.current = true;
      try {
        await call("/api/receita/poll", { companyId });
      } catch (e) {
        setError((e as Error).message);
      } finally {
        polling.current = false;
      }
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [overview.open, companyId, call, busy]);

  async function sync(target: string | null) {
    setBusy(target ?? "carteira");
    setError(null);
    setElapsed(null);
    startedAt.current = Date.now();
    try {
      await call("/api/receita/sync", { companyId: target });
    } catch (e) {
      setError((e as Error).message);
      startedAt.current = null;
    } finally {
      setBusy(null);
    }
  }

  const risks = overview.companies.flatMap((c) =>
    c.services.filter((s) => s.windowAtRisk).map((s) => ({ company: c.name, service: s.service, days: s.windowDays })),
  );

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center gap-3">
        {!companyId ? (
          <Button onClick={() => sync(null)} disabled={busy !== null || overview.open > 0}>
            Sincronizar a carteira
          </Button>
        ) : null}
        <span className="text-sm text-muted-foreground" aria-live="polite">
          {overview.open > 0
            ? `${overview.open} ${overview.open === 1 ? "consulta em andamento" : "consultas em andamento"} — atualizando a cada 2 s`
            : elapsed !== null
              ? `Sincronização concluída em ${(elapsed / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} s`
              : "Nenhuma consulta em andamento"}
        </span>
      </div>
      {error ? <p className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-900">{error}</p> : null}
      {risks.length > 0 ? (
        <div role="alert" className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          <strong>Janela em risco:</strong> a Receita só devolve os últimos 8 dias.{" "}
          {risks.map((r) => `${r.company} · ${SERVICE_LABEL[r.service]} (${r.days} dias)`).join("; ")}.
        </div>
      ) : null}

      {overview.companies.map((c) => {
        const open = c.services.some((s) => s.state && OPEN.includes(s.state));
        const remaining = c.services.reduce((n, s) => n + Math.max(s.quotaLimit - s.quotaUsed, 0), 0);
        return (
          <section key={c.id} className="rounded-lg border" aria-label={c.name}>
            <header className="flex flex-wrap items-center gap-3 border-b px-4 py-3">
              <h2 className="font-semibold">{c.name}</h2>
              <span className="text-xs text-muted-foreground">
                {c.counts.debits} débitos · {c.counts.credits} créditos · {c.counts.payments} pagamentos/recolhimentos na base
              </span>
              <Button
                className="ml-auto"
                size="sm"
                variant="outline"
                onClick={() => sync(c.id)}
                disabled={busy !== null || open || remaining === 0}
              >
                {busy === c.id ? "Pedindo…" : "Sincronizar agora"}
              </Button>
            </header>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Serviço</TableHead>
                  <TableHead>Situação</TableHead>
                  <TableHead>Pedido em</TableHead>
                  <TableHead>Cota restante hoje</TableHead>
                  <TableHead>Última concluída</TableHead>
                  <TableHead>Detalhe</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {c.services.map((s) => (
                  <TableRow key={s.service} data-service={s.service}>
                    <TableCell className="font-medium">{SERVICE_LABEL[s.service]}</TableCell>
                    <TableCell>
                      <StateBadge state={s.state} />
                    </TableCell>
                    <TableCell className="text-xs">{s.requestedAt ? dateTime.format(new Date(s.requestedAt)) : "—"}</TableCell>
                    <TableCell className={cn("text-sm", s.quotaUsed >= s.quotaLimit && "font-medium text-red-700")}>
                      {Math.max(s.quotaLimit - s.quotaUsed, 0)} de {s.quotaLimit}
                    </TableCell>
                    <TableCell className="text-xs">
                      {s.lastCompletedAt ? dateTime.format(new Date(s.lastCompletedAt)) : "—"}
                      {s.windowAtRisk ? <span className="ml-2 font-medium text-amber-700">janela em risco ({s.windowDays} dias)</span> : null}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {s.errorCode ? `${s.errorCode}${s.errorMessage ? ` — ${s.errorMessage}` : ""}` : ""}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </section>
        );
      })}
    </div>
  );
}
