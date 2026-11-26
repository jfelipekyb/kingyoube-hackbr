"use client";

import { CloudDownload, TriangleAlert } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { AgentStatus, type AgentState } from "@/components/ui/agent-status";
import { Button } from "@/components/ui/button";
import { CountUp } from "@/components/ui/count-up";
import { LockedButton } from "@/components/ui/locked-button";
import { StatusBadge, type StatusTone } from "@/components/ui/status-badge";
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

const STATE_TONE: Record<RequestState, StatusTone> = {
  solicitada: "aguardando",
  em_processamento: "aguardando",
  concluida: "aguardando",
  baixada: "aguardando",
  normalizada: "conciliado",
  erro: "divergente",
  expirada: "divergente",
};

const OPEN: RequestState[] = ["solicitada", "em_processamento", "concluida", "baixada"];

const dateTime = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "medium", timeZone: "America/Sao_Paulo" });

function StateBadge({ state }: { state: RequestState | null }) {
  if (!state) return <StatusBadge tone="aguardando">nunca sincronizado</StatusBadge>;
  return (
    <StatusBadge tone={STATE_TONE[state]} data-state={state}>
      {STATE_LABEL[state]}
    </StatusBadge>
  );
}

const countFormat = (v: bigint) => v.toLocaleString("pt-BR");

