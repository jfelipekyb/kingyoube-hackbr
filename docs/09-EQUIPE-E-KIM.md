# 09 — A equipe digital e a Kim

A Equipe CBS é um conjunto de agentes com nome e função. Cada agente é uma **fachada fina** sobre um serviço de domínio: chama o serviço, grava `agent_events` e auditoria. Regra de negócio fica no serviço. Nenhum agente aprova o próprio trabalho, e nenhum agente aprova nada: quem decide é o contador.

Frase de referência: **a IA explica e fala; a regra calcula; o contador decide.**

## Agentes

| Chave (`agent`) | Nome na tela | Função | Serviço | IA? |
|---|---|---|---|---|
| `kim` | Kim · gestora | Resume a carteira e responde por voz | `kim/` | Voz (ElevenLabs); números por regra |
| `captura` | Captura | Recebe as notas da carteira | notas (seed/upload) | Não |
| `apuracao` | Apuração | Busca na Receita débitos, créditos, pagamentos e recolhimentos | `receita/` | Não |
| `conciliador` | Conciliador | Casa nota × Receita e classifica (R01–R06; a R07 é da confirmação do RAD, S4) | `conciliacao/` | Não |
| `conferente` | Conferente | Refaz a conciliação de forma independente e aponta diferenças | `conferente/` | Não |
| `analista` | Analista | Explica cada item que pede atenção | `explicacao/` | Opcional (um modelo de linguagem reescreve o texto, sem mudar número) |
| `tesouraria` | Tesouraria | Prepara a proposta de guia RAD (rascunho) | `rad/` | Não |
| `vigia` | Vigia | Lê a web pública: documentação da Receita e site do fornecedor | `radar/`, `fornecedor/` | Extração do Firecrawl |
| `mensageiro` | Mensageiro | Envia cobrança, DARF e alertas | `notificacao/` | Não |

O contador (humano) aparece no topo do organograma, acima da Kim.

## Rodada da equipe ("Rodar a equipe")

`POST /api/equipe/run` abre uma rodada (`agent_runs`). A tela chama `POST /api/equipe/run/[runId]/[agent]` para cada agente, **na ordem abaixo, uma chamada por agente** (um agente pode precisar de mais de uma chamada; a resposta diz `done: true|false`). Isso evita estourar o tempo de função da Vercel. A tela acompanha por `GET /api/equipe/run/[runId]` a cada 1 s.

| Ordem | Agente | O que faz na rodada | Resumo esperado no seed (antes de qualquer aprovação) |
|---|---|---|---|
| 1 | Captura | Conta as notas por cliente | "Recebi 412 notas de 12 clientes." |
| 2 | Apuração | Sincroniza os 4 serviços de cada cliente (respeita a cota; em SIMULADO usa `SIMULADO_RAPIDO`) | "Busquei 48 arquivos na Receita (simulado) e organizei tudo." |
| 3 | Conciliador | Concilia a carteira | "Conciliei 413 itens: 405 conciliados, 8 pedem olhar." |
| 4 | Conferente | Recálculo independente (`docs/04`) | "Conferi 413 de 413. Nenhuma diferença." |
| 5 | Analista | Explica os itens que não estão `conciliado` | "Expliquei 8 itens." |
| 6 | Tesouraria | Cria proposta `rascunho` para cada candidata a RAD que ainda não tem proposta | "Preparei 2 guias de recolhimento para aprovação." |
| 7 | Vigia | Radar (usa a última verificação se tiver menos de 24 h; o botão do Radar força) + contato dos fornecedores das candidatas sem e-mail | "Verifiquei 9 páginas da Receita. Achei o contato financeiro do Moinho Estrela." |
| 8 | Mensageiro | Cobra por e-mail os fornecedores das candidatas (idempotente) | "Cobrei 2 fornecedores por e-mail." |
| 9 | Kim | Monta o resumo da rodada | "Resumo pronto: 3 decisões esperam o contador." |

Rodar de novo **não duplica** propostas, contatos nem e-mails (chaves de idempotência). Os textos usam os números reais da base; os da tabela são os esperados no seed.

## Sala da Equipe (tela inicial)

