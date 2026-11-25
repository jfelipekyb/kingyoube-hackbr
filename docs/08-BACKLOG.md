# 08 — Backlog (sessões do Devin)

Uma sessão = um PR. Ordem obrigatória S1 → S6 (cada uma depende da anterior mergeada). Prazo: submissão em **29/11/2026**.

| Sessão | Data-alvo | Entrega |
|---|---|---|
| S1 | 25/11 | Fundação: app, banco, seed, CI, auditoria |
| S2 | 25–26/11 | Conector da Receita (SIMULADO + REAL atrás de flag) |
| S3 | 26/11 | Motor de conciliação + telas |
| S4 | 27/11 | RAD com aprovação + DARF + e-mail Resend |
| S5 | 27–28/11 | Radar da documentação com Firecrawl |
| S6 | 28/11 | Acabamento, README de vitrine, deploy, roteiro |

---

## S1 — Fundação

**Tasks**
1. Projeto Next.js 15 + TypeScript estrito + Tailwind + shadcn/ui; layout com menu (Painel, Sincronização, Conciliação, RAD, Radar, Auditoria), selo de modo e seletor de papel da demo.
2. Postgres local via `docker compose`; Drizzle com o modelo de `docs/02`; migrations versionadas; `npm run db:migrate`.
3. Utilitários: centavos (`parseCents("115.55") === 11555n`, sem float), CNPJ (validação, raiz de 8), chave de acesso (validação DV módulo 11), datas ISO com `Z` e `-03:00`.
4. Seed idempotente de `docs/06` (empresa, usuários, contrapartes, 11 notas, fixtures da Receita em `fixtures/receita/`, páginas do radar).
5. Serviço de auditoria append-only + tela de Auditoria.
6. `npm run verify` (eslint + `tsc --noEmit` + vitest); GitHub Action com `verify` + `gitleaks`; `.env.example`.
7. Instalar a skill: copiar `docs/skills/verificar-entrega.md` para `.agents/skills/verificar-entrega/SKILL.md`.
8. Criar `docs/PENDENCIAS.md` e `docs/DEVIN-LOG.md` se não existirem.
9. Pronto para Vercel desde já: script `vercel-build` = `db:migrate` + `next build`; rota `POST /api/demo/reset` (protegida por `CRON_SECRET`) que roda o seed; `docs/DEPLOY.md` com as variáveis.

**Critérios de aceite**
- [ ] Clone limpo → `docker compose up -d && npm i && npm run db:migrate && npm run db:seed && npm run dev` sobe o app.
- [ ] Testes: centavos (incluindo `0.1 + 0.2`-style e strings com 2 casas), CNPJ e chave de acesso (válidas e inválidas), seed idempotente (rodar 2× dá as mesmas contagens).
- [ ] CI verde no PR.
- [ ] Screenshot do layout com selo "Dados simulados".

## S2 — Conector da Receita

**Tasks**
1. Interface `ReceitaAdapter` (`requestConsulta(service)`, `getSituacao(ticket)`, `download(ticket)`, `gerarDarfRad(items)`), implementações `SimuladoAdapter` e `RealAdapter`, escolhidas por `RECEITA_MODE`. Só o adaptador conhece URLs.
2. Máquina de estados de `rfb_requests` (`docs/02`); cota por serviço e dia de Brasília (`RFB_DAILY_LIMIT`, padrão 4; falha conta); bloqueio antes de chamar.
3. Rotas `POST /api/receita/sync` (abre os 4 serviços que ainda têm cota), `POST /api/receita/poll` (situação → download → normalização), webhook `HEAD`/`POST /api/receita/webhook/[requestId]/[nonce]`.
4. Normalização idempotente para `rfb_debits`, `rfb_credits`, `rfb_payments` (chave natural; atualização só se `atualizacao` for igual ou mais nova); bruto em `rfb_raw_files` com sha256.
5. Alerta "janela em risco" quando a última sincronização concluída de um serviço tiver 6 dias ou mais.
6. Tela Sincronização: lista, estados ao vivo (polling da UI a cada 2 s em modo SIMULADO), cota restante, botão "Sincronizar agora".

**Critérios de aceite**
- [ ] Em SIMULADO, "Sincronizar agora" leva os 4 serviços a `normalizada` em < 15 s e popula as tabelas conforme `docs/06`.
- [ ] Mesmo arquivo processado 2× não duplica linha (teste).
- [ ] 5ª chamada do dia no mesmo serviço é recusada sem chamar o adaptador (teste).
- [ ] Webhook com nonce errado → 404; tíquete desconhecido → 400; registrado na auditoria (teste).
- [ ] Parser aceita campos ausentes como 0 e datas com `Z` e `-03:00` (teste com os exemplos oficiais de `docs/03`).
- [ ] `RealAdapter` compila e tem testes com `fetch` simulado; não é chamado em CI.

