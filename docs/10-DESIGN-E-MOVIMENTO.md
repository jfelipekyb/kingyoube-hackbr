# 10 — Identidade, movimento e tour guiado

Fonte: manual de marca da KingYouBe (versão atual). **Quando o manual novo chegar, só os valores da seção 1 mudam**; o resto vale igual.

Princípio: **simples, sutil e útil.** Movimento existe para mostrar que a equipe está trabalhando e para guiar o olho até a próxima decisão. Nada pisca à toa, nada esconde número.

## 1. Tokens (CSS variables em `src/styles/tokens.css`, usados pelo Tailwind)

| Token | Valor | Uso |
|---|---|---|
| `--kyb-azul` | `#000055` (Azul Comando) | Texto principal, menu lateral, cabeçalhos, botão secundário |
| `--kyb-azul-2` | `#000088` | Hover sobre azul, gráficos |
| `--kyb-verde` | `#00CC99` (Verde Liberdade) | Ação principal, sucesso, progresso, "trabalhando" |
| `--kyb-verde-texto` | `#007A5C` | **Verde para texto sobre branco** (o `#00CC99` não tem contraste para texto) |
| `--kyb-canvas` | `#F7F8FB` | Fundo das páginas |
| `--kyb-canvas-2` | `#EFF2F6` | Fundo de blocos, linhas alternadas |
| `--kyb-linha` | `#DDE3EA` | Bordas |
| `--kyb-mudo` | `#667085` | Texto secundário |
| `--kyb-alerta` | `#B54708` | Atenção (âmbar escuro, legível) |
| `--kyb-erro` | `#B42318` | Divergência, erro, bloqueio |
| `--kyb-raio` | `14px` cartões · `10px` botões · `999px` selos |
| `--kyb-sombra` | `0 12px 40px rgba(0,0,85,.08)` |

- **Proporção 60-30-10:** 60% branco e neutros claros, 30% Azul Comando, 10% Verde Liberdade. O verde é raro de propósito: aparece só na próxima ação e no que deu certo.
- Texto sobre verde: sempre Azul Comando (nunca branco).
- Contraste mínimo WCAG AA (4,5:1 para texto). Teste automatizado com `axe` nas páginas principais.

## 2. Tipografia

- **Georama** (Google Fonts, licença OFL), via `next/font/google`, pesos 400, 500, 600 e 700.
- Escala: H1 32px/700 · H2 24px/600 · H3 18px/600 · corpo 15px/400 · secundário 13px/500 · rótulo 12px/500 maiúsculas com espaçamento 0,04em.
- **Números sempre com `font-variant-numeric: tabular-nums`** (valores alinhados nas tabelas e contadores).
- Logo: usar o SVG oficial (`public/marca/kingyoube.svg`, caixa baixa, coroa + balão). Nunca redesenhar com texto.

## 3. Layout e componentes

- Menu lateral em Azul Comando com o logo no topo; conteúdo em `--kyb-canvas`; largura máxima 1280px.
- Selo "Dados simulados" fixo no topo direito, discreto (fundo `--kyb-canvas-2`, texto `--kyb-azul`).
- **Uma ação principal por tela**, sempre em verde. As demais, em contorno azul.
- Cartões com `--kyb-raio`, borda `--kyb-linha`, sombra só no hover.
- Status com selo arredondado + ícone + texto (nunca só cor): conciliado (verde), atenção (âmbar), divergente (vermelho), aguardando (cinza).
- Ícones: `lucide-react`, traço 1,75.
- Estados vazios com uma frase útil e a próxima ação ("A equipe ainda não rodou. Rodar a equipe").

## 4. Movimento (biblioteca `motion`, licença MIT, ou CSS puro)

