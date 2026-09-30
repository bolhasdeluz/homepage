// Cloudflare Pages Function: /api/sessoes-modelos
// CRUD de "modelos de sessão" — peças reaproveitáveis (nome, tipo, lado,
// onde, endereço, responsável, tambor, descrição) pro Planejamento Anual:
// em vez de criar uma sessão do zero pra cada gira que se repete todo ano,
// a admin arrasta um modelo pronto pro dia e só ajusta a hora. Guardado no
// mesmo KV das sessões (SESSOES_KV), prefixo "modelo:".

const ADMIN_PASSWORD = 'admin';
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-Admin-Password',
  'Content-Type': 'application/json',
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: CORS });
}

export async function onRequest(context) {
  const { request, env } = context;

  if (request.method === 'OPTIONS') return new Response('', { status: 200, headers: CORS });

  const KV = env.SESSOES_KV;
  if (!KV) return json({ error: 'KV não configurado.' }, 500);

  const method = request.method;

  try {
    // LIST — GET /api/sessoes-modelos
    if (method === 'GET') {
      const list = await KV.list({ prefix: 'modelo:' });
      const items = await Promise.all(list.keys.map(k => KV.get(k.name, { type: 'json' })));
      const modelos = items.filter(Boolean).sort((a, b) => (a.nome || '').localeCompare(b.nome || ''));
      return json(modelos);
    }

    if (request.headers.get('X-Admin-Password') !== ADMIN_PASSWORD) {
      return json({ error: 'Não autorizado' }, 403);
    }
    const body = await request.json();

    // CREATE — POST
    if (method === 'POST') {
      const id = `modelo:${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      const modelo = {
        id,
        nome: body.nome || '',
        tipo: body.tipo || '',
        lado: body.lado || '',
        onde: body.onde || '',
        endereco: body.endereco || '',
        descricao: body.descricao || '',
        responsavel: body.responsavel || '',
        tambor: body.tambor || '',
        criadoEm: Date.now(),
      };
      await KV.put(id, JSON.stringify(modelo));
      return json(modelo);
    }

    // UPDATE — PUT
    if (method === 'PUT') {
      const { id, ...fields } = body;
      if (!id) return json({ error: 'id obrigatório' }, 400);
      const existing = await KV.get(id, { type: 'json' });
      if (!existing) return json({ error: 'Modelo não encontrado' }, 404);
      const updated = { ...existing, ...fields, id };
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
