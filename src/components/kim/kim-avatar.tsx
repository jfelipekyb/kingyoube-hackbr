"use client";

// Avatar 2D da Kim (docs/11, seção 5): ilustração própria em SVG, Azul Comando e Verde Liberdade, com a coroa e o balão.
export type KimState = "parado" | "ouvindo" | "pensando" | "falando";

const STATE_LABEL: Record<KimState, string> = { parado: "Kim aguardando", ouvindo: "Kim ouvindo", pensando: "Kim pensando", falando: "Kim falando" };

export function KimAvatar({ state, mouth = 0, blink = false, size = 200 }: { state: KimState; mouth?: number; blink?: boolean; size?: number }) {
  const open = Math.max(0, Math.min(1, mouth));
  return (
    <div className="relative inline-flex flex-col items-center" data-estado={state} data-boca={open.toFixed(2)}>
      <svg width={size} height={size} viewBox="0 0 200 200" role="img" aria-label={STATE_LABEL[state]}>
        {state === "ouvindo" && <circle className="kyb-kim-anel" cx="100" cy="112" r="70" fill="none" stroke="var(--kyb-verde)" strokeWidth="4" />}
        {state === "ouvindo" && <circle cx="100" cy="112" r="70" fill="none" stroke="var(--kyb-verde)" strokeWidth="4" />}
        <g className={state === "parado" ? "kyb-kim-parado" : undefined}>
          {/* rosto */}
          <circle cx="100" cy="112" r="62" fill="var(--kyb-azul)" />
          {/* cabelo */}
          <path d="M42 104 C44 64 70 46 100 46 C130 46 156 64 158 104 C146 84 126 74 100 74 C74 74 54 84 42 104 Z" fill="var(--kyb-azul-2)" />
          {/* coroa */}
          <path d="M72 48 L78 22 L92 38 L100 16 L108 38 L122 22 L128 48 Z" fill="var(--kyb-verde)" stroke="var(--kyb-branco)" strokeWidth="2" strokeLinejoin="round" />
          {/* olhos */}
          <g fill="var(--kyb-branco)">
            <ellipse cx="78" cy="108" rx="8" ry={blink ? 1 : 9} />
            <ellipse cx="122" cy="108" rx="8" ry={blink ? 1 : 9} />
          </g>
          {!blink && (
            <g fill="var(--kyb-azul)">
              <circle cx="80" cy="110" r="3.5" />
              <circle cx="124" cy="110" r="3.5" />
            </g>
          )}
          {/* boca: altura pela abertura (0 fechada, 1 aberta) */}
          <ellipse cx="100" cy="142" rx={14 - open * 3} ry={1.5 + open * 9} fill="var(--kyb-branco)" />
        </g>
        {/* balão */}
        <g className={state === "falando" ? "kyb-falando" : undefined} style={{ transformOrigin: "166px 52px", transformBox: "view-box" }}>
          <path d="M146 30 h40 a8 8 0 0 1 8 8 v22 a8 8 0 0 1 -8 8 h-26 l-10 10 v-10 h-4 a8 8 0 0 1 -8 -8 v-22 a8 8 0 0 1 8 -8 Z" fill="var(--kyb-verde)" />
          {state === "pensando" ? (
            [0, 1, 2].map((i) => <circle key={i} className="kyb-kim-ponto" style={{ ["--kyb-ordem" as string]: i }} cx={154 + i * 12} cy="49" r="3.5" fill="var(--kyb-branco)" />)
          ) : (
            <path d="M156 44 h20 M156 54 h14" stroke="var(--kyb-branco)" strokeWidth="3" strokeLinecap="round" />
          )}
        </g>
      </svg>
      <span className="mt-1 rounded-[var(--kyb-raio-selo)] border border-[var(--kyb-linha)] bg-[var(--kyb-branco)] px-2 py-0.5 text-xs text-[var(--kyb-mudo)]">voz e avatar sintéticos</span>
    </div>
  );
}
