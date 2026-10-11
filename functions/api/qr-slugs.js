// Cloudflare Pages Function: /api/qr-slugs
// Permite criar/remover QR codes personalizados direto do painel admin,
// sem precisar mexer em código. Cada um vira um link curto /ir/<slug>
// (resolvido em functions/ir/[slug].js) apontando pra uma das páginas já
// existentes do site — as leituras continuam contadas em /api/qr-contagem,
// que já é genérico por slug.

const ADMIN_PASSWORD = 'admin';
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-Admin-Password',
  'Content-Type': 'application/json',
};

const DESTINOS_PERMITIDOS = {
  site: '/',
  'rifa-digital': '/rifa-digital',
  cosmes: '/cosmes',
};

// slugs já usados pelos QR codes fixos do sistema — não deixa recriar
const SLUGS_RESERVADOS = ['cosmes', 'rifa', 'site', 'banner'];

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: CORS });
}

function normalizarSlug(valor) {
  return String(valor || '')
    .toLowerCase()
    .trim()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

export async function onRequest(context) {
  const { request, env } = context;

  if (request.method === 'OPTIONS') return new Response('', { status: 200, headers: CORS });
  if (request.headers.get('X-Admin-Password') !== ADMIN_PASSWORD) {
    return json({ error: 'Não autorizado' }, 403);
  }

  const KV = env.MENU_DATA;
  if (!KV) return json({ error: 'KV não configurado.' }, 500);

  if (request.method === 'GET') {
    const registro = (await KV.get('qr:slugs:registro', { type: 'json' })) || [];
    const itens = [];
    for (const slug of registro) {
      const dados = await KV.get(`qr:slug:${slug}`, { type: 'json' });
      if (dados) itens.push({ slug, ...dados });
    }
    itens.sort((a, b) => (b.criadoEm || 0) - (a.criadoEm || 0));
    return json({ itens });
  }

  if (request.method === 'POST') {
    let body = {};
    try { body = await request.json(); } catch (e) { /* body vazio */ }
    const acao = body.acao;

    if (acao === 'criar') {
      const slug = normalizarSlug(body.slug);
      const destinoTipo = String(body.destino || '');
      const destino = DESTINOS_PERMITIDOS[destinoTipo];
      const label = String(body.label || '').trim().slice(0, 80);

      if (!slug || slug.length < 2) {
        return json({ error: 'Dê um nome válido pro QR (só letras, números e hífen).' }, 400);
      }
      if (SLUGS_RESERVADOS.includes(slug)) {
        return json({ error: 'Esse nome já é usado por um QR do sistema. Escolha outro.' }, 400);
      }
      if (!destino) return json({ error: 'Escolha um destino válido.' }, 400);

      const existente = await KV.get(`qr:slug:${slug}`);
      if (existente) return json({ error: 'Já existe um QR com esse nome.' }, 400);

      const registro = (await KV.get('qr:slugs:registro', { type: 'json' })) || [];
      if (!registro.includes(slug)) registro.push(slug);
      await KV.put('qr:slugs:registro', JSON.stringify(registro));

      const dados = { destino, destinoTipo, label: label || slug, criadoEm: Date.now() };
      await KV.put(`qr:slug:${slug}`, JSON.stringify(dados));

      return json({ slug, ...dados });
    }

    if (acao === 'remover') {
      const slug = normalizarSlug(body.slug);
      const registro = (await KV.get('qr:slugs:registro', { type: 'json' })) || [];
      const novoRegistro = registro.filter(s => s !== slug);
      await KV.put('qr:slugs:registro', JSON.stringify(novoRegistro));
      await KV.delete(`qr:slug:${slug}`);
      return json({ ok: true });
    }

    return json({ error: 'Ação desconhecida.' }, 400);
  }

  return json({ error: 'Método não suportado' }, 405);
}
