"use client";

import { Compass, Volume2, VolumeX, X } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { pickTarget, planStep, readTourSeen, TOUR_STEPS, writeTourSeen } from "./tour-steps";

type Rect = { top: number; left: number; width: number; height: number };
type Placement = "right" | "bottom" | "left";

const GAP = 14;
const POPOVER_WIDTH = 340;
const PAD = 6;
const POLL_MS = 150;
const POLL_MAX = 40;

type Narration = { audio: string; mime: string } | "sem-voz";
type VoiceStatus = "carregando" | "sem-voz" | "erro" | null;

function findTarget(target: string): HTMLElement | null {
  const list = [...document.querySelectorAll<HTMLElement>(`[data-tour="${target}"]`)];
  return pickTarget(list, (el) => {
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  });
}

function safeStorage(): Storage | undefined {
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
}

function place(rect: Rect): { placement: Placement; top: number; left: number; width: number } {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const width = Math.min(POPOVER_WIDTH, vw - 24);
  const clampTop = (t: number) => Math.max(Math.min(t, vh - 220), 12);
  if (rect.left + rect.width + GAP + width < vw - 12) {
    return { placement: "right", top: clampTop(rect.top - 8), left: rect.left + rect.width + GAP, width };
  }
  if (rect.top + rect.height + GAP + 200 < vh) {
    const left = Math.max(Math.min(rect.left + rect.width - width, vw - width - 12), 12);
    return { placement: "bottom", top: rect.top + rect.height + GAP, left, width };
  }
  return { placement: "left", top: clampTop(rect.top - 8), left: Math.max(rect.left - GAP - width, 12), width };
}

function center(): { placement: Placement; top: number; left: number; width: number } {
  const width = Math.min(POPOVER_WIDTH, window.innerWidth - 24);
  return { placement: "bottom", top: Math.max(window.innerHeight / 2 - 120, 12), left: (window.innerWidth - width) / 2, width };
}