| Onde | Movimento | Duração |
|---|---|---|
| Logo, ao abrir o app | A coroa sobe 4px e volta, uma vez | 600ms |
| Balão da coroa, quando a Kim fala | Pulsa suave (escala 1 → 1,06) enquanto o áudio toca | contínuo |
| Cartões da Sala da Equipe | Entram em sequência (opacidade + 8px para cima), 50ms entre um e outro | 250ms |
| Agente "trabalhando" | Anel verde pulsando ao redor do ícone | 1,6s em loop |
| Agente "feito" | Ícone de check desenhado (traço SVG) | 300ms |
| Conferente "413 de 413" | Contador sobe até o número final | 800ms |
| Valores que mudam (crédito travado, horas) | Contagem do valor antigo ao novo | 600ms |
| Item que muda de status (ex.: vira Conciliado) | Fundo verde claro que some aos poucos | 1,2s |
| Botão bloqueado pela trava | Tremida curta horizontal (±4px) + mensagem | 300ms |
| Troca de página | Fade | 150ms |
| Carregando | Esqueleto com brilho suave, nunca spinner na tela inteira | — |

Regras:
- Curva padrão `cubic-bezier(0.2, 0.8, 0.2, 1)`. Animar só `transform` e `opacity`.
- **`prefers-reduced-motion: reduce`** desliga tudo que não é essencial (fica só a troca de estado, sem animação).
- Nenhuma animação passa de 1,2s, exceto os loops de "trabalhando" e da Kim falando.

## 5. Tour guiado

Objetivo: um jurado ou um contador entende o produto em **um minuto**, sem ninguém explicar.

- Biblioteca leve com licença MIT (ex.: `driver.js`) ou componente próprio; destaque do elemento com fundo escurecido e balão com o estilo da marca (o balão tem o "rabinho" do símbolo da KingYouBe).
- Abre sozinho na **primeira visita** (lembrado em `localStorage`, com try/catch) e pelo botão "Fazer o tour" no topo. Sempre dá para pular (Esc ou "Pular").
- Teclado: setas avançam e voltam; foco preso no balão; leitor de tela anuncia o passo.
- **Narração da Kim (opcional):** se a voz estiver ligada, a Kim lê cada passo (áudio em cache pelo texto). Botão de som desligado por padrão.

| # | Elemento | Texto do passo |
|---|---|---|
| 1 | Logo | "Esta é a Equipe CBS da KingYouBe: agentes que fazem o trabalho repetitivo do escritório. Você só decide." |
| 2 | Botão "Rodar a equipe" | "Clique aqui e veja a equipe trabalhar: capturar notas, buscar a apuração na Receita, conciliar e conferir." |
| 3 | Cartão do Conferente | "O Conferente refaz tudo do zero. Nenhum agente aprova o próprio trabalho." |
| 4 | Botão da Kim | "Pergunte à Kim o que precisa de decisão hoje. Ela responde por voz, com os números da base." |
| 5 | Carteira | "Os clientes aparecem em ordem de dinheiro em risco. Comece pelo primeiro." |
| 6 | Fila do contador (RAD) | "Guia de recolhimento só sai com a aprovação do contador. A trava está no servidor." |
| 7 | Tela Equipe | "Aqui você vê as horas que a equipe devolveu e as próximas contratações." |
| 8 | Selo "Dados simulados" | "Na demonstração, os dados são fictícios e a Receita é simulada. Bom tour!" |

## 6. Experiência (regras de uso)

- Linguagem de contador, sem jargão de TI. Datas `dd/mm/aaaa`, valores `R$ 1.236,50`.
- Toda ação que muda dinheiro pede confirmação com o valor escrito.
- Mensagens de erro dizem o que fazer ("Peça a aprovação do contador"), nunca só o código.
- Responsivo até 1024px (o júri pode abrir no notebook); em celular, só leitura.
- Lighthouse acessibilidade ≥ 95 em Sala da Equipe, Carteira e Kim.

## Critérios de aceite (sessão de design)

- [ ] Tokens e Georama aplicados em todo o app; nenhuma cor fora da tabela (teste que procura hex no código fora de `tokens.css`).
- [ ] `axe` sem violação "serious" ou "critical" nas telas principais.
- [ ] Com `prefers-reduced-motion`, nenhuma animação não essencial (teste ou gravação).
- [ ] Tour com os 8 passos, pulável, lembrado na segunda visita; gravação curta.
- [ ] Gravação da Sala da Equipe mostrando a entrada dos cartões, o anel "trabalhando" e o check.
