"use client";

import type { WordTiming } from "./lipsync";

/** Legenda da resposta: palavra a palavra enquanto a Kim fala (tempos do with-timestamps); sem tempos, o texto inteiro. */
export function KimCaption({ text, words, spoken }: { text: string; words: WordTiming[] | null; spoken: number | null }) {
  if (!words || spoken === null) return <p className="text-lg leading-relaxed">{text}</p>;
  return (
    <p className="text-lg leading-relaxed">
      <span className="sr-only">{text}</span>
      {words.map((w, i) => (
        <span key={i} aria-hidden="true" className={i < spoken ? (i === spoken - 1 ? "font-semibold text-[var(--kyb-azul)]" : "") : "opacity-0"}>
          {w.word}{" "}
        </span>
      ))}
    </p>
  );
}