- Um cartão por agente: ícone, nome, função em uma linha, status (`aguardando`, `trabalhando` pulsando, `feito`, `revisado_ok`, `revisado_divergente`, `erro`) e o resumo da última entrega.
- Linha do tempo à direita com os `agent_events` da rodada, mais recentes em cima.
- Cartão do Conferente destacado quando termina: verde com "413 de 413" ou vermelho com a lista do que diverge.
- Botão "Rodar a equipe" e, no fim, chamada "Perguntar à Kim".
- Animação leve: cartões entram em sequência; o status pulsa enquanto trabalha. Nada esconde números.

## Conferente

Detalhe em `docs/04`. Critério de aceite obrigatório: um teste altera de propósito um item de `reconciliation_items` (ex.: muda o status de V2 para `conciliado`) e o Conferente acusa `revisado_divergente` naquele item.

## Horas devolvidas

Medição = Σ (contagem × minutos-padrão) / 60, com os minutos de `effort_standards` (`docs/06`). Premissa mostrada na tela: **"uma rodada = um mês de conferência da carteira"** (editável como as demais). Conta só o trabalho feito de fato na rodada: radar em cache conta 0 páginas; e-mail idempotente que não saiu de novo conta 0.

| Contagem | Minutos-padrão |
|---|---|
| Itens conciliados ou conferidos pela equipe (uma vez por item, por rodada) | `conferir_nota` |
| Solicitações à Receita normalizadas | `sincronizar_servico` |
| Itens explicados pelo Analista | `investigar_divergencia` |
| Propostas preparadas pela Tesouraria | `preparar_rad` |
| Contatos encontrados pelo Vigia | `achar_contato` |
| E-mails enviados pelo Mensageiro | `escrever_email` |
| Páginas da Receita verificadas pelo Vigia | `ler_documentacao` |

Tela Equipe mostra:
- **Medição na carteira de demonstração:** horas da última rodada e acumulado desde o último reset.
- **Projeção:** (horas da última rodada ÷ clientes da carteira) × N clientes (N editável, padrão 200) = horas por mês; "equivale a X analistas em tempo integral" = horas por mês ÷ 168. Sempre com o rótulo **"projeção, não medição"**.
- As premissas numa tabela editável (só o papel Contador edita; a mudança vai para a auditoria).

## Organograma (tela Equipe)

- Topo: **Contador (humano) — decide**. Abaixo: **Kim — gestora**. Abaixo: os 8 agentes da Equipe CBS, com o selo "Contratada".
- Seção **"Próximas contratações"**: cartões apagados (opacidade baixa, sem clique), com o rótulo "visão do produto — ainda não disponível": Equipe IBS · Faturamento · Cobrança · Conciliação bancária · Rentabilidade da carteira · Obrigações acessórias.
- Nenhum cartão apagado tem número, tela ou promessa de prazo.

## Kim

### Fluxo

1. Pergunta por **microfone** (clicar para começar, clicar para parar; `MediaRecorder`) → `POST /api/kim/ouvir` (ElevenLabs speech-to-text) → texto reconhecido. Ou por **botão de pergunta pronta** (plano B, sem microfone) ou por **texto**.
2. `POST /api/kim/perguntar` → intenção por regra → resposta montada a partir da base. Devolve dois textos: `legenda` (números formatados, ex.: "R$ 1.236,50") e `fala` (números por extenso).
3. `POST /api/kim/falar` com a `fala` → áudio (ElevenLabs text-to-speech) → toca no navegador. A legenda aparece na tela junto.
4. Grava em `kim_queries` e auditoria: modo, texto reconhecido, intenção, resposta. **Nunca o áudio.**

Sem `ELEVENLABS_API_KEY`/`ELEVENLABS_VOICE_ID`: a Kim responde só em texto, com aviso discreto "voz desligada". Modelos padrão: `ELEVENLABS_TTS_MODEL = eleven_multilingual_v2`, `ELEVENLABS_STT_MODEL = scribe_v1` (conferir na documentação oficial).

### Intenções (lista fechada)

Normalizar o texto (minúsculas, sem acento). A intenção `acao_proibida` é avaliada **primeiro**.

