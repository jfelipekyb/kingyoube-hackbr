# 02 — Arquitetura

## Visão

```
Next.js (App Router)
 ├─ UI (páginas do produto)
 ├─ Route handlers (API interna + webhooks)
 └─ Serviços de domínio (TypeScript puro, testáveis)
      ├─ receita/        adaptador da Receita (SIMULADO | REAL) — só ele conhece URLs da Receita
      ├─ conciliacao/    regras determinísticas
      ├─ rad/            propostas, aprovação, geração de DARF
      ├─ notificacao/    Resend (envio + webhook de eventos)
      ├─ radar/          Firecrawl (monitorar documentação oficial)
      ├─ explicacao/     textos de divergência (determinístico; LLM opcional)
      ├─ conferente/     recálculo independente a partir dos arquivos brutos
      ├─ fornecedor/     contato (Firecrawl) e cobrança (Resend)
      ├─ equipe/         agentes, agent_events, orquestração "Rodar a equipe", horas devolvidas
      ├─ kim/            intenções, respostas a partir da base, extenso pt-BR, voz (ElevenLabs)
      └─ auditoria/      registro append-only
Postgres (Drizzle)
```

Regra de dependência: UI → serviços → adaptadores. Nenhuma tela chama a Receita, o Firecrawl, a Resend ou a ElevenLabs diretamente; chaves só no servidor.

Cada agente de `docs/09` é uma fachada fina sobre um serviço: chama o serviço e grava `agent_events`. A regra de negócio fica no serviço, não no agente.

## Modo da Receita

`RECEITA_MODE=SIMULADO` (padrão) ou `REAL`.

- **SIMULADO:** o adaptador responde com arquivos de `fixtures/receita/` montados exatamente no formato oficial (`docs/03`). Simula o assíncrono: POST devolve tíquete; a situação passa por `PENDENTE → EM_PROCESSAMENTO → CONCLUIDA` em segundos; o download entrega o JSON. A geração de DARF devolve uma resposta no formato oficial com valores calculados da proposta. Tudo marcado como simulado.
- **REAL:** mesmo contrato, chamando `https://api.receitafederal.gov.br/apuracao-cbs/v2/...` com token OAuth2 (client credentials). A URL do token **não consta** na documentação lida → variável `RFB_TOKEN_URL` e pendência. Só liga se todas as variáveis `RFB_*` existirem.

## Modelo de dados (tabelas)

| Tabela | Campos principais |
|---|---|
| `companies` | id, name, cnpj (14), cnpj_root (8), segment, is_demo — os clientes da carteira do escritório |
| `users` | id, name, email, role (`analista` \| `contador`) — fictícios |
| `counterparties` | id, cnpj, name, site_url?, finance_email?, contact_source (`cadastro` \| `firecrawl` \| `simulado`), contact_found_at?, is_demo — fornecedores e clientes dos clientes |
| `invoices` | id, company_id, access_key (44), direction (`venda` \| `compra`), doc_model (55…), counterparty_cnpj, issued_at, period (`MM/AAAA`), total_cents, cbs_cents, source (`seed` \| `upload`) |
| `rfb_requests` | id, company_id, service (`debitos` \| `creditos` \| `pagamentos` \| `recolhimentos`), ticket, state, requested_at, eta_seconds, ready_at, downloaded_at, error_code, error_message, mode |
| `rfb_raw_files` | id, request_id, sha256, payload (jsonb), received_at — append-only |
| `rfb_debits` | company_id, access_key, period, origin, doc_model, issued_at, registered_at, updated_at, apurado_cents, saldo_devedor_cents, excedente_cents, inexigivel_cents, suspenso_cents, pgto_antecipado_cents, extinto_cents — único por (company_id, access_key, period, origin) |
| `rfb_credits` | company_id, access_key, period, origin, …, apurado_cents, apropriado_cents, a_apropriar_cents, inapropriavel_cents, suspenso_cents, prescrito_cents, utilizado_cents, inutilizavel_cents, restabelecido_cents, saldo_credor_cents, pedido_ressarcimento_cents |
| `rfb_payments` | company_id, darf_number (17), type (1 RAD \| 2 PCONT), collected_on, seq, period, due_date, counterparty_cnpj, access_key, principal/multa/juros/total_cents, source_service (`pagamentos` \| `recolhimentos`) |
| `reconciliation_items` | id, company_id, invoice_id?, access_key, period, kind (`debito` \| `credito`), status, invoice_cents, rfb_cents, diff_cents, rule_id, explanation, computed_at, contract_version |
| `rad_proposals` | id, company_id, invoice_id, access_key, option (`PAGAMENTO_TOTAL` \| `PAGAMENTO_PARCIAL`), partial_cents, justification, state, prepared_by (`agente:tesouraria` ou usuário), submitted_by, approved_by, decided_at, darf_pix, darf_barcode, darf_pdf_url, due_date, principal_cents, total_cents, rfb_return_code |
| `outbound_emails` | id, kind (`darf` \| `cobranca_fornecedor` \| `alerta_radar`), ref_id, to_label (texto mostrado na tela), resend_id, idempotency_key, created_at, last_status |
| `email_events` | id, email_id, outbound_email_id?, type (`email.sent`, `email.delivered`, …), received_at, raw_hash |
| `doc_watch` | id, url, title, last_version, last_checked_at, change_status, diff_text, alerted_at |
| `audit_log` | id, at, actor, action, entity, entity_id, result, details (jsonb, sem segredo) — `actor` pode ser usuário ou `agente:<nome>` |
| `agent_runs` | id, started_at, finished_at, triggered_by, status (`rodando` \| `concluida` \| `erro`) |
| `agent_events` | id, run_id?, at, agent, action, entity, entity_id?, status (`trabalhando` \| `feito` \| `revisado_ok` \| `revisado_divergente` \| `aguardando_humano` \| `erro`), summary (pt-BR), count, minutes_saved |
| `effort_standards` | task (chave), label, minutes, source (`premissa`), updated_by, updated_at — editável na tela Equipe |
| `kim_queries` | id, at, user_id, input_mode (`voz` \| `botao` \| `texto`), recognized_text, intent, answer_text — sem áudio |

