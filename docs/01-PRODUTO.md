# 01 — Produto

## Problema

Desde 2026 a Receita Federal apura a CBS a partir dos documentos fiscais eletrônicos e publica, por API, os débitos, créditos, pagamentos e recolhimentos de cada empresa. Escritórios contábeis e empresas menores não têm como conferir isso com as próprias notas: os dados chegam de forma assíncrona, em arquivos que expiram em 48 horas, com janela de 8 dias e 4 consultas por dia. Divergência que ninguém vê vira débito em aberto, crédito perdido ou multa.

Em 13/11/2026 a Receita publicou a geração de DARF para **recolhimento pelo adquirente (RAD)**: a empresa compradora pode recolher a CBS da nota do fornecedor para apropriar o próprio crédito. Isso precisa de controle: quem decide, quanto, com que prova.

## Proposta

> A KingYouBe não é calculadora tributária: é um sistema de ação que liga nota, apuração, recolhimento e prova.

## Usuários

| Papel | O que faz no sistema |
|---|---|
| **Analista** (escritório ou financeiro) | Sincroniza com a Receita, olha divergências, propõe RAD |
| **Contador responsável** | Aprova ou recusa a proposta de RAD; é quem responde pelo recolhimento |
| **Financeiro da empresa** | Recebe por e-mail o DARF aprovado (Pix, código de barras, PDF, vencimento) |

Na demo, um seletor de papel no topo troca entre Analista e Contador (usuários fictícios). A troca fica registrada na auditoria.

## Telas (MVP)

1. **Painel** — período selecionado; totais de CBS (débito apurado, saldo devedor, crédito apurado, saldo credor); contagem por status de conciliação; última sincronização e cota restante do dia; selo de modo (SIMULADO/REAL).
2. **Sincronização** — lista de solicitações à Receita com estado (`solicitada → em_processamento → concluida → baixada → normalizada` ou `erro`/`expirada`), tíquete, horários; botão "Sincronizar agora" que respeita a cota.
3. **Conciliação** — tabela nota × Receita com filtros (vendas/compras, status, período). Cada linha: chave, contraparte, valor CBS da nota, valor da Receita, diferença, status com cor.
4. **Detalhe da divergência** — os dois lados lado a lado, regra que disparou, evidência (arquivo de origem, data, versão do contrato), explicação em linguagem simples, ações possíveis.
5. **RAD** — candidatas (compras com crédito a apropriar); proposta (total ou parcial, com justificativa); fila do contador (aprovar/recusar); DARF gerado (Pix, código de barras, link do PDF, vencimento, valores); status do pagamento.
6. **Radar da documentação** — páginas oficiais monitoradas pelo Firecrawl, versão atual de cada uma, diff quando mudou, alerta enviado.
7. **Auditoria** — linha do tempo filtrável de tudo que aconteceu.

## Fora do escopo

IBS; captura real da Qive; DARF do contribuinte (PCONT) além de exibir pagamentos; login real com senha; multiempresa além da empresa de demonstração; pagar o DARF (o sistema nunca paga).

## Roteiro da demo (3 minutos)

1. Painel em modo SIMULADO: "12 itens, 5 conciliados, 7 pedem atenção, 2 candidatas a RAD".
2. Abrir uma divergência de venda: nota diz R$ 120,00, Receita apurou R$ 132,00 — explicação e evidência.
3. Ir em RAD: compra com crédito travado porque o fornecedor não recolheu. Analista propõe recolhimento total.
4. Tentar gerar DARF como Analista → **bloqueado** ("precisa de aprovação do contador").
5. Trocar para Contador → aprovar → DARF gerado (Pix, código de barras, PDF) → e-mail chega ao financeiro (Resend), status "entregue".
6. Sincronizar recolhimentos → a Receita confirma o RAD → linha vira **Conciliado**.
7. Radar: a página "Gerar DARF RAD" da Receita mudou de versão — o Firecrawl detectou e o time foi avisado.
8. Auditoria: cada passo com quem, quando e prova.
