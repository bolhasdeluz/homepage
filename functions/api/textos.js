// Cloudflare Pages Function: /api/textos
// CRUD de "Textos" (doutrina, instruções, lembretes, normas etc.) via KV
// (MENU_DATA, prefixo "texto:") — mesmo padrão de sessoes.js, mas sem
// sincronização externa. Leitura é pública (a visibilidade por grupo é
// aplicada no cliente, igual já acontece com sessões e avisos); escrita
// protegida por X-Admin-Password.

const ADMIN_PASSWORD = 'admin';
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-Admin-Password',
  'Content-Type': 'application/json',
};

const GRUPOS_VALIDOS = ['publico', 'visitante', 'filhas', 'tamboreiro', 'amigos', 'assistencia', 'familia'];
const CATEGORIAS_VALIDAS = ['doutrina', 'instrucao', 'lembrete', 'financeiro', 'reflexao', 'materiais', 'normas', 'vestimenta', 'recursos'];

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: CORS });
}

function sanitizarPalavrasChave(v) {
  if (!Array.isArray(v)) return [];
  return [...new Set(v.map(k => String(k || '').trim().toLowerCase()).filter(Boolean))].slice(0, 30);
}

function sanitizarGrupos(v) {
  if (!Array.isArray(v)) return [];
  return v.filter(g => GRUPOS_VALIDOS.includes(g));
}

export async function onRequest(context) {
  const { request, env } = context;

  if (request.method === 'OPTIONS') return new Response('', { status: 200, headers: CORS });

  const KV = env.MENU_DATA;
  if (!KV) return json({ error: 'KV não configurado.' }, 500);

  const method = request.method;

  try {
    // LIST — GET /api/textos
    if (method === 'GET') {
      const list = await KV.list({ prefix: 'texto:' });
      const items = await Promise.all(list.keys.map(k => KV.get(k.name, { type: 'json' })));
      const textos = items.filter(Boolean).sort((a, b) => (b.data || '').localeCompare(a.data || ''));
      return json(textos);
    }

    if (request.headers.get('X-Admin-Password') !== ADMIN_PASSWORD) {
      return json({ error: 'Não autorizado' }, 403);
    }
    const body = await request.json();

    // CREATE — POST
    if (method === 'POST') {
      if (!body.titulo || !body.data) return json({ error: 'Título e data são obrigatórios.' }, 400);
      const id = `texto:${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      const texto = {
        id,
        titulo: String(body.titulo).slice(0, 300),
        data: body.data,
        datasExtras: Array.isArray(body.datasExtras) ? body.datasExtras.slice(0, 20) : [],
        corpo: String(body.corpo || '').slice(0, 20000),
        categoria: CATEGORIAS_VALIDAS.includes(body.categoria) ? body.categoria : 'lembrete',
        palavrasChave: sanitizarPalavrasChave(body.palavrasChave),
        grupos: sanitizarGrupos(body.grupos),
        criadoEm: Date.now(),
      };
      await KV.put(id, JSON.stringify(texto));
      return json(texto);
    }

    // UPDATE — PUT
    if (method === 'PUT') {
      const { id, ...fields } = body;
      if (!id) return json({ error: 'id obrigatório' }, 400);
      const existing = await KV.get(id, { type: 'json' });
      if (!existing) return json({ error: 'Texto não encontrado' }, 404);
      const updated = { ...existing, ...fields, id, atualizadoEm: Date.now() };
      if (fields.palavrasChave !== undefined) updated.palavrasChave = sanitizarPalavrasChave(fields.palavrasChave);
      if (fields.grupos !== undefined) updated.grupos = sanitizarGrupos(fields.grupos);
      if (fields.categoria !== undefined) updated.categoria = CATEGORIAS_VALIDAS.includes(fields.categoria) ? fields.categoria : existing.categoria;
      await KV.put(id, JSON.stringify(updated));
      return json(updated);
    }

    // DELETE — DELETE
    if (method === 'DELETE') {
      const { id } = body;
      if (!id) return json({ error: 'id obrigatório' }, 400);
      await KV.delete(id);
      return json({ ok: true });
    }

    return json({ error: 'Método não suportado' }, 405);

  } catch (e) {
    return json({ error: e.message }, 500);
  }
}
