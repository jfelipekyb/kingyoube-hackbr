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
      └─ auditoria/      registro append-only
Postgres (Drizzle)
```

Regra de dependência: UI → serviços → adaptadores. Nenhuma tela chama a Receita, o Firecrawl ou a Resend diretamente.

## Modo da Receita

`RECEITA_MODE=SIMULADO` (padrão) ou `REAL`.

- **SIMULADO:** o adaptador responde com arquivos de `fixtures/receita/` montados exatamente no formato oficial (`docs/03`). Simula o assíncrono: POST devolve tíquete; a situação passa por `PENDENTE → EM_PROCESSAMENTO → CONCLUIDA` em segundos; o download entrega o JSON. A geração de DARF devolve uma resposta no formato oficial com valores calculados da proposta. Tudo marcado como simulado.
- **REAL:** mesmo contrato, chamando `https://api.receitafederal.gov.br/apuracao-cbs/v2/...` com token OAuth2 (client credentials). A URL do token **não consta** na documentação lida → variável `RFB_TOKEN_URL` e pendência. Só liga se todas as variáveis `RFB_*` existirem.

## Modelo de dados (tabelas)

| Tabela | Campos principais |
|---|---|
| `companies` | id, name, cnpj (14), cnpj_root (8), is_demo |
| `users` | id, name, email, role (`analista` \| `contador`) — fictícios |
| `invoices` | id, company_id, access_key (44), direction (`venda` \| `compra`), doc_model (55…), counterparty_cnpj, issued_at, period (`MM/AAAA`), total_cents, cbs_cents, source (`seed` \| `upload`) |
| `rfb_requests` | id, company_id, service (`debitos` \| `creditos` \| `pagamentos` \| `recolhimentos`), ticket, state, requested_at, eta_seconds, ready_at, downloaded_at, error_code, error_message, mode |
| `rfb_raw_files` | id, request_id, sha256, payload (jsonb), received_at — append-only |
| `rfb_debits` | company_id, access_key, period, origin, doc_model, issued_at, registered_at, updated_at, apurado_cents, saldo_devedor_cents, excedente_cents, inexigivel_cents, suspenso_cents, pgto_antecipado_cents, extinto_cents — único por (company_id, access_key, period, origin) |
| `rfb_credits` | company_id, access_key, period, origin, …, apurado_cents, apropriado_cents, a_apropriar_cents, inapropriavel_cents, suspenso_cents, prescrito_cents, utilizado_cents, inutilizavel_cents, restabelecido_cents, saldo_credor_cents, pedido_ressarcimento_cents |
| `rfb_payments` | company_id, darf_number (17), type (1 RAD \| 2 PCONT), collected_on, seq, period, due_date, counterparty_cnpj, access_key, principal/multa/juros/total_cents, source_service (`pagamentos` \| `recolhimentos`) |
| `reconciliation_items` | id, company_id, invoice_id?, access_key, period, kind (`debito` \| `credito`), status, invoice_cents, rfb_cents, diff_cents, rule_id, explanation, computed_at, contract_version |
| `rad_proposals` | id, company_id, invoice_id, access_key, option (`PAGAMENTO_TOTAL` \| `PAGAMENTO_PARCIAL`), partial_cents, justification, state, proposed_by, approved_by, decided_at, darf_pix, darf_barcode, darf_pdf_url, due_date, principal_cents, total_cents, rfb_return_code |
| `email_events` | id, email_id, proposal_id?, type (`email.sent`, `email.delivered`, …), received_at, raw_hash |
| `doc_watch` | id, url, title, last_version, last_checked_at, change_status, diff_text, alerted_at |
| `audit_log` | id, at, actor, action, entity, entity_id, result, details (jsonb, sem segredo) |

## Estados

- **Solicitação à Receita:** `solicitada → em_processamento → concluida → baixada → normalizada`; desvios: `erro`, `expirada` (após 240 min ou URL vencida).
- **Item de conciliação:** `conciliado`, `divergente_valor`, `so_na_nota`, `aguardando_janela`, `so_na_receita`, `atencao` (ver `docs/04`).
- **Proposta de RAD:** `rascunho → aguardando_aprovacao → aprovada → darf_gerado → pago_confirmado`; desvios: `recusada`, `erro_receita`, `vencida` (passou de `dataMaximaPagamento` sem confirmação).
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
| `FIRECRAWL_API_KEY` | sim | Radar |
| `ALERT_EMAIL` | sim | Destinatário dos alertas do radar |
| `RFB_CLIENT_ID`, `RFB_CLIENT_SECRET`, `RFB_TOKEN_URL`, `RFB_CNPJ` | só no modo REAL | Credencial da Receita |
| `RFB_DAILY_LIMIT` | não (padrão 4) | Cota por serviço e dia |
| `CRON_SECRET` | sim | Protege as rotas chamadas pelo Vercel Cron |
| `ANTHROPIC_API_KEY`, `LLM_MODEL` | não | Explicação redigida por LLM; sem eles, usa texto determinístico |
| `FORBIDDEN_TERMS` | só no Devin | Regex de termos que nunca podem ir ao repositório (usado pela skill `verificar-entrega`) |
| `RAD_CNPJ_FORMAT` | não (padrão 14) | Formato do CNPJ no path do RAD (pendência P3) |

`.env.example` lista todas, sem valores.
