"use client";

import { Compass, X } from "lucide-react";
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { availableSteps, readTourSeen, writeTourSeen, type TourStep } from "./tour-steps";

type Rect = { top: number; left: number; width: number; height: number };
type Placement = "right" | "bottom" | "left";

const GAP = 14;
const POPOVER_WIDTH = 340;
const PAD = 6;

function findTarget(target: string): HTMLElement | null {
  const list = document.querySelectorAll<HTMLElement>(`[data-tour="${target}"]`);
  for (const el of list) {
    const r = el.getBoundingClientRect();
    if (r.width > 0 && r.height > 0) return el;
  }
  return null;
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

export function Tour() {
  const [steps, setSteps] = useState<TourStep[] | null>(null);
  const [index, setIndex] = useState(0);
  const [rect, setRect] = useState<Rect | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const textId = useId();

  const open = useCallback(() => {
    const list = availableSteps((t) => findTarget(t) !== null);
    if (list.length === 0) return;
    setIndex(0);
    setSteps(list);
  }, []);

  const close = useCallback(() => {
    writeTourSeen(safeStorage());
    setSteps(null);
    setRect(null);
    triggerRef.current?.focus();
  }, []);

  // Primeira visita: abre sozinho.
  useEffect(() => {
    if (readTourSeen(safeStorage())) return;
    const timer = window.setTimeout(open, 700);
    return () => window.clearTimeout(timer);
  }, [open]);

  const step = steps?.[index];

  useLayoutEffect(() => {
    if (!step) return;
    const el = findTarget(step.target);
    if (!el) return;
    el.scrollIntoView({ block: "nearest" });
    const measure = () => {
      const r = el.getBoundingClientRect();
      setRect({ top: r.top, left: r.left, width: r.width, height: r.height });
    };
    measure();
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [step]);

  const hasRect = rect !== null;
  useEffect(() => {
    if (step && hasRect) dialogRef.current?.focus();
  }, [step, hasRect]);

  const total = steps?.length ?? 0;
  useEffect(() => {
    if (total === 0) return;
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
  }, [total, close]);

  if (!steps || !step) {
    return (
      <Button ref={triggerRef} variant="outline" size="sm" onClick={open} data-tour-trigger>
        <Compass aria-hidden strokeWidth={1.75} />
        Fazer o tour
      </Button>
    );
  }

  const last = index === steps.length - 1;
  const next = () => (last ? close() : setIndex((i) => i + 1));
  const prev = () => setIndex((i) => Math.max(i - 1, 0));

  const pos = rect ? place(rect) : null;

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
          <div className="mb-2 flex items-center justify-between gap-3">
            <p id={titleId} className="text-rotulo text-kyb-mudo">
              Passo {index + 1} de {steps.length}
            </p>
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
          <p className={cn("mt-3 text-secundario text-kyb-mudo")}>Setas avançam e voltam · Esc pula</p>
        </div>
      ) : null}
    </>
  );
}
