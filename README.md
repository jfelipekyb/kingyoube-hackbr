# KingYouBe · Equipe CBS

> O escritório contábil não precisa de mais um sistema. Precisa de uma equipe.

Projeto da **KingYouBe** no **Hack Brasil 2026**.

**Demonstração pública:** https://hackbrasil.kingyoube.com · roteiro guiado em [/demo](https://hackbrasil.kingyoube.com/demo)

![Tour da Equipe CBS: os 8 passos da primeira visita](docs/img/tour.gif)

> Dados simulados — não é consulta real à Receita. A base é fictícia (12 clientes, 412 notas, empresas inventadas) e a Receita roda em modo `SIMULADO`, com respostas tiradas do contrato oficial. Toda tela mostra esse aviso.

## O problema

Escritório contábil não acha gente. Quem ele tem passa o dia conferindo nota por nota, um trabalho repetitivo que desperdiça quem sabe pensar.

A reforma tributária criou mais trabalho. A Receita Federal agora apura a CBS de cada nota fiscal e publica o resultado por API: débitos, créditos, pagamentos e recolhimentos. Alguém precisa conferir isso com as notas, cliente por cliente. Quando o fornecedor não recolhe a parte dele, o crédito do cliente fica travado. Desde novembro de 2026, o comprador pode recolher no lugar do fornecedor (recolhimento pelo adquirente, RAD), mas alguém precisa decidir quanto, quando e com que prova.

## A equipe digital

A KingYouBe entrega uma equipe digital para o escritório. Este repositório é a primeira contratação: a Equipe CBS. Cada agente faz uma parte, registra o que fez e entrega para o próximo. Nenhum aprova o próprio trabalho.

| Quem | O que faz | Regra ou IA? |
|---|---|---|
| **Contador** | **Decide. Nenhuma guia sai sem a aprovação dele.** | Pessoa |
| Kim, a gestora | Responde por texto ou voz o que precisa de decisão hoje | Intenção e números por regra; voz sintética (ElevenLabs) |
| Captura | Recebe as notas da carteira | Regra |
| Apuração | Busca na Receita débitos, créditos, pagamentos e recolhimentos | Regra (contrato oficial) |
| Conciliador | Casa nota com Receita e classifica cada diferença (R01–R06) | Regra |
| Conferente | Refaz a conciliação do zero, com código próprio, e aponta o que não bate | Regra |
| Analista | Explica cada diferença em português simples | Texto por regra; LLM opcional só reescreve, sem mudar número |
| Tesouraria | Prepara a proposta de DARF RAD para o contador | Regra |
| Vigia | Lê a documentação oficial da Receita e acha o contato do fornecedor | Firecrawl em lista fechada de páginas |
| Mensageiro | Cobra o fornecedor e manda o DARF ao financeiro | Resend; WhatsApp simulado |

**A regra fiscal calcula, a IA explica e fala, e o contador decide.** Valor, status e estado de proposta saem só de código determinístico e testado. A IA, quando existe, redige texto a partir de fatos já calculados ou dá voz ao que a base já respondeu.

## Arquitetura

```mermaid
flowchart LR
  subgraph Tela["Next.js 15 (App Router)"]
    Sala["Sala da Equipe"] --> Run["/api/equipe/run"]
    Kim["Kim (texto e voz)"]
    RAD["RAD e DARF"]
  end
  Run --> Agentes["Agentes (src/services)"]
  Agentes --> Regras["Regras determinísticas<br/>conciliação, Conferente, RAD"]
  Agentes --> Receita["ReceitaAdapter<br/>SIMULADO | REAL"]
  Agentes --> Firecrawl["Firecrawl<br/>docs da Receita e site do fornecedor"]
  Agentes --> Resend["Resend<br/>cobrança e DARF por e-mail"]
  Agentes --> WhatsApp["WhatsApp simulado<br/>(Nvoip na S9)"]
  Kim --> Eleven["ElevenLabs<br/>fala e escuta, só no servidor"]
  RAD -->|trava no servidor: só proposta aprovada| Receita
  Regras --> DB[("Postgres + Drizzle<br/>auditoria append-only<br/>agent_events")]
  Receita --> DB
  Resend --> DB
```

## O fluxo

nota → apuração da Receita → conciliação → conferência independente → divergência explicada → cobrança ao fornecedor → proposta de RAD → **aprovação do contador** → DARF gerado → e-mail ao financeiro → pagamento confirmado pela Receita → conciliado.

