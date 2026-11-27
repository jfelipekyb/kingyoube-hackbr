import { NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { transcribe, voiceConfig } from "@/services/kim/voz";
import { limitKim, voiceErrorResponse } from "../http";

export const dynamic = "force-dynamic";

/** Pergunta falada (multipart `audio`) → texto reconhecido. O áudio não é gravado em lugar nenhum. */
export async function POST(request: Request) {
  const limited = await limitKim(request, "kim.ouvir");
  if (limited) return limited;
  if (!voiceConfig()) return NextResponse.json({ vozLigada: false, texto: null, aviso: "voz desligada" });
  let audio: FormDataEntryValue | null;
  try {
    audio = (await request.formData()).get("audio");
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
