// ════════════════════════════════════════
// API do Guia de Lojas — Cloudflare Pages Functions
// KV binding: LOJAS_KV
// Env var:    ADMIN_PASS
// ════════════════════════════════════════

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type,Authorization',
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS },
  });
}

function isAdmin(request, env) {
  const auth = request.headers.get('Authorization') || '';
  return auth === `Bearer ${env.ADMIN_PASS}`;
}

async function getLojas(env) {
  const raw = await env.LOJAS_KV.get('lojas');
  return raw ? JSON.parse(raw) : [];
}

async function getCats(env) {
  const raw = await env.LOJAS_KV.get('categorias');
  if (!raw) return [
    {name:'Alimentos', emoji:'🥬'},
    {name:'Artesanato', emoji:'🏺'},
    {name:'Ervas & Naturais', emoji:'🌿'},
    {name:'Esotérico', emoji:'🕯️'},
    {name:'Livros & Cultura', emoji:'📚'},
  ];
  const parsed = JSON.parse(raw);
  // migrate legacy string array
  if (parsed.length && typeof parsed[0] === 'string') {
    return parsed.map(c => ({ name: c, emoji: '🏪' }));
  }
  return parsed;
}

export async function onRequest({ request, env, params }) {
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS });
  }

  const url = new URL(request.url);
  const path = '/' + (params.route ? params.route.join('/') : '');

  // ── GET /api/lojas ──────────────────────
  if (path === '/lojas' && request.method === 'GET') {
    const lojas = await getLojas(env);
    if (!isAdmin(request, env)) {
      try {
        const cats = await getCats(env);
        const privateCats = new Set(cats.filter(c => c.private).map(c => c.name));
        if (privateCats.size) return json(lojas.filter(l => !privateCats.has(l.category)));
      } catch {}
    }
    return json(lojas);
  }

  // ── POST /api/lojas (qualquer pessoa) ──
  if (path === '/lojas' && request.method === 'POST') {
    const body = await request.json();
    const { name, category, sells, address, maps, photo, emoji, lat, lng, addedBy } = body;
    if (!name || !category || !address) {
      return json({ error: 'Nome, categoria e endereço são obrigatórios' }, 400);
    }
    const lojas = await getLojas(env);
    const nova = {
      id: Date.now(),
      name: String(name).slice(0, 120),
      category: String(category).slice(0, 60),
      sells: String(sells).slice(0, 400),
      address: String(address).slice(0, 200),
      maps: String(maps).slice(0, 500),
      photo: String(photo || '').slice(0, 500),
      emoji: String(emoji || '🏪').slice(0, 4),
      lat: parseFloat(lat) || null,
      lng: parseFloat(lng) || null,
      addedBy: String(addedBy || 'Anônimo').slice(0, 80),
      addedAt: new Date().toLocaleDateString('pt-BR'),
    };
    lojas.push(nova);
    await env.LOJAS_KV.put('lojas', JSON.stringify(lojas));
    return json(nova, 201);
  }

  // ── PUT /api/loja/:id (admin) ──────────
  if (path.startsWith('/loja/') && request.method === 'PUT') {
    if (!isAdmin(request, env)) return json({ error: 'Não autorizado' }, 401);
    const id = parseInt(path.split('/')[2]);
    const body = await request.json();
    const lojas = await getLojas(env);
    const i = lojas.findIndex(l => l.id === id);
    if (i === -1) return json({ error: 'Não encontrado' }, 404);
    lojas[i] = { ...lojas[i], ...body, id };
    await env.LOJAS_KV.put('lojas', JSON.stringify(lojas));
    return json(lojas[i]);
  }

  // ── DELETE /api/loja/:id (admin) ───────
  if (path.startsWith('/loja/') && request.method === 'DELETE') {
    if (!isAdmin(request, env)) return json({ error: 'Não autorizado' }, 401);
    const id = parseInt(path.split('/')[2]);
    let lojas = await getLojas(env);
    lojas = lojas.filter(l => l.id !== id);
    await env.LOJAS_KV.put('lojas', JSON.stringify(lojas));
    return json({ ok: true });
  }

  // ── POST /api/reset-cats (admin) — recupera categorias corrompidas ──
  if (path === '/reset-cats' && request.method === 'POST') {
    if (!isAdmin(request, env)) return json({ error: 'Não autorizado' }, 401);
    const defaults = [
      {name:'Alimentos',       emoji:'🥬', private:false},
      {name:'Artesanato',      emoji:'🏺', private:false},
      {name:'Ervas & Naturais',emoji:'🌿', private:false},
      {name:'Esotérico',       emoji:'🕯️', private:false},
      {name:'Livros & Cultura',emoji:'📚', private:false},
    ];
    await env.LOJAS_KV.put('categorias', JSON.stringify(defaults));
    return json(defaults);
  }

  // ── GET /api/resolve-url?u=... ────────
  // Resolve short Google Maps URLs (share.google, goo.gl, maps.app.goo.gl)
  // server-side to extract the final URL with coords and address
  if (path === '/resolve-url' && request.method === 'GET') {
    const shortUrl = url.searchParams.get('u');
    if (!shortUrl) return json({ error: 'Parâmetro u obrigatório' }, 400);
    try {
      const res = await fetch(shortUrl, {
        redirect: 'follow',
        headers: { 'User-Agent': 'Mozilla/5.0' },
      });
      return json({ finalUrl: res.url });
    } catch (e) {
      return json({ error: 'Não foi possível resolver o link', detail: e.message }, 502);
    }
  }

  // ── GET /api/qualidades ───────────────
  if (path === '/qualidades' && request.method === 'GET') {
    const raw = await env.LOJAS_KV.get('qualidades');
    const quals = raw ? JSON.parse(raw) : ['Bons preços','Perto do terreiro','Diversidade de materiais','Imagens Bahia','Atendimento especial','Preço justo','Variedade de ervas'];
    return json(quals);
  }

  // ── PUT /api/qualidades (admin) ────────
  if (path === '/qualidades' && request.method === 'PUT') {
    if (!isAdmin(request, env)) return json({ error: 'Não autorizado' }, 401);
    const body = await request.json();
    if (!Array.isArray(body)) return json({ error: 'Array esperado' }, 400);
    const quals = body.map(c => String(c).slice(0, 80)).filter(Boolean);
    await env.LOJAS_KV.put('qualidades', JSON.stringify(quals));
    return json(quals);
  }

  // ── GET /api/categorias ────────────────
  if (path === '/categorias' && request.method === 'GET') {
    return json(await getCats(env));
  }

  // ── PUT /api/categorias (admin) ────────
  if (path === '/categorias' && request.method === 'PUT') {
    if (!isAdmin(request, env)) return json({ error: 'Não autorizado' }, 401);
    const body = await request.json();
    if (!Array.isArray(body)) return json({ error: 'Array esperado' }, 400);
    const cats = body.map(c => ({
      name:    String(c.name||c).slice(0, 60),
      emoji:   String(c.emoji||'🏪').slice(0, 4),
      private: Boolean(c.private || false)
    })).filter(c => c.name);
    await env.LOJAS_KV.put('categorias', JSON.stringify(cats));
    return json(cats);
  }

  return json({ error: 'Rota não encontrada' }, 404);
}