| Intenção | Gatilhos (exemplos) | Resposta (modelo de `fala`, números do seed antes de qualquer aprovação) |
|---|---|---|
| `acao_proibida` | aprova, aprovar, gera a guia, gerar o darf, paga, pagar, recusa | "Eu não aprovo nem gero nada. A aprovação é só na tela, com o usuário do contador." |
| `decisoes_hoje` | decidir, decisão, hoje, pendente, o que eu preciso | "Conferi quatrocentas e doze notas de doze clientes. São três decisões, todas na Padaria Boa Massa: duas guias de recolhimento e uma diferença de doze reais. Há mil duzentos e trinta e seis reais e cinquenta centavos de crédito travado. Os dois fornecedores já foram cobrados por e-mail." |
| `credito_travado` | crédito, travado, quanto | "O crédito travado na carteira é de mil duzentos e trinta e seis reais e cinquenta centavos, todo na Padaria Boa Massa." |
| `motivo_cliente` | por que, motivo, + nome de cliente | "Na Padaria Boa Massa, o Moinho Estrela não recolheu a CBS da nota mil duzentos e oitenta e quatro. São quatrocentos e trinta e seis reais e cinquenta centavos de crédito esperando." |
| `fornecedor_cobrado` | fornecedor, cobrou, cobrança | "Cobrei os dois fornecedores por e-mail. O do Moinho Estrela já foi entregue." (status real da Resend) |
| `horas` | horas, tempo, economizou | "Nesta rodada, a equipe fez o equivalente a N horas de trabalho, pelas premissas da tela Equipe." |
| `ajuda` | (nada reconheceu) | "Ainda não sei responder isso. Posso dizer o que precisa de decisão hoje, quanto crédito está travado ou se os fornecedores foram cobrados." |

Botões de pergunta pronta: "O que eu preciso decidir hoje?", "Quanto crédito está travado?", "Por que a Padaria Boa Massa?", "Os fornecedores foram cobrados?".

**Estado de referência:** a frase da tabela vale para **seed + uma rodada completa da equipe**, antes de qualquer aprovação (é o estado do vídeo). Antes de qualquer rodada, `decisoes_hoje` responde: "A equipe ainda não rodou hoje. Clique em Rodar a equipe e eu te conto o que precisa de decisão." Se a cobrança ainda não saiu, a última frase vira "Ainda não cobrei os fornecedores."; se saiu e ainda não há confirmação de entrega, "Os dois fornecedores foram cobrados por e-mail." (sem "já").

As frases se ajustam aos números (singular/plural, "todas na" quando é um cliente só, "em N clientes" quando são vários). Depois de aprovar e confirmar o C2, a resposta muda sozinha.

### Números por extenso (função testada)

`porExtenso(n, genero)` e `reaisPorExtenso(centavos)`, em português do Brasil:

| Entrada | Saída |
|---|---|
| `reaisPorExtenso(50n)` | "cinquenta centavos" |
| `reaisPorExtenso(100n)` | "um real" |
| `reaisPorExtenso(1200n)` | "doze reais" |
| `reaisPorExtenso(10000n)` | "cem reais" |
| `reaisPorExtenso(10100n)` | "cento e um reais" |
| `reaisPorExtenso(43650n)` | "quatrocentos e trinta e seis reais e cinquenta centavos" |
| `reaisPorExtenso(123650n)` | "mil duzentos e trinta e seis reais e cinquenta centavos" |
| `reaisPorExtenso(200000000n)` | "dois milhões de reais" |
| `porExtenso(412, 'f')` | "quatrocentas e doze" |
| `porExtenso(2, 'f')` | "duas" |
| `porExtenso(1284, 'f')` | "mil duzentas e oitenta e quatro" — para número de nota usar `'m'` ("mil duzentos e oitenta e quatro") |

### Tela da Kim

- Avatar da Kim, botão grande de microfone, botões de pergunta pronta, campo de texto.
- Legenda da pergunta e da resposta; onda sonora animada enquanto fala.
- Rótulo fixo **"voz sintética"**.
- A Kim também aparece como cartão na Sala da Equipe e no topo do organograma.

## Ligação (opcional, S9)

Kim liga para `CONTADOR_TELEFONE` pela Nvoip e toca um áudio curto gerado pela ElevenLabs: "Aqui é a Kim, da KingYouBe. Você tem três decisões esperando na tela." Só aviso; a aprovação continua só na tela. Só se a documentação oficial da Nvoip permitir tocar áudio nosso de forma simples.

## Status de entrega dos e-mails

Fonte principal: webhook da Resend (`email_events`). Fallback, usado também dentro das sessões do Devin (onde o webhook de produção não chega): consultar o e-mail pela API da Resend (`GET /emails/{id}`, campo do último evento) ao abrir a tela ou a cada 10 s por até 2 min. **Confirmar o nome do campo na documentação oficial.**
