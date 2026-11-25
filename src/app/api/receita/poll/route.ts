import { NextResponse } from "next/server";
import { isAuthorizedCron } from "@/services/demo";
import { pollRequests, syncOverview } from "@/services/receita";
import { apuracaoDeps, optionalCompanyId, readJson, requireOperator } from "../http";

export const dynamic = "force-dynamic";

/** Consulta a situação do que está em aberto, baixa o que ficou pronto e normaliza. */
export async function POST(request: Request) {
  const denied = requireOperator(request);
  if (denied) return denied;
  let body: Record<string, unknown>;
  try {
    body = await readJson(request);
  } catch {
    return NextResponse.json({ erro: "corpo inválido" }, { status: 400 });
  }
  const companyId = optionalCompanyId(body);
  if (companyId === undefined) return NextResponse.json({ erro: "companyId inválido" }, { status: 400 });
  const deps = apuracaoDeps();
  if (deps instanceof NextResponse) return deps;
  const { processed } = await pollRequests(deps, { companyId });
  return NextResponse.json({ processed, overview: await syncOverview(deps.db, { companyId }) });
}

/** Vercel Cron (GET com CRON_SECRET): avança a carteira inteira. */
export async function GET(request: Request) {
  if (!isAuthorizedCron(request.headers.get("authorization"))) {
    return NextResponse.json({ erro: "não autorizado" }, { status: 401 });
  }
  const deps = apuracaoDeps();
  if (deps instanceof NextResponse) return deps;
  return NextResponse.json(await pollRequests(deps));
}
