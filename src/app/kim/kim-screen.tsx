"use client";

import { Mic, Send, Square, Volume2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { KimAvatar, type KimState } from "@/components/kim/kim-avatar";
import { KimCaption } from "@/components/kim/kim-caption";
import { useKimSpeech } from "@/components/kim/use-kim-speech";
import { Button } from "@/components/ui/button";

export const PRESETS = ["O que eu preciso decidir hoje?", "Quanto crédito está travado?", "Por que a Padaria Boa Massa?", "Os fornecedores foram cobrados?"];
type Mode = "voz" | "botao" | "texto";

async function post(url: string, body: BodyInit, json = true) {
  const r = await fetch(url, { method: "POST", body, headers: json ? { "content-type": "application/json" } : undefined });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.erro ?? "A Kim não conseguiu responder agora.");
  return data;
}

/** Onda sonora: barras que acompanham a abertura da boca enquanto a Kim fala. */
function Wave({ level, active }: { level: number; active: boolean }) {
  const bars = [0.5, 0.8, 1, 0.8, 0.5];
  return (
    <div aria-hidden="true" className="flex h-8 items-center gap-1">
      {bars.map((k, i) => (
        <span key={i} className="w-1.5 rounded-full bg-[var(--kyb-verde)]" style={{ height: `${active ? 6 + level * k * 26 : 4}px` }} />
      ))}
    </div>
  );
}

