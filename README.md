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

- **App (`app/index.html`)**: single-page app. Os dados da ficha (pacientes, avaliações, prontuário) ficam salvos **só no navegador** (localStorage), nunca em servidor — é assim que o dado sensível do paciente (LGPD) fica protegido. Por isso é importante orientar o fisioterapeuta a fazer backup/exportação com regularidade.
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

## Limitações conhecidas (decisão de produto, não bug)

Duas coisas que **parecem** falha mas são consequência direta e aceita conscientemente da
decisão de manter o app 100% local (dado do paciente nunca sai do navegador — é a base da
proposta de privacidade/LGPD do produto). Registrado aqui pra quem for mexer no código não
tentar "corrigir" isso sem entender a troca envolvida:

- **Controle de assinatura é só client-side.** O bloqueio de tela (`html.locked`, ver comentário
  no CSS) é `visibility:hidden` — qualquer pessoa com DevTools consegue remover a classe e usar
  o app sem pagar, ou forjar o cache de assinatura no localStorage. Fechar isso de verdade exige
  que uma Edge Function passe a controlar o que é *entregue* (não só a validação), o que muda o
  modelo de confiança do app — decisão pendente, revisitar se o bypass começar a doer no caixa.
- **Sem redundância de dado.** Tudo mora numa única chave do `localStorage` de um navegador.
  Limpar dados do navegador, trocar de aparelho ou formatar o computador sem ter feito backup
  geral = perda irrecuperável do prontuário. O único mitigador hoje é o lembrete de backup
  (`checarBannerBackup`, a cada 30 dias sem exportar) — reforce isso na orientação ao
  fisioterapeuta. Resolver de verdade exigiria sync criptografado ponta-a-ponta pra nuvem, o que
  também é decisão pendente (mesma razão: tensiona com a promessa de privacidade atual).

## Edge Functions (Supabase)

As functions em `supabase-functions/` são deployadas manualmente pelo editor do dashboard do Supabase (não há CI configurado pra isso ainda). Se editar localmente, copie o conteúdo atualizado pro editor do dashboard e clique em "Deploy".
