// Cloudflare Pages Function: /api/push-subscribe
// Guarda/remove a "subscription" de push do navegador de cada pessoa (o que
// o pushManager.subscribe() do navegador devolve: endpoint + chaves) —
// chave push:sub:<email> na mesma KV (MENU_DATA), guardando uma lista (uma
// pessoa pode ter mais de um aparelho/navegador inscrito)
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json',
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: CORS });
}

export async function onRequest(context) {
  const { request, env } = context;
  if (request.method === 'OPTIONS') return new Response('', { status: 200, headers: CORS });

  const body = await request.json().catch(() => ({}));
  const email = (body.email || '').trim().toLowerCase();
  if (!email) return json({ error: 'E-mail é obrigatório.' }, 400);

  const key = 'push:sub:' + email;
  const atuais = (await env.MENU_DATA.get(key, { type: 'json' })) || [];

  if (request.method === 'POST') {
    const sub = body.subscription;
    if (!sub || !sub.endpoint || !sub.keys || !sub.keys.p256dh || !sub.keys.auth) {
      return json({ error: 'Subscription inválida.' }, 400);
    }
    const semDuplicata = atuais.filter(s => s.endpoint !== sub.endpoint);
    semDuplicata.push(sub);
    await env.MENU_DATA.put(key, JSON.stringify(semDuplicata));
    return json({ ok: true, total: semDuplicata.length });
  }

  if (request.method === 'DELETE') {
    const endpoint = body.endpoint;
    const restantes = endpoint ? atuais.filter(s => s.endpoint !== endpoint) : [];
    await env.MENU_DATA.put(key, JSON.stringify(restantes));
    return json({ ok: true, total: restantes.length });
  }

  return json({ error: 'Método não suportado.' }, 405);
}
