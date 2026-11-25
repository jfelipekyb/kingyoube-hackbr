# 06 — Base de demonstração (seed)

Tudo fictício e marcado `is_demo`. O seed é idempotente (`npm run db:seed` recria do zero). Os arquivos da Receita simulada ficam em `fixtures/receita/`, **no formato exato de `docs/03`**, e são o que o adaptador SIMULADO devolve no download.

## Escritório, pessoas e carteira

- Escritório de demonstração: **Escritório Exemplo Contabilidade (FICTÍCIO)**.
- Usuários: **Ana Analista** (`analista`) e **Carlos Contador** (`contador`). E-mails `@exemplo.com`.
- Carteira: **12 clientes**, todos com o sufixo "(FICTÍCIA)" no nome e CNPJ com dígitos verificadores válidos gerado com raiz começando por `00`:

| # | Cliente | Segmento | Itens no seed |
|---|---|---|---|
| 1 | Padaria Boa Massa | Alimentação | 12 cenários à mão (11 notas + 1 registro só na Receita) + 39 gerados = 51 |
| 2 | Auto Peças Rota 9 | Comércio | 1 cenário à mão + 31 gerados = 32 |
| 3 | Clínica Sorriso Pleno | Saúde | 33 gerados |
| 4 | Mercadinho Sol Nascente | Comércio | 33 gerados |
| 5 | Construtora Pedra Firme | Construção | 33 gerados |
| 6 | Restaurante Sabor da Serra | Alimentação | 33 gerados |
| 7 | Farmácia Vida Leve | Saúde | 33 gerados |
| 8 | Ateliê Bordado Fino | Indústria | 33 gerados |
| 9 | Transportadora Rumo Certo | Transporte | 33 gerados |
| 10 | Academia Corpo em Movimento | Serviços | 33 gerados |
| 11 | Gráfica Tinta Viva | Indústria | 33 gerados |
| 12 | Pet Shop Patas Felizes | Comércio | 33 gerados |
| | **Total** | | **413 itens = 412 notas + 1 registro só na Receita** |

- Contrapartes: fictícias, CNPJ válido gerado. Duas têm nome fixo:
  - **Moinho Estrela Farinhas (FICTÍCIA)** — fornecedor da nota C2; `site_url = ${APP_URL}/demo/fornecedores/moinho-estrela`; sem e-mail no cadastro (o Vigia encontra).
  - **Equipamentos Forno Forte (FICTÍCIA)** — fornecedor da nota C3; e-mail no cadastro `financeiro@fornoforte.exemplo`.
- Chaves de acesso: 44 dígitos com DV módulo 11 válido, modelo 55, UF 35, períodos 10/2026 e 11/2026.

## Cenários à mão — Padaria Boa Massa (cada um prova uma regra)

| # | Tipo | Nota (CBS) | Receita | Resultado esperado |
|---|---|---|---|---|
| V1 | venda | 90,00 | débito apurado 90,00; saldoDevedor 0; extinto 90,00; PCONT em pagamentos | `conciliado` (R01), quitado |
| V2 | venda | 120,00 | débito apurado 132,00; saldoDevedor 132,00 | `divergente_valor` (R02), diff +12,00 |
| V3 | venda | 45,00 | — (nota emitida 2 dias antes da sincronização) | `aguardando_janela` (R03) |
| V4 | venda | 60,00 | — (nota emitida 20 dias antes) | `so_na_nota` (R04) |
| V5 | venda | — (não existe nota) | débito apurado 75,00 | `so_na_receita` (R05) |
| V6 | venda | 200,00 | débito apurado 200,00; suspenso 20,00; saldoDevedor 180,00 | `atencao` (R06) |
| C1 | compra | 150,00 | crédito apurado 150,00; apropriado 150,00; utilizado 150,00; saldoCredor 0 | `conciliado` |
| C2 | compra | **436,50** — nota nº **1.284** do Moinho Estrela, produtos R$ 48.500,00 | crédito apurado 436,50; aApropriar 436,50; saldoCredor 0 | `conciliado` + **candidata a RAD (total)** |
| C3 | compra | 800,00 — Equipamentos Forno Forte, produtos R$ 88.888,89 | crédito apurado 800,00; aApropriar 800,00 | `conciliado` + **candidata a RAD** (a Tesouraria propõe o total; o Analista pode trocar para parcial antes de enviar — serve para mostrar o erro `VALOR_PARCIAL_SUPERIOR_DFE`) |
| C4 | compra | 90,00 | crédito apurado 90,00; inapropriavel 90,00 | `atencao` (R06) |
| C5 | compra | 100,00 | crédito apurado 100,00; apropriado 100,00; RAD em recolhimentos (principal 100,00, multa 10,00, juros 5,00, total 115,00) | `conciliado`, RAD já confirmado |
| C6 | compra | 55,00 | — (emitida 15 dias antes) | `so_na_nota` |

## Cenário à mão — Auto Peças Rota 9

| # | Tipo | Nota (CBS) | Receita | Resultado esperado |
|---|---|---|---|---|
| R9 | venda | 81,00 | — (emitida 12 dias antes) | `so_na_nota` (R04) |

## Notas geradas (400)

Gerador determinístico com semente fixa (`SEED_DEMO = 2026`): mesma entrada, mesmas notas, sempre.

- Metade vendas, metade compras (arredondar para baixo nas vendas).
- CBS entre R$ 5,00 e R$ 900,00, em centavos inteiros; períodos 10/2026 e 11/2026; emitidas há mais de 8 dias.
- Vendas: débito apurado = CBS da nota; saldoDevedor 0; extinto = CBS. Compras: crédito apurado = CBS; apropriado = CBS; aApropriar 0.
- Todas saem `conciliado` (R01) e nenhuma é candidata a RAD nem `atencao`.

