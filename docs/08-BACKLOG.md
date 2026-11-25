# 08 — Backlog (sessões do Devin)

Uma sessão = um PR. Ordem obrigatória S1 → S8 (cada uma depende da anterior mergeada). S9 é opcional. Submissão até 30/11/2026 às 23h59; depois disso, nenhum commit.

| Sessão | Entrega |
|---|---|
| S1 | Fundação: app, banco, carteira de 12 clientes, seed, auditoria, CI, licença |
| S2 | Agente Apuração: conector da Receita (SIMULADO + REAL atrás de flag) |
| S3 | Agentes Conciliador e Analista + Carteira e telas de conciliação |
| S4 | Agentes Tesouraria e Mensageiro: RAD com aprovação, DARF e e-mail |
| S5 | Agente Vigia: radar da documentação + contato e cobrança do fornecedor |
| S6 | Sala da Equipe, Conferente, horas devolvidas e organograma |
| S7 | Kim por voz |
| S8 | Acabamento, README de vitrine, smoke test |
| S9 | Opcional: ligação da Kim (Nvoip) |

---

## S1 — Fundação

**Tasks**
1. Projeto Next.js 15 + TypeScript estrito + Tailwind + shadcn/ui; layout com menu (Equipe ao vivo, Kim, Carteira, Sincronização, Conciliação, Fornecedores, RAD, Radar, Equipe, Auditoria), seletor de cliente, selo de modo e seletor de papel da demo. Telas ainda vazias podem mostrar "em construção".
2. Postgres local via `docker compose`; Drizzle com o modelo completo de `docs/02` (incluindo `counterparties`, `outbound_emails`, `agent_runs`, `agent_events`, `effort_standards`, `kim_queries`); migrations versionadas; `npm run db:migrate`.
3. Utilitários: centavos (`parseCents("115.55") === 11555n`, sem float), formatação `R$ 1.236,50`, CNPJ (validação, raiz de 8), chave de acesso (validação DV módulo 11), datas ISO com `Z` e `-03:00`.
4. Seed idempotente de `docs/06`: escritório, usuários, 12 clientes, contrapartes, 412 notas (cenários à mão + gerador determinístico com semente fixa), fixtures da Receita em `fixtures/receita/`, páginas do radar, `effort_standards`.
5. Serviço de auditoria append-only + tela de Auditoria (filtro por ator humano ou agente).
6. Serviço `equipe/` mínimo: `recordAgentEvent(...)` + teste.
7. `npm run verify` (eslint + `tsc --noEmit` + vitest); GitHub Action com `verify` + `gitleaks`; `.env.example` com todas as variáveis de `docs/02`, sem valores.
8. Licença MIT na raiz. Preservar o README existente.
9. Instalar a skill: copiar `docs/skills/verificar-entrega.md` para `.agents/skills/verificar-entrega/SKILL.md`.
10. Pronto para Vercel desde já: script `vercel-build` = `db:migrate` + `next build`; rota `POST /api/demo/reset` (protegida por `CRON_SECRET`) que recria o seed e zera solicitações à Receita, propostas, e-mails e rodadas; `vercel.json` com o cron diário do reset (06:00 de Brasília = 09:00 UTC); botão público `POST /api/demo/reiniciar` (só SIMULADO, 1/min por IP); relógio da demo `DEMO_TODAY` (`docs/06`); `docs/DEPLOY.md` com as variáveis.

**Critérios de aceite**
- [ ] Clone limpo → `docker compose up -d && npm i && npm run db:migrate && npm run db:seed && npm run dev` sobe o app.
- [ ] Testes: centavos (strings com 2 casas, nada de float), CNPJ e chave de acesso (válidas e inválidas), gerador determinístico (duas execuções geram as mesmas 400 notas), seed idempotente (rodar 2× dá as mesmas contagens: 12 clientes, 412 notas).
- [ ] `POST /api/demo/reset` sem `CRON_SECRET` → 401 (teste); `POST /api/demo/reiniciar` 2× no mesmo minuto → 429 (teste).
- [ ] Teste: com `DEMO_TODAY` fixo, V3 está a 2 dias e V4 a 20 dias, em qualquer data real.
- [ ] CI verde no PR; `LICENSE` presente.
- [ ] Screenshot do layout com selo "Dados simulados".

