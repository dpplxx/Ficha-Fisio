const RESEND_KEY     = Deno.env.get('RESEND_API_KEY') ?? ''
const OWNER_EMAIL    = Deno.env.get('OWNER_EMAIL') ?? ''
const WEBHOOK_SECRET = Deno.env.get('SIGNUP_WEBHOOK_SECRET') ?? ''

function timingSafeEqual(a: string, b: string): boolean {
  const bufA = new TextEncoder().encode(a)
  const bufB = new TextEncoder().encode(b)
  let diff = bufA.length ^ bufB.length
  const len = Math.max(bufA.length, bufB.length)
  for (let i = 0; i < len; i++) diff |= (bufA[i] ?? 0) ^ (bufB[i] ?? 0)
  return diff === 0
}

function escapeHtml(s: string): string {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string))
}

Deno.serve(async (req) => {
  const provided = req.headers.get('x-webhook-secret') ?? ''
  if (!WEBHOOK_SECRET || !timingSafeEqual(provided, WEBHOOK_SECRET)) {
    return new Response('Unauthorized', { status: 401 })
  }
  try {
    const { email, created_at } = await req.json()

    const data = new Date(created_at)
    const formatado = data.toLocaleString('pt-BR', {
      timeZone: 'America/Sao_Paulo',
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit'
    })

    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: 'Ficha Fisio <onboarding@resend.dev>',
        to: OWNER_EMAIL,
        subject: '🆕 Nova conta criada no Ficha Fisio',
        html: `
          <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px">
            <h2 style="color:#0f4c81;margin-bottom:16px">Nova conta no Ficha Fisio 🩺</h2>
            <table style="width:100%;border-collapse:collapse">
              <tr>
                <td style="padding:8px 0;color:#555;font-size:14px;width:90px"><strong>E-mail</strong></td>
                <td style="padding:8px 0;font-size:14px">${escapeHtml(email)}</td>
              </tr>
              <tr>
                <td style="padding:8px 0;color:#555;font-size:14px"><strong>Data/hora</strong></td>
                <td style="padding:8px 0;font-size:14px">${formatado}</td>
              </tr>
            </table>
            <p style="color:#aaa;font-size:11px;margin-top:24px">Notificação automática — Ficha Fisio</p>
          </div>
        `
      })
    })
  } catch (_) { /* ignora erros silenciosamente */ }

  return new Response(JSON.stringify({ ok: true }), {
    headers: { 'Content-Type': 'application/json' }
  })
})
