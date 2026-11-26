import { NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { runSnapshot } from "@/services/equipe/snapshot";
import { isUuid } from "../../../receita/http";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ runId: string }> };

/** Estado da rodada: passo de cada agente, linha do tempo, horas e decisões que esperam o contador. */
export async function GET(_request: Request, { params }: Params) {
  const { runId } = await params;
  if (!isUuid(runId)) return NextResponse.json({ erro: "rodada inválida" }, { status: 400 });
  const snap = await runSnapshot(getDb(), runId);
  if (!snap) return NextResponse.json({ erro: "rodada não encontrada" }, { status: 404 });
  return NextResponse.json(snap);
}
