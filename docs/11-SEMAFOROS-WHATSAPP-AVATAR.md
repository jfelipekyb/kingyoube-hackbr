# 11 — Semáforo de fornecedores e clientes, WhatsApp e avatar da Kim

Pedido dos sócios depois da aprovação do escopo. **Nada aqui muda as contagens de `docs/06`** (12 clientes, 412 notas, 413 itens, R$ 1.519,50 em risco, R$ 1.236,50 travado, 3 decisões): só acrescenta campos, classificação e telas.

## 1. Semáforo de fornecedores (contas a pagar)

Cada fornecedor de cada cliente recebe uma cor, calculada pela regra (nunca pelo modelo de linguagem):

| Cor | Situação | Recomendação mostrada | Quem age |
|---|---|---|---|
| **Verde** | Fornecedor recolhe a CBS: todas as compras dele estão com o crédito apropriado (`aApropriar = 0`), ou foram regularizadas por RAD já confirmado | Nenhuma ação | — |
| **Amarelo** | Fornecedor **não recolheu** (alguma compra com `aApropriar > 0`) e **aceita o RAD** ou ainda não respondeu | **Recolher via RAD** (a Tesouraria prepara; o contador aprova) e cobrar o fornecedor | Tesouraria, Mensageiro, contador |
| **Vermelho** | Fornecedor **não recolheu** e **recusou o RAD** (não aceita o desconto do valor no pagamento) | **Não pagar a parte da CBS até regularizar**, negociar ou trocar de fornecedor; RAD só com decisão expressa do contador, com o aviso de que haverá disputa | Contador |

- Campo novo em `counterparties`: `rad_acordo` (`aceita` \| `recusa` \| `sem_resposta`, padrão `sem_resposta`) + `rad_acordo_em` + `rad_acordo_fonte` (`cadastro` \| `resposta_cobranca` \| `simulado`).
- Função pura `supplierLight(companyId, counterpartyId) → 'verde' | 'amarelo' | 'vermelho'` com teste para cada linha da tabela.
- **Seed (sem mudar contagens):** Moinho Estrela = `sem_resposta` → **amarelo**. Equipamentos Forno Forte = `recusa` (fonte `simulado`, "respondeu a uma cobrança anterior que não aceita o desconto") → **vermelho**. O fornecedor da C5 (RAD já confirmado) → **verde**, com selo "regularizado via RAD". Todos os demais → **verde**.
- Na tela de RAD, a proposta para fornecedor vermelho mostra o aviso em vermelho e exige que o contador marque "Estou ciente da recusa do fornecedor" antes de aprovar (trava no servidor, com teste).
- O Mensageiro, ao cobrar, oferece ao fornecedor as duas respostas ("Vou recolher" e "Não aceito o RAD"); na demo, a resposta é simulada e registrada em `agent_events` e na auditoria.

## 2. Semáforo de clientes (contas a receber)

O mesmo raciocínio do lado das vendas: o risco é a empresa dever a CBS de uma venda que o cliente ainda não pagou.

| Cor | Situação | Recomendação mostrada |
|---|---|---|
| **Verde** | Cliente pagou e a CBS da venda está extinta ou sem saldo devedor | Nenhuma ação |
| **Amarelo** | Venda **a receber**, ainda no prazo, com CBS em aberto na Receita (saldo devedor > 0) | Cobrar o cliente antes do vencimento da CBS |
| **Vermelho** | Venda **vencida** (cliente inadimplente) com CBS em aberto | Recolher a CBS para não gerar multa e cobrar o cliente; avaliar suspender novas vendas a prazo |

- Campo novo em `invoices` (só vendas): `recebimento` (`recebido` \| `a_receber` \| `vencido`) + `vencimento_titulo`.
- Função pura `customerLight(...)` com teste.
- **Seed (sem mudar contagens):** V2 = `a_receber` → **amarelo**; V6 = `vencido` → **vermelho**; todas as outras vendas = `recebido` → **verde**.
- **Leitura a confirmar com os sócios:** "contas a receber" foi interpretado como o risco de CBS em aberto de vendas não recebidas. Se a intenção for outra, só muda esta seção.

## 3. Telas e Kim