## S3 — Conciliação e telas

**Tasks**
1. Serviço `reconcile(companyId, period)` implementando R01–R06 de `docs/04`, gravando `reconciliation_items` com `rule_id` e `contract_version`.
2. Candidatas a RAD (regra de `docs/04`).
3. Explicações por modelo de texto por regra; LLM opcional (só se `ANTHROPIC_API_KEY` existir; guarda o texto original).
4. Painel: totais do período, contagem por status, candidatas a RAD, última sincronização.
5. Tela Conciliação (filtros por tipo, status, período) e Detalhe (lado a lado, regra, evidência, explicação).

**Critérios de aceite**
- [ ] Teste de ponta a ponta sobre o seed confere exatamente a tabela de totais de `docs/06`.
- [ ] Cada regra R01–R06 tem teste unitário.
- [ ] Recalcular não duplica itens.
- [ ] Screenshots do Painel, da Conciliação e do detalhe de V2.

## S4 — RAD com aprovação, DARF e e-mail

**Tasks**
1. Serviço de propostas com a máquina de estados de `docs/02`; propor (Analista), enviar para aprovação, aprovar/recusar (Contador), gerar DARF (só `aprovada`, aprovador ≠ proponente).
2. `gerarDarfRad` pelo adaptador; tratar `DARF_GERADO` e os 4 erros; gravar Pix, código de barras, PDF, vencimento, valores.
3. E-mail Resend "DARF RAD aprovado" com `Idempotency-Key = darf-<id>`; webhook `POST /api/resend/webhook` com verificação Svix; status de entrega na tela.
4. Confirmação: após sincronizar recolhimentos, proposta com chave encontrada → `pago_confirmado` (e divergência R07 se valor diferente); vencida sem confirmação → `vencida`.
5. Telas: candidatas, formulário de proposta (total/parcial + justificativa), fila do Contador, detalhe do DARF.

**Critérios de aceite**
- [ ] Teste: Analista tenta gerar DARF → 403 e auditoria; mesmo usuário propõe e aprova → recusado; proposta de outra empresa → recusado.
- [ ] Teste: parcial maior que o documento → `VALOR_PARCIAL_SUPERIOR_DFE` mostrado ao usuário em português.
- [ ] Reenviar o e-mail do mesmo DARF não gera segundo e-mail (idempotência).
- [ ] Webhook da Resend sem assinatura válida → 401.
- [ ] Demo: C2 proposto → aprovado → DARF → e-mail entregue → sincronizar → `pago_confirmado`. Screenshots e gravação curta.

## S5 — Radar da documentação (Firecrawl)

**Tasks**
1. Serviço `checkDocs()` com Firecrawl (scrape + changeTracking git-diff, tag `receita-cbs`), fila respeitando 10/min.
2. Extração da versão atual de cada página a partir do markdown; comparação com `CONTRACT_VERSION`.
3. Com `changed`: diff, auditoria e alerta Resend para `ALERT_EMAIL`.
4. Rota `POST /api/radar/check` (botão + Vercel Cron diário com `CRON_SECRET`); `vercel.json` com o cron.
5. Tela Radar: página, versão, última verificação, status, diff.

**Critérios de aceite**
- [ ] Teste com resposta do Firecrawl simulada para `new`, `same` e `changed`.
- [ ] Execução real (com a chave) registra as 9 páginas e suas versões; screenshot.
- [ ] Rota de cron sem `CRON_SECRET` → 401.

## S6 — Acabamento e entrega

**Tasks**
1. README de vitrine: problema, demo (link e GIF), arquitetura (diagrama), fluxo, regras inegociáveis, "Como usamos cada parceiro" (com links para o código), "Construído com Devin" (números do `DEVIN-LOG`), como rodar, limitações e pendências honestas, time.
2. Roteiro de demo dentro do app (`/demo`): botão "Reiniciar demonstração" (re-seed protegido) e passos guiados.
3. Revisão de textos (português correto), estados vazios e de erro, responsivo.
4. Checklist de deploy na Vercel (`docs/DEPLOY.md`) e smoke test pós-deploy (`npm run smoke -- $APP_URL`).
5. Revisão de segurança de `docs/07` (gitleaks, grep de termos proibidos).

**Critérios de aceite**
- [ ] Smoke na URL pública passa: painel abre, sincronização simulada conclui, fluxo C2 completo.
- [ ] README revisado; nenhum termo proibido; gitleaks limpo.
- [ ] Vídeo/GIF de até 3 min seguindo `docs/01`.
