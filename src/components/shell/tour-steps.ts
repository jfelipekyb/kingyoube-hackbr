// Passos do tour guiado (docs/10, seção 5). Só aparecem os passos cujo elemento existe na tela
// (`data-tour="..."`); os demais entram sozinhos quando as telas das próximas sessões criarem o elemento.
export type TourStep = { target: string; text: string };

export const TOUR_STEPS: readonly TourStep[] = [
  { target: "logo", text: "Esta é a Equipe CBS da KingYouBe: agentes que fazem o trabalho repetitivo do escritório. Você só decide." },
  { target: "rodar-equipe", text: "Clique aqui e veja a equipe trabalhar: capturar notas, buscar a apuração na Receita, conciliar e conferir." },
  { target: "conferente", text: "O Conferente refaz tudo do zero. Nenhum agente aprova o próprio trabalho." },
  { target: "kim", text: "Pergunte à Kim o que precisa de decisão hoje. Ela responde por voz, com os números da base." },
  { target: "carteira", text: "Os clientes aparecem em ordem de dinheiro em risco. Comece pelo primeiro." },
  { target: "rad", text: "Guia de recolhimento só sai com a aprovação do contador. A trava está no servidor." },
  { target: "equipe", text: "Aqui você vê as horas que a equipe devolveu e as próximas contratações." },
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

export function availableSteps(has: (target: string) => boolean): TourStep[] {
  return TOUR_STEPS.filter((s) => has(s.target));
}

/**
 * Mesmo alvo no menu e na tela (ex.: "carteira"): ganha o último visível na ordem do documento,
 * que é o da tela. Assim o passo 5 aponta a tabela da Carteira quando ela existe, e o menu nas demais.
 */
export function pickTarget<T>(elements: readonly T[], visible: (el: T) => boolean): T | null {
  for (let i = elements.length - 1; i >= 0; i--) if (visible(elements[i])) return elements[i];
  return null;
}
