import { NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { MAX_AUDIO_BYTES, transcribe, voiceConfig } from "@/services/kim/voz";
import { limitKim, voiceErrorResponse } from "../http";

export const dynamic = "force-dynamic";

// Áudio de até MAX_AUDIO_BYTES + folga do multipart; o corpo é lido aos pedaços e cortado no limite.
const MAX_BODY = MAX_AUDIO_BYTES + 64 * 1024;
const tooLarge = () => NextResponse.json({ erro: "áudio grande demais (máximo 5 MB)" }, { status: 413 });

async function readBounded(request: Request): Promise<Uint8Array<ArrayBuffer> | null> {
  if (!request.body) return new Uint8Array(new ArrayBuffer(0));
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_BODY) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  const out = new Uint8Array(new ArrayBuffer(size));
  let at = 0;
  for (const c of chunks) {
    out.set(c, at);
    at += c.byteLength;
  }
  return out;
}

/** Pergunta falada (multipart `audio`) → texto reconhecido. O áudio não é gravado em lugar nenhum. */
export async function POST(request: Request) {
  const limited = await limitKim(request, "kim.ouvir");
  if (limited) return limited;
  if (!voiceConfig()) return NextResponse.json({ vozLigada: false, texto: null, aviso: "voz desligada" });
  const declared = Number(request.headers.get("content-length") ?? "0");
  if (declared > MAX_BODY) return tooLarge();
  const body = await readBounded(request);
  if (!body) return tooLarge();
  let audio: FormDataEntryValue | null;
  try {
    audio = (await new Response(body, { headers: { "content-type": request.headers.get("content-type") ?? "" } }).formData()).get("audio");
  } catch {
    return NextResponse.json({ erro: "envie o áudio no campo audio (multipart)" }, { status: 400 });
  }
  if (!(audio instanceof Blob)) return NextResponse.json({ erro: "envie o áudio no campo audio (multipart)" }, { status: 400 });
  try {
    return NextResponse.json({ vozLigada: true, texto: await transcribe({ db: getDb() }, audio) });
  } catch (e) {
    return voiceErrorResponse(e);
  }
}
