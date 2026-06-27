const ADMIN_PASSWORD = 'admin';
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-Admin-Password, X-User-Email',
  'Content-Type': 'application/json',
};

export async function onRequest(context) {
  const { request, env } = context;

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS });
  }

  const url = new URL(request.url);
  const adminPwd = request.headers.get('X-Admin-Password');
  const isAdmin = adminPwd === ADMIN_PASSWORD;

  // GET ?todos=1 — admin lista todos os perfis
  if (request.method === 'GET' && url.searchParams.get('todos') === '1') {
    if (!isAdmin) {
      return new Response(JSON.stringify({ error: 'Não autorizado' }), { status: 401, headers: CORS });
    }
    const list = await env.MENU_DATA.list({ prefix: 'perfil:' });
    const perfis = await Promise.all(
      list.keys.map(async k => {
        const val = await env.MENU_DATA.get(k.name);
        return val ? JSON.parse(val) : null;
      })
    );
    return new Response(JSON.stringify(perfis.filter(Boolean)), { status: 200, headers: CORS });
  }

  // GET ?historico=email — admin vê histórico
  if (request.method === 'GET' && url.searchParams.get('historico')) {
    if (!isAdmin) {
      return new Response(JSON.stringify({ error: 'Não autorizado' }), { status: 401, headers: CORS });
    }
    const targetEmail = url.searchParams.get('historico').toLowerCase();
    const hist = await env.MENU_DATA.get('historico:' + targetEmail);
    return new Response(hist || '[]', { status: 200, headers: CORS });
  }

  // GET ?email=x — retorna perfil por email
  if (request.method === 'GET') {
    const email = url.searchParams.get('email') || request.headers.get('X-User-Email');
    if (!email) {
      return new Response(JSON.stringify({ error: 'Email obrigatório' }), { status: 400, headers: CORS });
    }
    const key = 'perfil:' + email.toLowerCase();
    const data = await env.MENU_DATA.get(key);
    if (!data) {
      const vazio = {
        email: email.toLowerCase(), nome: '', cargo: '', emoji: '', foto: '',
        historia: {}, guias: {}, cruzamentos: {}, notas: '', criadoEm: Date.now()
      };
      return new Response(JSON.stringify(vazio), { status: 200, headers: CORS });
    }
    return new Response(data, { status: 200, headers: CORS });
  }

  // POST — salvar perfil + histórico
  if (request.method === 'POST') {
    const userEmail = request.headers.get('X-User-Email');
    if (!userEmail && !isAdmin) {
      return new Response(JSON.stringify({ error: 'Não autorizado' }), { status: 401, headers: CORS });
    }

    let body;
    try { body = await request.json(); }
    catch(e) { return new Response(JSON.stringify({ error: 'JSON inválido' }), { status: 400, headers: CORS }); }

    const targetEmail = (body.email || userEmail || '').toLowerCase();

    if (!isAdmin && userEmail && userEmail.toLowerCase() !== targetEmail) {
      return new Response(JSON.stringify({ error: 'Não autorizado' }), { status: 403, headers: CORS });
    }

    // salvar histórico
    const histKey = 'historico:' + targetEmail;
    const histRaw = await env.MENU_DATA.get(histKey);
    const hist = histRaw ? JSON.parse(histRaw) : [];
    hist.unshift({
      quem: isAdmin ? 'admin' : userEmail,
      quando: Date.now(),
      solicitacao: body.solicitacao || '',
      snapshot: { historia: body.historia || {}, guias: body.guias || {}, cruzamentos: body.cruzamentos || {} }
    });
    if (hist.length > 20) hist.splice(20);
    await env.MENU_DATA.put(histKey, JSON.stringify(hist));

    // salvar perfil
    body.atualizadoEm = Date.now();
    await env.MENU_DATA.put('perfil:' + targetEmail, JSON.stringify(body));

    return new Response(JSON.stringify({ ok: true }), { status: 200, headers: CORS });
  }

  return new Response('Method not allowed', { status: 405, headers: CORS });
}