export function Tour() {
  const [active, setActive] = useState(false);
  const [index, setIndex] = useState(0);
  // Retângulo do alvo do passo `index`; `lost` = o alvo não apareceu, o balão fica no centro.
  const [found, setFound] = useState<{ index: number; rect: Rect } | null>(null);
  const [lostIndex, setLostIndex] = useState<number | null>(null);
  const [sound, setSound] = useState(false);
  const [voice, setVoice] = useState<{ index: number; status: VoiceStatus } | null>(null);
  const narrations = useRef(new Map<number, Narration>());
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const router = useRouter();
  const pathname = usePathname();
  const titleId = useId();
  const textId = useId();

  const open = useCallback(() => {
    setIndex(0);
    setFound(null);
    setLostIndex(null);
    setActive(true);
  }, []);

  const close = useCallback(() => {
    writeTourSeen(safeStorage());
    audioRef.current?.pause();
    setActive(false);
    setFound(null);
    triggerRef.current?.focus();
  }, []);

  // Primeira visita: abre sozinho, a partir da tela em que a pessoa chegou.
  useEffect(() => {
    if (readTourSeen(safeStorage())) return;
    const timer = window.setTimeout(open, 700);
    return () => window.clearTimeout(timer);
  }, [open]);

  const step = active ? TOUR_STEPS[index] : undefined;
  const rect = found && found.index === index ? found.rect : null;
  const lost = lostIndex === index;

  // Acha o alvo do passo; se ele é de outra tela, navega até ela e espera a tela carregar.
  useLayoutEffect(() => {
    if (!step) return;
    let timer: number | undefined;
    let tries = 0;
    let navigated = false;
    let detach: (() => void) | undefined;
    const attach = (el: HTMLElement) => {
      el.scrollIntoView({ block: "center" });
      const measure = () => {
        const r = el.getBoundingClientRect();
        setFound({ index, rect: { top: r.top, left: r.left, width: r.width, height: r.height } });
      };
      measure();
      window.addEventListener("resize", measure);
      window.addEventListener("scroll", measure, true);
      detach = () => {
        window.removeEventListener("resize", measure);
        window.removeEventListener("scroll", measure, true);
      };
    };
    const attempt = () => {
      const plan = planStep(step, window.location.pathname, (t) => findTarget(t) !== null);
      if (plan.kind === "show") {
        const el = findTarget(plan.target);
        if (el) return attach(el);
      }
      if (plan.kind === "navigate" && !navigated) {
        navigated = true;
        router.push(plan.href);
      }
      if (++tries > POLL_MAX) return setLostIndex(index);
      timer = window.setTimeout(attempt, POLL_MS);
    };
    attempt();
    return () => {
      window.clearTimeout(timer);
      detach?.();
    };
  }, [step, index, router, pathname]);

  // Narração opcional: som desligado por padrão; o áudio vem do cache (servidor e memória da página).
  const shown = rect !== null || lost;
  useEffect(() => {
    if (!active || !sound || !shown) return;
    let cancelled = false;
    const playClip = (n: Narration) => {
      if (cancelled) return;
      if (n === "sem-voz") return setVoice({ index, status: "sem-voz" });
      setVoice({ index, status: null });
      const audio = new Audio(`data:${n.mime};base64,${n.audio}`);
      audioRef.current = audio;
      audio.play().catch(() => setVoice({ index, status: "erro" }));
    };
    const cached = narrations.current.get(index);
    if (cached) playClip(cached);
    else {
      setVoice({ index, status: "carregando" });
      fetch("/api/tour/falar", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ passo: index + 1 }) })
        .then(async (r) => {
          const body = (await r.json().catch(() => null)) as { vozLigada?: boolean; audio?: string; mime?: string } | null;
          if (!r.ok || !body) throw new Error("voz");
          const n: Narration = body.vozLigada && body.audio && body.mime ? { audio: body.audio, mime: body.mime } : "sem-voz";
          narrations.current.set(index, n);
          playClip(n);
        })
        .catch(() => !cancelled && setVoice({ index, status: "erro" }));
    }
    return () => {
      cancelled = true;
      audioRef.current?.pause();
      audioRef.current = null;
    };
  }, [active, sound, shown, index]);

  useEffect(() => {
    if (step && shown) dialogRef.current?.focus();
  }, [step, shown]);

  const total = TOUR_STEPS.length;
  useEffect(() => {
    if (!active) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        close();
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        setIndex((i) => {
          if (i < total - 1) return i + 1;
          window.setTimeout(close, 0);
          return i;
        });
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        setIndex((i) => Math.max(i - 1, 0));
      } else if (e.key === "Tab") {
        // Foco preso no balão.
        const dialog = dialogRef.current;
        const nodes = dialog?.querySelectorAll<HTMLElement>("button:not([disabled])");
        if (!dialog || !nodes || nodes.length === 0) return;
        const first = nodes[0];
        const lastNode = nodes[nodes.length - 1];
        const active = document.activeElement;
        const inside = active instanceof Node && dialog.contains(active);
        if (e.shiftKey && (!inside || active === first || active === dialog)) {
          e.preventDefault();
          lastNode.focus();
        } else if (!e.shiftKey && (!inside || active === lastNode)) {
          e.preventDefault();
          first.focus();
        }
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [active, total, close]);

  if (!step) {
    return (
      <Button ref={triggerRef} variant="outline" size="sm" onClick={open} data-tour-trigger>
        <Compass aria-hidden strokeWidth={1.75} />
        Fazer o tour
      </Button>
    );
  }

  const last = index === total - 1;
  const next = () => (last ? close() : setIndex((i) => i + 1));
  const prev = () => setIndex((i) => Math.max(i - 1, 0));

  const pos = rect ? place(rect) : lost ? center() : null;
  const voiceStatus = sound && voice?.index === index ? voice.status : null;

  return (
    <>
      <Button ref={triggerRef} variant="outline" size="sm" onClick={open} data-tour-trigger aria-expanded>
        <Compass aria-hidden strokeWidth={1.75} />
        Fazer o tour
      </Button>
      <div className="fixed inset-0 z-50" onClick={close} aria-hidden data-tour-overlay>
        {rect ? (
          <div
            className="absolute rounded-kyb-botao outline-2 outline-kyb-verde transition-[top,left,width,height] duration-150 ease-kyb"
            style={{
              top: rect.top - PAD,
              left: rect.left - PAD,
              width: rect.width + PAD * 2,
              height: rect.height + PAD * 2,
              boxShadow: "0 0 0 9999px color-mix(in srgb, var(--kyb-azul) 60%, transparent)",
            }}
          />
        ) : (
          <div className="absolute inset-0" style={{ background: "color-mix(in srgb, var(--kyb-azul) 60%, transparent)" }} />
        )}
      </div>
      {pos ? (
        <div
          key={step.target}
          ref={dialogRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          aria-describedby={textId}
          tabIndex={-1}
          data-placement={pos.placement}
          className="kyb-entrada kyb-balao-tour fixed z-50 rounded-kyb border border-kyb-linha bg-kyb-branco p-5 text-kyb-azul shadow-kyb outline-none"
          style={{ top: pos.top, left: pos.left, width: pos.width }}
        >
          <div className="mb-2 flex items-center gap-2">
            <p id={titleId} className="text-rotulo text-kyb-mudo">
              Passo {index + 1} de {total}
            </p>
            <button
              type="button"
              onClick={() => setSound((v) => !v)}
              aria-pressed={sound}
              aria-label={sound ? "Desligar a narração da Kim" : "Ligar a narração da Kim"}
              title={sound ? "Narração da Kim ligada" : "Narração da Kim desligada"}
              className="ml-auto rounded-kyb-botao p-1 text-kyb-mudo hover:bg-kyb-canvas-2 hover:text-kyb-azul focus-visible:outline-2 focus-visible:outline-kyb-azul-2 aria-pressed:text-kyb-azul"
            >
              {sound ? <Volume2 aria-hidden className="size-4" strokeWidth={1.75} /> : <VolumeX aria-hidden className="size-4" strokeWidth={1.75} />}
            </button>
            <button
              type="button"
              onClick={close}
              aria-label="Fechar o tour"
              className="rounded-kyb-botao p-1 text-kyb-mudo hover:bg-kyb-canvas-2 hover:text-kyb-azul focus-visible:outline-2 focus-visible:outline-kyb-azul-2"
            >
              <X aria-hidden className="size-4" strokeWidth={1.75} />
            </button>
          </div>
          <p id={textId} className="text-[15px] leading-relaxed" aria-live="polite">
            {step.text}
          </p>
          {voiceStatus ? (
            <p className="mt-2 text-secundario text-kyb-mudo" role="status">
              {voiceStatus === "carregando"
                ? "Carregando a voz da Kim…"
                : voiceStatus === "sem-voz"
                  ? "Voz desligada nesta instalação: siga pelo texto."
                  : "A voz não tocou agora. Siga pelo texto ou desligue o som."}
            </p>
          ) : null}
          <div className="mt-4 flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={close}>
              Pular
            </Button>
            <div className="ml-auto flex gap-2">
              <Button variant="outline" size="sm" onClick={prev} disabled={index === 0}>
                Voltar
              </Button>
              <Button size="sm" onClick={next}>
                {last ? "Concluir" : "Próximo"}
              </Button>
            </div>
          </div>
          <p className={cn("mt-3 text-secundario text-kyb-mudo")}>Setas avançam e voltam · Esc pula · som desligado por padrão</p>
        </div>
      ) : null}
    </>
  );
}
