# Pendências (não suponha — registre)

| # | Pendência | Impacto | Como validar | Situação |
|---|---|---|---|---|
| P1 | URL do token OAuth2 da Receita não consta na doc lida | Modo REAL | Manual "Receita Integra" no portal da Receita | Aberta |
| P2 | Não há ambiente de homologação documentado | Modo REAL só em produção | FAQ / organização do hack | Aberta |
| P3 | CNPJ do RAD: 14 ou 8 dígitos (doc inconsistente) | Geração de DARF real | 1 chamada com credencial real | Aberta (`RAD_CNPJ_FORMAT`, padrão 14) |
| P4 | Elegibilidade legal ao RAD não consta na doc | Regra de candidata | Contador responsável (LC 214/2025) | Aberta — candidata é só sugestão |
| P5 | Página de download (`urlAssinada`) não foi lida | Modo REAL | Ler `download.html` | Aberta |
| P6 | Cota de DARF, situação e download não consta | Modo REAL | Doc / teste real | Aberta |
| P7 | Restrições do remetente de teste da Resend | E-mail sem domínio | Doc da Resend | Aberta — usar domínio verificado |
