# 04 — Regras de conciliação (determinísticas)

Cada regra tem um `rule_id` estável, gravado no item. Toda regra tem teste com o cenário de `docs/06`. Comparação **sempre em centavos inteiros, tolerância zero**.

## Chave de casamento

`(company_id, access_key, period)`. Vendas casam com **débitos**; compras casam com **créditos**. Se houver várias linhas da Receita para a mesma chave (origens diferentes), somar por chave e período e guardar as linhas de origem como evidência.

## Status de um item

| rule_id | Status | Quando |
|---|---|---|
| `R01` | `conciliado` | Nota e Receita existem e `cbs_cents` da nota = `apurado_cents` |
| `R02` | `divergente_valor` | Existem os dois e os valores diferem → `diff_cents = rfb - nota` |
| `R03` | `aguardando_janela` | Nota sem registro na Receita e emitida há **até 8 dias** da última sincronização concluída (pode só não ter chegado) |
| `R04` | `so_na_nota` | Nota sem registro na Receita e emitida há **mais de 8 dias** |
| `R05` | `so_na_receita` | Registro na Receita sem nota no sistema |
| `R06` | `atencao` | Conciliado em valor, mas a Receita mostra `suspenso`, `inexigivel`, `inapropriavel`, `prescrito` ou origem diferente de 0 (cancelamento/devolução) → precisa de olhar humano |

Ordem de avaliação: R05 → R03/R04 → R02 → R06 → R01.

## Situação financeira (informativa, não muda o status)

- Débito: `saldoDevedor_cents > 0` → "em aberto"; `= 0` → "quitado". Mostrar `extinto` e os pagamentos (`rfb_payments` tipo 2 PCONT ou tipo 1 RAD de terceiros) que casam pela chave quando houver.
- Crédito: mostrar `apropriado`, `aApropriar`, `utilizado`, `saldoCredor`.

## Candidata a RAD (hipótese de negócio — confirmar com o contador)

Uma **compra** é candidata quando o crédito na Receita tem `aApropriar_cents > 0` (crédito ainda não apropriado, tipicamente porque o débito do fornecedor não foi extinto) **e** não há recolhimento RAD já registrado para a chave.

- Valor sugerido = `aApropriar_cents` (texto: "valor sugerido; o valor oficial vem da Receita na geração do DARF").
- A tela diz sempre: "Elegibilidade legal ao RAD a confirmar pelo contador responsável."
- Esta regra **não** decide nada: só lista. Quem propõe é o Analista; quem aprova é o Contador.

## Confirmação de RAD

Proposta `darf_gerado` vira `pago_confirmado` quando aparece em `recolhimentos` uma composição com `chaveDFE` igual à da proposta. Se o valor recolhido (`principal`) for diferente do DARF gerado, marcar divergência `R07` no detalhe. Se passar de `dataMaximaPagamento` sem confirmação → `vencida`.

## Explicação (texto)

Gerada a partir de modelo fixo por regra, com os números já calculados. Exemplo R02: "A nota informa CBS de R$ 120,00. A Receita apurou R$ 132,00 para a mesma chave no período 10/2026. Diferença de R$ 12,00 a maior na Receita. Verifique a classificação tributária dos itens da nota." Se `ANTHROPIC_API_KEY` existir, a LLM pode **reescrever** esse texto para ficar mais claro, recebendo só os fatos (sem CNPJ completo) e sem poder mudar número; guardar o texto original junto.
