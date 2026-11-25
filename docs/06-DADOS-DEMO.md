# 06 — Base de demonstração (seed)

Tudo fictício e marcado `is_demo`. O seed é idempotente (`npm run db:seed` recria do zero). Os arquivos da Receita simulada ficam em `fixtures/receita/*.json`, **no formato exato de `docs/03`**, e são o que o adaptador SIMULADO devolve no download.

## Empresa e pessoas

- Empresa: **Distribuidora Aurora Ltda (FICTÍCIA)**. Gerar um CNPJ com dígitos verificadores válidos e raiz começando por `00`, marcado fictício.
- Usuários: **Ana Analista** (`analista`) e **Carlos Contador** (`contador`). E-mails `@exemplo.com`.
- Fornecedores e clientes: 8 empresas fictícias com CNPJ válido gerado.
- Chaves de acesso: 44 dígitos com DV módulo 11 válido, modelo 55, UF 35, período 10/2026 e 11/2026.

## Cenários (11 notas + 1 registro só na Receita) — cada um prova uma regra

| # | Tipo | Nota (CBS) | Receita | Resultado esperado |
|---|---|---|---|---|
| V1 | venda | 90,00 | débito apurado 90,00; saldoDevedor 0; extinto 90,00; PCONT em pagamentos | `conciliado` (R01), quitado |
| V2 | venda | 120,00 | débito apurado 132,00; saldoDevedor 132,00 | `divergente_valor` (R02), diff +12,00 |
| V3 | venda | 45,00 | — (nota emitida 2 dias antes da sincronização) | `aguardando_janela` (R03) |
| V4 | venda | 60,00 | — (nota emitida 20 dias antes) | `so_na_nota` (R04) |
| V5 | venda | — (não existe nota) | débito apurado 75,00 | `so_na_receita` (R05) |
| V6 | venda | 200,00 | débito apurado 200,00; suspenso 20,00; saldoDevedor 180,00 | `atencao` (R06) |
| C1 | compra | 150,00 | crédito apurado 150,00; apropriado 150,00; utilizado 150,00; saldoCredor 0 | `conciliado` |
| C2 | compra | 115,55 | crédito apurado 115,55; aApropriar 115,55; saldoCredor 0 | `conciliado` + **candidata a RAD (total)** |
| C3 | compra | 800,00 | crédito apurado 800,00; aApropriar 800,00 | `conciliado` + **candidata a RAD** (demo usa parcial de 500,00) |
| C4 | compra | 90,00 | crédito apurado 90,00; inapropriavel 90,00 | `atencao` (R06) |
| C5 | compra | 100,00 | crédito apurado 100,00; apropriado 100,00; RAD em recolhimentos (principal 100,00, multa 10,00, juros 5,00, total 115,00) | `conciliado`, RAD já confirmado |
| C6 | compra | 55,00 | — (emitida 15 dias antes) | `so_na_nota` |

Totais esperados (11 notas + 1 registro só na Receita = **12 itens**):

| Status | Qtd | Itens |
|---|---|---|
| `conciliado` | 5 | V1, C1, C2, C3, C5 |
| `atencao` | 2 | V6, C4 |
| `divergente_valor` | 1 | V2 |
| `aguardando_janela` | 1 | V3 |
| `so_na_nota` | 2 | V4, C6 |
| `so_na_receita` | 1 | V5 |
| **Candidatas a RAD** | 2 | C2, C3 |

Há um teste que roda a conciliação sobre o seed e confere exatamente esta tabela. Se não bater, a tabela é a fonte e o código está errado.

## Simulação do assíncrono

- `POST` simulado devolve `tiqueteSolicitacao` aleatório e `tEASegundos: 5`.
- Situação: `PENDENTE` (0–2 s) → `EM_PROCESSAMENTO` (2–5 s) → `CONCLUIDA`.
- Download devolve o arquivo do serviço. A **primeira** sincronização traz V1, V2, V5, V6, C1–C5; a "sincronização seguinte" (botão na demo) traz o recolhimento RAD da proposta aprovada (C2) para mostrar a confirmação.
- Geração de DARF simulada: devolve `DARF_GERADO` com `chavePIX` (UUID), `codigoBarras` de 44 dígitos fictício, `linkDarfPDF` apontando para uma página interna `/demo/darf/[id]` (marcada SIMULADO), `dataMaximaPagamento` = hoje + 10 dias e valores iguais ao proposto. Também simular os erros `VALOR_PARCIAL_SUPERIOR_DFE` (parcial maior que o documento) e `DFE_NAO_ENCONTRADO` (chave desconhecida).