export function KimScreen({ voiceOn, initialQuestion }: { voiceOn: boolean; initialQuestion?: string }) {
  const [state, setState] = useState<KimState>("parado");
  const [question, setQuestion] = useState<string | null>(null);
  const [answer, setAnswer] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const recorder = useRef<MediaRecorder | null>(null);
  const speech = useKimSpeech();
  const busy = state === "pensando" || state === "falando";

  const ask = useCallback(
    async (text: string, mode: Mode) => {
      speech.stop();
      setError(null);
      setQuestion(text);
      setAnswer(null);
      setState("pensando");
      try {
        const a = await post("/api/kim/perguntar", JSON.stringify({ texto: text, modo: mode }));
        setAnswer(a.legenda);
        if (a.vozLigada) {
          const f = await post("/api/kim/falar", JSON.stringify({ consulta: a.consulta }));
          if (f.vozLigada) {
            setState("falando");
            await speech.play({ audio: f.audio, mime: f.mime, alinhamento: f.alinhamento });
          }
        }
      } catch (e) {
        setError((e as Error).message);
      }
      setState("parado");
    },
    [speech],
  );

  const replay = useCallback(async () => {
    if (!speech.blocked) return;
    setState("falando");
    await speech.play(speech.blocked);
    setState("parado");
  }, [speech]);

  // Saiu da tela no meio da gravação: desliga o microfone sem mandar o áudio.
  useEffect(
    () => () => {
      const rec = recorder.current;
      if (!rec) return;
      rec.onstop = null;
      if (rec.state !== "inactive") rec.stop();
      rec.stream.getTracks().forEach((t) => t.stop());
      recorder.current = null;
    },
    [],
  );

  const asked = useRef(false);
  useEffect(() => {
    if (initialQuestion && !asked.current) {
      asked.current = true;
      void ask(initialQuestion, "botao");
    }
  }, [initialQuestion, ask]);

  async function toggleMic() {
    if (recorder.current) {
      recorder.current.stop();
      return;
    }
    setError(null);
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      setError("Sem acesso ao microfone. Use os botões ou o campo de texto.");
      return;
    }
    const chunks: Blob[] = [];
    const rec = new MediaRecorder(stream);
    recorder.current = rec;
    rec.ondataavailable = (e) => chunks.push(e.data);
    rec.onstop = async () => {
      stream.getTracks().forEach((t) => t.stop());
      recorder.current = null;
      setState("pensando");
      const form = new FormData();
      form.append("audio", new Blob(chunks, { type: rec.mimeType }), "pergunta");
      try {
        const o = await post("/api/kim/ouvir", form, false);
        if (o.texto) await ask(o.texto, "voz");
        else {
          setError("Não entendi o áudio. Tente de novo ou escreva a pergunta.");
          setState("parado");
        }
      } catch (e) {
        setError((e as Error).message);
        setState("parado");
      }
    };
    rec.start();
    setState("ouvindo");
  }

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,320px)_minmax(0,1fr)]">
      <section className="flex flex-col items-center gap-4 rounded-[var(--kyb-raio)] border border-[var(--kyb-linha)] bg-[var(--kyb-branco)] p-6">
        <KimAvatar state={state} mouth={speech.mouth} blink={speech.blink} />
        <Wave level={speech.mouth} active={state === "falando"} />
        <p className="text-sm text-[var(--kyb-mudo)]" aria-live="polite">
          {state === "ouvindo" ? "Ouvindo… toque de novo para enviar." : state === "pensando" ? "Pensando…" : state === "falando" ? "Falando…" : "Pronta para ouvir."}
        </p>
        <Button size="lg" className="h-16 w-16 rounded-full" onClick={toggleMic} disabled={!voiceOn || busy} aria-label={state === "ouvindo" ? "Parar e enviar a pergunta" : "Falar com a Kim"}>
          {state === "ouvindo" ? <Square aria-hidden="true" /> : <Mic aria-hidden="true" />}
        </Button>
        {!voiceOn && <p className="text-center text-sm text-[var(--kyb-mudo)]">Voz desligada nesta instalação: a Kim responde em texto, com legenda.</p>}
      </section>
      <section className="flex flex-col gap-4">
        <div className="flex flex-wrap gap-2">
          {PRESETS.map((p) => (
            <Button key={p} variant="outline" className="h-auto min-h-9 max-w-full py-1.5 text-left whitespace-normal" onClick={() => ask(p, "botao")} disabled={busy || state === "ouvindo"}>
              {p}
            </Button>
          ))}
        </div>
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (draft.trim()) void ask(draft.trim(), "texto");
            setDraft("");
          }}
        >
          <label htmlFor="kim-pergunta" className="sr-only">
            Pergunta para a Kim
          </label>
          <input
            id="kim-pergunta"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            maxLength={500}
            placeholder="Escreva sua pergunta"
            className="h-10 min-w-0 flex-1 rounded-[var(--kyb-raio-botao)] border border-[var(--kyb-linha)] bg-[var(--kyb-branco)] px-3"
          />
          <Button type="submit" disabled={busy || !draft.trim()}>
            <Send aria-hidden="true" /> Perguntar
          </Button>
        </form>
        <div className="min-h-40 rounded-[var(--kyb-raio)] border border-[var(--kyb-linha)] bg-[var(--kyb-branco)] p-6" aria-live="polite">
          {question && (
            <p className="mb-3 text-sm text-[var(--kyb-mudo)]">
              <span className="font-semibold">Você:</span> {question}
            </p>
          )}
          {answer ? (
            <div>
              <p className="mb-1 text-sm font-semibold">Kim:</p>
              <KimCaption text={answer} words={state === "falando" ? speech.words : null} spoken={state === "falando" ? speech.spoken : null} />
            </div>
          ) : (
            !question && <p className="text-[var(--kyb-mudo)]">Pergunte o que precisa de decisão hoje. Os números vêm da base, pela regra.</p>
          )}
          {speech.blocked && state === "parado" && (
            <Button variant="outline" className="mt-3" onClick={replay}>
              <Volume2 aria-hidden="true" /> Ouvir a resposta
            </Button>
          )}
          {error && <p className="mt-3 text-sm text-[var(--kyb-erro)]" role="alert">{error}</p>}
        </div>
        <p className="text-sm text-[var(--kyb-mudo)]">A Kim explica e fala, mas não aprova, não recusa e não gera guia. A decisão é sua, na tela.</p>
      </section>
    </div>
  );
}