## S2 — Agente Apuração (conector da Receita)

**Tasks**
1. Interface `ReceitaAdapter` (`requestConsulta(companyId, service)`, `getSituacao(ticket)`, `download(ticket)`, `gerarDarfRad(items)`), implementações `SimuladoAdapter` e `RealAdapter`, escolhidas por `RECEITA_MODE`. Só o adaptador conhece URLs.
2. Máquina de estados de `rfb_requests` (`docs/02`); cota por serviço, por cliente e por dia de Brasília (`RFB_DAILY_LIMIT`, padrão 4; falha conta); bloqueio antes de chamar.
3. Rotas `POST /api/receita/sync` (um cliente ou a carteira; abre os serviços que ainda têm cota), `POST /api/receita/poll` (situação → download → normalização), webhook `HEAD`/`POST /api/receita/webhook/[requestId]/[nonce]`.
4. Normalização idempotente para `rfb_debits`, `rfb_credits`, `rfb_payments` (chave natural; atualização só se `atualizacao` for igual ou mais nova); bruto em `rfb_raw_files` com sha256.
5. `SIMULADO_RAPIDO=true` encurta o assíncrono para 1–2 s, passando pelos três estados.
6. Alerta "janela em risco" quando a última sincronização concluída de um serviço tiver 6 dias ou mais.
7. Tela Sincronização: por cliente, estados ao vivo (polling da UI a cada 2 s), cota restante, botão "Sincronizar agora".
8. `agent_events` do agente `apuracao`.

**Critérios de aceite**
- [ ] Em SIMULADO, "Sincronizar agora" da Padaria leva os 4 serviços a `normalizada` em < 15 s e popula as tabelas conforme `docs/06`.
- [ ] Mesmo arquivo processado 2× não duplica linha (teste).
- [ ] 5ª chamada do dia no mesmo serviço e cliente é recusada sem chamar o adaptador (teste).
- [ ] Webhook com nonce errado → 404; tíquete desconhecido → 400; registrado na auditoria (teste).
- [ ] Parser aceita campos ausentes como 0 e datas com `Z` e `-03:00` (teste com os exemplos oficiais de `docs/03`).
- [ ] `RealAdapter` compila e tem testes com `fetch` simulado; não é chamado em CI.

## S3 — Agentes Conciliador e Analista + Carteira

**Tasks**
1. Serviço `reconcile(companyId, period?)` implementando R01–R06 de `docs/04`, gravando `reconciliation_items` com `rule_id` e `contract_version`; `reconcilePortfolio()` para a carteira.
2. Candidatas a RAD e indicadores da carteira (dinheiro em risco, crédito travado, decisões) de `docs/04`.
3. Explicações por modelo de texto por regra; LLM opcional (só se `ANTHROPIC_API_KEY` existir; guarda o texto original).
4. Telas: Carteira (ordenada por dinheiro em risco), Painel do cliente, Conciliação (filtros) e Detalhe (lado a lado, regra, evidência, explicação).
5. `agent_events` dos agentes `conciliador` e `analista`.

**Critérios de aceite**
- [ ] Teste de ponta a ponta sobre o seed confere exatamente as tabelas "Por status" e "Carteira" de `docs/06`.
- [ ] Cada regra R01–R06 tem teste unitário.
- [ ] Recalcular não duplica itens.
- [ ] Screenshots da Carteira (Padaria no topo), da Conciliação da Padaria e do detalhe de V2.

## S4 — Agentes Tesouraria e Mensageiro (RAD, aprovação, DARF, e-mail)

