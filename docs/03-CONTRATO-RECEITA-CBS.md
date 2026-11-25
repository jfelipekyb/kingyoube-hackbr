# 03 — Contrato da API "Apuração Assistida da CBS" (Receita Federal)

> Fonte de verdade para o código. Lido em 24/11/2026 em https://docs.receitafederal.gov.br/apuracao-cbs/ .
> Versões: débitos, créditos, pagamentos e recolhimentos **1.3 (13/11/2026)**; situação **1.2 (14/10/2026)**; gerar DARF adquirente (RAD) e contribuinte (PCONT) **1.0 (13/11/2026)**; guia assíncrono **1.1 (14/10/2026)**.
> Guarde a versão do contrato implementada na constante `CONTRACT_VERSION` e mostre-a na tela.
> **Não use campo que não esteja aqui.** "Não consta" = pendência, nunca suposição.

## 1. Regras comuns das consultas assíncronas (débitos, créditos, pagamentos, recolhimentos)

Fluxo:
1. Obter token OAuth2 (**client credentials**) → `access_token`. URL do token: **não consta** (pendência; variável `RFB_TOKEN_URL`).
2. `POST` no endpoint com `Authorization: Bearer <token>`, `Content-Type: application/json`, `{cnpj}` com **8 dígitos (raiz)** no path e corpo `{"urlRetorno": "<https>"}` ou `{"urlRetorno": ""}` sem webhook.
3. Se `urlRetorno` for informada, a Receita faz `HEAD` nela na abertura; se não responder bem, a solicitação é rejeitada.
4. Aguardar o webhook ou consultar a situação.
5. Com `situacao = CONCLUIDA`, consultar o endpoint de download para obter a `urlAssinada` (página de download não lida → no modo REAL, tratar como pendência e logar só o código de status).
6. `GET` direto na `urlAssinada` **sem** Bearer e sem cabeçalhos extras. É uma S3 pre-signed URL. Validade: **48 horas** (respeitar `urlAssinadaExpiraEm` quando vier).

Respostas do POST:
- `201` → `{"tiqueteSolicitacao": "…", "tEASegundos": 120}` (`tEASegundos = -1` quando não dá para estimar).
- `400` → `{"codigoErro": "REQUISICAO_INVALIDA", "mensagemErro": "…"}`
- `401` → `{"codigoErro": "NAO_AUTORIZADO", "mensagemErro": "consumidor não autorizado para este NI"}`
- `500` → `{"codigoErro": "ERRO_INTERNO", "mensagemErro": "…"}`

Webhook (aviso da Receita):
- `POST`, JSON, UTF-8. Sucesso: `{"tiqueteSolicitacao": "…", "situacao": "CONCLUIDA"}`. Erro: `{"codigoErro": "…", "mensagemErro": "…"}`.
- **Sem autenticação, assinatura ou mTLS.** A segurança é nossa: URL única por solicitação com nonce aleatório (≥128 bits, guardado só como hash), aceitar só tíquete conhecido e em aberto, IP de origem esperado `189.9.61.23/32` (guia assíncrono), não logar corpo nem URL assinada. O aviso é só um sinal: o dado vem do download.

Limites:
- **Até 4 chamadas por API, por dia e por credencial** (FAQ 12), reinício à 00:00. Contar por serviço e dia de Brasília; **pedido que falhou também conta**; bloquear antes de chamar a Receita.
- Processamento: até **240 minutos**; depois vira `EXPIRADA`.
- Janela de dados: com consulta concluída nos últimos 3 meses, retorna inclusões/atualizações desde a última concluída, **limitado aos últimos 8 dias**; sem consulta concluída, começa no **1º dia do mês corrente**. Exemplo oficial: pedido em 29/09/2026 10:00, última concluída em 10/09 → retorno de 22/09 00:00 a 29/09 10:00. Consequência: sincronizar pelo menos a cada 7 dias e alertar no 6º dia sem sucesso.
- Datas: ISO 8601; os exemplos usam `Z` e também `-03:00` → aceitar os dois.

