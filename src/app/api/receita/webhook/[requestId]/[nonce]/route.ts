import { NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { clientIp } from "@/services/demo";
import { handleWebhookHead, handleWebhookPost } from "@/services/receita/webhook";
import { apuracaoDeps } from "../../../http";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ requestId: string; nonce: string }> };

export async function HEAD(_request: Request, { params }: Params) {
  const { requestId, nonce } = await params;
  return new NextResponse(null, { status: await handleWebhookHead(getDb(), requestId, nonce) });
}

export async function POST(request: Request, { params }: Params) {
  const { requestId, nonce } = await params;
  const deps = apuracaoDeps();
  if (deps instanceof NextResponse) return deps;
  const ip = clientIp(request.headers);
  const result = await handleWebhookPost(deps, {
    requestId,
    nonce,
    body: await request.text(),
    sourceIp: ip === "desconhecido" ? null : ip,
  });
  return NextResponse.json(result.body, { status: result.status });
}
