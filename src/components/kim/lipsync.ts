// Sincronia labial e legenda pelos tempos de cada caractere (ElevenLabs with-timestamps). Funções puras, testadas.
export interface Alignment {
  characters: string[];
  starts: number[];
  ends: number[];
}

const VOWEL = /[aeiouáàâãéêíóôõúü]/i;
const CLOSED = /[mbp]/i;

/** Abertura da boca de um caractere: vogal abre (1), m/b/p fecha (0), outra consoante entreabre, espaço e pontuação fecham. */
export function charOpenness(ch: string): number {
  if (VOWEL.test(ch)) return 1;
  if (CLOSED.test(ch)) return 0;
  if (/\p{L}/u.test(ch)) return 0.35;
  return 0;
}

/** Índice do caractere que soa no instante `t` (s), ou -1 fora da fala. */
export function charAt(a: Alignment, t: number): number {
  let lo = 0;
  let hi = a.starts.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (t < a.starts[mid]) hi = mid - 1;
    else if (t >= a.ends[mid]) lo = mid + 1;
    else return mid;
  }
  return -1;
}

/** Abertura da boca (0 a 1) no instante `t`. */
export function mouthOpenAt(a: Alignment | null, t: number): number {
  if (!a) return 0;
  const i = charAt(a, t);
  return i < 0 ? 0 : charOpenness(a.characters[i]);
}

/** Momentos em que a boca muda de abertura: [{ t, open }], começando fechada. */
export function mouthTimeline(a: Alignment): { t: number; open: number }[] {
  const out: { t: number; open: number }[] = [];
  let last = 0;
  for (let i = 0; i < a.characters.length; i++) {
    const open = charOpenness(a.characters[i]);
    if (open !== last) out.push({ t: a.starts[i], open });
    last = open;
    const nextStart = a.starts[i + 1];
    // Silêncio entre um caractere e o próximo (ou o fim): fecha.
    if (last !== 0 && (nextStart === undefined || nextStart > a.ends[i])) {
      out.push({ t: a.ends[i], open: 0 });
      last = 0;
    }
  }
  return out;
}

export interface WordTiming {
  word: string;
  start: number;
  end: number;
}

/** Palavras da fala com início e fim, para a legenda palavra a palavra. */
export function wordTimings(a: Alignment): WordTiming[] {
  const out: WordTiming[] = [];
  let cur: WordTiming | null = null;
  for (let i = 0; i < a.characters.length; i++) {
    const ch = a.characters[i];
    if (/\s/.test(ch)) {
      if (cur) out.push(cur);
      cur = null;
      continue;
    }
    if (!cur) cur = { word: ch, start: a.starts[i], end: a.ends[i] };
    else {
      cur.word += ch;
      cur.end = a.ends[i];
    }
  }
  if (cur) out.push(cur);
  return out;
}

/** Quantas palavras já foram ditas no instante `t` (inclui a que está soando). */
export function wordsSpokenAt(words: WordTiming[], t: number): number {
  let n = 0;
  for (const w of words) if (t >= w.start) n++;
  return n;
}

/** Fallback sem tempos: volume (RMS de amostras de -1 a 1) → abertura da boca. */
export function opennessFromVolume(samples: ArrayLike<number>, gain = 4): number {
  if (samples.length === 0) return 0;
  let sum = 0;
  for (let i = 0; i < samples.length; i++) sum += samples[i] * samples[i];
  const rms = Math.sqrt(sum / samples.length);
  const open = Math.min(1, rms * gain);
  return open < 0.08 ? 0 : open;
}