## Estados

- **Solicitação à Receita:** `solicitada → em_processamento → concluida → baixada → normalizada`; desvios: `erro`, `expirada` (após 240 min ou URL vencida).
- **Item de conciliação:** `conciliado`, `divergente_valor`, `so_na_nota`, `aguardando_janela`, `so_na_receita`, `atencao` (ver `docs/04`).
- **Geração do DARF:** só o papel `contador`, só com proposta `aprovada` e aprovador ≠ quem enviou. Na tela, o botão do Contador é "Aprovar e gerar guia": duas chamadas em sequência (`/approve` e depois `/generate-darf`). Analista que chama `/generate-darf` recebe 403, em qualquer estado.
- **Proposta de RAD:** `rascunho` (Tesouraria prepara) `→ aguardando_aprovacao` (Analista envia) `→ aprovada` (Contador) `→ darf_gerado → pago_confirmado`; desvios: `recusada`, `erro_receita`, `vencida` (passou de `dataMaximaPagamento` sem confirmação).
- **Cobrança ao fornecedor:** `sem_contato → contato_encontrado → enviada → entregue`; desvios: `falhou`, `devolvida`.
- **Rodada da equipe:** `rodando → concluida` ou `erro`; cada agente: `aguardando → trabalhando → feito` (Conferente: `revisado_ok` ou `revisado_divergente`).
- **Página monitorada:** `sem_mudanca`, `mudou`, `alertado`.

Transições só pelos serviços; cada transição grava auditoria.

## Rotas (route handlers)

