# KingYouBe · Equipe CBS

> O escritório contábil não precisa de mais um sistema. Precisa de uma equipe.

Projeto da **KingYouBe** no **Hack Brasil 2026**. Página de apresentação: **https://hackbrasil.kingyoube.com**

## O problema

Escritório contábil não acha gente. Quem ele tem passa o dia conferindo nota por nota, um trabalho repetitivo que desperdiça quem sabe pensar.

A reforma tributária criou mais trabalho. A Receita Federal agora apura a CBS de cada nota fiscal e publica o resultado por API: débitos, créditos, pagamentos e recolhimentos. Alguém precisa conferir isso com as notas, cliente por cliente. Quando o fornecedor não recolhe a parte dele, o crédito do cliente fica travado. Desde novembro de 2026, o comprador pode recolher no lugar do fornecedor (recolhimento pelo adquirente, RAD), mas alguém precisa decidir quanto, quando e com que prova.

## A Equipe CBS

A KingYouBe entrega uma equipe digital para o escritório. Este repositório é a primeira contratação: a Equipe CBS.

| Quem | O que faz |
|---|---|
| Kim, a gestora | Responde por voz o que precisa de decisão hoje |
| Captura | Recebe as notas da carteira |
| Apuração | Busca a apuração da CBS na Receita |
| Conciliador | Casa nota com Receita e classifica cada diferença |
| Conferente | Refaz tudo de forma independente e aponta o que não bate |
| Analista | Explica cada diferença em português simples |
| Tesouraria | Prepara a guia de recolhimento (DARF RAD) |
| Vigia | Acompanha a documentação da Receita e acha o contato do fornecedor |
| Mensageiro | Cobra o fornecedor e avisa o financeiro |
| **Contador** | **Decide. Nenhuma guia sai sem a aprovação dele.** |

A regra fiscal calcula, a IA explica e fala, e o contador decide.

## Regras do projeto

- Nenhum DARF é gerado sem aprovação do contador, com trava no servidor.
- DARF gerado não é DARF pago: só a Receita confirma.
- Nenhum agente aprova o próprio trabalho.
- Dados de demonstração são fictícios e sempre marcados como simulados.
- Chaves e senhas só em cofre, nunca no código, em log ou em conversa.
- Valores em centavos inteiros. O projeto trata só a CBS (não o IBS).

## Tecnologia

Next.js, TypeScript, Postgres, APIs da apuração da CBS da Receita Federal, Firecrawl, Resend, Nvoip e ElevenLabs. Construído com o Devin.

## Status

Demonstração no ar: **https://hackbrasil.kingyoube.com**

> Dados simulados — não é consulta real à Receita. A base é fictícia (12 clientes, notas e empresas inventadas) e a API da Receita roda no modo `SIMULADO`, com respostas tiradas do contrato oficial. Toda tela mostra esse aviso.

O que já funciona:

- **Fundação (S1):** base de demonstração com 12 clientes e 412 notas, carteira, trilha de auditoria append-only e botão para reiniciar a demonstração.
- **Apuração (S2):** consulta assíncrona de débitos, créditos, pagamentos e recolhimentos da CBS (solicitar, acompanhar, baixar, normalizar), com webhook e cron protegidos.
- **Conciliação, Analista e Carteira (S3):** nota contra Receita pelas regras determinísticas de `docs/04`, explicação de cada diferença em português e semáforos de clientes e fornecedores.
- **Tesouraria e Mensageiro (S4):** proposta de RAD preparada pelo agente, enviada pelo Analista e decidida pelo contador (trava no servidor), DARF gerado, e-mail ao financeiro (Resend ou simulado) e WhatsApp simulado, e confirmação do pagamento pelos recolhimentos.
- **Vigia, contato e cobrança (S5):** o Vigia lê as 9 páginas oficiais da Receita (Firecrawl, com diff e alerta de versão) e acha o contato financeiro do fornecedor no site dele; o Mensageiro cobra o fornecedor por e-mail (idempotente) e WhatsApp simulado, e a resposta atualiza o semáforo.
- **Sala da Equipe, Conferente, horas e organograma (S6):** página inicial com a rodada da equipe, um agente por chamada e idempotente (Captura, Apuração, Conciliador, Conferente, Analista, Tesouraria, Vigia, Mensageiro e Kim), cada um com anel "trabalhando", check e resumo, e no fim o que precisa da decisão do contador; o Conferente refaz a conciliação do zero, com código próprio, e marca `revisado_ok` ou `revisado_divergente` sem corrigir nada; tela Equipe com organograma (Contador → Kim → 8 agentes), horas devolvidas (Σ contagem × minutos ÷ 60), projeção para 200 clientes ("projeção, não medição") e premissas que só o contador muda, com auditoria.

O que vem a seguir está em [`docs/08-BACKLOG.md`](docs/08-BACKLOG.md); o que ainda depende de decisão está em [`docs/PENDENCIAS.md`](docs/PENDENCIAS.md).

## Como rodar

Precisa de Node.js 22 e Docker.

```bash
cp .env.example .env.local   # DATABASE_URL=postgres://cbs:cbs_local_dev@localhost:5432/cbs e RECEITA_MODE=SIMULADO
docker compose up -d         # Postgres local
npm i
npm run db:migrate
npm run db:seed              # recria a base de demonstração
npm run dev                  # http://localhost:3000
```

Antes de abrir um PR, `npm run verify` (lint, typecheck e testes) tem que passar.
