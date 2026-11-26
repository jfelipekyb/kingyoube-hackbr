// Minutos-padrão de docs/06 (premissas editáveis na tela Equipe).
export const EFFORT_STANDARDS = [
  { task: "conferir_nota", label: "Conferir uma nota com a Receita", minutes: 3 },
  { task: "sincronizar_servico", label: "Baixar e organizar um arquivo da Receita", minutes: 10 },
  { task: "investigar_divergencia", label: "Investigar uma divergência e escrever a explicação", minutes: 20 },
  { task: "preparar_rad", label: "Preparar uma guia de recolhimento", minutes: 15 },
  { task: "achar_contato", label: "Achar o contato financeiro de um fornecedor", minutes: 10 },
  { task: "escrever_email", label: "Escrever e enviar um e-mail de cobrança ou aviso", minutes: 5 },
  { task: "ler_documentacao", label: "Conferir uma página da documentação da Receita", minutes: 5 },
] as const;

// Premissas da projeção (docs/06, docs/09).
export const TEAM_PREMISES = [
  { key: "rodadas_por_mes", label: "Rodadas por mês (uma rodada = um mês de conferência da carteira)", value: 1 },
  { key: "clientes_projecao", label: "Clientes na projeção", value: 200 },
  { key: "horas_pessoa_mes", label: "Horas de trabalho de uma pessoa por mês", value: 168 },
] as const;
