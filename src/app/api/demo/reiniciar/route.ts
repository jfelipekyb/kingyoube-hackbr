import { NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { clientIp, reiniciarDemo } from "@/services/demo";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const result = await reiniciarDemo(getDb(), clientIp(request.headers));
  if (result.status === "indisponivel") {
    return NextResponse.json({ erro: "reinício só existe no modo SIMULADO" }, { status: 404 });
  }
  if (result.status === "limitado") {
    return NextResponse.json(
      { erro: "aguarde um minuto para reiniciar de novo" },
      { status: 429, headers: { "Retry-After": String(result.retryAfterSeconds) } },
    );
  }
  return NextResponse.json({ ok: true, counts: result.counts });
}
