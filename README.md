# Ficha Fisio

Ficha de avaliação fisioterapêutica digital. Landing page + app + assinatura paga.

Site: https://fichafisio.com.br

## O que é cada parte

```
index.html                    landing page (marketing, planos, pagamento PIX/Asaas)
app/index.html                o app em si — ficha de avaliação, prontuário, agenda, financeiro
app/pre-anamnese.html         formulário que o paciente preenche antes da consulta e envia por WhatsApp
app/sw.js                     service worker (PWA, funciona offline)
app/manifest.webmanifest      manifesto do PWA (ícone, nome, tela cheia)
app/icon.svg                  ícone do app
supabase-functions/           Edge Functions do Supabase (não sobem pro GitHub Pages)
CNAME                         domínio customizado do GitHub Pages
```

Não tem build step. É HTML/CSS/JS puro, cada arquivo é servido como está — não precisa de `npm install` nem bundler pra rodar ou editar.

## Como funciona

- **App (`app/index.html`)**: single-page app. Os dados da ficha (pacientes, avaliações, prontuário) ficam salvos **só no navegador** (localStorage), nunca em servidor — é assim que o dado sensível do paciente (LGPD) fica protegido. Por isso é importante orientar o fisioterapeuta a fazer backup/exportação com regularidade.
- **Pré-anamnese (`app/pre-anamnese.html`)**: link que o fisioterapeuta manda pro paciente responder antes da consulta. O paciente preenche, aceita o termo de uso de dados (LGPD) e os dados vão direto pro WhatsApp do fisioterapeuta — não passam por nenhum servidor do Ficha Fisio.
- **Assinatura**: pagamento processado pela Asaas (PIX/cartão). O backend (Supabase) guarda só o essencial pra liberar acesso: e-mail, status (ativo/inativo) e validade da assinatura, na tabela `assinantes` (protegida por Row Level Security).
- **Webhook da Asaas**: recebe eventos de pagamento (aprovado, recusado, assinatura cancelada) e ativa/desativa o acesso do usuário automaticamente, calculando a validade a partir do ciclo do plano (mensal, anual etc.). Essa function não está neste repositório — foi criada e é editada direto pelo painel do Supabase.
- **`supabase-functions/notificar-signup`**: function separada, sem relação com pagamento. Dispara um e-mail pra você (via Resend) sempre que uma conta nova é criada, só como aviso. Protegida por um segredo compartilhado (`SIGNUP_WEBHOOK_SECRET`) enviado no header `x-webhook-secret` — configure o mesmo valor no disparador (trigger/webhook) e nas secrets da function no painel do Supabase.

## Como editar e publicar

Não tem ambiente de dev/staging — é editar o arquivo e subir pro GitHub Pages (branch `main`, domínio configurado via `CNAME`).

```bash
git add <arquivo>
git commit -m "descrição da mudança"
git push
```

O deploy é automático assim que o GitHub Pages detecta o push em `main`.

## Edge Functions (Supabase)

As functions em `supabase-functions/` são deployadas manualmente pelo editor do dashboard do Supabase (não há CI configurado pra isso ainda). Se editar localmente, copie o conteúdo atualizado pro editor do dashboard e clique em "Deploy".
