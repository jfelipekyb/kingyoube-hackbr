import { NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { RunError, runAgentStep } from "@/services/equipe/run";
import { isUuid, requireOperator } from "../../../../receita/http";

export const dynamic = "force-dynamic";
// O Vigia lê 9 páginas em fila (6,5 s entre elas) quando não há leitura de menos de 24 h.
export const maxDuration = 300;

type Params = { params: Promise<{ runId: string; agent: string }> };

/** Um passo da rodada: uma chamada por agente. `done: false` = chame de novo (ex.: Apuração esperando a Receita). */
export async function POST(request: Request, { params }: Params) {
  const denied = requireOperator(request);
  if (denied) return denied;
  const { runId, agent } = await params;
  if (!isUuid(runId)) return NextResponse.json({ erro: "rodada inválida" }, { status: 400 });
  try {
    const r = await runAgentStep({ db: getDb() }, runId, agent);
    return NextResponse.json({ agent, done: r.done, step: r.step, runStatus: r.run.status });
  } catch (e) {
    if (e instanceof RunError) return NextResponse.json({ erro: e.message, codigo: e.code }, { status: e.status });
    throw e;
  }
}
