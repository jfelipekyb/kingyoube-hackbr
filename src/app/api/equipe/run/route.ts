import { NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { actorFromRequest } from "@/lib/request-actor";
import { ROUND_AGENTS, startRun } from "@/services/equipe/run";
import { requireOperator } from "../../receita/http";

export const dynamic = "force-dynamic";

/** Abre a rodada da equipe (docs/09). Rodada em andamento devolve a mesma: dois cliques = uma rodada. */
export async function POST(request: Request) {
  const denied = requireOperator(request);
  if (denied) return denied;
  const { run, created } = await startRun({ db: getDb() }, actorFromRequest(request));
  return NextResponse.json({ runId: run.id, created, agents: ROUND_AGENTS }, { status: created ? 201 : 200 });
}