## 2. Débitos — `POST https://api.receitafederal.gov.br/apuracao-cbs/v2/debitos/{cnpj8}`

Arquivo baixado:
```
{ tiqueteSolicitacao, ni (8), niConsumidor (11|14), geradoEm,
  apuracao: [ { pa: "MM/AAAA",
    debitos: [ { origem: int, documento: int, chave: string(100),
                 emissao, registro, atualizacao,
                 cbs: { excedente?, apurado, inexigivel?, suspenso?, pgtoAntecipado?, extinto?, saldoDevedor } } ] } ] }
```
- Valores `number(18,2)`. Exceto `apurado` e `saldoDevedor`, os campos **não aparecem quando zero** → tratar ausente como 0.
- `apuracao: []` quando não há nada na janela.
- Exemplo oficial (resumido): `pa "06/2026"`, `origem 0`, `documento 55`, `cbs {excedente 10, apurado 70, inexigivel 5, suspenso 15, extinto 10, saldoDevedor 40}`.

## 3. Créditos — `POST …/v2/creditos/{cnpj8}`

```
{ tiqueteSolicitacao, ni, niConsumidor, geradoEm,
  apuracao: [ { pa,
    creditos: [ { origem, documento, chave, emissao, registro, atualizacao,
      cbs: { excedente?, apurado,
        apropriacao: { inapropriavel?, suspenso?, prescrito?, aApropriar?, apropriado?,
          utilizacao: { inutilizavel?, utilizado?, restabelecido?,
            naoUtilizado: { saldoCredor, pedidoRessarcimento? } } } } } ] } ] }
```
- Exceto `apurado` e `saldoCredor`, valores zero não aparecem. Os objetos `apropriacao`, `utilizacao` e `naoUtilizado` sempre aparecem.
- Exemplo oficial: `apurado 3002`, `apropriado 3002`, `utilizado 884.51`, `saldoCredor 0`, `pedidoRessarcimento 2117.49`.

## 4. Pagamentos (PCONT e RAD que extinguem débitos da empresa) — `POST …/v2/pagamentos/{cnpj8}`

```
{ tiqueteSolicitacao, ni, niConsumidor, geradoEm,
  apuracao: [ { dataArrecadacao: "YYYY-MM-DD",
    pagamentos: [ { numeroDARF: string(17), tipo: 1 (RAD) | 2 (PCONT),
      niAdquirente?: string(14)  // só tipo 1
      niContribuinte?: string(14) // só tipo 2
      composicao: [ { sequencial, pa, vencimento,
                      niContribuinte?, chaveDFE?,   // só tipo 1
                      principal, multa, juros, total } ] } ] } ] }
```

## 5. Recolhimentos (RAD feitos pela empresa como adquirente) — `POST …/v2/recolhimentos/{cnpj8}`

```
{ tiqueteSolicitacao, ni, niConsumidor, geradoEm,
  apuracao: [ { dataArrecadacao,
    pagamentos: [ { numeroDARF, tipo: 1,
      composicao: [ { sequencial, pa, vencimento, niFornecedor: string(14), chaveDFE?, principal, multa, juros, total } ] } ] } ] }
```
- Extinguem débitos do fornecedor e apropriam créditos da aquisição. Sem registros: `apuracao: []`.

## 6. Situação — `GET …/v2/situacao/{tiqueteSolicitacao}`

- Headers: `Authorization: Bearer`, `Accept: application/json`.
- `200` → `{"situacao": "PENDENTE" | "EM_PROCESSAMENTO" | "CONCLUIDA" | "ERRO" | "EXPIRADA", "codigoErro"?, "mensagemErro"?}`.
- Exemplo expirada: `{"situacao":"EXPIRADA","codigoErro":"EXPIRADA","mensagemErro":"Tempo limite de processamento excedido (240 minutos)."}`.

## 7. Gerar DARF como adquirente (RAD) — `POST …/v2/rad/{cnpj}` (síncrono)

