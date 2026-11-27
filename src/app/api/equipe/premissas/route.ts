import { NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { actorFromRequest } from "@/lib/request-actor";
import { PremiseError, returnedHours, updateEffortStandard, updateTeamPremise } from "@/services/equipe/hours";
import { readJson } from "../../receita/http";

export const dynamic = "force-dynamic";

/** Muda uma premissa das horas devolvidas. Só o Contador (trava no serviço, papel lido da base); vai para a auditoria. */
export async function PATCH(request: Request) {
  let body: Record<string, unknown>;
  try {
    body = await readJson(request);
  } catch {
    return NextResponse.json({ erro: "corpo inválido" }, { status: 400 });
  }
  const { tipo, chave, valor } = body;
  if ((tipo !== "tarefa" && tipo !== "projecao") || typeof chave !== "string" || typeof valor !== "number") {
    return NextResponse.json({ erro: "Informe tipo (tarefa|projecao), chave e valor numérico." }, { status: 400 });
  }
  const db = getDb();
  const actor = actorFromRequest(request);
  try {
    if (tipo === "tarefa") await updateEffortStandard(db, { task: chave, minutes: valor, actor });
    else await updateTeamPremise(db, { key: chave, value: valor, actor });
  } catch (e) {
    if (e instanceof PremiseError) return NextResponse.json({ erro: e.message }, { status: e.status });
    throw e;
  }
  return NextResponse.json({ horas: await returnedHours(db) });
}
