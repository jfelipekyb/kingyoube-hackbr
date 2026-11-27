import { sql } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import * as s from "@/db/schema";
import type { Db } from "@/db/types";
import { seedDemo } from "@/seed/seed";
import { createTestDb } from "@/test/db";
import { fakeElevenLabs, FIXTURE_AUDIO_BASE64 } from "@/test/fixtures/elevenlabs";

let db: Db;
let close: () => Promise<void>;
vi.mock("@/db/client", () => ({ getDb: () => db }));
const ouvir = await import("./ouvir/route");
const perguntar = await import("./perguntar/route");
const falar = await import("./falar/route");

let ip = 0;
const json = (body: unknown, from = `10.0.0.${++ip}`) =>
  new Request("http://localhost/api/kim", { method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": from }, body: JSON.stringify(body) });
const audioRequest = (from = `10.0.1.${++ip}`) => {
  const form = new FormData();
  form.append("audio", new Blob([new Uint8Array([1, 2, 3, 4])], { type: "audio/webm" }), "pergunta.webm");
  return new Request("http://localhost/api/kim/ouvir", { method: "POST", headers: { "x-forwarded-for": from }, body: form });
};
const consulta = async (texto: string) => ((await (await perguntar.POST(json({ texto }))).json()) as { consulta: string }).consulta;
const HELP = "Ainda não sei responder isso. Posso dizer o que precisa de decisão hoje, quanto crédito está travado ou se os fornecedores foram cobrados.";
const keys = () => {
  vi.stubEnv("ELEVENLABS_API_KEY", "chave-de-teste");
  vi.stubEnv("ELEVENLABS_VOICE_ID", "voz-teste");
};

beforeAll(async () => {
  ({ db, close } = await createTestDb());
  await seedDemo(db, { demoToday: "2026-11-20" });
}, 120_000);
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
afterAll(() => close());

describe("rotas da Kim sem chave da ElevenLabs", () => {
  it("perguntar responde em texto; falar e ouvir devolvem 'voz desligada' sem erro e sem chamar nada", async () => {
    vi.stubEnv("ELEVENLABS_API_KEY", "");
    vi.stubEnv("ELEVENLABS_VOICE_ID", "");
    const net = vi.fn();
    vi.stubGlobal("fetch", net);
    const r = await perguntar.POST(json({ texto: "Kim, aprova a guia", modo: "texto" }));
    expect(r.status).toBe(200);
    expect(await r.json()).toMatchObject({ intencao: "acao_proibida", vozLigada: false, legenda: expect.stringContaining("não aprovo") });
    const f = await falar.POST(json({ consulta: await consulta("Olá") }));
    expect(f.status).toBe(200);
    expect(await f.json()).toEqual({ vozLigada: false, aviso: "voz desligada" });
    const o = await ouvir.POST(audioRequest());
    expect(o.status).toBe(200);
    expect(await o.json()).toMatchObject({ vozLigada: false, texto: null });
    expect(net).not.toHaveBeenCalled();
  });

  it("cada pergunta vai para kim_queries e para a auditoria com modo, texto reconhecido, intenção e resposta — sem áudio", async () => {
    const r = await (await perguntar.POST(json({ texto: "Quanto crédito está travado?", modo: "voz" }))).json();
    const [q] = await db.select().from(s.kimQueries).where(sql`${s.kimQueries.recognizedText} = 'Quanto crédito está travado?'`);
    expect(q).toMatchObject({ inputMode: "voz", intent: "credito_travado", answerText: r.legenda });
    expect(q.userId).not.toBeNull();
    expect(Object.keys(q).some((k) => /audio|audio/i.test(k))).toBe(false);
    const [audit] = await db.select().from(s.auditLog).where(sql`${s.auditLog.entityId} = ${q.id}`);
    expect(audit).toMatchObject({ action: "kim.pergunta", entity: "kim_query", result: "credito_travado", details: { modo: "voz", pergunta: "Quanto crédito está travado?", resposta: r.legenda } });
    expect(JSON.stringify(audit.details)).not.toMatch(/audio|base64/i);
  });

  it("pergunta vazia ou longa demais → 400", async () => {
    expect((await perguntar.POST(json({ texto: "  " }))).status).toBe(400);
    expect((await perguntar.POST(json({ texto: "a".repeat(501) }))).status).toBe(400);
  });
});

describe("rotas da Kim com ElevenLabs (fetch simulado)", () => {
  it("falar usa with-timestamps com eleven_multilingual_v2 por padrão, devolve áudio + tempos e a mesma frase sai do cache", async () => {
    keys();
    const fake = fakeElevenLabs();
    vi.stubGlobal("fetch", fake.fetch);
    const id = await consulta("Qual a cor do céu?");
    const r = await falar.POST(json({ consulta: id }));
    expect(r.status).toBe(200);
    const body = await r.json();
    expect(body).toMatchObject({ vozLigada: true, audio: FIXTURE_AUDIO_BASE64, mime: "audio/mpeg", cache: false, modelo: "eleven_multilingual_v2" });
    expect(body.alinhamento.characters.join("")).toBe(HELP);
    expect(body.alinhamento.starts).toHaveLength([...HELP].length);
    expect(fake.calls).toHaveLength(1);
    expect(fake.calls[0].url).toBe("https://api.elevenlabs.io/v1/text-to-speech/voz-teste/with-timestamps?output_format=mp3_44100_128");
    expect(JSON.parse(String(fake.calls[0].init?.body))).toEqual({ text: HELP, model_id: "eleven_multilingual_v2" });
    const again = await (await falar.POST(json({ consulta: await consulta("Qual a capital da França?") }))).json();
    expect(again).toMatchObject({ cache: true, audio: FIXTURE_AUDIO_BASE64 });
    expect(fake.calls).toHaveLength(1);
    // Outro modelo é outra entrada do cache (hash = texto + voz + modelo).
    vi.stubEnv("ELEVENLABS_TTS_MODEL", "eleven_flash_v2_5");
    expect(await (await falar.POST(json({ consulta: id }))).json()).toMatchObject({ cache: false, modelo: "eleven_flash_v2_5" });
    expect(fake.calls).toHaveLength(2);
    expect((await db.select({ n: sql<number>`count(*)::int` }).from(s.kimAudioCache))[0].n).toBe(2);
  });

  it("ouvir manda o áudio ao Scribe mais recente (scribe_v3) em português e não grava o áudio", async () => {
    keys();
    const fake = fakeElevenLabs("O que eu preciso decidir hoje?");
    vi.stubGlobal("fetch", fake.fetch);
    const r = await ouvir.POST(audioRequest());
    expect(await r.json()).toEqual({ vozLigada: true, texto: "O que eu preciso decidir hoje?" });
    const form = fake.calls[0].init?.body as FormData;
    expect(fake.calls[0].url).toBe("https://api.elevenlabs.io/v1/speech-to-text");
    expect(form.get("model_id")).toBe("scribe_v3");
    expect(form.get("language_code")).toBe("pt");
    expect((fake.calls[0].init?.headers as Record<string, string>)["xi-api-key"]).toBe("chave-de-teste");
  });

  it("ElevenLabs fora do ar → 502 com mensagem, sem vazar a chave", async () => {
    keys();
    vi.stubGlobal("fetch", async () => new Response("erro", { status: 500 }));
    const r = await falar.POST(json({ consulta: await consulta("Kim, aprova a guia") }));
    expect(r.status).toBe(502);
    const text = await r.text();
    expect(text).toContain("VOZ_INDISPONIVEL");
    expect(text).not.toContain("chave-de-teste");
  });
});

describe("falar e ouvir não aceitam qualquer coisa", () => {
  it("falar só sintetiza a resposta de uma consulta recente, nunca texto livre", async () => {
    keys();
    const net = vi.fn();
    vi.stubGlobal("fetch", net);
    expect((await falar.POST(json({ texto: "qualquer texto para gastar a cota" }))).status).toBe(400);
    expect((await falar.POST(json({ consulta: "00000000-0000-4000-8000-000000000000" }))).status).toBe(404);
    expect(net).not.toHaveBeenCalled();
  });

  it("ouvir recusa corpo maior que o limite sem ler tudo (413)", async () => {
    keys();
    const big = new Uint8Array(6 * 1024 * 1024);
    const r = await ouvir.POST(new Request("http://localhost/api/kim/ouvir", { method: "POST", headers: { "x-forwarded-for": "10.9.9.9", "content-type": "multipart/form-data; boundary=x" }, body: big }));
    expect(r.status).toBe(413);
  });
});

describe("rate limit por IP nas rotas da Kim", () => {
  it("perguntar: a 31ª pergunta do mesmo IP no mesmo minuto → 429 com Retry-After", async () => {
    const from = "192.0.2.77";
    for (let i = 0; i < 30; i++) expect((await perguntar.POST(json({ texto: "Ajuda" }, from))).status).toBe(200);
    const r = await perguntar.POST(json({ texto: "Ajuda" }, from));
    expect(r.status).toBe(429);
    expect(Number(r.headers.get("Retry-After"))).toBeGreaterThan(0);
    expect((await perguntar.POST(json({ texto: "Ajuda" }, "192.0.2.78"))).status).toBe(200);
  });
});
