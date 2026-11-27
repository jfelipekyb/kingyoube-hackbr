"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { mouthOpenAt, opennessFromVolume, wordsSpokenAt, wordTimings, type Alignment, type WordTiming } from "./lipsync";

export interface SpeechClip {
  audio: string;
  mime: string;
  alinhamento: Alignment | null;
}

const BLINK_EVERY_S = 3.2;
const BLINK_S = 0.12;

function prefersReducedMotion() {
  return typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
}

/** Toca a fala da Kim e devolve, a cada quadro, a abertura da boca, o piscar e quantas palavras da legenda já foram ditas. */
export function useKimSpeech() {
  const [mouth, setMouth] = useState(0);
  const [blink, setBlink] = useState(false);
  const [spoken, setSpoken] = useState<number | null>(null);
  const [words, setWords] = useState<WordTiming[] | null>(null);
  const [playing, setPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);

  const stop = useCallback(() => {
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    audioRef.current?.pause();
    audioRef.current = null;
    void ctxRef.current?.close().catch(() => {});
    ctxRef.current = null;
    setPlaying(false);
    setMouth(0);
    setBlink(false);
  }, []);

  useEffect(() => stop, [stop]);

  const play = useCallback(
    (clip: SpeechClip): Promise<void> => {
      stop();
      const reduced = prefersReducedMotion();
      const w = clip.alinhamento ? wordTimings(clip.alinhamento) : null;
      setWords(w);
      setSpoken(w ? 0 : null);
      const audio = new Audio(`data:${clip.mime};base64,${clip.audio}`);
      audioRef.current = audio;
      let analyser: AnalyserNode | null = null;
      let samples: Float32Array<ArrayBuffer> | null = null;
      if (!clip.alinhamento && !reduced && typeof AudioContext !== "undefined") {
        // Sem tempos: a boca segue o volume do áudio (Web Audio).
        const ctx = new AudioContext();
        ctxRef.current = ctx;
        analyser = ctx.createAnalyser();
        analyser.fftSize = 512;
        samples = new Float32Array(analyser.fftSize);
        ctx.createMediaElementSource(audio).connect(analyser);
        analyser.connect(ctx.destination);
      }
      const tick = () => {
        const t = audio.currentTime;
        if (w) setSpoken(wordsSpokenAt(w, t));
        if (reduced) setMouth(0.3);
        else if (clip.alinhamento) setMouth(mouthOpenAt(clip.alinhamento, t));
        else if (analyser && samples) {
          analyser.getFloatTimeDomainData(samples);
          setMouth(opennessFromVolume(samples));
        }
        setBlink(!reduced && t % BLINK_EVERY_S < BLINK_S && t > 1);
        rafRef.current = requestAnimationFrame(tick);
      };
      return new Promise<void>((resolve) => {
        const done = () => {
          if (w) setSpoken(w.length);
          stop();
          resolve();
        };
        audio.addEventListener("ended", done, { once: true });
        audio.addEventListener("error", done, { once: true });
        setPlaying(true);
        audio.play().then(() => (rafRef.current = requestAnimationFrame(tick)), done);
      });
    },
    [stop],
  );

  return { play, stop, mouth, blink, playing, words, spoken };
}
