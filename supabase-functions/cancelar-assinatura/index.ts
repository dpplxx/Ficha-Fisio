Deno.serve(async (req) => {
  const cors = {
    'Access-Control-Allow-Origin':'*',
    'Access-Control-Allow-Headers':'authorization, content-type',
    'Access-Control-Allow-Methods':'POST, OPTIONS'
  };
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const json = (o, s=200) => new Response(JSON.stringify(o), {
    status:s, headers:{...cors,'Content-Type':'application/json'}
  });
  try {
    const token = (req.headers.get('Authorization')||'').replace('Bearer ','');
    const SB_URL = Deno.env.get('SUPABASE_URL')!;
    const SB_ANON = Deno.env.get('SUPABASE_ANON_KEY')!;
    const ASAAS_KEY = Deno.env.get('ASAAS_API_KEY')!;
    const ASAAS_BASE = 'https://api.asaas.com/v3';

    // Verifica token usando a chave anon (correta)
    const ures = await fetch(`${SB_URL}/auth/v1/user`, {
      headers: { Authorization:`Bearer ${token}`, apikey: SB_ANON }
    });
    if (!ures.ok) return json({ ok:false, erro:'nao autenticado' }, 401);
    const email = ((await ures.json()).email||'').toLowerCase();
    if (!email) return json({ ok:false, erro:'sem email' });

    // Busca cliente no Asaas pelo email e cancela assinatura
    const cres = await fetch(`${ASAAS_BASE}/customers?email=${encodeURIComponent(email)}`, {
      headers: { access_token: ASAAS_KEY }
    });
    const cust = (await cres.json())?.data?.[0];
    let canceladas = 0;
    if (cust) {
      const sres = await fetch(`${ASAAS_BASE}/subscriptions?customer=${cust.id}`, {
        headers: { access_token: ASAAS_KEY }
      });
      for (const sub of ((await sres.json())?.data||[])) {
        const d = await fetch(`${ASAAS_BASE}/subscriptions/${sub.id}`, {
          method:'DELETE', headers:{ access_token: ASAAS_KEY }
        });
        if (d.ok) canceladas++;
      }
    }
    return json({ ok:true, canceladas });
  } catch(e){ return json({ ok:false, erro:String(e) }, 500); }
});
