"use client";

import { Menu, SlidersHorizontal, X } from "lucide-react";
import { usePathname } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { cn } from "@/lib/utils";

/** Abaixo de 1024 px o menu lateral vira uma gaveta aberta pelo botão "Menu" (docs/10, responsivo). */
export function MobileMenu({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const panelId = useId();

  // Trocar de página fecha a gaveta.
  const [seenPath, setSeenPath] = useState(pathname);
  if (pathname !== seenPath) {
    setSeenPath(pathname);
    setOpen(false);
  }

  useEffect(() => {
    if (!open) return;
    panelRef.current?.querySelector<HTMLElement>("a,button")?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        setOpen(false);
        buttonRef.current?.focus();
      } else if (e.key === "Tab") {
        const nodes = panelRef.current?.querySelectorAll<HTMLElement>("a[href],button:not([disabled])");
        if (!nodes || nodes.length === 0) return;
        const first = nodes[0];
        const last = nodes[nodes.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open]);

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen(true)}
        aria-expanded={open}
        aria-controls={panelId}
        className="inline-flex h-9 items-center gap-1.5 rounded-kyb-botao border border-kyb-azul bg-kyb-branco px-2.5 text-sm font-semibold text-kyb-azul hover:bg-kyb-canvas-2 focus-visible:outline-2 focus-visible:outline-kyb-azul-2 lg:hidden"
      >
        <Menu aria-hidden className="size-4" strokeWidth={1.75} />
        Menu
      </button>
      <div className={cn("fixed inset-0 z-40 lg:hidden", open ? "block" : "hidden")}>
        <div
          className="absolute inset-0"
          style={{ background: "color-mix(in srgb, var(--kyb-azul) 60%, transparent)" }}
          onClick={() => setOpen(false)}
          aria-hidden
        />
        <div
          ref={panelRef}
          id={panelId}
          role="dialog"
          aria-modal="true"
          aria-label="Menu principal"
          className="kyb-entrada absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col gap-6 overflow-y-auto bg-kyb-azul px-3 py-5 text-kyb-branco"
          onClick={(e) => {
            if ((e.target as HTMLElement).closest("a")) setOpen(false);
          }}
        >
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              buttonRef.current?.focus();
            }}
            aria-label="Fechar o menu"
            className="absolute right-3 top-3 rounded-kyb-botao p-1.5 text-kyb-branco/80 hover:bg-kyb-azul-2 hover:text-kyb-branco focus-visible:outline-2 focus-visible:outline-kyb-verde"
          >
            <X aria-hidden className="size-5" strokeWidth={1.75} />
          </button>
          {children}
        </div>
      </div>
    </>
  );
}

/** Cliente, papel e data: em linha a partir de 1024 px; abaixo disso, num painel aberto pelo botão "Contexto". */
export function HeaderContext({ children, summary }: { children: React.ReactNode; summary: string }) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls={panelId}
        title={summary}
        className="inline-flex h-9 min-w-0 items-center gap-1.5 rounded-kyb-botao border border-kyb-linha bg-kyb-branco px-2.5 text-sm text-kyb-azul hover:border-kyb-azul focus-visible:outline-2 focus-visible:outline-kyb-azul-2 aria-expanded:bg-kyb-canvas-2 lg:hidden"
      >
        <SlidersHorizontal aria-hidden className="size-4 shrink-0" strokeWidth={1.75} />
        <span className="sr-only sm:not-sr-only">Cliente e papel</span>
      </button>
      <div
        id={panelId}
        className={cn(
          "order-last w-full flex-col gap-3 border-t border-kyb-linha pt-3",
          "lg:order-none lg:flex lg:w-auto lg:flex-row lg:flex-wrap lg:items-center lg:gap-x-6 lg:gap-y-2 lg:border-0 lg:pt-0",
          open ? "flex" : "hidden",
        )}
      >
        {children}
      </div>
    </>
  );
}
