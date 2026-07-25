// Cloudflare Pages Function: /api/sessoes
// CRUD de sessões via KV (SESSOES_KV)
// Escrita protegida pelo mesmo cabeçalho X-Admin-Password usado nos outros
// endpoints administrativos do site — antes pedia uma senha própria digitada
// na hora (por evento), o que era redundante pra quem já está logada como
// admin de verdade (o botão de editar só aparece pra ela)
//
// Cada sessão pertence a um terreiro (terreiroId). Sessão sem esse campo é
// tratada como do terreiro padrão (bolhas-de-luz), pra não quebrar as sessões
// já cadastradas antes dessa mudança. Além da senha de admin global, quem
// administra especificamente aquele terreiro (terreiro:<id>.adminEmails, ver
// functions/api/terreiros.js) também pode mexer na agenda da própria casa.

const ADMIN_PASSWORD = 'admin';
const ADMIN_EMAILS = ['bolhasdeluz@gmail.com', 'annagomes.bdl@gmail.com'];
const TERREIRO_PADRAO = 'bolhas-de-luz';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-Admin-Password, X-User-Email',
  'Content-Type': 'application/json',
};

async function podeEditarTerreiro(env, terreiroId, userEmail, adminPwd) {
  if (adminPwd === ADMIN_PASSWORD) return true;
  if (userEmail && ADMIN_EMAILS.includes(userEmail)) return true;
  if (!env.MENU_DATA || !userEmail) return false;
  const raw = await env.MENU_DATA.get('terreiro:' + terreiroId);
  if (!raw) return false;
  const terreiro = JSON.parse(raw);
  return (terreiro.adminEmails || []).includes(userEmail);
}

export async function onRequest(context) {
  const { request, env } = context;

  if (request.method === 'OPTIONS') {
    return new Response('', { status: 200, headers: CORS });
  }

  const KV = env.SESSOES_KV;
  if (!KV) return json({ error: 'KV não configurado.' }, 500);

  const method = request.method;
  const url = new URL(request.url);
  const userEmail = (request.headers.get('X-User-Email') || '').toLowerCase();
  const adminPwd = request.headers.get('X-Admin-Password');

  try {
    // LIST — GET /api/sessoes?terreiroId=X
    if (method === 'GET') {
      const terreiroId = url.searchParams.get('terreiroId') || TERREIRO_PADRAO;
      const list = await KV.list({ prefix: 'sessao:' });
      const items = await Promise.all(
        list.keys.map(k => KV.get(k.name, { type: 'json' }))
      );
      const sessoes = items
        .filter(Boolean)
        .filter(s => (s.terreiroId || TERREIRO_PADRAO) === terreiroId)
        .sort((a, b) => a.data.localeCompare(b.data));
      return json(sessoes);
    }

    const body = await request.json();

    // CREATE — POST
    if (method === 'POST') {
      const terreiroId = body.terreiroId || TERREIRO_PADRAO;
      if (!(await podeEditarTerreiro(env, terreiroId, userEmail, adminPwd))) {
        return json({ error: 'Não autorizado' }, 403);
      }
      const id = `sessao:${Date.now()}-${Math.random().toString(36).slice(2,7)}`;
      const sessao = {
        id,
        terreiroId,
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

    // UPDATE — PUT
    if (method === 'PUT') {
      const { id, ...fields } = body;
      if (!id) return json({ error: 'id obrigatório' }, 400);
      const existing = await KV.get(id, { type: 'json' });
      if (!existing) return json({ error: 'Sessão não encontrada' }, 404);
      const terreiroId = existing.terreiroId || TERREIRO_PADRAO;
      if (!(await podeEditarTerreiro(env, terreiroId, userEmail, adminPwd))) {
        return json({ error: 'Não autorizado' }, 403);
      }
      const updated = { ...existing, ...fields, id, terreiroId: fields.terreiroId || terreiroId };
      await KV.put(id, JSON.stringify(updated));
      return json(updated);
    }

    // DELETE — DELETE
    if (method === 'DELETE') {
      const { id } = body;
      if (!id) return json({ error: 'id obrigatório' }, 400);
      const existing = await KV.get(id, { type: 'json' });
      if (!existing) return json({ ok: true });
      const terreiroId = existing.terreiroId || TERREIRO_PADRAO;
      if (!(await podeEditarTerreiro(env, terreiroId, userEmail, adminPwd))) {
        return json({ error: 'Não autorizado' }, 403);
      }
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
