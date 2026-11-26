"use client";

import { CircleAlert, CloudDownload, FileSearch, Inbox, Mail, MessageCircle, Radar, Receipt, Scale, ShieldCheck, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { AgentStatus, type AgentState } from "@/components/ui/agent-status";
import { Button } from "@/components/ui/button";
import { CountUp } from "@/components/ui/count-up";
import { StatusBadge } from "@/components/ui/status-badge";
import { cn } from "@/lib/utils";
import type { RunSnapshot } from "@/services/equipe/snapshot";

export interface AgentCard {
  key: string;
  name: string;
  role: string;
}

const ICONS: Record<string, LucideIcon> = {
  captura: Inbox,
  apuracao: CloudDownload,
  conciliador: Scale,
  conferente: ShieldCheck,
  analista: FileSearch,
  tesouraria: Receipt,
  vigia: Radar,
  mensageiro: Mail,
  kim: MessageCircle,
};

const sleep = (ms: number) => new Promise((ok) => setTimeout(ok, ms));
const timeFmt = new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit", timeZone: "America/Sao_Paulo" });
const hoursFmt = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

function stateOf(step: RunSnapshot["steps"][keyof RunSnapshot["steps"]] | undefined): AgentState {
  if (!step) return "parado";
  if (step.status === "trabalhando") return "trabalhando";
  if (step.status === "revisado_divergente" || step.status === "erro") return step.status;
  return "feito";
}

async function call<T>(path: string, method: "GET" | "POST"): Promise<T> {
  const res = await fetch(path, { method, cache: "no-store" });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(typeof json.erro === "string" ? json.erro : `Falha (HTTP ${res.status})`);
  return json as T;
}

export function SalaDaEquipe({ agents, initial }: { agents: AgentCard[]; initial: RunSnapshot | null }) {
  const [snap, setSnap] = useState<RunSnapshot | null>(initial);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [current, setCurrent] = useState<string | null>(null);
  const router = useRouter();
  // Voltar pelo navegador reaproveita a página do cache do roteador (talvez de antes da rodada): busca a versão atual.
  useEffect(() => router.refresh(), [router]);
  const [seen, setSeen] = useState(initial);
  if (initial !== seen) {
    setSeen(initial);
    if (initial && !running) setSnap(initial);
  }

  const seq = useRef({ sent: 0, applied: 0 });
  // Polling e chamadas se cruzam: só vale a resposta mais nova.
  const refresh = useCallback(async (runId: string) => {
    const n = ++seq.current.sent;
    const next = await call<RunSnapshot>(`/api/equipe/run/${runId}`, "GET");
    if (n > seq.current.applied) {
      seq.current.applied = n;
      setSnap(next);
    }
  }, []);

  const run = useCallback(async () => {
    let poll: ReturnType<typeof setInterval> | undefined;
    setRunning(true);
    setError(null);
    try {
      const { runId, agents: order } = await call<{ runId: string; agents: string[] }>("/api/equipe/run", "POST");
      await refresh(runId);
      // docs/09: a tela acompanha pelo GET a cada 1 s, também enquanto um agente demora na própria chamada.
      poll = setInterval(() => void refresh(runId).catch(() => {}), 1_000);
      for (const agent of order) {
        setCurrent(agent);
        for (;;) {
          const r = await call<{ done: boolean; step: { status: string; summary?: string } }>(`/api/equipe/run/${runId}/${agent}`, "POST");
          await refresh(runId);
          if (r.step.status === "erro") throw new Error(r.step.summary ?? "O agente não terminou.");
          if (r.done) break;
          await sleep(1_000);
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha inesperada");
    } finally {
      clearInterval(poll);
      setCurrent(null);
      setRunning(false);
    }
  }, [refresh]);

  const finished = snap?.run.status === "concluida";
  const conferente = snap?.steps.conferente ?? null;

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
      <section aria-labelledby="sala-agentes" className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <h2 id="sala-agentes" className="sr-only">
            Agentes da rodada
          </h2>
          <Button onClick={run} disabled={running} data-tour="rodar-equipe" size="lg">
            {running ? "A equipe está trabalhando…" : finished ? "Rodar a equipe de novo" : "Rodar a equipe"}
          </Button>
          <p className="text-secundario text-muted-foreground">
            Uma rodada = um mês de conferência da carteira. Nenhum agente aprova nada: quem decide é o contador.
          </p>
        </div>
        {error ? (
          <p role="alert" className="flex items-center gap-2 text-sm font-semibold text-kyb-erro">
            <CircleAlert aria-hidden className="size-4" /> {error}
          </p>
        ) : null}
        <ol className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-3">
          {agents.map((a, i) => {
            const step = snap?.steps[a.key as keyof RunSnapshot["steps"]] ?? null;
            const stored = stateOf(step ?? undefined);
            const state: AgentState = current === a.key && stored === "parado" ? "trabalhando" : stored;
            const isConferente = a.key === "conferente";
            return (
              <li
                key={a.key}
                data-tour={isConferente ? "conferente" : undefined}
                data-agent={a.key}
                className={cn(
                  "kyb-entrada flex flex-col gap-2 rounded-kyb border bg-kyb-branco p-4",
                  isConferente && step?.status === "revisado_ok" ? "border-kyb-verde ring-2 ring-kyb-verde/40" : "border-kyb-linha",
                  isConferente && step?.status === "revisado_divergente" && "border-kyb-erro ring-2 ring-kyb-erro/30",
                  current === a.key && "border-kyb-verde",
                )}
                style={{ "--kyb-ordem": i } as React.CSSProperties}
              >
                <div className="flex items-center justify-between gap-2">
                  <AgentStatus name={a.name} icon={ICONS[a.key] ?? Inbox} state={state} />
                  {isConferente && step?.status === "revisado_ok" ? <StatusBadge tone="conciliado">Conferido do zero</StatusBadge> : null}
                  {isConferente && step?.status === "revisado_divergente" ? <StatusBadge tone="divergente">Diferença apontada</StatusBadge> : null}
                </div>
                <p className="text-secundario text-muted-foreground">{a.role}</p>
                <p className={cn("text-sm", step?.summary ? "font-semibold" : "text-muted-foreground")} data-summary>
                  {step?.summary ?? (state === "parado" ? "Aguardando a rodada." : "Trabalhando…")}
                </p>
                {isConferente && step?.status === "revisado_divergente" && snap?.decisions ? (
                  <ul className="flex flex-col gap-1 text-secundario">
                    {snap.decisions
                      .filter((d) => d.kind === "conferente")
                      .map((d) => (
                        <li key={d.href}>
                          <Link href={d.href} className="font-semibold text-kyb-erro underline underline-offset-4">
                            {d.title}
                          </Link>
                        </li>
                      ))}
                  </ul>
                ) : null}
              </li>
            );
          })}
          <li className="flex flex-col gap-2 rounded-kyb border-2 border-kyb-azul bg-kyb-branco p-4 sm:col-span-2 2xl:col-span-3" data-agent="contador">
            <h2 className="text-base font-semibold">Contador — o que precisa da sua decisão</h2>
            {finished && snap?.decisions ? (
              <>
                <p className="text-3xl font-bold tabular-nums text-kyb-azul" aria-live="polite">
                  <CountUp value={snap.decisions.length} /> <span className="text-base font-semibold">{snap.decisions.length === 1 ? "decisão" : "decisões"}</span>
                </p>
                <ul className="flex flex-col gap-2">
                  {snap.decisions.map((d, i) => (
                    <li key={`${d.href}-${i}`} className="kyb-entrada" style={{ "--kyb-ordem": i } as React.CSSProperties}>
                      <Link href={d.href} className="font-semibold underline underline-offset-4 hover:text-kyb-verde-texto">
                        {d.title}
                      </Link>
                      <span className="block text-secundario text-muted-foreground">{d.detail}</span>
                    </li>
                  ))}
                </ul>
                <div className="flex flex-wrap items-center gap-4 pt-1">
                  <Link href="/kim" className="text-sm font-semibold underline underline-offset-4">
                    Perguntar à Kim o que decidir primeiro
                  </Link>
                  <Link href="/equipe" className="text-sm underline underline-offset-4">
                    Esta rodada devolveu {hoursFmt.format(snap.hours.hours)} h de trabalho
                  </Link>
                </div>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">{running ? "A equipe ainda está trabalhando. As decisões aparecem aqui no fim da rodada." : "Rode a equipe para ver o que espera a sua decisão."}</p>
            )}
          </li>
        </ol>
      </section>
      <aside aria-labelledby="sala-linha-do-tempo" className="rounded-kyb border border-kyb-linha bg-kyb-branco p-4">
        <h2 id="sala-linha-do-tempo" className="text-base font-semibold">
          Linha do tempo
        </h2>
        {conferente?.status === "revisado_ok" ? <p className="mt-1 text-secundario text-kyb-verde-texto">O Conferente refez tudo do zero e não achou diferença.</p> : null}
        {snap && snap.timeline.length > 0 ? (
          <ol className="mt-3 flex max-h-[36rem] flex-col gap-3 overflow-y-auto pr-1" aria-live="polite" aria-relevant="additions" aria-labelledby="sala-linha-do-tempo" tabIndex={0}>
            {snap.timeline.map((e) => (
              <li key={e.id} className="kyb-entrada border-l-2 border-kyb-linha pl-3">
                <span className="block text-rotulo text-muted-foreground">
                  {timeFmt.format(new Date(e.at))} · {agents.find((a) => a.key === e.agent)?.name ?? e.agent}
                </span>
                <span className={cn("text-secundario", e.status === "revisado_divergente" || e.status === "erro" ? "font-semibold text-kyb-erro" : "")}>{e.summary}</span>
              </li>
            ))}
          </ol>
        ) : (
          <p className="mt-3 text-secundario text-muted-foreground">Nenhum evento ainda.</p>
        )}
      </aside>
    </div>
  );
}
