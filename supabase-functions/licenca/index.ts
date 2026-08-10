// Devolve a chave que o app usa pra decifrar o banco de dados local (localStorage) —
// só entrega essa chave se a assinatura estiver ativa OU o trial (controlado aqui,
// não no navegador) ainda não tiver acabado. Sem essa chave, o app não consegue ler
// os dados salvos localmente: é isso que fecha o jeito de hoje de burlar o
// bloqueio (só remover a classe "locked" no DevTools).
//
// Nenhum dado de paciente passa por aqui — só um segredo de "licença", do mesmo
// jeito que o app já troca token de login com o Supabase.
//
// SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY são injetados automaticamente pelo
// runtime de Edge Functions do Supabase — não precisa configurar. Só
// APP_UNLOCK_SECRET precisa ser criado manualmente nas secrets da function
// (um valor aleatório longo, gerado uma vez, nunca reaproveitado de outro lugar).

// npm: em vez de esm.sh — resolve direto do registro do npm (mesma origem já
// confiada pelo pin do lado do navegador), sem depender da camada de transformação
// de um CDN terceiro (esm.sh) no meio do caminho.
import { createClient } from 'npm:@supabase/supabase-js@2.112.0'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const APP_UNLOCK_SECRET = Deno.env.get('APP_UNLOCK_SECRET') ?? ''
const TRIAL_DIAS = 5

// Sem isso, o navegador bloqueia a chamada antes mesmo dela funcionar: toda
// requisição feita via fetch() de um site (fichafisio.com.br) pra outro domínio
// (supabase.co) manda um preflight OPTIONS primeiro, e só segue com a chamada de
// verdade se a resposta do OPTIONS disser explicitamente que aquele origin pode
// chamar. Deno.serve não adiciona isso sozinho — precisa declarar à mão em toda
// resposta (inclusive nas de erro), senão o navegador também descarta elas.
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

function b64url(bytes: Uint8Array): string {
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

// HMAC(userId + ':' + sal, APP_UNLOCK_SECRET) — mesma função pras duas chaves abaixo,
// só muda o "sal" usado.
async function chaveHmac(userId: string, sal: string): Promise<string> {
  const enc = new TextEncoder()
  const key = await crypto.subtle.importKey(
    'raw', enc.encode(APP_UNLOCK_SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  )
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(userId + ':' + sal))
  return b64url(new Uint8Array(sig))
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (!APP_UNLOCK_SECRET || !SUPABASE_URL || !SERVICE_ROLE) {
    return jsonResponse({ error: 'function não configurada' }, 500)
  }

  const authHeader = req.headers.get('Authorization') ?? ''
  const token = authHeader.replace(/^Bearer\s+/i, '')
  if (!token) return jsonResponse({ error: 'sem sessão' }, 401)

  const sb = createClient(SUPABASE_URL, SERVICE_ROLE)

  const { data: userData, error: userErr } = await sb.auth.getUser(token)
  if (userErr || !userData?.user) {
    return jsonResponse({ error: 'sessão inválida' }, 401)
  }
  const uid = userData.user.id

  let liberado = false
  try {
    const { data: assin } = await sb.from('assinantes').select('status,validade').eq('id', uid).maybeSingle()
    liberado = !!(assin && assin.status === 'ativo' && (!assin.validade || new Date(assin.validade) >= new Date()))

    if (!liberado) {
      let { data: trial } = await sb.from('trial_starts').select('started_at').eq('user_id', uid).maybeSingle()
      if (!trial) {
        const ins = await sb.from('trial_starts').insert({ user_id: uid }).select('started_at').single()
        trial = ins.data
      }
      if (trial) {
        const diasPassados = (Date.now() - new Date(trial.started_at).getTime()) / 86400000
        liberado = diasPassados < TRIAL_DIAS
      }
    }
  } catch (_) {
    return jsonResponse({ error: 'erro ao verificar acesso' }, 500)
  }

  if (!liberado) {
    return jsonResponse({ error: 'sem acesso — trial expirado e sem assinatura ativa' }, 403)
  }

  // Chave de criptografia do banco local: ESTÁVEL por usuário — não muda com o mês.
  // Rotacionar por época parecia bom pra "revogar num intervalo previsível", mas na
  // prática só a autorização acima (liberado/não liberado, checada em toda chamada)
  // já controla o acesso; trocar a chave todo mês só quebrava a decriptação de quem
  // já tinha sido cifrado no mês anterior, travando cliente pagante fora do próprio
  // prontuário. Ver CHANGELOG — correção do bug de rotação mensal.
  const chave = await chaveHmac(uid, 'chave-db-estavel-v1')

  // Só serve pra abrir (uma única vez) um banco que já tinha sido cifrado com o
  // esquema antigo (chave por "AAAA-MM"), migrar pra chave estável acima e nunca
  // mais ser usada. Não é uma chave "de verdade" nova — é a mesma conta antiga,
  // calculada de novo, só como ponte de migração.
  const epochAtual = new Date().toISOString().slice(0, 7)
  const chaveAntiga = await chaveHmac(uid, epochAtual)

  return jsonResponse({ chave, chaveAntiga }, 200)
})
