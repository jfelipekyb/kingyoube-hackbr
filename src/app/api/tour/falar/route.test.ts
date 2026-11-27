import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { TOUR_STEPS } from "@/components/shell/tour-steps";
import type { Db } from "@/db/types";
import { createTestDb } from "@/test/db";
import { fakeElevenLabs, FIXTURE_AUDIO_BASE64 } from "@/test/fixtures/elevenlabs";

let db: Db;
let close: () => Promise<void>;
vi.mock("@/db/client", () => ({ getDb: () => db }));
const falar = await import("./route");

let ip = 0;
const json = (body: unknown) =>
  new Request("http://localhost/api/tour/falar", { method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": `10.0.9.${++ip}` }, body: JSON.stringify(body) });

beforeAll(async () => {
  ({ db, close } = await createTestDb());
}, 120_000);
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
afterAll(() => close());

describe("narração do tour", () => {
  it("sem chave: voz desligada, sem erro e sem chamar a ElevenLabs", async () => {
    vi.stubEnv("ELEVENLABS_API_KEY", "");
    const fake = fakeElevenLabs();
    vi.stubGlobal("fetch", fake.fetch);
    const r = await falar.POST(json({ passo: 1 }));
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ vozLigada: false, aviso: "voz desligada" });
    expect(fake.calls).toHaveLength(0);
  });

  it("fala só a frase fixa do passo e a segunda vez sai do cache", async () => {
    vi.stubEnv("ELEVENLABS_API_KEY", "chave-de-teste");
    vi.stubEnv("ELEVENLABS_VOICE_ID", "voz-teste");
    const fake = fakeElevenLabs();
    vi.stubGlobal("fetch", fake.fetch);
    const first = await (await falar.POST(json({ passo: 4 }))).json();
    expect(first).toMatchObject({ vozLigada: true, audio: FIXTURE_AUDIO_BASE64, mime: "audio/mpeg", cache: false });
    expect(JSON.parse(String(fake.calls[0].init?.body)).text).toBe(TOUR_STEPS[3].text);
    expect(await (await falar.POST(json({ passo: 4 }))).json()).toMatchObject({ cache: true });
    expect(fake.calls).toHaveLength(1);
  });

  it("não aceita texto livre nem passo fora de 1 a 8", async () => {
    for (const body of [{ texto: "qualquer coisa" }, { passo: 0 }, { passo: 9 }, { passo: 2.5 }, { passo: "1" }]) {
      expect((await falar.POST(json(body))).status).toBe(400);
    }
  });
});
