# 05 — Parceiros do Hack Brasil (uso obrigatório: Firecrawl, Resend, Devin)

O júri pontua o **uso das ferramentas dos parceiros**. Cada uma tem papel necessário no produto, não decorativo. O README final tem a seção "Como usamos cada parceiro", com links para o código.

## Firecrawl — Radar da documentação oficial

**Por quê:** o sistema depende de um contrato que a Receita muda com frequência (débitos já está na versão 1.3; a API de RAD nasceu em 13/11/2026). Se a Receita muda um campo e ninguém vê, a conciliação quebra em silêncio.

**O quê:** monitorar estas páginas (tabela `doc_watch`, carga inicial no seed):
`guiaapiassincrona.html`, `debito.html`, `credito.html`, `pagamentos.html`, `recolhimentos.html`, `situacao-solicitacao.html`, `gerar-darf-ad.html`, `gerar-darf-contrib.html`, `faq.html` — todas em `https://docs.receitafederal.gov.br/apuracao-cbs/`.

**Como (API v2, confirmada em 24/11/2026):**
- SDK `firecrawl`: `import { Firecrawl } from 'firecrawl'; const fc = new Firecrawl({ apiKey: process.env.FIRECRAWL_API_KEY });`
- `await fc.scrape(url, { formats: ['markdown', { type: 'changeTracking', modes: ['git-diff'], tag: 'receita-cbs' }] })`.
- Resposta em `changeTracking`: `changeStatus` = `new` | `same` | `changed` | `removed`; `previousScrapeAt`; com `changed`, `diff.text`.
- Do markdown, extrair a **versão atual da página** (tabela de histórico de versões) para `last_version`.
- Com `changed`: gravar diff, auditoria, e enviar alerta pela Resend para `ALERT_EMAIL` ("Contrato da Receita mudou: Débitos 1.3 → 1.4"). Comparar com `CONTRACT_VERSION` do código e mostrar "código desatualizado" quando a página estiver à frente.
- Limites do plano grátis: 1.000 créditos na chave gratuita; 10 scrapes/min → processar as 9 páginas em fila, com pausa.
- Disparo: botão "Verificar agora" + Vercel Cron diário em `POST /api/radar/check` (protegido por `CRON_SECRET`).

**Proibido:** scraping de qualquer coisa que não seja documentação pública oficial; dados de pessoa física; burlar captcha.

## Resend — o DARF chega a quem paga, com prova

**Por quê:** o DARF aprovado precisa chegar ao financeiro com prazo, e o escritório precisa provar que avisou.

**O quê:**
1. E-mail "DARF RAD aprovado" para `FINANCEIRO_EMAIL` quando a proposta vira `darf_gerado`: empresa, nota (chave mascarada no meio), valor, vencimento (`dataMaximaPagamento`), chave Pix, código de barras, link do PDF, quem aprovou. Texto: "Este e-mail não confirma pagamento."
2. Alerta do radar para `ALERT_EMAIL`.
3. Webhook `POST /api/resend/webhook`: guardar `email.sent`, `email.delivered`, `email.delivery_delayed`, `email.bounced`, `email.opened`, `email.failed` em `email_events`; mostrar o status na tela do DARF ("entregue às 14:32").

**Como (confirmado em 24/11/2026):**
- SDK `resend`: `const resend = new Resend(process.env.RESEND_API_KEY); await resend.emails.send({ from, to, subject, html }, { idempotencyKey })` — ou `POST https://api.resend.com/emails` com `Authorization: Bearer`.
- Cabeçalho `Idempotency-Key` (até 256 caracteres, vale 24 h): usar `darf-<proposalId>` para nunca duplicar.
- Webhook: verificar com o **corpo bruto** e os headers `svix-id`, `svix-timestamp`, `svix-signature` (`resend.webhooks.verify(...)` ou pacote `svix`). Reparsear o JSON antes de verificar quebra a assinatura.
- Remetente: domínio verificado na Resend (`RESEND_FROM`). Sem domínio verificado, usar o remetente de teste só para o e-mail da própria conta — comportamento a confirmar.

## Devin — quem construiu

**Por quê:** o produto inteiro é construído pelo Devin em sessões curtas, cada uma com PR, testes e evidência.

**Como registrar:** rótulo `devin` em todo PR; `docs/DEVIN-LOG.md` com sessão, PR, escopo, tempo, o que precisou de correção humana. No fim (S6), a seção do README "Construído com Devin" traz números reais desse log.

## AbacatePay — fora

Tributo se paga pelo canal oficial (Pix/código de barras do DARF). Não usar gateway de terceiros para pagar DARF.
