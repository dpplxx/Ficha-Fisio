import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const sb = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
)

const APP_URL = 'https://fichafisio.com.br/app/'
const ASAAS_BASE = 'https://api.asaas.com/v3'

async function asaasGet(path: string): Promise<any> {
  const key = Deno.env.get('ASAAS_API_KEY')!
  const res = await fetch(`${ASAAS_BASE}${path}`, {
    headers: { 'access_token': key }
  })
  if (!res.ok) return null
  return res.json()
}

async function enviarEmailBoasVindas(email: string, setupLink: string) {
  const resendKey = Deno.env.get('RESEND_API_KEY')
  if (!resendKey) { console.error('RESEND_API_KEY não configurada'); return }
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: 'Ficha Fisio <noreply@fichafisio.com.br>',
      to: email,
      subject: 'Pagamento aprovado — crie sua senha para acessar o Ficha Fisio',
      html: `
        <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px;">
          <h2 style="color:#0f4c81;">Bem-vindo ao Ficha Fisio!</h2>
          <p>Seu pagamento foi aprovado. Clique no botão abaixo para acessar o app:</p>
          <a href="${setupLink}"
             style="display:inline-block;background:#0f4c81;color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:bold;margin:16px 0;">
            Acessar o Ficha Fisio
          </a>
          <p style="color:#666;font-size:13px;">Na tela de login, clique em <b>Esqueci a senha</b> para criar sua senha de acesso. O link expira em 24 horas.</p>
          <p style="color:#666;font-size:12px;word-break:break-all;">${setupLink}</p>
          <hr style="border:none;border-top:1px solid #eee;margin:24px 0;">
          <p style="color:#999;font-size:12px;">Acesse sempre em: <a href="${APP_URL}">${APP_URL}</a></p>
        </div>
      `,
    }),
  })
  if (!res.ok) {
    const body = await res.text()
    console.error('Resend erro:', res.status, body)
  } else {
    console.log('Email boas-vindas enviado para:', email)
  }
}

async function ativarOuDesativar(email: string, ativo: boolean, subId?: string, validade?: string | null) {
  const { data: lista } = await sb.auth.admin.listUsers()
  let user = lista?.users.find((u: any) => u.email?.toLowerCase() === email)
  const isNovo = !user

  if (!user && ativo) {
    const supaUrl = Deno.env.get('SUPABASE_URL')!
    const supaKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const res = await fetch(`${supaUrl}/auth/v1/admin/users`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${supaKey}`,
        'apikey': supaKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email, email_confirm: true, password: crypto.randomUUID() }),
    })
    const body = await res.json()
    console.log('createUser:', res.status, JSON.stringify(body))
    if (!res.ok) throw new Error('Erro ao criar usuário: ' + JSON.stringify(body))
    user = body
  }

  if (!user) return { action: 'no_user' }

  await sb.from('assinantes').upsert({
    id: user.id,
    email,
    status: ativo ? 'ativo' : 'inativo',
    mp_sub_id: subId ?? null,
    atualizado_em: new Date().toISOString(),
    validade: validade ?? null,
  })

  if (isNovo && ativo) {
    try {
      const supaUrl = Deno.env.get('SUPABASE_URL')!
      const supaKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
      const linkRes = await fetch(`${supaUrl}/auth/v1/admin/generate_link`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${supaKey}`, 'apikey': supaKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'recovery', email, redirect_to: APP_URL }),
      })
      const linkData = await linkRes.json()
      if (linkData?.action_link) {
        await enviarEmailBoasVindas(email, linkData.action_link)
      }
    } catch (_) {}
  }

  return { action: ativo ? 'activated' : 'deactivated', email }
}

function calcularValidade(cycle: string | undefined): string | null {
  if (!cycle) return null
  const dias: Record<string, number> = {
    MONTHLY: 33,
    BIMONTHLY: 63,
    QUARTERLY: 93,
    SEMIANNUALLY: 186,
    YEARLY: 366,
  }
  const d = new Date()
  d.setDate(d.getDate() + (dias[cycle] ?? 33))
  return d.toISOString()
}

Deno.serve(async (req) => {
  if (req.method === 'GET') return new Response(JSON.stringify({ ok: true }), { headers: { 'Content-Type': 'application/json' } })
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 })

  const expectedToken = Deno.env.get('ASAAS_WEBHOOK_TOKEN')
  const receivedToken = req.headers.get('asaas-access-token')
  if (!expectedToken || receivedToken !== expectedToken) {
    console.error('webhook token inválido:', receivedToken)
    return new Response('Unauthorized', { status: 401 })
  }

  let payload: any
  try { payload = await req.json() } catch { return new Response('Invalid JSON', { status: 400 }) }

  const event = payload?.event as string
  const payment = payload?.payment
  const subscription = payload?.subscription

  console.log('asaas webhook:', JSON.stringify({ event, paymentId: payment?.id, subId: subscription?.id }))

  const ATIVAR = ['PAYMENT_RECEIVED', 'PAYMENT_CONFIRMED']
  const DESATIVAR = ['PAYMENT_REFUNDED', 'PAYMENT_CHARGEBACK', 'SUBSCRIPTION_DELETED', 'PAYMENT_OVERDUE']

  if (!ATIVAR.includes(event) && !DESATIVAR.includes(event)) {
    return new Response(JSON.stringify({ ok: true, action: 'ignored', event }), { headers: { 'Content-Type': 'application/json' } })
  }

  const customerId = payment?.customer ?? subscription?.customer
  if (!customerId) return new Response('No customer in payload', { status: 400 })

  const customer = await asaasGet(`/customers/${customerId}`)
  if (!customer?.email) return new Response('No email for customer', { status: 400 })

  const email = customer.email.toLowerCase().trim()
  const subId = payment?.subscription ?? subscription?.id ?? undefined
  const ativo = ATIVAR.includes(event)

  // Calcula validade buscando o ciclo da assinatura na API do Asaas
  let validade: string | null = null
  if (ativo && subId) {
    const sub = await asaasGet(`/subscriptions/${subId}`)
    validade = calcularValidade(sub?.cycle)
    console.log('ciclo:', sub?.cycle, '→ validade:', validade)
  }

  console.log('processando:', JSON.stringify({ event, email, ativo, validade }))

  try {
    const result = await ativarOuDesativar(email, ativo, subId, validade)
    return new Response(JSON.stringify({ ok: true, ...result }), { headers: { 'Content-Type': 'application/json' } })
  } catch (err: any) {
    return new Response(JSON.stringify({ ok: false, error: err.message }), { headers: { 'Content-Type': 'application/json' }, status: 500 })
  }
})
