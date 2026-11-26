# Deploy (Vercel + Neon)

O deploy é feito pelo time: conectar o repositório na Vercel a partir da `main`. O Devin não faz deploy.

## Build

- `vercel.json` usa `npm run vercel-build` = `npm run db:migrate && next build`: as migrations rodam no banco de produção antes de cada build.
- Cron diário `/api/demo/reset` às 09:00 UTC (06:00 de Brasília). A Vercel envia `Authorization: Bearer <CRON_SECRET>`; sem o segredo certo a rota responde 401. A rota aceita `GET` (como o Vercel Cron chama) e `POST`. Reset e botão público de reiniciar só existem em `RECEITA_MODE=SIMULADO`; em `REAL` respondem 409 sem tocar na base.
- Em `RECEITA_MODE=REAL`, `POST /api/receita/sync` e `POST /api/receita/poll` exigem `Authorization: Bearer <CRON_SECRET>` (401 sem ele); em SIMULADO ficam abertas para a demo pública. O modo REAL só sobe com as `RFB_*` e `PII_HASH_KEY`.
- Botão público "Reiniciar demonstração" em `/demo` → `POST /api/demo/reiniciar`: só em `SIMULADO`, 1 vez por minuto por IP (o IP vai para a auditoria só como hash).

## Variáveis de ambiente

Lista completa em `.env.example` (mesma tabela de `docs/02`). Para a S1 bastam:

| Variável | Valor na Vercel |
|---|---|
| `DATABASE_URL` | String de conexão do Neon (com `sslmode=require`) |
| `APP_URL` | URL pública do app, sem barra no fim |
| `RECEITA_MODE` | `SIMULADO` |
| `CRON_SECRET` | Texto aleatório longo (ex.: `openssl rand -hex 32`) |
| `DEMO_TODAY` | Deixar vazio (padrão `2026-11-20`) |

As demais (`RESEND_*`, `FIRECRAWL_API_KEY`, `ELEVENLABS_*`, `RFB_*`, `ANTHROPIC_API_KEY`, `LLM_MODEL`, `ALERT_EMAIL`, `FINANCEIRO_EMAIL`, `FORNECEDOR_EMAIL`, `RAD_CNPJ_FORMAT`, `RFB_DAILY_LIMIT`, `PII_HASH_KEY` (só REAL), `SIMULADO_RAPIDO`, `CONTADOR_TELEFONE`) entram nas sessões que as usam. `FORBIDDEN_TERMS` fica só nos Secrets do Devin, nunca na Vercel.

## Primeira carga

Depois do primeiro deploy, rodar o seed uma vez apontando para o Neon (`DATABASE_URL=… npm run db:seed`) ou chamar o reset com o `CRON_SECRET`.

## Desenvolvimento local

```bash
cp .env.example .env.local   # preencher DATABASE_URL=postgres://cbs:cbs_local_dev@localhost:5432/cbs e RECEITA_MODE=SIMULADO
docker compose up -d && npm i && npm run db:migrate && npm run db:seed && npm run dev
```
