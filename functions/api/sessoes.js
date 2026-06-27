// Cloudflare Pages Function: /api/sessoes
// CRUD de sessões via KV (SESSOES_KV)
// Senha protege escrita (POST, PUT, DELETE)

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Content-Type': 'application/json',
};

export async function onRequest(context) {
  const { request, env } = context;

  if (request.method === 'OPTIONS') {
    return new Response('', { status: 200, headers: CORS });
  }

  const KV = env.SESSOES_KV;
  const SENHA = env.SESSOES_SENHA || 'terreiro';

  if (!KV) return json({ error: 'KV não configurado.' }, 500);

  const url = new URL(request.url);
  const method = request.method;

  try {
    // LIST — GET /api/sessoes
    if (method === 'GET') {
      const list = await KV.list({ prefix: 'sessao:' });
      const items = await Promise.all(
        list.keys.map(k => KV.get(k.name, { type: 'json' }))
      );
      const sessoes = items
        .filter(Boolean)
        .sort((a, b) => a.data.localeCompare(b.data));
      return json(sessoes);
    }

    // Verifica senha para escrita
    const body = await request.json();
    if (body.senha !== SENHA) {
      return json({ error: 'Senha incorreta.' }, 403);
    }

    // CREATE — POST
    if (method === 'POST') {
      const id = `sessao:${Date.now()}-${Math.random().toString(36).slice(2,7)}`;
      const sessao = {
        id,
        nome: body.nome || '',
        data: body.data || '',
        hora: body.hora || '',
        tipo: body.tipo || '',
        descricao: body.descricao || '',
        responsavel: body.responsavel || '',
        criadoEm: Date.now(),
      };
      await KV.put(id, JSON.stringify(sessao));
      return json(sessao);
    }

    // UPDATE — PUT
    if (method === 'PUT') {
      const { id, senha, ...fields } = body;
      if (!id) return json({ error: 'id obrigatório' }, 400);
      const existing = await KV.get(id, { type: 'json' });
      if (!existing) return json({ error: 'Sessão não encontrada' }, 404);
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

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: CORS });
}
