// Voz da Kim pela ElevenLabs (docs/05, docs/09): só no servidor. Sem chave, a Kim responde em texto, sem erro.
import { createHash } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { kimAudioCache, type CharAlignment } from "@/db/schema";
import type { Db } from "@/db/types";
import type { Env } from "@/lib/config";

export const ELEVENLABS_API = "https://api.elevenlabs.io/v1";
/** Melhor pronúncia em português; a latência fica no cache. Alternativa rápida: eleven_flash_v2_5. */
export const DEFAULT_TTS_MODEL = "eleven_multilingual_v2";
/** Scribe mais recente na documentação oficial (elevenlabs.io/docs/overview/models). */
export const DEFAULT_STT_MODEL = "scribe_v3";
export const OUTPUT_FORMAT = "mp3_44100_128";
export const STT_LANGUAGE = "pt";
export const MAX_SPEECH_CHARS = 1_000;
export const MAX_AUDIO_BYTES = 5 * 1024 * 1024;
const TIMEOUT_MS = 30_000;

export interface VoiceConfig {
  apiKey: string;
  voiceId: string;
  ttsModel: string;
  sttModel: string;
}

export interface VoiceDeps {
  db: Db;
  env?: Env;
  fetch?: typeof fetch;
}

export class VoiceError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

/** Configuração da voz, ou null sem ELEVENLABS_API_KEY/ELEVENLABS_VOICE_ID ("voz desligada"). */
export function voiceConfig(env: Env = process.env): VoiceConfig | null {
  const apiKey = env.ELEVENLABS_API_KEY?.trim();
  const voiceId = env.ELEVENLABS_VOICE_ID?.trim();
  if (!apiKey || !voiceId) return null;
  return { apiKey, voiceId, ttsModel: env.ELEVENLABS_TTS_MODEL?.trim() || DEFAULT_TTS_MODEL, sttModel: env.ELEVENLABS_STT_MODEL?.trim() || DEFAULT_STT_MODEL };
}

export const audioCacheKey = (text: string, voiceId: string, model: string) => createHash("sha256").update(`${model}\n${voiceId}\n${OUTPUT_FORMAT}\n${text}`).digest("hex");

export interface Speech {
  audioBase64: string;
  mime: string;
  alignment: CharAlignment | null;
  cached: boolean;
  model: string;
}

function parseAlignment(raw: unknown): CharAlignment | null {
  const a = raw as { characters?: unknown; character_start_times_seconds?: unknown; character_end_times_seconds?: unknown } | null;
  if (!a || !Array.isArray(a.characters) || !Array.isArray(a.character_start_times_seconds) || !Array.isArray(a.character_end_times_seconds)) return null;
  const n = a.characters.length;
  if (a.character_start_times_seconds.length !== n || a.character_end_times_seconds.length !== n) return null;
  const nums = (v: unknown[]) => v.map((x) => (typeof x === "number" && Number.isFinite(x) ? x : 0));
  return { characters: a.characters.map(String), starts: nums(a.character_start_times_seconds), ends: nums(a.character_end_times_seconds) };
}

/** Fala da Kim com os tempos de cada caractere (`with-timestamps`). Mesma frase + voz + modelo sai do cache, sem chamar a ElevenLabs. */
export async function synthesize(deps: VoiceDeps, text: string): Promise<Speech | null> {
  const cfg = voiceConfig(deps.env);
  if (!cfg) return null;
  const clean = text.trim();
  if (!clean || clean.length > MAX_SPEECH_CHARS) throw new VoiceError(400, "TEXTO_INVALIDO", `A fala precisa ter de 1 a ${MAX_SPEECH_CHARS} caracteres.`);
  const hash = audioCacheKey(clean, cfg.voiceId, cfg.ttsModel);
  const [hit] = await deps.db.select().from(kimAudioCache).where(eq(kimAudioCache.hash, hash));
  if (hit) {
    await deps.db.update(kimAudioCache).set({ hits: sql`${kimAudioCache.hits} + 1` }).where(eq(kimAudioCache.hash, hash));
    return { audioBase64: hit.audioBase64, mime: hit.mime, alignment: hit.alignment, cached: true, model: hit.model };
  }
  const url = `${ELEVENLABS_API}/text-to-speech/${encodeURIComponent(cfg.voiceId)}/with-timestamps?output_format=${OUTPUT_FORMAT}`;
  let res: Response;
  try {
    res = await (deps.fetch ?? fetch)(url, {
      method: "POST",
      headers: { "xi-api-key": cfg.apiKey, "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ text: clean, model_id: cfg.ttsModel }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    throw new VoiceError(502, "VOZ_INDISPONIVEL", "A voz da Kim não respondeu agora; a resposta segue em texto.");
  }
  if (!res.ok) throw new VoiceError(502, "VOZ_INDISPONIVEL", `A voz da Kim não respondeu agora (HTTP ${res.status}); a resposta segue em texto.`);
  const body = (await res.json().catch(() => null)) as { audio_base64?: unknown; alignment?: unknown; normalized_alignment?: unknown } | null;
  if (!body || typeof body.audio_base64 !== "string" || !body.audio_base64) throw new VoiceError(502, "VOZ_INDISPONIVEL", "A voz da Kim veio sem áudio; a resposta segue em texto.");
  const alignment = parseAlignment(body.alignment) ?? parseAlignment(body.normalized_alignment);
  const row = { hash, voiceId: cfg.voiceId, model: cfg.ttsModel, text: clean, mime: "audio/mpeg", audioBase64: body.audio_base64, alignment };
  await deps.db.insert(kimAudioCache).values(row).onConflictDoNothing();
  return { audioBase64: row.audioBase64, mime: row.mime, alignment, cached: false, model: cfg.ttsModel };
}

/** Pergunta falada → texto (Scribe, português). O áudio só passa pela memória: nada é gravado. */
export async function transcribe(deps: VoiceDeps, audio: Blob): Promise<string | null> {
  const cfg = voiceConfig(deps.env);
  if (!cfg) return null;
  if (audio.size === 0 || audio.size > MAX_AUDIO_BYTES) throw new VoiceError(400, "AUDIO_INVALIDO", "Grave de novo: o áudio veio vazio ou grande demais.");
  const form = new FormData();
  form.append("model_id", cfg.sttModel);
  form.append("language_code", STT_LANGUAGE);
  form.append("tag_audio_events", "false");
  form.append("file", audio, "pergunta.webm");
  let res: Response;
  try {
    res = await (deps.fetch ?? fetch)(`${ELEVENLABS_API}/speech-to-text`, { method: "POST", headers: { "xi-api-key": cfg.apiKey }, body: form, signal: AbortSignal.timeout(TIMEOUT_MS) });
  } catch {
    throw new VoiceError(502, "ESCUTA_INDISPONIVEL", "Não consegui ouvir agora. Use os botões ou digite a pergunta.");
  }
  if (!res.ok) throw new VoiceError(502, "ESCUTA_INDISPONIVEL", `Não consegui ouvir agora (HTTP ${res.status}). Use os botões ou digite a pergunta.`);
  const body = (await res.json().catch(() => null)) as { text?: unknown } | null;
  return typeof body?.text === "string" ? body.text.trim() : "";
}
