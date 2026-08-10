# Changelog

Registro das mudanças relevantes no Ficha Fisio a partir desta data. Formato livre, mais curto que um commit log — pra dar contexto rápido de "o que mudou e por quê" sem precisar ler o histórico do git inteiro.

## 2026-08-10 (parte 5) — auditoria final: correção de V1/V2/V3/V4

Correções P0/P1 da auditoria de release-gate anterior (achados V1 a V4). Backup
criado antes de mexer em qualquer arquivo: tag git `backup/pre-fix-v1-v2-v3-v4-20260810`.

- **V1 (crítico) — bug de rotação mensal da chave, corrigido.** A chave que cifra o
  banco local passava a ser diferente todo mês (derivada com o "epoch" AAAA-MM); sem
  nenhum código de recriptografia, isso ia travar TODO cliente pagante fora do
  próprio prontuário no primeiro login de setembro. Corrigido escolhendo a
  arquitetura de menor risco: a chave de criptografia do banco agora é **estável
  por usuário** (não depende mais do mês) — a Edge Function `licenca` só usa o
  "epoch" pra calcular, à parte, uma **chave-ponte** (`chaveAntiga`) que serve só
  pra abrir, uma única vez, um banco que já tenha sido cifrado com o esquema antigo,
  e recifrar na hora com a chave estável. `app/lib/db-crypto.js` ganhou
  `abrirComMigracao()` (tenta a chave atual, cai pra antiga só se a atual falhar,
  nunca sobrescreve nada se nenhuma das duas abrir) — testado com 6 casos novos em
  `tests/db-crypto.test.js` (dado íntegro após migrar, chave errada, chave de outra
  conta, ciphertext adulterado, ausência de chave-ponte).
- **V3 (alto) — bypass de trial/assinatura via localStorage, corrigido.**
  `tentarDesbloquear()` só bloqueava o acesso quando já existia dado local cifrado
  esperando chave — um 403 explícito do servidor (trial acabado, sem assinatura)
  era ignorado se não houvesse nada cifrado ainda (ex.: navegador novo, ou
  localStorage limpo), liberando o app de qualquer jeito com um trial local
  reiniciado. Agora um 403 explícito **sempre** bloqueia, independente de existir
  ou não dado cifrado local; o fallback offline (cache de chave) só é consultado
  em falha de rede/timeout, nunca depois de uma negação explícita. Em
  `checarAcesso()`, `iniciarTrial()` (que grava um novo início de trial local) só
  roda **depois** que `entrarNoApp()` confirma acesso de verdade pelo servidor —
  antes disso, "não achei trial local" nunca mais é tratado como "é a primeira vez".
- **V2 (alto) — `notificar-signup` publicada divergia do código do repositório.**
  O teste ao vivo da auditoria mostrou que a function publicada no Supabase
  aceitava chamadas sem o `x-webhook-secret` correto (devolvia 200 mesmo com
  segredo errado ou ausente) — o código do repositório já tinha essa checagem
  desde 2026-08-03, mas nunca tinha sido redeployado. Sem mudança de código aqui;
  precisa de redeploy manual (mesmo processo da `licenca`).
- **V4 (alto) — XSS armazenado em `financeiro.data`/`financeiro.valor`, corrigido.**
  `openFinForm()` escapava `desc`/`categoria`/`paciente` mas não `data`/`valor` —
  um backup JSON malicioso com HTML nesses dois campos injetava atributo
  (`" onfocus="..." autofocus`) executável ao abrir o lançamento. Aplicado
  `escAttr()` nos dois campos. Confirmado ao vivo (não só lendo o código): o
  payload antes criava um `onfocus` de verdade no elemento (`typeof el.onfocus
  === 'function'` → `true`, disparava com `dispatchEvent`); depois da correção,
  nenhum handler é criado e o conteúdo fica como texto inerte no atributo.

## 2026-08-10 (parte 4) — vulnerabilidade crítica encontrada e corrigida no Supabase

**Não é mudança de código — é mudança de configuração direto no painel do Supabase, registrada aqui porque foi grave.**

A tabela `assinantes` tinha uma RLS policy de UPDATE ("Usuário atualiza próprio registro",
`using (auth.uid() = id)`, **sem** `WITH CHECK`) que permitia qualquer usuário autenticado
alterar QUALQUER coluna da própria linha — inclusive `status` e `validade`. Ou seja: bastava
estar logado (nem precisava ter pago nada) pra rodar um `update` via SDK do Supabase e se
autodeclarar `status: 'ativo'` com validade no futuro, sem pagar. Isso destravava a assinatura
na raiz, inclusive enganando a function `licenca` (que lê exatamente esse campo).