| Rota | Uso |
|---|---|
| `POST /api/receita/sync` | Abre solicitações (respeita cota) |
| `POST /api/receita/webhook/[requestId]/[nonce]` e `HEAD` | Aviso da Receita (modo REAL); nonce aleatório por solicitação, guardado só como hash |
| `POST /api/receita/poll` | Consulta situação e baixa o que estiver pronto (também por Vercel Cron) |
| `POST /api/conciliacao/run` | Recalcula a conciliação do período |
| `POST /api/rad/proposals` · `POST /api/rad/proposals/[id]/submit` · `/approve` · `/reject` · `/generate-darf` | Fluxo de RAD |
| `POST /api/resend/webhook` | Eventos de e-mail (verificar assinatura Svix com o corpo bruto) |
| `POST /api/radar/check` | Firecrawl: verifica as páginas oficiais (também por Vercel Cron diário) |
| `POST /api/fornecedor/[id]/contato` | Firecrawl: extrai CNPJ e e-mail financeiro do site do fornecedor |
| `POST /api/fornecedor/[id]/cobrar` | Resend: cobrança do recolhimento que faltou (`Idempotency-Key: cobranca-<invoiceId>`) e WhatsApp simulado |
| `POST /api/fornecedor/[id]/resposta` | Só SIMULADO: resposta do fornecedor à cobrança ("Vou recolher" / "Não aceito o RAD"), atualiza `rad_acordo` (docs/11) |
| `POST /api/equipe/run` · `POST /api/equipe/run/[runId]/[agent]` · `GET /api/equipe/run/[runId]` | Abre a rodada, executa um agente por chamada, consulta o andamento |
| `POST /api/kim/ouvir` | Áudio → texto (ElevenLabs speech-to-text); não guarda o áudio |
| `POST /api/kim/perguntar` | Texto → intenção → resposta a partir da base |
| `POST /api/kim/falar` | Texto → áudio (ElevenLabs text-to-speech) |
| `POST /api/demo/reset` | Recria a base de demonstração (protegida por `CRON_SECRET`; Vercel Cron diário); só em SIMULADO, em REAL responde 409 sem tocar na base |
| `POST /api/demo/reiniciar` | Botão público de reinício, só em SIMULADO, 1/min por IP |
| `GET /demo/fornecedores/[slug]` | Página pública do site fictício do fornecedor (lida pelo Firecrawl) |

## Variáveis de ambiente

| Variável | Obrigatória | Uso |
|---|---|---|
| `DATABASE_URL` | sim | Postgres |
| `APP_URL` | sim | URL pública (para webhooks e links no e-mail) |
| `RECEITA_MODE` | sim | `SIMULADO` ou `REAL` |
| `RESEND_API_KEY` | sim | Envio de e-mail |
| `RESEND_FROM` | sim | Remetente verificado (ex.: `KingYouBe <cbs@hack.kingyoube.com>`) |
| `RESEND_WEBHOOK_SECRET` | sim p/ eventos | Verificação Svix |
| `FINANCEIRO_EMAIL` | sim | Destinatário do DARF na demo |
| `FIRECRAWL_API_KEY` | sim | Vigia (radar e contato do fornecedor) |
| `FORNECEDOR_EMAIL` | sim | Destinatário da cobrança ao fornecedor na demo (caixa do time) |
| `ELEVENLABS_API_KEY`, `ELEVENLABS_VOICE_ID` | sim para voz | Kim (fala e escuta); sem eles, a Kim responde só em texto |
| `ELEVENLABS_TTS_MODEL`, `ELEVENLABS_STT_MODEL` | não | Modelos da ElevenLabs (padrões em `docs/09`) |
| `DEMO_TODAY` | não (padrão `2026-11-20`) | Relógio da demo em SIMULADO (`docs/06`) |
| `SIMULADO_RAPIDO` | não | Encurta o assíncrono simulado (`docs/06`) |
| `CONTADOR_TELEFONE`, `NVOIP_*` | só na S9 | Ligação opcional da Kim |
| `ALERT_EMAIL` | sim | Destinatário dos alertas do radar |
| `RFB_CLIENT_ID`, `RFB_CLIENT_SECRET`, `RFB_TOKEN_URL`, `RFB_CNPJ` | só no modo REAL | Credencial da Receita |
| `RFB_DAILY_LIMIT` | não (padrão 4) | Cota por serviço e dia |
| `CRON_SECRET` | sim | Protege as rotas chamadas pelo Vercel Cron; em `REAL`, também exigido (`Authorization: Bearer`) em `POST /api/receita/sync` e `/poll` |
| `ANTHROPIC_API_KEY`, `LLM_MODEL` | não | Explicação redigida por LLM; sem eles, usa texto determinístico |
| `FORBIDDEN_TERMS` | só no Devin | Regex de termos que nunca podem ir ao repositório (usado pela skill `verificar-entrega`) |
| `RAD_CNPJ_FORMAT` | não (padrão 14) | Formato do CNPJ no path do RAD (pendência P3) |
| `PII_HASH_KEY` | só no modo REAL (sem ela o REAL não sobe) | Chave do HMAC-SHA256 do `niConsumidor` guardado no arquivo bruto (docs/07); em SIMULADO usa uma chave fixa de demonstração |

`.env.example` lista todas, sem valores.
