# 07 — Segurança e LGPD

O repositório é **público**. Trate tudo como se um concorrente e um atacante fossem ler.

## Segredos
- Só em variáveis de ambiente (Secrets do Devin, variáveis da Vercel). `.env` no `.gitignore`; `.env.example` sem valores.
- Nunca em código, teste, fixture, log, mensagem de commit/PR ou texto enviado à LLM.
- CI roda `gitleaks` em todo PR (GitHub Action). PR com achado não entra.

## Dados
- Só dados fictícios. Nenhum CNPJ, CPF, nome ou nota real de cliente da KingYouBe.
- `niConsumidor` pode ser CPF: nunca exibir nem logar em claro; guardar só hash com sal da empresa + 2 últimos dígitos.
- Chave de acesso exibida mascarada no meio nos e-mails (`3526…7890`).
- Arquivo bruto da Receita: tabela append-only, sem rota que exponha o conteúdo inteiro.

## Webhooks
- Receita (modo REAL): URL única por solicitação com nonce; aceitar só tíquete conhecido e aberto; responder `HEAD`; rate limit por IP; download só de URL HTTPS; não logar URL assinada.
- Resend: verificar assinatura Svix com corpo bruto; rejeitar sem assinatura válida (401).

## Autorização
- Segregação: quem propõe RAD não aprova. Trava no serviço, com teste que tenta furar (mesmo usuário, estado errado, proposta de outra empresa).
- Rotas de cron exigem `Authorization: Bearer ${CRON_SECRET}`.
- O seletor de papel da demo é explícito ("Modo demonstração"), registrado na auditoria, e desligável por `DEMO_ROLE_SWITCH=false`.

## LLM (opcional)
- Só no servidor. Recebe apenas fatos já calculados, sem CNPJ completo nem chave completa. Não decide valor nem status.

## Voz (Kim)
- Chave da ElevenLabs só no servidor; o navegador fala com rotas do app.
- Áudio do usuário não é guardado; só o texto reconhecido vai para `kim_queries` e auditoria.
- A Kim não executa ação: nenhuma aprovação, recusa ou geração de DARF por voz (teste).
- Rótulo "voz sintética" na tela e no vídeo. Clone de voz de pessoa real só com consentimento escrito.
- Rate limit nas rotas `/api/kim/*` (evita gastar créditos).

## Scraping
- Lista fechada de URLs (`docs/05`); qualquer outra é recusada no serviço.

## Antes de tornar público
- `gitleaks` limpo; `grep -rniE "$FORBIDDEN_TERMS" --exclude-dir=node_modules --exclude-dir=.git .` sem resultado (a lista de termos proibidos fica só no segredo `FORBIDDEN_TERMS`, nunca no repositório); revisão humana do Oscar.
- Revisão da S8 (27/11/2026): `gitleaks` 8.21.2 sem achado no histórico inteiro (`--log-opts=--all`, 116 commits) e nos 322 arquivos versionados (`git archive HEAD`; os 2 achados da pasta local `.next/`, fora do git, são chaves de pré-visualização geradas pelo build); `FORBIDDEN_TERMS` sem ocorrência na árvore, nos diffs e mensagens de todos os commits e nos nomes de branch e tag. Comandos no PR da S8. Falta a revisão humana do Oscar.