**Tasks**
1. Serviço de propostas com a máquina de estados de `docs/02`: Tesouraria prepara (`rascunho`, `prepared_by = agente:tesouraria`), Analista envia (`aguardando_aprovacao`), Contador aprova/recusa, gerar DARF (só `aprovada`; aprovador ≠ quem enviou; agente nunca aprova).
2. `gerarDarfRad` pelo adaptador; tratar `DARF_GERADO` e os 4 erros; gravar Pix, código de barras, PDF, vencimento, valores.
3. E-mail Resend "DARF RAD aprovado" com `Idempotency-Key = darf-<id>`, registrado em `outbound_emails`; webhook `POST /api/resend/webhook` com verificação Svix; status de entrega na tela.
4. Confirmação: após sincronizar recolhimentos, proposta com chave encontrada → `pago_confirmado` (e divergência R07 se valor diferente); vencida sem confirmação → `vencida`.
5. Telas: candidatas, proposta (total/parcial + justificativa), fila do Contador, detalhe do DARF.
6. `agent_events` de `tesouraria` e `mensageiro`.

**Critérios de aceite**
- [ ] Teste: Analista tenta gerar DARF → 403 e auditoria; mesmo usuário envia e aprova → recusado; proposta de outra empresa → recusado; chamada em nome de agente para aprovar → recusado.
- [ ] Teste: parcial maior que o documento → `VALOR_PARCIAL_SUPERIOR_DFE` mostrado ao usuário em português.
- [ ] Reenviar o e-mail do mesmo DARF não gera segundo e-mail (idempotência).
- [ ] Webhook da Resend sem assinatura válida → 401.
- [ ] Demo: C2 preparado → enviado → bloqueio do Analista → aprovado → DARF → e-mail entregue (status pelo fallback da API da Resend, `docs/09`) → sincronizar → `pago_confirmado`. Screenshots e gravação curta. O webhook é conferido pelo Felipe depois do deploy.

## S5 — Agente Vigia (Firecrawl) e cobrança do fornecedor

**Tasks**
1. Serviço `checkDocs()` com Firecrawl (scrape + changeTracking git-diff, tag `receita-cbs`), fila respeitando 10/min; extração da versão atual de cada página; comparação com `CONTRACT_VERSION`; com `changed`: diff, auditoria e alerta Resend para `ALERT_EMAIL`.
2. Rota `POST /api/radar/check` (botão + Vercel Cron diário com `CRON_SECRET`); `vercel.json` com o cron; tela Radar.
3. Página pública `/demo/fornecedores/moinho-estrela` (`docs/06`).
4. Serviço `findSupplierContact(counterpartyId)`: Firecrawl com extração JSON; lista fechada de URLs; CNPJ extraído tem que bater; fixture quando não houver `APP_URL` público.
5. Serviço `notifySupplier(invoiceId)`: e-mail de cobrança pela Resend para `FORNECEDOR_EMAIL`, `Idempotency-Key = cobranca-<invoiceId>`, registrado em `outbound_emails`; estados de `docs/02`.
6. Tela Fornecedores: contato encontrado (com a fonte), candidatas daquele fornecedor, e-mail com status de entrega.
7. `agent_events` de `vigia` e `mensageiro`.

**Critérios de aceite**
- [ ] Teste com resposta do Firecrawl simulada para `new`, `same` e `changed`.
- [ ] Teste: URL fora da lista → recusada sem chamar o Firecrawl; CNPJ extraído diferente → contato não gravado.
- [ ] Execução real (com a chave) registra as 9 páginas e suas versões; screenshot.
- [ ] Contato do Moinho Estrela pela fixture na sessão + cobrança real enviada e entregue (fallback da API da Resend); screenshot. A leitura real da página pública pelo Firecrawl é conferida pelo Felipe depois do merge e do deploy.
- [ ] Rota de cron sem `CRON_SECRET` → 401.

## S6 — Sala da Equipe, Conferente, horas devolvidas e organograma

