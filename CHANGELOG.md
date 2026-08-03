# Changelog

Registro das mudanças relevantes no Ficha Fisio a partir desta data. Formato livre, mais curto que um commit log — pra dar contexto rápido de "o que mudou e por quê" sem precisar ler o histórico do git inteiro.

## 2026-08-03

- Corrigido: `validade` das assinaturas agora é calculada automaticamente pelo webhook da Asaas (antes ficava sempre `null`, dependendo só do evento de cancelamento pra desativar acesso).
- Adicionado: `for`/`id` nos labels da pré-anamnese e do modal de pagamento da landing page, pra leitores de tela associarem campo e rótulo corretamente.
- Melhorado: termo de consentimento LGPD na pré-anamnese, agora citando a lei explicitamente e deixando claro que os dados não ficam armazenados no site.
- Corrigido: contraste de texto insuficiente (abaixo do mínimo recomendado pra leitura) no rodapé da pré-anamnese, no rótulo de seção da landing page e no fluxo de assinatura/pagamento do app.
- Adicionado: `robots.txt`, `LICENSE` e este `CHANGELOG.md`.
- Adicionado: acessibilidade no mapa corporal da dor do app (`role="img"`, `aria-labelledby`, `aria-describedby`), pra leitores de tela identificarem o elemento e a contagem de pontos marcados.
- Segurança: `supabase-functions/notificar-signup` agora exige um segredo compartilhado (`SIGNUP_WEBHOOK_SECRET`, header `x-webhook-secret`) — antes qualquer request externo podia disparar e-mail pro dono da conta sem nenhuma validação.
- Segurança: script do `supabase-js` no app agora usa versão fixa (`2.112.0`) com hash de integridade (SRI) nas duas fontes (jsDelivr e unpkg), pra garantir que o navegador só execute exatamente o código esperado. Como consequência, a versão não atualiza mais sozinha — futuras atualizações do supabase-js exigem trocar a versão e o hash manualmente nas duas tags de script.
- Corrigido: `README.md` descrevia `notificar-signup` como se fosse o webhook da Asaas; na verdade é uma function separada, só de aviso de conta nova. O webhook real da Asaas não está neste repositório (vive só no painel do Supabase).
