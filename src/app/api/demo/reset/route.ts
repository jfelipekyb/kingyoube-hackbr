import { NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { recordAudit } from "@/services/auditoria";
import { isAuthorizedCron, resetDemo } from "@/services/demo";

export const dynamic = "force-dynamic";

async function handle(request: Request) {
  const db = getDb();
  if (!isAuthorizedCron(request.headers.get("authorization"))) {
    await recordAudit(db, { actor: "sistema:cron", action: "demo.reset", entity: "base_demo", result: "nao_autorizado" });
    return NextResponse.json({ erro: "não autorizado" }, { status: 401 });
  }
  const counts = await resetDemo(db, "sistema:cron", "reset diário");
  return NextResponse.json({ ok: true, counts });
}

export const POST = handle;
// O Vercel Cron chama com GET; a mesma trava de CRON_SECRET vale para os dois.
export const GET = handle;
