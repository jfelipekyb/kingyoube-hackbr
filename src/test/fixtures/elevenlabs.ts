// Fixtures da ElevenLabs para testes e modo sem chave: áudio fictício e tempos por caractere no formato do with-timestamps.
export const FIXTURE_AUDIO_BASE64 = Buffer.from("ID3-fixture-audio-kim").toString("base64");

/** Alinhamento sintético: cada caractere dura `step` segundos. */
export function fixtureAlignment(text: string, step = 0.06) {
  const characters = [...text];
  return {
    characters,
    character_start_times_seconds: characters.map((_, i) => Number((i * step).toFixed(3))),
    character_end_times_seconds: characters.map((_, i) => Number(((i + 1) * step).toFixed(3))),
  };
}

export interface FakeCall {
  url: string;
  init?: RequestInit;
}

/** fetch simulado da ElevenLabs: TTS with-timestamps devolve áudio + tempos; STT devolve `transcript`. */
export function fakeElevenLabs(transcript = "O que eu preciso decidir hoje?") {
  const calls: FakeCall[] = [];
  const fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, init });
    if (url.includes("/text-to-speech/") && url.includes("/with-timestamps")) {
      const { text } = JSON.parse(String(init?.body)) as { text: string };
      return Response.json({ audio_base64: FIXTURE_AUDIO_BASE64, alignment: fixtureAlignment(text), normalized_alignment: fixtureAlignment(text) });
    }
    if (url.endsWith("/speech-to-text")) return Response.json({ language_code: "por", language_probability: 0.99, text: transcript });
    return new Response("not found", { status: 404 });
  }) as typeof globalThis.fetch;
  return { fetch, calls };
}