**Tasks**
1. Serviço `conferente/` (`docs/04`), com implementação independente do Conciliador.
2. Orquestração da rodada (`docs/09`): `POST /api/equipe/run`, `POST /api/equipe/run/[runId]/[agent]`, `GET /api/equipe/run/[runId]`; uma chamada por agente; idempotente.
3. Tela Sala da Equipe (página inicial) conforme `docs/09`.
4. Cálculo de horas devolvidas e projeção (`docs/09`); premissas editáveis só pelo Contador, com auditoria.
5. Tela Equipe: organograma + horas + próximas contratações apagadas.

**Critérios de aceite**
- [ ] Teste: item alterado de propósito → Conferente marca `revisado_divergente` naquele item; sem alteração → `revisado_ok` em todos.
- [ ] Teste: rodar a equipe 2× não duplica propostas, contatos nem e-mails.
- [ ] Teste: resumos da rodada no seed batem com a tabela de `docs/09`.
- [ ] Teste: horas = Σ contagem × minutos ÷ 60 com as premissas do seed; mudar uma premissa recalcula.
- [ ] Gravação da Sala da Equipe do começo ao fim; screenshot da tela Equipe com o rótulo "projeção, não medição" e as vagas apagadas.

## S7 — Kim por voz

**Tasks**
1. `porExtenso` e `reaisPorExtenso` com a tabela de testes de `docs/09`.
2. Intenções e respostas (`docs/09`), com legenda e fala; `acao_proibida` avaliada primeiro.
3. Rotas `/api/kim/ouvir`, `/api/kim/perguntar`, `/api/kim/falar` (ElevenLabs só no servidor; rate limit; áudio da resposta guardado em cache pelo hash do texto, para não gastar crédito com a mesma frase).
4. Tela Kim (`docs/09`) + chamada "Perguntar à Kim" na Sala da Equipe.
5. `kim_queries` e auditoria, sem áudio.

**Critérios de aceite**
- [ ] Todos os casos da tabela de extenso passam.
- [ ] Teste: `decisoes_hoje` em "seed + rodada completa" devolve exatamente a frase de `docs/09`; antes da rodada, a frase de "ainda não rodou"; depois de aprovar e confirmar o C2, a frase muda.
- [ ] Teste: "Kim, aprova a guia" → `acao_proibida`, nenhuma proposta muda de estado.
- [ ] Sem chaves da ElevenLabs → resposta em texto, sem erro.
- [ ] Gravação com áudio: pergunta falada → resposta falada com legenda.

## S8 — Acabamento e entrega

**Tasks**
1. README de vitrine: problema, demo (link e GIF), a equipe digital (o que é IA e o que é regra), arquitetura (diagrama), fluxo, regras inegociáveis, "Como usamos cada parceiro" (com links para o código), "Construído com Devin" (números do `DEVIN-LOG`), como rodar, limitações e pendências honestas, time.
2. Roteiro de demo dentro do app (`/demo`): botão "Reiniciar demonstração" (protegido) e passos guiados.
3. Revisão de textos (português correto), estados vazios e de erro, responsivo.
4. Smoke test pós-deploy (`npm run smoke -- $APP_URL`): painel abre, rodada da equipe conclui, Kim responde em texto, fluxo C2 completo.
5. Revisão de segurança de `docs/07` (gitleaks, grep de termos proibidos).

**Critérios de aceite**
- [ ] Smoke na URL pública passa.
- [ ] README revisado; nenhum termo proibido; gitleaks limpo.
- [ ] Resumo de até 500 caracteres para o formulário de submissão.

## S9 — Opcional: ligação da Kim (Nvoip)

Só se a documentação oficial da Nvoip permitir tocar um áudio nosso de forma simples. Ver `docs/09`.

**Critérios de aceite**
- [ ] Ligação real para `CONTADOR_TELEFONE` com o áudio da Kim; nenhuma ação é executada pela ligação.