- Corpo: **array**, um objeto por documento:
```json
[ { "chaveDFE": "<chave>", "opcaoPagamento": "PAGAMENTO_TOTAL" } ]
[ { "chaveDFE": "<chave>", "opcaoPagamento": "PAGAMENTO_PARCIAL", "valorDarfParcial": 500.00 } ]
```
- `valorDarfParcial` obrigatório só no parcial; ignorado no total.
- **CNPJ do path: inconsistente na doc** (descrição diz 14 dígitos e "CNPJ base"; exemplo usa 8). Implementar com configuração `RAD_CNPJ_FORMAT=14|8`, padrão 14, e registrar a pendência.
- Sucesso `200`:
```json
{ "cdRetorno": "DARF_GERADO",
  "darf": { "chavePIX": "…", "codigoBarras": "…", "linkDarfPDF": "…" },
  "informacoesPagamento": { "dataMaximaPagamento": "YYYY-MM-DD", "valorDarfPrincipal": 115.55, "valorDarfTotal": 115.55 } }
```
- Erros (`cdRetorno`): `DFE_NAO_ENCONTRADO`, `VALOR_PARCIAL_SUPERIOR_DFE`, `CNPJ_NAO_ADQUIRENTE`, `DADOS_DE_ENTRADA_INVALIDOS` (com `mensagem` e `dadosInvalidos: string[]`).
- Cota: **não consta**. Elegibilidade legal do RAD: **não consta** na documentação (pendência de negócio).

## 8. Gerar DARF como contribuinte (PCONT) — `POST …/v2/pcont/{cnpj14}` (síncrono)

Fora do escopo do MVP. Registrado para referência: corpo `{"pa": "08/2026", "opcaoPagamento": "PAGAMENTO_TOTAL" | "PAGAMENTO_PARCIAL", "valorDarfParcial"?}`; resposta com `darf` e `informacoesPagamento` (inclui `valorDarfMulta` e `valorDarfJuros`).

## 9. Tabelas de códigos

`origem`: 0 NORMAL · 20 DEVOLUCAO_POR_PCONT · 21 DEVOLUCAO_POR_RAD · 22 DEVOLUCAO_POR_CREDITO · 30 CANCELAMENTO_CREDITO · 31 CANCELAMENTO_RAD · 32 CANCELAMENTO_PCONT · 50 PERECIMENTO_TRANSPORTE_FOB · 51 PERECIMENTO_TRANSPORTE_CIF · 52/53/54 devoluções de perecimento CIF (por PCONT/RAD/crédito) · 55 NOTA_CREDITO_MULTA_JUROS.

`documento`: 55 NF-e · 57 CT-e · 62 NFCOM · 63 BP-e · 64 GTV-e · 65 NFC-e · 66 NF3-e · 67 CT-e OS · 91 NFS-e · 92 NFS-e Via · 93 BP-e TM · 94 DERE · 97 CT-e Simplificado.

## 10. Inconsistências conhecidas na documentação (não "corrigir" no escuro)

1. Créditos, pagamentos e recolhimentos listam só `Content-Type` na tabela de headers, mas os exemplos enviam `Authorization: Bearer` → enviar sempre.
2. CNPJ: 8 dígitos nas assíncronas; RAD ambíguo (14 × 8); PCONT 14.
3. Janela: a seção 3 fala em "concluída nos últimos 3 meses"; a FAQ, em "concluída sem erro".
4. Data com `Z` e com `-03:00` nos exemplos.

## 11. Não consta (vira pendência)

URL do token OAuth2 · ambiente de homologação · cota de DARF/situação/download · limites por segundo e de tamanho · elegibilidade legal do RAD · tratamento do Simples Nacional.

## 12. Referências

Índice https://docs.receitafederal.gov.br/apuracao-cbs/ · guia assíncrono `guiaapiassincrona.html` · `debito.html` · `credito.html` · `pagamentos.html` · `recolhimentos.html` · `situacao-solicitacao.html` · `gerar-darf-ad.html` · `gerar-darf-contrib.html` · `faq.html`.
Calculadora oficial de tributos (código aberto, MIT): github.com/ReceitaFederal/calculadora-rtc-regime-regular (Java 25, Spring Boot, `POST /api/calculadora/regime-geral`, Swagger em `/api/swagger-ui.html`).
