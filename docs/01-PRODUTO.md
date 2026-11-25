# 01 — Produto

## Problema

Escritórios contábeis não acham gente. Quem eles têm passa o dia em trabalho repetitivo, conferindo nota por nota, e o profissional que sabe pensar gasta o tempo fazendo o que uma máquina faz melhor.

A reforma tributária criou um trabalho novo. Desde 2026 a Receita Federal apura a CBS a partir dos documentos fiscais eletrônicos e publica, por API, os débitos, créditos, pagamentos e recolhimentos de cada empresa. Alguém precisa conferir isso com as notas, cliente por cliente: os dados chegam de forma assíncrona, em arquivos que expiram em 48 horas, com janela de 8 dias e 4 consultas por dia. Divergência que ninguém vê vira débito em aberto, crédito perdido ou multa.

Em 13/11/2026 a Receita publicou a geração de DARF para **recolhimento pelo adquirente (RAD)**: o comprador pode recolher a CBS da nota do fornecedor que não recolheu, para não perder o próprio crédito. Isso precisa de controle: quem decide, quanto, com que prova.

## Proposta

> A KingYouBe não entrega mais um sistema. Entrega uma equipe.
> Este projeto é a primeira contratação: a **Equipe CBS**. Uma fatia de uma plataforma maior, que resolve um problema inteiro, de ponta a ponta.

A equipe é formada por agentes com nome e função (`docs/09`). A **Kim** é a gestora e responde por voz. O **contador** decide.

## Usuários

| Papel | O que faz no sistema |
|---|---|
| **Contador responsável** | Pergunta à Kim o que precisa decidir; aprova ou recusa a proposta de RAD; é quem responde pelo recolhimento |
| **Analista** (escritório) | Acompanha a equipe, revisa divergências, envia propostas para aprovação |
| **Financeiro do cliente** | Recebe por e-mail o DARF aprovado (Pix, código de barras, PDF, vencimento) |
| **Fornecedor do cliente** | Recebe por e-mail a cobrança do recolhimento que faltou |

Na demo, um seletor de papel no topo troca entre Analista e Contador (usuários fictícios). A troca fica registrada na auditoria.

## Telas (MVP)

1. **Sala da Equipe** (página inicial) — cartões dos agentes com status ao vivo, linha do tempo das entregas, botão "Rodar a equipe"; o Conferente fecha com "N de N conferidas".
2. **Kim** — botão de microfone, botões de pergunta pronta, resposta falada com legenda, rótulo "voz sintética".
3. **Carteira** — clientes ordenados por dinheiro em risco; por cliente: itens, decisões pendentes, crédito travado, última sincronização.
4. **Painel do cliente** — totais de CBS (débito apurado, saldo devedor, crédito apurado, saldo credor); contagem por status; candidatas a RAD; cota restante.
5. **Sincronização** — solicitações à Receita por cliente, com estado (`solicitada → em_processamento → concluida → baixada → normalizada` ou `erro`/`expirada`), tíquete, horários; "Sincronizar agora" respeita a cota.
6. **Conciliação** — tabela nota × Receita com filtros (cliente, vendas/compras, status, período): chave, contraparte, CBS da nota, valor da Receita, diferença, status com cor.
7. **Detalhe da divergência** — os dois lados lado a lado, regra que disparou, evidência (arquivo de origem, data, versão do contrato), explicação do Analista, resultado do Conferente, ações possíveis.
8. **Fornecedor** — contato financeiro encontrado pelo Vigia (Firecrawl), histórico de notas sem recolhimento, e-mail de cobrança com status de entrega.
9. **RAD** — candidatas; proposta preparada pela Tesouraria (total ou parcial, com justificativa); fila do contador (aprovar/recusar); DARF gerado (Pix, código de barras, link do PDF, vencimento, valores); status do pagamento.
10. **Radar da documentação** — páginas oficiais monitoradas pelo Vigia, versão atual de cada uma, diff quando mudou, alerta enviado.
11. **Equipe** — organograma (contador → Kim → agentes), horas devolvidas com premissas editáveis, projeção para N clientes, próximas contratações apagadas.
12. **Auditoria** — linha do tempo filtrável de tudo o que aconteceu, humano e agente.

## Fora do escopo

IBS (aparece só como próxima contratação no organograma); captura real da Qive; DARF do contribuinte (PCONT) além de exibir pagamentos; login real com senha; pagar o DARF (o sistema nunca paga); qualquer ação por voz que não seja responder.

## Roteiro da demo (3 minutos)

1. **Sala da Equipe:** "Rodar a equipe" → Captura, Apuração, Conciliador, Conferente ("413 de 413 conferidas"), Analista, Tesouraria, Vigia, Mensageiro.
2. **Kim:** "Kim, o que eu preciso decidir hoje?" → resposta falada: 412 notas, 12 clientes, 3 decisões na Padaria Boa Massa, R$ 1.236,50 de crédito travado, fornecedores já cobrados.
3. **Carteira:** Padaria Boa Massa no topo → detalhe da nota 1.284 (crédito a apropriar R$ 436,50; o moinho não recolheu).
4. **Fornecedor:** contato achado pelo Vigia; cobrança entregue.
5. **RAD:** proposta pronta → Analista tenta gerar DARF → **bloqueado** → Contador aprova → DARF (Pix, código de barras, PDF) → e-mail ao financeiro "entregue".
6. **Confirmação:** sincronizar recolhimentos → a Receita confirma o RAD → item vira **Conciliado**.
7. **Auditoria:** cada passo com quem (humano ou agente), quando e prova.
8. **Equipe:** horas devolvidas e organograma com as próximas contratações apagadas.