## Totais esperados (há teste que confere exatamente)

### Por status

| Status | Padaria | Rota 9 | Demais 10 | Carteira |
|---|---|---|---|---|
| `conciliado` | 44 (V1, C1, C2, C3, C5 + 39) | 31 | 330 | **405** |
| `atencao` | 2 (V6, C4) | 0 | 0 | **2** |
| `divergente_valor` | 1 (V2) | 0 | 0 | **1** |
| `aguardando_janela` | 1 (V3) | 0 | 0 | **1** |
| `so_na_nota` | 2 (V4, C6) | 1 (R9) | 0 | **3** |
| `so_na_receita` | 1 (V5) | 0 | 0 | **1** |
| **Itens** | 51 | 32 | 330 | **413** |
| **Notas** | 50 | 32 | 330 | **412** |
| Candidatas a RAD | 2 (C2, C3) | 0 | 0 | **2** |

### Carteira (fórmulas em `docs/04`)

| Cliente | Dinheiro em risco | Crédito travado | Decisões |
|---|---|---|---|
| Padaria Boa Massa | **R$ 1.438,50** (1.236,50 + 12,00 + 115,00 + 75,00) | **R$ 1.236,50** | **3** (C2, C3, V2) |
| Auto Peças Rota 9 | R$ 81,00 | R$ 0,00 | 0 |
| Demais 10 | R$ 0,00 | R$ 0,00 | 0 |
| **Carteira** | **R$ 1.519,50** | **R$ 1.236,50** | **3** |

Se o código não bater com estas tabelas, a tabela é a fonte e o código está errado.

## Relógio da demonstração

Em modo SIMULADO, toda regra que depende de data (R03/R04, janela em risco, vencimento do DARF, "emitida há N dias") usa o **relógio da demo** `DEMO_TODAY` (padrão `2026-11-20`), nunca o relógio real. As datas do seed e das fixtures são fixas e calculadas a partir dele (V3 = `DEMO_TODAY − 2 dias`, V4 = `− 20`, C6 = `− 15`, R9 = `− 12`; geradas = `− 9` ou mais). Assim os totais desta página valem em qualquer dia, inclusive na final. A cota diária da Receita continua no relógio real (dia de Brasília). Em modo REAL, relógio real.

## Simulação do assíncrono

- `POST` simulado devolve `tiqueteSolicitacao` aleatório e `tEASegundos: 5`.
- Situação: `PENDENTE` (0–2 s) → `EM_PROCESSAMENTO` (2–5 s) → `CONCLUIDA`. Em "Rodar a equipe", o tempo pode ser encurtado para 1–2 s (`SIMULADO_RAPIDO=true`), sempre passando pelos três estados.
- Download devolve o arquivo do serviço. A **primeira** sincronização traz tudo o que está na coluna "Receita" acima; uma sincronização **seguinte** de recolhimentos traz também o recolhimento RAD de toda proposta que estiver em `darf_gerado` (valor = principal do DARF), para mostrar a confirmação.
- Geração de DARF simulada: devolve `DARF_GERADO` com `chavePIX` (UUID), `codigoBarras` de 44 dígitos fictício, `linkDarfPDF` apontando para `/demo/darf/[id]` (marcada SIMULADO), `dataMaximaPagamento` = `DEMO_TODAY` + 10 dias e valores iguais ao proposto. Também simular os erros `VALOR_PARCIAL_SUPERIOR_DFE` (parcial maior que o documento) e `DFE_NAO_ENCONTRADO` (chave desconhecida).

## Site fictício do fornecedor

`/demo/fornecedores/moinho-estrela`: página pública simples com faixa "Site fictício para demonstração — KingYouBe Hack Brasil", razão social "Moinho Estrela Farinhas Ltda (FICTÍCIA)", o mesmo CNPJ da contraparte do seed, um texto curto sobre o moinho e a seção "Fale com o financeiro: financeiro@moinhoestrela.exemplo". Sem nenhum dado de pessoa física.

## Minutos-padrão (`effort_standards`, premissas editáveis)

| task | Rótulo na tela | Minutos |
|---|---|---|
| `conferir_nota` | Conferir uma nota com a Receita | 3 |
| `sincronizar_servico` | Baixar e organizar um arquivo da Receita | 10 |
| `investigar_divergencia` | Investigar uma divergência e escrever a explicação | 20 |
| `preparar_rad` | Preparar uma guia de recolhimento | 15 |
| `achar_contato` | Achar o contato financeiro de um fornecedor | 10 |
| `escrever_email` | Escrever e enviar um e-mail de cobrança ou aviso | 5 |
| `ler_documentacao` | Conferir uma página da documentação da Receita | 5 |

Fonte: premissa do time, mostrada como premissa na tela. Mudar o valor na tela recalcula as horas.

## Demonstração pública (estado compartilhado)

- **Reset automático diário** pelo Vercel Cron (`POST /api/demo/reset` com `CRON_SECRET`, 06:00 de Brasília).
- **Botão público "Reiniciar demonstração"** em `/demo` → `POST /api/demo/reiniciar`: só existe em SIMULADO, sem segredo, com limite de 1 por minuto por IP e registro na auditoria. O júri sempre consegue voltar aos números desta página.
- Reset zera rodadas, solicitações à Receita (inclusive a cota da demo), propostas, cobranças e e-mails da base; não apaga a auditoria (marca "reset").
