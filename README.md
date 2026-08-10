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
app/lib/                      módulos JS compartilhados (escape de HTML, criptografia da pré-anamnese, matemática do trial) — carregados via <script src>, sem bundler
supabase-functions/           Edge Functions do Supabase (não sobem pro GitHub Pages)
tests/                        testes automatizados (Vitest) de app/lib/ — não afeta como o site roda
CNAME                         domínio customizado do GitHub Pages
```

Não tem build step. É HTML/CSS/JS puro, cada arquivo é servido como está — não precisa de `npm install` nem bundler pra rodar ou editar o site. O `package.json` existe só pra rodar os testes automatizados (veja "Testes" abaixo); `node_modules/` está no `.gitignore` e nunca é commitado. `package.json`, `tests/` e `.github/` ficam expostos como arquivo estático pelo GitHub Pages (ele publica o repo inteiro) — não têm segredo nenhum dentro, mas se algum dia isso incomodar, a solução é mover o conteúdo do site pra uma subpasta dedicada (ex.: `/docs`) e apontar o Pages só pra ela.

## Como funciona

- **App (`app/index.html`)**: single-page app. Os dados da ficha (pacientes, avaliações, prontuário) ficam salvos **só no navegador** (localStorage), nunca em servidor — é assim que o dado sensível do paciente (LGPD) fica protegido. Por isso é importante orientar o fisioterapeuta a fazer backup/exportação com regularidade — o botão "📁 Backup automático" na barra de pacientes usa a File System Access API (Chrome/Edge; não existe no Safari/iPhone) pra gravar um backup atualizado automaticamente numa pasta escolhida por ele, sem depender de lembrar de exportar manualmente.
- **Pré-anamnese (`app/pre-anamnese.html`)**: link que o fisioterapeuta manda pro paciente responder antes da consulta. O paciente preenche, aceita o termo de uso de dados (LGPD) e os dados vão direto pro WhatsApp do fisioterapeuta — não passam por nenhum servidor do Ficha Fisio. O payload (`FICHA::v2:...`) vai cifrado com AES-GCM (`app/lib/preanamnese-crypto.js`); a chave fica só no localStorage do aparelho do fisioterapeuta, embutida no link como fragmento de URL (`#k=...`), que também não é enviado a servidor nenhum.
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

O deploy é automático assim que o GitHub Pages detecta o push em `main`. Não tem staging — o que sobe pra `main` vai direto pro site.

## Testes

Os módulos em `app/lib/` (escape de HTML, matemática do trial) têm testes automatizados. Precisa de Node.js instalado só pra isso — não pra rodar o site.

```bash
npm install
npm test
```

O GitHub Actions (`.github/workflows/ci.yml`) roda isso a cada push/PR na `main`, mas **não bloqueia o deploy do GitHub Pages** — o Pages publica direto no push, independente do resultado do CI. Se quiser um gate de verdade (só publica se os testes passarem), a alternativa é trocar a fonte do GitHub Pages de "branch" pra "GitHub Actions" nas configurações do repositório e fazer o deploy acontecer como um step depois dos testes — isso é uma mudança de configuração do repositório, não de código.

## Controle de assinatura sem bypass (precisa de 3 passos manuais no Supabase)

O código do app já sabe cifrar o banco de dados local com uma chave que só é entregue pela
Edge Function `licenca` quando o trial (controlado no servidor, não mais só no navegador) ou a
assinatura estão realmente ativos. Sem essa chave, os dados salvos no localStorage ficam
ilegíveis — remover a classe `locked` no DevTools deixa de adiantar qualquer coisa, porque não
tem ficha legível pra mostrar.

**Isso só entra em vigor depois de 3 passos manuais** (o app funciona normalmente, do jeito de
sempre, enquanto eles não forem feitos — nada quebra por estarem pendentes):

1. Rodar `supabase-functions/licenca/schema.sql` no SQL editor do painel do Supabase (cria a
   tabela `trial_starts`, com RLS).
2. Deployar a function `supabase-functions/licenca` pelo editor do dashboard (mesmo processo
   manual das outras functions, veja "Edge Functions" abaixo).
3. Criar a secret `APP_UNLOCK_SECRET` nas configurações da function — um valor aleatório longo,
   gerado uma vez (ex.: `openssl rand -base64 32`), que nunca deve ser reaproveitado de outro
   lugar nem commitado no repositório.

**Migração automática:** no primeiro login de cada fisioterapeuta *depois* desses 3 passos
estarem no ar, o app baixa sozinho um backup de segurança em texto puro (arquivo
`seguranca_migracao_<data>.json`) antes de cifrar o banco pela primeira vez — é assim que fica
resguardado contra qualquer imprevisto nessa transição.

**Funciona offline** (mantém a promessa do PWA): a chave obtida fica em cache local por até 3
meses (`fisio_licencaCache`) — se o app abrir sem internet, usa a última chave válida já obtida
em vez de bloquear quem já pagou. Uma recusa **explícita** do servidor (403 — trial acabou e sem
assinatura) nunca usa esse cache, senão cancelar a assinatura não revogaria nada de verdade.

**O trial gratuito passa a ser controlado pelo servidor** (tabela `trial_starts`), não mais só
por um timestamp no localStorage — fecha o jeito mais fácil de hoje de reiniciar o trial
indefinidamente limpando os dados do navegador.

## Limitações conhecidas (decisão de produto, não bug)

Uma coisa que **parece** falha mas é consequência direta e aceita conscientemente da decisão de
manter o app 100% local (dado do paciente nunca sai do navegador — é a base da proposta de
privacidade/LGPD do produto):

- **Sem redundância de dado na nuvem.** Tudo mora no `localStorage`/numa pasta local escolhida
  pelo usuário (ver "Backup automático" acima) — nunca em servidor. Perder o aparelho sem ter
  feito backup (manual ou automático em pasta) ainda é perda irrecuperável do prontuário. O
  lembrete de backup (`checarBannerBackup`, a cada 30 dias sem exportar) continua como rede de
  segurança pra quem não tem Chrome/Edge ou não configurou a pasta automática. Resolver de vez
  exigiria sync criptografado ponta-a-ponta pra nuvem — decisão de produto ainda pendente, porque
  os bytes (mesmo cifrados) passariam a existir num servidor, o que tensiona com o texto atual da
  proposta de privacidade mesmo sendo tecnicamente seguro.

## Edge Functions (Supabase)

As functions em `supabase-functions/` são deployadas manualmente pelo editor do dashboard do Supabase (não há CI configurado pra isso ainda). Se editar localmente, copie o conteúdo atualizado pro editor do dashboard e clique em "Deploy".

A function `licenca` também precisa da tabela `trial_starts` (veja "Controle de assinatura" acima) e da secret `APP_UNLOCK_SECRET` — sem isso ela responde erro 500 e o app segue funcionando sem cifrar nada (fail-open), exatamente como hoje.
