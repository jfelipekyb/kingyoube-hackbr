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

## Antes de tornar público
- `gitleaks` limpo; `grep -rniE "$FORBIDDEN_TERMS" --exclude-dir=node_modules --exclude-dir=.git .` sem resultado (a lista de termos proibidos fica só no segredo `FORBIDDEN_TERMS`, nunca no repositório); revisão humana do Oscar.
