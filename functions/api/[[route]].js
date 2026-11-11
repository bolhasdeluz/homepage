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

  // ── contador de uso do Google Places, por mês ──────────────────────
  // A gente não sabe de antemão qual é a cota gratuita exata (o preço/cota
  // do Google muda com o tempo e depende do plano) — em vez de inventar um
  // número, só conta cada tentativa e descobre o teto sozinho na primeira
  // vez que o Google recusar por cota. Depois de descoberto, pausa a busca
  // automática pro resto do mês (sem gastar chamada à toa) até o contador
  // zerar no mês seguinte.
  function chaveMesAtual() {
    return 'places-busca:' + new Date().toISOString().slice(0, 7); // "2026-11"
  }
  async function getContadorBuscas(env) {
    const raw = await env.LOJAS_KV.get(chaveMesAtual());
    return raw ? JSON.parse(raw) : { contagem: 0, limiteDescoberto: null, descobertoEm: null };
  }
  async function salvarContadorBuscas(env, estado) {
    await env.LOJAS_KV.put(chaveMesAtual(), JSON.stringify(estado));
  }
  function pareceErroDeCota(status, data) {
    if (status === 429) return true;
    const s = (data?.error?.status || '').toUpperCase();
    const msg = (data?.error?.message || '').toLowerCase();
    return s === 'RESOURCE_EXHAUSTED' || msg.includes('quota');
  }

  // ── GET /api/buscar-lugar-status ───────
  // Só lê o contador do mês — pra mostrar no botão do cabeçalho, sem gastar
  // nenhuma chamada ao Google.
  if (path === '/buscar-lugar-status' && request.method === 'GET') {
    return json(await getContadorBuscas(env));
  }

  // ── POST /api/buscar-lugar ─────────────
  // Busca automática no Google Places (Text Search) a partir do nome +
  // endereço já digitados no formulário de indicar loja — pra achar a
  // localização exata sem precisar que a pessoa vá no Google Maps, copie
  // o link e cole de volta aqui. Precisa da env var GOOGLE_PLACES_API_KEY
  // (chave do Google Cloud com a "Places API (New)" ativada e faturamento
  // configurado — tem cota gratuita mensal, mas exige cartão cadastrado).
  if (path === '/buscar-lugar' && request.method === 'POST') {
    const apiKey = env.GOOGLE_PLACES_API_KEY;
    if (!apiKey) {
      return json({ error: 'Busca automática não configurada ainda (falta a chave do Google Places nas variáveis de ambiente).' }, 500);
    }
    const body = await request.json();
    const nome = String(body.nome || '').trim();
    const endereco = String(body.endereco || '').trim();
    if (!nome && !endereco) return json({ error: 'Informe nome ou endereço.' }, 400);

    const contador = await getContadorBuscas(env);
    if (contador.limiteDescoberto !== null && contador.contagem >= contador.limiteDescoberto) {
      // já sabemos o teto desse mês — nem tenta de novo, economiza a chamada
      return json({ limitado: true, contagem: contador.contagem, limiteDescoberto: contador.limiteDescoberto, descobertoEm: contador.descobertoEm });
    }

    const textQuery = [nome, endereco].filter(Boolean).join(', ');
    try {
      const res = await fetch('https://places.googleapis.com/v1/places:searchText', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': apiKey,
          'X-Goog-FieldMask': 'places.displayName,places.formattedAddress,places.location,places.googleMapsUri,places.nationalPhoneNumber,places.regularOpeningHours.weekdayDescriptions',
        },
        body: JSON.stringify({
          textQuery,
          languageCode: 'pt-BR',
          regionCode: 'BR',
          // só prioriza resultados perto da terreira (Porto Alegre) — não
          // restringe a busca, então um endereço de verdade fora dali
          // ainda é encontrado
          locationBias: {
            circle: {
              center: { latitude: -30.022979992882995, longitude: -51.13118660674672 },
              radius: 30000,
            },
          },
        }),
      });
      const data = await res.json();

      if (!res.ok) {
        if (pareceErroDeCota(res.status, data)) {
          // primeira vez que o Google recusa por cota esse mês — é o teto
          // que a gente estava tentando descobrir
          contador.limiteDescoberto = contador.contagem;
          contador.descobertoEm = Date.now();
          await salvarContadorBuscas(env, contador);
          return json({ limitado: true, contagem: contador.contagem, limiteDescoberto: contador.limiteDescoberto, descobertoEm: contador.descobertoEm });
        }
        return json({ error: data.error?.message || 'Erro ao consultar o Google Places.' }, 502);
      }

      contador.contagem += 1;
      await salvarContadorBuscas(env, contador);

      const lugar = (data.places || [])[0];
      if (!lugar) return json({ encontrado: false, contagem: contador.contagem });
      // "horário seg a sex" e "horário sábado" só dá pra aproximar — o
      // formulário tem só esses dois campos de texto, não um por dia da
      // semana, então usamos o texto de segunda (índice 0) e sábado
      // (índice 5) como representativos e avisamos no popup que é uma
      // aproximação, pra quem está cadastrando conferir antes de enviar.
      const diasSemana = lugar.regularOpeningHours?.weekdayDescriptions || [];
      const horaDoDia = (texto) => texto ? texto.replace(/^[^:]+:\s*/, '') : '';
      return json({
        encontrado: true,
        nome: lugar.displayName?.text || '',
        endereco: lugar.formattedAddress || '',
        lat: lugar.location?.latitude ?? null,
        lng: lugar.location?.longitude ?? null,
        mapsUrl: lugar.googleMapsUri || '',
        telefone: lugar.nationalPhoneNumber || '',
        horarioSegSex: horaDoDia(diasSemana[0]),
        horarioSabado: horaDoDia(diasSemana[5]),
        contagem: contador.contagem,
      });
    } catch (e) {
      return json({ error: e.message }, 500);
    }
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