- **Fornecedores** (tela 8 de `docs/01`) vira lista com semáforo: filtro por cor, contagem por cor no topo, recomendação por linha.
- **Clientes do cliente** (aba nova dentro do Painel do cliente): a mesma lista para as vendas.
- **Carteira:** duas colunas pequenas com bolinhas "fornecedores" e "clientes" (quantos amarelos e vermelhos).
- Selos de cor sempre com **ícone + texto** (nunca só cor), cores de `docs/10` (verde `--kyb-verde-texto`, amarelo `--kyb-alerta`, vermelho `--kyb-erro`).
- **Kim**, intenções novas (frases com números da base):
  - `semaforo_fornecedores` ("fornecedor", "vermelho", "semáforo"): "Na Padaria Boa Massa, um fornecedor está no vermelho: a Forno Forte não recolheu e recusou o RAD. O Moinho Estrela está no amarelo: recomendo recolher via RAD."
  - `semaforo_clientes` ("cliente", "receber", "inadimplente"): resume amarelos e vermelhos das vendas.

## 4. WhatsApp como canal

- O Mensageiro passa a ter dois canais: **e-mail (Resend)** e **WhatsApp (Nvoip, API v3)**.
- Usos: cobrança ao fornecedor (amarelo e vermelho), aviso ao financeiro de guia pronta, e o **resumo do dia da Kim para o contador** ("3 decisões, R$ 1.236,50 travado").
- `WHATSAPP_MODE=SIMULADO` é o padrão: a mensagem aparece numa prévia no estilo de conversa dentro do app, com o selo "simulado", e é registrada em `outbound_messages` (tabela de `outbound_emails` generalizada com `channel` `email` \| `whatsapp`).
- Modo real atrás de `WHATSAPP_MODE=NVOIP` + credenciais da Nvoip como segredo; envio real precisa de número habilitado e modelo de mensagem aprovado no WhatsApp, por isso **fica desligado na demo** (decisão 2 dos sócios) e testado com `fetch` simulado.
- Nenhum número de telefone real no repositório: destinatários vêm de variável de ambiente.

## 5. Avatar da Kim com ElevenLabs

- Avatar 2D da Kim no padrão da marca (ilustração própria em SVG, Azul Comando e Verde Liberdade, com a coroa e o balão), com **boca e olhos animados** enquanto fala.
- Sincronia labial pelo endpoint da ElevenLabs que devolve o áudio com os tempos de cada caractere (`text-to-speech/{voice_id}/with-timestamps`); se não houver tempos, a boca segue o volume do áudio (Web Audio). A mesma marcação de tempo gera a **legenda palavra a palavra**.
- Estados do avatar: parado (respira devagar), ouvindo (anel verde), pensando (três pontos), falando (boca sincronizada), com `prefers-reduced-motion`.
- Rótulo fixo "voz e avatar sintéticos". Sem chave da ElevenLabs, o avatar responde em texto com a legenda e a boca parada.

## Onde entra no backlog

| Item | Sessão |
|---|---|
| Campos `rad_acordo` e `recebimento`, funções `supplierLight` e `customerLight`, seed, telas de semáforo | **S3** |
| Trava "ciente da recusa" na aprovação do RAD de fornecedor vermelho | **S4** |
| Canal WhatsApp simulado no Mensageiro + resumo do dia da Kim | **S4** (canal) e **S7** (resumo) |
| Respostas do fornecedor à cobrança ("vou recolher" / "não aceito") | **S5** |
| Avatar com sincronia labial e intenções novas da Kim | **S7** |
| WhatsApp real pela Nvoip | **S9** (opcional, desligado na demo) |

## Critérios de aceite

- [ ] Testes de `supplierLight` e `customerLight` cobrindo cada linha das tabelas 1 e 2.
- [ ] Seed continua dando exatamente os números de `docs/06`; mais: fornecedores da Padaria = 1 vermelho, 1 amarelo, demais verdes; vendas da Padaria = 1 vermelho, 1 amarelo, demais verdes.
- [ ] Aprovar RAD de fornecedor vermelho sem marcar "ciente" → 409 (teste).
- [ ] Mensagem de WhatsApp simulada aparece na prévia e na auditoria; nenhum envio real em CI.
- [ ] Gravação curta: Kim falando com a boca sincronizada e a legenda.
