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
| P8 | Consulta em nome do cliente da carteira (procuração eletrônica do escritório) não consta na doc lida | Modo REAL multicliente | Manual "Receita Integra" / contador | Aberta — na demo, cada cliente sincroniza com a própria credencial simulada |
| P9 | Formato atual da extração JSON do Firecrawl v2 | Contato do fornecedor | docs.firecrawl.dev | Aberta — conferir na S5 |
| P10 | Endpoints e modelos atuais da ElevenLabs para português | Kim por voz | elevenlabs.io/docs | Aberta — conferir na S7 |
| P11 | Segredo `FORBIDDEN_TERMS` ainda não existe nos Secrets do Devin | Item 4 da skill `verificar-entrega` falha com "FORBIDDEN_TERMS não configurado" | Time cadastra o segredo; rodar o item 4 de novo | Aberta (S1) |
| P12 | Nomes das variáveis `NVOIP_*` não constam em `docs/02` (só o prefixo) | Ligação da Kim (S9) | Doc da Nvoip na S9 | Aberta — fora do `.env.example` até a S9 |
| P13 | `docs/06` não define o valor total das notas, só a CBS (exceto C2 e C3) | Coluna `total_cents` do seed | Time confirma se importa para a demo | Aberta — seed usa total = CBS × 1000 / 9 (mesma proporção de C2), sem uso em regra |
