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

Em construção durante o Hack Brasil 2026. A especificação está em [`docs/`](docs/). Os comandos para rodar a demonstração entram aqui assim que o código estiver no repositório.
