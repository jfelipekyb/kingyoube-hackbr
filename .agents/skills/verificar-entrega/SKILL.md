---
name: verificar-entrega
description: Use antes de abrir ou atualizar qualquer PR neste repositório. Confere a definição de pronto, as regras inegociáveis e os critérios de aceite da sessão, e produz um relatório para colar no PR.
---

# Verificar entrega

Rode tudo e cole o resultado no corpo do PR, na seção "Verificação". Se qualquer item falhar, corrija antes de abrir o PR. Não marque item como feito sem evidência.

1. `npm run verify` → colar o resumo (lint, typecheck, testes: quantos passaram).
2. Para cada critério de aceite da sessão em `docs/08-BACKLOG.md`: `[x]` + evidência (nome do teste, screenshot ou saída de comando). Sem evidência = `[ ]`.
3. Segredos: `git diff origin/main -- . ':!package-lock.json' | grep -nE "re_[A-Za-z0-9]{8,}|fc-[A-Za-z0-9]{8,}|sk-[A-Za-z0-9]{8,}|eyJhbGciOi"` → tem que voltar vazio.
4. Termos proibidos: `( [ -n "$FORBIDDEN_TERMS" ] || { echo "FORBIDDEN_TERMS não configurado"; exit 1; }; grep -rliE "$FORBIDDEN_TERMS" --exclude-dir=node_modules --exclude-dir=.git .; [ $? -eq 1 ] )` → código de saída 0. O `-l` lista só os arquivos com ocorrência, sem imprimir o termo; erro do grep (saída 2) também conta como falha. Com a variável vazia o comando falha com a mensagem "FORBIDDEN_TERMS não configurado" (grep com padrão vazio casa tudo): o item fica como falha/pendente, nunca como feito. A lista vem do segredo `FORBIDDEN_TERMS`; nunca escreva esses termos em arquivo, log ou PR.
5. Dinheiro: o diff não usa `parseFloat`/`Number(` em valor monetário; valores em centavos `bigint`.
6. Trava de aprovação (a partir da S4): os testes de "furar a trava" existem e passam.
7. Dado simulado: telas novas mostram o selo de modo.
8. `docs/PENDENCIAS.md` atualizado com o que ficou incerto; `docs/DEVIN-LOG.md` com a linha desta sessão.
9. Screenshots das telas tocadas anexados ao PR.
