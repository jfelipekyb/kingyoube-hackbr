// Passos do tour guiado (docs/10, seção 5). Os 8 passos aparecem sempre: se o elemento (`data-tour="..."`)
// não está na tela, o tour navega até a página do passo (`page`) e usa o alvo dela; no celular o menu fica
// recolhido, então "Kim", "RAD" e "Equipe" apontam para a própria tela (`fallback`).
export type TourStep = { target: string; text: string; page?: string; fallback?: readonly string[] };

export const TOUR_STEPS: readonly TourStep[] = [
  { target: "logo", text: "Esta é a Equipe CBS da KingYouBe: agentes que fazem o trabalho repetitivo do escritório. Você só decide." },
  { target: "rodar-equipe", page: "/", text: "Clique aqui e veja a equipe trabalhar: capturar notas, buscar a apuração na Receita, conciliar e conferir." },
  { target: "conferente", page: "/", text: "O Conferente refaz tudo do zero. Nenhum agente aprova o próprio trabalho." },
  { target: "kim", page: "/kim", fallback: ["kim-tela"], text: "Pergunte à Kim o que precisa de decisão hoje. Ela responde por voz, com os números da base." },
  { target: "carteira", page: "/carteira", text: "Os clientes aparecem em ordem de dinheiro em risco. Comece pelo primeiro." },
  { target: "rad", page: "/rad", fallback: ["rad-fila"], text: "Guia de recolhimento só sai com a aprovação do contador. A trava está no servidor." },
  { target: "equipe", page: "/equipe", fallback: ["equipe-horas"], text: "Aqui você vê as horas que a equipe devolveu e as próximas contratações." },
  { target: "selo-simulado", text: "Na demonstração, os dados são fictícios e a Receita é simulada. Bom tour!" },
];

export const TOUR_SEEN_KEY = "kyb-tour-visto";

/** localStorage pode não existir ou lançar erro (modo privado, cota); nunca quebra a tela. */
export function readTourSeen(storage: Pick<Storage, "getItem"> | undefined): boolean {
  try {
    return storage?.getItem(TOUR_SEEN_KEY) === "1";
  } catch {
    return false;
  }
}

export function writeTourSeen(storage: Pick<Storage, "setItem"> | undefined): void {
  try {
    storage?.setItem(TOUR_SEEN_KEY, "1");
  } catch {
    // Sem armazenamento: o tour volta a abrir na próxima visita, sem erro.
  }
}

export type StepPlan = { kind: "show"; target: string } | { kind: "navigate"; href: string } | { kind: "wait" };

/** O que fazer em um passo: apontar o alvo visível, ir para a página do passo ou esperar a página carregar. */
export function planStep(step: TourStep, pathname: string, has: (target: string) => boolean): StepPlan {
  for (const target of [step.target, ...(step.fallback ?? [])]) if (has(target)) return { kind: "show", target };
  if (step.page && step.page !== pathname) return { kind: "navigate", href: step.page };
  return { kind: "wait" };
}

/**
 * Mesmo alvo no menu e na tela (ex.: "carteira"): ganha o último visível na ordem do documento,
 * que é o da tela. Assim o passo 5 aponta a tabela da Carteira quando ela existe, e o menu nas demais.
 */
export function pickTarget<T>(elements: readonly T[], visible: (el: T) => boolean): T | null {
  for (let i = elements.length - 1; i >= 0; i--) if (visible(elements[i])) return elements[i];
  return null;
}