Verificado que o código do app nunca fazia UPDATE nessa tabela (só `select`), e que o fluxo de
cancelamento já passa por uma Edge Function separada (`cancelar-assinatura`, fora do repo) — a
policy não tinha nenhuma utilidade legítima. Removida:

```sql
drop policy if exists "Usuário atualiza próprio registro" on public.assinantes;
```

Ficou só a policy de SELECT ("Usuário vê próprio registro"). Toda escrita em `assinantes`
agora só acontece via service role (webhook da Asaas e function `licenca`), nunca direto do
cliente.

## 2026-08-10 (parte 3) — auditoria de segunda camada

- Corrigido (crítico): a function `licenca` (deployada nesta data) não respondia CORS —
  testado direto com curl comparando contra `send-reset` (que funciona) e confirmado que o
  navegador bloquearia toda chamada real. Adicionado tratamento de `OPTIONS` e cabeçalhos
  `Access-Control-Allow-*` em todas as respostas. **Precisa redeployar a function** pra a
  correção valer (o código antigo continua no ar até isso acontecer).
- Testado abuso da function `licenca` com curl: sem token, token corrompido e um JWT forjado
  (assinatura falsa) — os três foram rejeitados corretamente (401), confirmando que
  `sb.auth.getUser()` valida a assinatura de verdade, não só o formato do token.
- Testado RLS de `trial_starts` direto com a anon key: tentativa de INSERT sem sessão real foi
  bloqueada pelo Postgres com "new row violates row-level security policy" — confirma que só a
  function (service role) escreve ali, ninguém consegue forjar a própria data de início do trial.
- Corrigido: e-mail da conta (`session.user.email`) agora passa por `esc()` antes de ir pro
  `innerHTML` da tela de pagamento — risco era baixo (Supabase valida formato de e-mail no
  cadastro) mas o custo da correção é zero.
- Endurecido: `licenca` agora importa `supabase-js` via `npm:` em vez de `esm.sh` — resolve
  direto do registro do npm, sem depender de mais uma camada de transformação de CDN no meio.
- Revisão completa de todo `innerHTML`/`insertAdjacentHTML` do repositório (app, landing,
  libs novas) — nenhum outro ponto sem escape encontrado.
- **Pendente, precisa de verificação manual no painel:** não consegui confirmar de fora se a
  RLS da tabela `assinantes` impede um usuário autenticado de dar `UPDATE` no próprio
  `status` pra `'ativo'` — testar isso exige um token de usuário real logado, que não tenho.
  Verificar em Table Editor → assinantes → RLS Policies no painel do Supabase.
- **Avaliado e não implementado:** CSP via meta tag. O app usa `onclick=` e `<script>`/`<style>`
  inline extensivamente, então uma CSP precisaria de `'unsafe-inline'` em `script-src`/
  `style-src` — o que bloquearia scripts EXTERNOS não autorizados (proteção real) mas não
  bloquearia um payload de XSS injetado inline (a limitação real está na arquitetura do app,
  não em não ter tentado). Meta tag também não suporta `frame-ancestors` (proteção contra
  clickjacking só funciona via header HTTP, que o GitHub Pages não permite). Draft da política
  ficou pronto mas não foi aplicado — teria que confirmar o domínio exato de ingest do Sentry
  antes, pra não quebrar o monitoramento de erros silenciosamente.

## 2026-08-10 (parte 2)

- Adicionado: controle de assinatura sem bypass client-side. O DB local agora pode ser cifrado
  (AES-GCM) com uma chave entregue só pela nova Edge Function `licenca`, que verifica trial
  (agora controlado no servidor, tabela `trial_starts`) ou assinatura ativa antes de entregar
  qualquer coisa. **Requer 3 passos manuais no painel do Supabase pra entrar em vigor** — veja
  o README, seção "Controle de assinatura sem bypass". Até lá, o app funciona exatamente como
  antes (fail-open, não trava ninguém).
- Migração automática e segura: no primeiro desbloqueio bem-sucedido de cada fisioterapeuta, o
  app baixa um backup de segurança em texto puro antes de cifrar o banco pela primeira vez.
  Testado (inclusive com chave errada, pra garantir que uma falha na decriptação nunca sobrescreve
  o que já estava salvo).