export function SyncPanel({ initial, companyId }: { initial: SyncOverview; companyId: string | null }) {
  const [overview, setOverview] = useState(initial);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState<number | null>(null);
  const polling = useRef(false);
  const startedAt = useRef<number | null>(null);

  const previous = useRef<Map<string, RequestState | null> | null>(null);
  const [flash, setFlash] = useState<Set<string>>(new Set());

  useEffect(() => setOverview(initial), [initial]);

  // Linha que muda de estado ganha o destaque verde que some aos poucos.
  useEffect(() => {
    const now = new Map(overview.companies.flatMap((c) => c.services.map((s) => [`${c.id}:${s.service}`, s.state] as const)));
    const before = previous.current;
    previous.current = now;
    if (!before) return;
    const changed = [...now].filter(([k, v]) => before.has(k) && before.get(k) !== v && v === "normalizada").map(([k]) => k);
    if (changed.length > 0) setFlash((f) => new Set([...f, ...changed]));
  }, [overview]);

  const call = useCallback(
    async (path: string, body: Record<string, unknown>, apply = true) => {
      const res = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(typeof json.erro === "string" ? json.erro : `Falha (HTTP ${res.status})`);
      if (apply) setOverview(json.overview as SyncOverview);
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
      // A resposta do sync vem filtrada pelo cliente pedido; a tela mostra o filtro da página.
      await call("/api/receita/sync", { companyId: target }, target === companyId);
      if (target !== companyId) await call("/api/receita/poll", { companyId });
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
            <CloudDownload aria-hidden strokeWidth={1.75} />
            Sincronizar a carteira
          </Button>
        ) : null}
        <span className="text-secundario text-muted-foreground" aria-live="polite">
          {overview.open > 0
            ? `${overview.open} ${overview.open === 1 ? "consulta em andamento" : "consultas em andamento"} — atualizando a cada 2 s`
            : elapsed !== null
              ? `Sincronização concluída em ${(elapsed / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} s`
              : "Nenhuma consulta em andamento"}
        </span>
      </div>
      {error ? (
        <p role="alert" className="flex items-start gap-2 rounded-kyb border border-kyb-erro/40 bg-kyb-erro/10 px-4 py-3 text-sm text-kyb-erro">
          <TriangleAlert aria-hidden className="mt-0.5 size-4 shrink-0" strokeWidth={1.75} />
          {error}
        </p>
      ) : null}
      {risks.length > 0 ? (
        <div role="alert" className="flex items-start gap-2 rounded-kyb border border-kyb-alerta/40 bg-kyb-alerta/10 px-4 py-3 text-sm text-kyb-alerta">
          <TriangleAlert aria-hidden className="mt-0.5 size-4 shrink-0" strokeWidth={1.75} />
          <span>
            <strong>Janela em risco:</strong> a Receita só devolve os últimos 8 dias.{" "}
            {risks.map((r) => `${r.company} · ${SERVICE_LABEL[r.service]} (${r.days} dias)`).join("; ")}.
          </span>
        </div>
      ) : null}

      {overview.companies.map((c, index) => {
        const open = c.services.some((s) => s.state && OPEN.includes(s.state));
        const remaining = c.services.reduce((n, s) => n + Math.max(s.quotaLimit - s.quotaUsed, 0), 0);
        const done = c.services.every((s) => s.state === "normalizada");
        const agentState: AgentState = open || busy === c.id ? "trabalhando" : done ? "feito" : "parado";
        const lockReason = open
          ? "Aguarde: a Receita ainda está processando as consultas deste cliente."
          : remaining === 0
            ? "Cota de hoje esgotada para este cliente. Tente de novo amanhã."
            : null;
        return (
          <section
            key={c.id}
            aria-label={c.name}
            className="kyb-entrada rounded-kyb border border-kyb-linha bg-kyb-branco transition-shadow duration-150 ease-kyb hover:shadow-kyb"
            style={{ "--kyb-ordem": index } as React.CSSProperties}
          >
            <header className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-kyb-linha px-5 py-4">
              <h2 className="text-lg">{c.name}</h2>
              <AgentStatus name="Apuração" icon={CloudDownload} state={agentState} className="text-secundario" />
              <span className="text-secundario text-muted-foreground">
                <CountUp value={c.counts.debits} format={countFormat} /> débitos · <CountUp value={c.counts.credits} format={countFormat} /> créditos ·{" "}
                <CountUp value={c.counts.payments} format={countFormat} /> pagamentos/recolhimentos na base
              </span>
              <div className="ml-auto">
                {lockReason ? (
                  <LockedButton reason={lockReason} size="sm" variant={companyId ? "default" : "outline"}>
                    Sincronizar agora
                  </LockedButton>
                ) : (
                  <Button size="sm" variant={companyId ? "default" : "outline"} onClick={() => sync(c.id)} disabled={busy !== null}>
                    {busy === c.id ? "Pedindo…" : "Sincronizar agora"}
                  </Button>
                )}
              </div>
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
                {c.services.map((s) => {
                  const key = `${c.id}:${s.service}`;
                  return (
                    <TableRow
                      key={s.service}
                      data-service={s.service}
                      className={cn(flash.has(key) && "kyb-destaque")}
                      onAnimationEnd={(e) => {
                        if (e.animationName !== "kyb-destaque") return;
                        setFlash((f) => {
                          const next = new Set(f);
                          next.delete(key);
                          return next;
                        });
                      }}
                    >
                      <TableCell className="font-semibold">{SERVICE_LABEL[s.service]}</TableCell>
                      <TableCell>
                        <StateBadge state={s.state} />
                      </TableCell>
                      <TableCell className="text-secundario">{s.requestedAt ? dateTime.format(new Date(s.requestedAt)) : "—"}</TableCell>
                      <TableCell className={cn("text-sm", s.quotaUsed >= s.quotaLimit && "font-semibold text-kyb-erro")}>
                        {Math.max(s.quotaLimit - s.quotaUsed, 0)} de {s.quotaLimit}
                      </TableCell>
                      <TableCell className="text-secundario">
                        {s.lastCompletedAt ? dateTime.format(new Date(s.lastCompletedAt)) : "—"}
                        {s.windowAtRisk ? (
                          <StatusBadge tone="atencao" className="ml-2">
                            janela em risco ({s.windowDays} dias)
                          </StatusBadge>
                        ) : null}
                      </TableCell>
                      <TableCell className="text-secundario text-muted-foreground">
                        {s.errorCode ? `${s.errorCode}${s.errorMessage ? ` — ${s.errorMessage}` : ""}` : ""}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </section>
        );
      })}
    </div>
  );
}
