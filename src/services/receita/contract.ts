// Versões do contrato da Receita implementadas (docs/03). Mostrada na tela.
export const CONTRACT_VERSION = {
  debitos: "1.3",
  creditos: "1.3",
  pagamentos: "1.3",
  recolhimentos: "1.3",
  situacao: "1.2",
  rad: "1.0",
  pcont: "1.0",
  guiaAssincrono: "1.1",
} as const;

export const CONTRACT_VERSION_LABEL =
  "Contrato Receita CBS v2 · consultas 1.3 (13/11/2026) · situação 1.2 · RAD 1.0 · guia assíncrono 1.1";

export const RECEITA_DOCS_BASE = "https://docs.receitafederal.gov.br/apuracao-cbs/";

/** Páginas monitoradas pelo Vigia (docs/05), com a versão lida em 24/11/2026 (docs/03). */
export const WATCHED_PAGES: { page: string; title: string; version: string | null }[] = [
  { page: "guiaapiassincrona.html", title: "Guia da API assíncrona", version: CONTRACT_VERSION.guiaAssincrono },
  { page: "debito.html", title: "Débitos", version: CONTRACT_VERSION.debitos },
  { page: "credito.html", title: "Créditos", version: CONTRACT_VERSION.creditos },
  { page: "pagamentos.html", title: "Pagamentos", version: CONTRACT_VERSION.pagamentos },
  { page: "recolhimentos.html", title: "Recolhimentos", version: CONTRACT_VERSION.recolhimentos },
  { page: "situacao-solicitacao.html", title: "Situação da solicitação", version: CONTRACT_VERSION.situacao },
  { page: "gerar-darf-ad.html", title: "Gerar DARF como adquirente (RAD)", version: CONTRACT_VERSION.rad },
  { page: "gerar-darf-contrib.html", title: "Gerar DARF como contribuinte (PCONT)", version: CONTRACT_VERSION.pcont },
  { page: "faq.html", title: "Perguntas frequentes", version: null },
];
