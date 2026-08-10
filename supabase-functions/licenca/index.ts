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

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.112.0'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const APP_UNLOCK_SECRET = Deno.env.get('APP_UNLOCK_SECRET') ?? ''
const TRIAL_DIAS = 5

function b64url(bytes: Uint8Array): string {
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

async function chaveDoMes(userId: string, epoch: string): Promise<string> {
  const enc = new TextEncoder()
  const key = await crypto.subtle.importKey(
    'raw', enc.encode(APP_UNLOCK_SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  )
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(userId + ':' + epoch))
  return b64url(new Uint8Array(sig))
}

Deno.serve(async (req) => {
  if (!APP_UNLOCK_SECRET || !SUPABASE_URL || !SERVICE_ROLE) {
    return new Response(JSON.stringify({ error: 'function não configurada' }), { status: 500 })
  }

  const authHeader = req.headers.get('Authorization') ?? ''
  const token = authHeader.replace(/^Bearer\s+/i, '')
  if (!token) return new Response(JSON.stringify({ error: 'sem sessão' }), { status: 401 })

  const sb = createClient(SUPABASE_URL, SERVICE_ROLE)

  const { data: userData, error: userErr } = await sb.auth.getUser(token)
  if (userErr || !userData?.user) {
    return new Response(JSON.stringify({ error: 'sessão inválida' }), { status: 401 })
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
    return new Response(JSON.stringify({ error: 'erro ao verificar acesso' }), { status: 500 })
  }

  if (!liberado) {
    return new Response(JSON.stringify({ error: 'sem acesso — trial expirado e sem assinatura ativa' }), { status: 403 })
  }

  // a chave muda por mês (epoch) — permite revogar acesso num intervalo previsível
  // sem quebrar uso offline dentro do mesmo período (o app guarda a chave do mês
  // corrente em cache pra continuar funcionando sem internet)
  const epoch = new Date().toISOString().slice(0, 7) // "AAAA-MM"
  const chave = await chaveDoMes(uid, epoch)

  return new Response(JSON.stringify({ chave, epoch }), {
    headers: { 'Content-Type': 'application/json' }
  })
})
