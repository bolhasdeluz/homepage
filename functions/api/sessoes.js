// Cloudflare Pages Function: /api/sessoes
// CRUD de sessões via KV (SESSOES_KV)
// Escrita protegida por login de admin de verdade (token do Firebase Auth,
// conferido contra a lista de e-mails admin em _lib/auth.js) — antes pedia
// uma senha própria digitada na hora (por evento), o que era redundante pra
// quem já está logada como admin.

import { requireAdmin } from './_lib/auth.js';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Firebase-Api-Key',
  'Content-Type': 'application/json',
};

export async function onRequest(context) {
  const { request, env } = context;

  if (request.method === 'OPTIONS') {
    return new Response('', { status: 200, headers: CORS });
  }

  const KV = env.SESSOES_KV;
  if (!KV) return json({ error: 'KV não configurado.' }, 500);

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

    const admin = await requireAdmin(request, env);
    if (!admin) return json({ error: 'Não autorizado' }, 401);

    const body = await request.json();

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
        tambor: body.tambor || '',
        criadoEm: Date.now(),
      };
      await KV.put(id, JSON.stringify(sessao));
      return json(sessao);
    }

    // UPDATE — PUT (item único, ou em lote via bulkIds/bulkFields)
    if (method === 'PUT') {
      if (Array.isArray(body.bulkIds)) {
        const fields = body.bulkFields && typeof body.bulkFields === 'object' ? body.bulkFields : {};
        const { id: _ignoreId, ...safeFields } = fields;
        const updated = [];
        for (const id of body.bulkIds) {
          const existing = await KV.get(id, { type: 'json' });
          if (!existing) continue;
          const merged = { ...existing, ...safeFields, id };
          await KV.put(id, JSON.stringify(merged));
          updated.push(merged);
        }
        return json(updated);
      }

      const { id, ...fields } = body;
      if (!id) return json({ error: 'id obrigatório' }, 400);
      const existing = await KV.get(id, { type: 'json' });
      if (!existing) return json({ error: 'Sessão não encontrada' }, 404);
      const updated = { ...existing, ...fields, id };
      await KV.put(id, JSON.stringify(updated));
      return json(updated);
    }

    // DELETE — item único, ou em lote via ids
    if (method === 'DELETE') {
      if (Array.isArray(body.ids)) {
        await Promise.all(body.ids.map(id => KV.delete(id)));
        return json({ ok: true, count: body.ids.length });
      }
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