- Mantido o funcionamento offline do PWA: a chave de licença fica em cache local (até 3 meses)
  pra continuar funcionando sem internet — só uma recusa explícita do servidor (403) ignora esse
  cache, senão cancelamento de assinatura nunca revogaria nada de verdade.
- Adicionado: backup automático em pasta local (`app/lib/fs-backup.js`, botão "📁 Backup
  automático" na barra de pacientes) via File System Access API — Chrome/Edge; sem suporte no
  Safari/iPhone, onde o lembrete manual de sempre continua sendo a rede de segurança.
- Adicionado: `app/lib/db-crypto.js` (AES-GCM genérico, com testes) e `tests/db-crypto.test.js`.

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

## 2026-08-04

- Segurança: corrigido XSS armazenado no app. O nome do paciente (vindo da importação de pré-anamnese, preenchida pelo próprio paciente) era inserido sem escape no cabeçalho de impressão via `innerHTML`. Um paciente mal-intencionado podia colocar HTML/script no campo nome e executar código na sessão do(a) fisioterapeuta ao importar e imprimir a ficha. Adicionada função `esc()` de escape de HTML, usada nesse ponto.
- Adicionado: aviso de backup — se houver pacientes cadastrados e o último "Backup geral" tiver mais de 30 dias (ou nunca tiver sido feito), um banner aparece lembrando de exportar, com opção de adiar por 7 dias.

## 2026-08-10

- Segurança: corrigido o mesmo tipo de XSS armazenado nas telas de Evolução e Exames de Imagem (`renderSessoes`/`renderImagens`) — os campos conduta, evolução, achados e laudo iam pro `innerHTML` sem escapar. Vetor real: importar um arquivo de backup/ficha malicioso (JSON) com HTML/script nesses campos executava código na sessão do(a) fisioterapeuta, com acesso ao token de sessão do Supabase.
- Refatorado: as três implementações duplicadas de escape de HTML (`esc`, `escAttr`, `escTxt`) viraram uma única implementação em `app/lib/sanitize.js`, carregada nas duas telas — elimina a chance de um ponto de renderização novo esquecer de escapar por falta de um padrão único.
- Segurança: o código `FICHA::...` da pré-anamnese, antes só Base64 (trivialmente decodificável por qualquer um com acesso à mensagem do WhatsApp), agora é cifrado com AES-GCM (`app/lib/preanamnese-crypto.js`). A chave é gerada e fica só no localStorage do aparelho do(a) fisioterapeuta, embutida no link enviado ao paciente via fragmento da URL (`#k=...`, nunca vai pro servidor). Compatível com códigos antigos (formato legado ainda é aceito na importação).
- Segurança: Sentry agora inicializa com `sendDefaultPii:false`, sem session replay, filtrando corpo de request/cookies/breadcrumbs de input antes de qualquer envio — evita que dado clínico digitado na tela vaze pro Sentry num relatório de erro. Aplicado no app e na landing page.
- Segurança: `supabase-functions/notificar-signup` agora compara o segredo do webhook em tempo constante (mitiga timing attack) e escapa o e-mail antes de inserir no HTML da notificação.
- Corrigido: cálculo de dias restantes do trial gratuito agora tem teto no total configurado (`app/lib/trial.js`) — sem isso, um relógio do aparelho atrasado/manipulado podia fazer o app calcular mais dias de trial do que o configurado.
- Aumentado: senha mínima de 6 para 8 caracteres (criação de conta, recuperação e troca de senha).
- Adicionado: validação de schema em `importarJSON` — arquivo com formato inesperado (paciente sem id, campo em tipo errado etc.) é rejeitado com mensagem clara antes de sobrescrever os dados atuais, em vez de corromper o app silenciosamente.
- Corrigido: `persistDB()` agora trata falha ao salvar no `localStorage` (armazenamento cheio, modo privado) com um aviso claro pro usuário, em vez de falhar silenciosamente sem persistir a alteração.
- Documentado: comentário no CSS explicando que o "cadeado" de login/assinatura é só ocultação de UI (`visibility:hidden`), não controle de acesso a dado — é uma limitação aceita de um app 100% local, não um bug.
- Adicionado: testes automatizados (Vitest) para `app/lib/sanitize.js` e `app/lib/trial.js`, incluindo teste de regressão do XSS corrigido acima, e workflow de CI no GitHub Actions rodando os testes a cada push/PR. Isso não muda como o site é editado/publicado (continua sem build step) — o `package.json` novo serve só pra rodar os testes.