Na demonstração, a Padaria Boa Massa aparece no topo da Carteira. O Moinho Estrela (nota 1.284, CBS R$ 436,50) não recolheu e está amarelo; a Equipamentos Forno Forte recusou e está vermelha. A Tesouraria prepara a RAD do Moinho, a Analista envia, o Contador aprova, o DARF sai com Pix e código de barras, o Mensageiro manda ao financeiro e, na sincronização seguinte, a Receita confirma o pagamento (`pago_confirmado`). O passo a passo está em [/demo](https://hackbrasil.kingyoube.com/demo).

## Regras que não se negociam

- Nenhum DARF é gerado sem proposta aprovada, e quem aprova é diferente de quem propôs. A trava fica no servidor ([`src/services/rad/index.ts`](src/services/rad/index.ts)), com teste que tenta furar.
- DARF gerado não é DARF pago: só a consulta de recolhimentos da Receita confirma ([`src/services/rad/confirm.ts`](src/services/rad/confirm.ts)).
- Nenhum agente aprova o próprio trabalho. A Kim fala, mas não aprova, não recusa e não gera DARF por voz.
- Dinheiro em centavos inteiros (`bigint`), lido da string da Receita, sem `float`.
- Dado simulado é sempre marcado. O projeto trata só a CBS (não o IBS).
- Toda ação relevante grava quem, o quê, quando e resultado na auditoria, sem segredo.
- Chaves só em variável de ambiente, nunca no código, em log ou em conversa.

## Como usamos cada parceiro

| Parceiro | Para quê | Código |
|---|---|---|
| **Firecrawl** | O Vigia lê as 9 páginas oficiais da documentação da Receita (markdown com `changeTracking`, diff e alerta de versão) e o site do fornecedor para achar o contato financeiro, com lista fechada de URLs e nunca dado de pessoa | [`src/services/vigia/scrape.ts`](src/services/vigia/scrape.ts), [`src/services/vigia/radar.ts`](src/services/vigia/radar.ts), [`src/services/fornecedor/`](src/services/fornecedor) |
| **Resend** | O Mensageiro cobra o fornecedor e envia o DARF ao financeiro, com `Idempotency-Key`; o webhook (Svix) atualiza o status | [`src/services/notificacao/index.ts`](src/services/notificacao/index.ts), [`src/app/api/resend/webhook/route.ts`](src/app/api/resend/webhook/route.ts) |
| **Devin** | Construiu o projeto sessão a sessão, um PR por sessão, guiado pelo [`AGENTS.md`](AGENTS.md) e pela skill [`verificar-entrega`](.agents/skills/verificar-entrega/SKILL.md) | [`docs/DEVIN-LOG.md`](docs/DEVIN-LOG.md) |
| **ElevenLabs** | Voz e escuta da Kim (`eleven_multilingual_v2` com tempos por caractere para a boca do avatar, `scribe_v3` em português), só no servidor e com cache do áudio; narração opcional do tour | [`src/services/kim/voz.ts`](src/services/kim/voz.ts), [`src/app/api/kim/falar/route.ts`](src/app/api/kim/falar/route.ts), [`src/app/api/tour/falar/route.ts`](src/app/api/tour/falar/route.ts) |
| **Nvoip (simulada)** | WhatsApp ao financeiro e ao fornecedor e resumo do dia ao contador, em modo `SIMULADO`, com prévia na tela | [`src/services/notificacao/index.ts`](src/services/notificacao/index.ts), [`src/services/kim/resumo.ts`](src/services/kim/resumo.ts) |

## Construído com Devin

Números de [`docs/DEVIN-LOG.md`](docs/DEVIN-LOG.md):

- **10 sessões** do Devin entre 25 e 27 de novembro de 2026 (S1 a S8, com a S4 em duas sessões), uma por PR.
- **9 PRs** de sessão: [S1](https://github.com/jfelipekyb/kingyoube-hackbr/pull/1), [S2](https://github.com/jfelipekyb/kingyoube-hackbr/pull/2), [S-Design](https://github.com/jfelipekyb/kingyoube-hackbr/pull/4), [S3](https://github.com/jfelipekyb/kingyoube-hackbr/pull/5), [S4](https://github.com/jfelipekyb/kingyoube-hackbr/pull/6), [S5](https://github.com/jfelipekyb/kingyoube-hackbr/pull/7), [S6](https://github.com/jfelipekyb/kingyoube-hackbr/pull/8), [S7](https://github.com/jfelipekyb/kingyoube-hackbr/pull/9) e a S8.
- **302 testes** em 46 arquivos no `npm run verify` (de 62 na S1).
- Cada PR passou pelo Devin Review; os achados corrigidos estão no registro.

## Como rodar

Precisa de Node.js 22 e Docker.

```bash
cp .env.example .env.local   # DATABASE_URL=postgres://cbs:cbs_local_dev@localhost:5432/cbs e RECEITA_MODE=SIMULADO
docker compose up -d         # Postgres local
npm ci
npm run db:migrate
npm run db:seed              # recria a base de demonstração
npm run dev                  # http://localhost:3000
```

- `npm run verify`: lint, typecheck e testes; tem que passar antes de qualquer PR.
- `npm run smoke -- https://hackbrasil.kingyoube.com`: smoke pós-deploy (painel, rodada da equipe, Kim em texto e o C2 até `pago_confirmado`). Só em modo `SIMULADO`; começa e termina reiniciando a demonstração.

Sem chaves de parceiros, tudo funciona em modo simulado: e-mail simulado, Kim em texto, Vigia sem leitura nova. Deploy, cron e variáveis estão em [`docs/DEPLOY.md`](docs/DEPLOY.md). A demonstração pública roda em servidor próprio com Docker; o [`vercel.json`](vercel.json) fica como alternativa documentada.

## Limitações e pendências

- **Receita em `SIMULADO`:** as respostas seguem o contrato oficial, mas nenhuma consulta é real.
- **E-mail real depende do domínio na Resend:** sem domínio verificado, o envio fica restrito ou simulado.
- **WhatsApp e ligação simulados:** o adaptador da Nvoip entra na S9; hoje a mensagem aparece como prévia.
- **Sem login de verdade:** o papel (Analista ou Contador) é trocado no cabeçalho. Em modo `REAL`, as rotas sensíveis exigem `CRON_SECRET`.
- O que ainda depende de decisão está em [`docs/PENDENCIAS.md`](docs/PENDENCIAS.md); o plano, em [`docs/08-BACKLOG.md`](docs/08-BACKLOG.md).

## Time

Felipe Vieira, Jeferson Komati e Oscar.

Licença [MIT](LICENSE).
