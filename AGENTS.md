# AGENTS.md — Conciliação CBS (KingYouBe · Hack Brasil 2026)

Você é o engenheiro deste repositório. Leia este arquivo inteiro antes de qualquer tarefa. Ele é curto de propósito; o detalhe está em `docs/`.

## O que é o produto

Sistema que concilia as **notas fiscais** de uma empresa com o que a **Receita Federal apurou de CBS** (débitos, créditos, pagamentos e recolhimentos), explica cada **divergência** e, quando a empresa é compradora, **prepara o DARF de recolhimento como adquirente (RAD)** para um contador aprovar. Tudo com trilha de auditoria.

Fluxo: nota → apuração da Receita → conciliação → divergência explicada → proposta de RAD → aprovação humana → DARF gerado → e-mail ao financeiro → pagamento confirmado pela Receita → conciliado.

## Onde está cada coisa

| Arquivo | Para quê |
|---|---|
| `docs/01-PRODUTO.md` | Problema, usuários, telas, roteiro da demo |
| `docs/02-ARQUITETURA.md` | Stack, módulos, modelo de dados, estados, rotas, variáveis de ambiente |
| `docs/03-CONTRATO-RECEITA-CBS.md` | Contrato oficial da API da Receita (fonte de verdade dos campos) |
| `docs/04-REGRAS-CONCILIACAO.md` | Regras determinísticas de conciliação e de candidata a RAD |
| `docs/05-PARCEIROS.md` | Firecrawl, Resend e Devin: como e onde usar |
| `docs/06-DADOS-DEMO.md` | Cenários da base fictícia (seed) |
| `docs/07-SEGURANCA.md` | Regras de segurança e LGPD |
| `docs/08-BACKLOG.md` | Sessões S1–S6, com critérios de aceite |

## Stack (não troque sem pedir)

- Node.js 22 LTS, TypeScript estrito, **Next.js 15 (App Router)**, Tailwind + shadcn/ui.
- **Postgres** (Neon em produção; Postgres local em Docker no desenvolvimento) com **Drizzle ORM** e migrations versionadas.
- **Vitest** para testes; ESLint; `tsc --noEmit`.
- Deploy na **Vercel** a partir da `main` (o usuário conecta; você não faz deploy).
- SDKs: `firecrawl` (pacote oficial, classe `Firecrawl`), `resend` (classe `Resend`), `svix` só se precisar verificar webhook manualmente.

## Comandos (mantenha funcionando)

```bash
npm run dev        # app local
npm run db:migrate # aplica migrations
npm run db:seed    # recria a base de demonstração (idempotente)
npm run verify     # lint + typecheck + testes — TEM que passar antes de qualquer PR
```

## Regras que não se negociam

1. **Não invente** endpoint, campo JSON, regra fiscal ou capacidade de API. Use só `docs/03-CONTRATO-RECEITA-CBS.md`. O que não estiver lá vira pendência em `docs/PENDENCIAS.md`, nunca suposição no código.
2. **CBS não é IBS.** Este sistema trata só CBS.
3. **DARF gerado não é DARF pago.** Só a consulta de pagamentos/recolhimentos confirma pagamento.
4. **Dinheiro em centavos inteiros** (`bigint`). Converta os valores da Receita (`number 18,2`) a partir da string, sem `float`. Nunca arredonde em silêncio.
5. **Aprovação humana com trava no servidor:** nenhuma chamada de geração de DARF sem proposta em estado `aprovada`, e quem aprova tem que ser diferente de quem propôs. A trava fica na rota/serviço, não só na tela. Há teste que tenta furar.
6. **Dado simulado é sempre marcado.** Em modo `SIMULADO`, a tela mostra o selo "Dados simulados — não é consulta real à Receita". Nunca apresente simulação como real.
7. **Segredo só em variável de ambiente** (Secrets do Devin / Vercel). Nunca em código, teste, log, commit, mensagem de PR ou prompt. Não logar URL assinada, token nem corpo de webhook.
8. **Regra fiscal é determinística e testada.** IA (se houver) só redige explicação a partir de fatos já calculados; nunca decide valor nem status.
9. **Trilha de auditoria:** toda ação relevante (consulta, download, conciliação, proposta, aprovação, DARF, e-mail, alerta) grava quem, o quê, quando, resultado — sem segredo.
10. **Scraping só de páginas públicas oficiais** (documentação da Receita) e nunca de dados de pessoa física. Não burlar captcha.

## Como trabalhar

- Antes de codar, escreva em até 10 linhas: entidade afetada, transição de estado (de → para), arquivos que vai mexer e como vai verificar.
- Uma sessão = um PR, com título `[Sx] ...`. Branch `sx-descricao-curta`. Não faça merge.
- Teste o que construiu: rode `npm run verify`, suba o app e confira a tela no navegador; anexe screenshot no PR.
- No fim, rode a skill `verificar-entrega` (`.agents/skills/verificar-entrega/SKILL.md`) e cole o resultado no PR.
- Código e identificadores em inglês; textos da interface, docs e mensagens de commit em português do Brasil, com acentuação correta.
- Se travar em algo que depende do usuário (chave, domínio, decisão), pare e pergunte em uma linha objetiva.
- Marque todo PR com o rótulo `devin` e preencha `docs/DEVIN-LOG.md` (sessão, PR, o que fez, tempo).

## Definição de pronto (vale para toda sessão)

- [ ] `npm run verify` verde.
- [ ] Critérios de aceite da sessão em `docs/08-BACKLOG.md` cumpridos, cada um com evidência (teste, screenshot ou saída de comando).
- [ ] Nenhum segredo nem termo proibido no diff (itens 3 e 4 da skill `verificar-entrega`).
- [ ] `docs/PENDENCIAS.md` e `docs/DEVIN-LOG.md` atualizados.
